# Specifica: i cinque tipi di risposta che il runner deve saper consumare

Fonte: `src/features/enea-shadow-crm/operator-answers/answerRecord.ts`, che vive
nella cartella del CRM ombra (`~/Projects/pratica-rapida`), NON in questo
worktree. Copia integrale accanto a questo file: `crm-ombra-answerRecord.ts.txt`
e `crm-ombra-responseLedger.ts.txt`. Il riferimento nel prompt della notte era
sbagliato: errore di Claude, non di Codex.

## Come il CRM ombra scrive oggi

Ogni risposta di Giuliano diventa un record nel ledger globale
`state/operator-responses/checkpoint.json`, nella forma esatta dei record gia'
presenti (`responseId`, `customerKey`, `practiceId`, `receivedAt`, `source:
"giuliano_crm_ombra"`, `question`, `answer`, `payload`, `status: "active"`,
`supersedesResponseId`, `appliedRuleIds`). Le misure con unita' diventano gia'
`screening_products`. Tutto il resto viene salvato con
`payload.kind = "operator_required"` e la risposta in chiaro nel campo `answer`:
leggibile, ma il runner oggi non la consuma.

## I cinque campi (`field` della domanda) senza consumo

| field della domanda | cosa contiene `answer` | consumo atteso lato runner |
|---|---|---|
| `shading_closures` | si' / no (chiusure oscuranti insieme agli infissi) | risolve `infissi_shading_closures_form_answer_missing_or_ambiguous`: la risposta vale come risposta del form |
| `completionDate` | una data (es. `15/07/2026`) | risolve `completion_date_missing`: diventa la data di fine lavori esplicita, con precedenza come il campo del form rivenditore |
| `economic.invoiceTotal` | un importo come stampato (es. `2.587,62`) | risolve `invoice_final_printed_total_not_verified` e i blocchi `invoice_<hash>`: e' il totale finale stampato, mai ricalcolato |
| `infissi.dimensioni_e_numero` | elenco di pezzi in metri quadri, uno per riga (es. `2,6 / 2,4 / 3,6`) | risolve `infissi_dimensions_and_cardinality_missing`: N pezzi, superficie ciascuno; regola del titolare: una riga per pezzo, niente millimetri |
| `operator.pendingData` | il dato richiesto in precedenza; se contiene misure con unita' il CRM lo salva gia' come `screening_products` | risolve `operator_response_pending_external_data` |

## Cosa serve

1. Un `payload.kind` nuovo per ciascuno (o uno solo, `case_decision`, con
   `field` e `value` tipizzati), nel tipo `OperatorResponsePayload` del
   ledger del runner (`scripts/enea-shadow-runner/operatorResponseLedger.ts`).
2. Il consumo runtime: per ogni kind, il punto del preflight che genera il
   blocker corrispondente consulta prima il ledger per (customerKey, field);
   se c'e' una risposta attiva la applica e il blocker non nasce.
3. Un test per kind: risposta nel ledger -> la pratica riparte senza rifare
   la domanda.
4. Il CRM ombra andra' poi allineato a scrivere i kind nuovi invece di
   `operator_required`: e' lavoro dell'altra sessione, dopo che il runner li
   consuma. Fino ad allora, il runner deve accettare ANCHE la forma attuale
   (`operator_required` + `answer` in chiaro) per questi cinque `field`,
   perche' e' cosi' che le risposte di Giuliano stanno entrando oggi.

## Contratto canonico proposto

Un solo payload tipizzato copre i cinque casi senza moltiplicare i rami del
ledger:

```ts
{
  kind: "case_decision";
  field:
    | "shading_closures"
    | "completionDate"
    | "economic.invoiceTotal"
    | "infissi.dimensioni_e_numero"
    | "operator.pendingData";
  value: string;
  originatingQuestionId: string;
}
```

`originatingQuestionId` e' obbligatorio: impedisce che una risposta valida per
un blocker venga applicata a una domanda diversa dello stesso cliente. La
chiave di consumo e' quindi `(customerKey, practiceId, field,
originatingQuestionId)`. Il `practiceId` puo' essere omesso soltanto nei record
esplicitamente generali gia' ammessi dal ledger; non deve mai degradare una
risposta caso-specifica a risposta per solo nome.

Durante la migrazione, un vecchio payload `operator_required` e' consumabile
soltanto se il suo `responseId` contiene l'ID normalizzato della domanda che
l'ha originato oppure se `entry.question` coincide esattamente con il prompt
persistito. Non e' ammesso dedurre il campo dal solo testo libero della
risposta.

## Precedenze e ciclo di vita

1. Prima di aprire una domanda, il generatore consulta il ledger globale delle
   risposte attive con la chiave canonica. Se trova una risposta compatibile,
   non crea una nuova domanda e registra l'applicazione.
2. Una domanda viene ritirata quando il caso e' `saved`, quando il blocker che
   l'ha originata non e' piu' presente oppure quando la risposta che la chiude
   risulta applicata. Il ritiro e' idempotente e auditato.
3. Una risposta `cannot_determine` non ritira la domanda e non sblocca il caso.
4. La risposta non puo' mai indebolire un gate estraneo al proprio `field`.

## Evidenza di formato nelle domande

Quando un lettore non riconosce un valore vicino a un'etichetta candidata, la
domanda deve includere, oltre al documento e alla causa, al massimo quindici
righe di contesto attorno all'etichetta. Il contesto serve all'operatore per
rispondere senza riaprire il fascicolo, ma non diventa un dato automatico: la
pipeline resta fail-closed finche' non arriva una risposta tipizzata.
