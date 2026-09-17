# APR r111 — diagnosi progressiva (preparazione, non installata)

Stato: **preparazione locale soltanto**. Il lotto operativo r110 da 70 pratiche non e stato modificato, riavviato o rallentato da questo lavoro. Nessuna azione ENEA e stata eseguita da questa preparazione.

## Regola economica definitiva

Decisione di Giuliano dell'11/09/2026: per la spesa ENEA di una fattura si usa esclusivamente il totale finale stampato verso il cliente. Imponibile, IVA, aliquote, scadenziari e ricostruzioni delle righe non sono dati richiesti da ENEA, non devono essere letti per validare l'importo e non possono generare blocker.

La diagnosi del codice ha trovato una contraddizione reale:

- il registro contiene gia `user-2026-09-07-invoice-gross-total-never-internally-verified-v1` e `user-2026-09-08-invoice-final-printed-total-only-never-internal-recalculation-v1`;
- il percorso operativo mantiene pero attivo `core-gross-triple-reconciliation`, legge imponibile/IVA/scadenziario/righe e puo ancora pubblicare `invoice_schedule_amount_missing` o `gross_triple_reconciliation_failed`;
- quindi la decisione era registrata ma non governava integralmente il runtime. La correzione preparata deve supersedere esplicitamente il controllo triplo, non aggiungere un'altra eccezione.

## Priorita 1 — fatture di acconto e saldo

Caso prova: Armando Ranzoni, coorte 5834.

- Fonti fiscali: due fatture native, ruoli `advance` e `balance`, numeri e date distinti, totale finale stampato EUR 3.446,50 ciascuna.
- Il preflight economico le ha entrambe accettate e ha calcolato EUR 6.893,00.
- Il gate Infissi/chiusure ha invece costruito l'insieme completo usando solo `kind === "invoice"`; ha quindi contato 0/2 fatture economiche complete e pubblicato `infissi_invoice_evidence_incomplete_for_shading_closure_resolution`.
- Causa: divergenza fra il tipo fiscale (`invoice`) e il ruolo contabile (`advance`/`balance`). Non e un difetto dei documenti.
- Correzione generale preparata: i ruoli fiscali `invoice`, `advance` e `balance` sono tutti fatture; il ruolo serve al calcolo della somma, non puo escludere la fonte dai gate documentali.

## Priorita 2 — allegati scansionati nello slot fattura

Verdetto documentale: **difetto di classificazione, non difetto OCR**. L'OCR ha letto i titoli; il classificatore restituisce comunque `invoice` prima di esaminare il contenuto quando lo slot CRM e `invoice`.

| Pratica | SHA-256 sorgente | Modo | Contenuto reale verificato | Verdetto |
|---|---|---:|---|---|
| Gregorio Fusco | `663cafe44632e83f31394b66720c46c614a8784ca382082ccde3a4c401093f21` | OCR, 7 pagine | `DICHIARAZIONE DI PRESTAZIONE` EKO-OKNA, specifiche tecniche serramenti | certificato tecnico, non fattura |
| Gregorio Fusco | `64498604ab78d52c2548c06f90b783dd78295fee8679f6599e598a196ed417a6` | OCR, 2 pagine | tessera sanitaria / carta regionale dei servizi | identita, non fattura |
| Andrea Trabucco | `95aa3d315e1954a3df0a846998faa690ba6b093ec5cb92b81a69c33f3ae4dc72` | OCR, 2 pagine | `DICHIARAZIONE DI PRESTAZIONE` EKO-OKNA | certificato tecnico, non fattura |
| Andrea Trabucco | `9eb7c36547b9d9871742e069fda7cb8d442f0dc36a9dbf916e7cb6c26e9c8057` | OCR, 2 pagine | carta d'identita / tessera sanitaria | identita, non fattura |
| Massimo Cappello | `dc3d59054e4cce732424e6e1bd38bd9a8a81ae030c461ecd27bbecc32ac12ada` | OCR, 8 pagine | `DICHIARAZIONE DEL PRODUTTORE` Internorm con dati tecnici per finestra | certificato tecnico, non fattura |
| Matteo Capitanelli | `a3ea1ec853f37aaa7a299b5478086e354703233ed5d3916178d92efd6c1c573b` | OCR, 2 pagine | carta d'identita | identita, non fattura |
| Matteo Capitanelli | `9fbfea9769c6c2353293e28d90d882f1d887baa5027e7c1077d04dd16389e7b1` | OCR, 9 pagine | dichiarazione/marcatura CE e documento di accompagnamento della commessa | certificato tecnico, non fattura |
| Matteo Capitanelli | `7600255dab4124a3c9d3e909626c310c8adb3f859ab995879b90804c80fbbafb` | OCR, 9 pagine | `RAPPORTO DI PROVA N. 325261` Istituto Giordano | rapporto tecnico, non fattura |

Nello stesso fascicolo Capitanelli esistono inoltre visura catastale e ricevute di bonifico native archiviate nello slot fattura. Sono anch'esse fonti non fiscali e confermano che il difetto e lo slot trattato come verita semantica.

Correzione generale preparata: classificare prima il contenuto; intestazione fiscale autentica e totale finale mantengono la fonte come fattura, mentre identita, ricevute bancarie, visure, dichiarazioni di prestazione/produttore e rapporti di prova chiaramente titolati vengono demossi a fonte ufficiale/tecnica/addizionale. Un PDF composito che contiene davvero una fattura non viene demosso.

## Caso lasciato intenzionalmente all'operatore

- `classification`: `operator_required`
- pratica: Luca Cigognetti
- `exactCause`: la zanzariera e documentata, ma nessuna fonte la collega univocamente a una delle finestre fisiche.
- `missingDocumentType`: `null`
- `operatorQuestion`: **A quale finestra specifica va associata la zanzariera documentata? Indica posizione o misure della finestra.**
- `onboardingGap`: richiedere nel form l'associazione fra ogni chiusura aggiuntiva e la finestra/posizione corrispondente.

## Implementazione preparata e prove locali

- Il modello economico espone ora un solo metodo autorevole, `final_printed_total`; i tre metodi storici duplicati sono stati rimossi dal risultato runtime.
- Il parser finanziario locale non contiene piu funzioni capaci di estrarre o riconciliare imponibile, IVA, aliquote, scadenziari o somme delle righe. I campi storici `taxableAmount` e `vatAmount` restano soltanto nello schema compatibile e sono sempre `null`.
- Il gate economico puo bloccare esclusivamente quando manca o e incerto il totale finale stampato di una vera fattura fiscale, non per una quadratura interna.
- I ruoli `invoice`, `advance` e `balance` sono equivalenti in tutti i gate documentali; la regressione Ranzoni e coperta da test dedicato.
- Lo slot CRM non prevale piu sul contenuto: i documenti OCR dei quattro casi verificati vengono tipizzati in base al titolo e al contenuto reale.

Riscontri locali gia verdi:

- 74/74 test mirati (totale finale, Ranzoni, classificatore contenuto, preflight Infissi, verticale economica);
- 279/279 test di integrazione sulle dieci suite direttamente attraversate dalla modifica;
- typecheck applicazione e runner ENEA: verde;
- ricerca statica del percorso attivo: nessun generatore di blocker `gross_triple_reconciliation_failed`, `infissi_financial_triple_reconciliation_required` o `invoice_schedule_amount_missing`; i codici residui in `deepCaseReview.ts` servono soltanto a interpretare checkpoint storici.

La suite di integrazione ha inizialmente scoperto una regressione vera nelle fixture e nei checkpoint storici privi di `semanticKind`: il filtro avrebbe escluso anche fatture storiche valide. La compatibilita e stata resa fail-closed cosi: un `semanticKind` esplicito prevale sempre sullo slot CRM; soltanto quando manca del tutto si usa il vecchio `kind`. Il secondo passaggio delle stesse dieci suite e risultato 279/279 verde.

Il risultato economico non simula piu una riconciliazione tripla con tre metodi duplicati: espone un unico controllo `final_printed_total`. L'alias storico del tipo rimane solo per compatibilita di compilazione e non produce verifiche ulteriori.

Questi sono test automatici/locali: non costituiscono ancora una verifica operativa sul portale.

## Installazione

Non ancora eseguita. Prima servono test positivi, negativi e di non regressione; il gate completo e l'installazione potranno iniziare soltanto dopo la chiusura terminale concordante del lotto r110 da 70 pratiche.

Ultimo stato read-only osservato durante la preparazione: 47/70 risultati persistiti, lotto `running`, pratica corrente Zeno Righetti. Il bundle runtime r110 non e stato modificato.
