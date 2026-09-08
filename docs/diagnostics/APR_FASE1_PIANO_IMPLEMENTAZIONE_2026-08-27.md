# APR — Fase 1 — Piano di implementazione

Sì: la separazione dei livelli 2 e 3 deve precedere la matrice completa pagina-per-pagina del livello 1.

C’è però una distinzione importante: prima dei livelli 2/3 serve un contratto minimo e immutabile delle fonti già disponibili — file, SHA-256, `documentKey`, testo estratto e numero pagine. Questo esiste quasi interamente. La matrice completa di ogni pagina può arrivare dopo, perché migliora audit e diagnosi ma non è il principale ostacolo alla riconciliazione economica e tecnica.

## Ordine di implementazione proposto

| Ordine | Componente | Motivo della priorità |
|---:|---|---|
| 1 | Contratti minimi L2/L3 e confronto parallelo | Crea il confine senza cambiare ancora il comportamento |
| 2 | Verticale economica: fatti → decisione | Interviene sulla famiglia di blocker più importante |
| 3 | Verticale quantità/misure: fatti → decisione | Affronta la seconda famiglia prioritaria |
| 4 | Mapper ENEA puro | Impedisce che i dati vengano reinterpretati dopo la decisione |
| 5 | Matrice per-pratica L1–L5 | Rende visibile esattamente dove una pratica fallisce |
| 6 | AcquisitionArtifact pagina-per-pagina completo | Rafforza audit e diagnosi senza ritardare le priorità economiche |
| 7 | Gate rigido L1–L4 → L5 | Impedisce definitivamente l’accesso browser con livelli locali incompleti |

I numeri della baseline sostengono questo ordine:

- `gross_triple_reconciliation_failed`: 22 casi;
- `infissi_financial_triple_reconciliation_required`: 14 casi;
- `infissi_dimensions_and_cardinality_missing`: 24 casi;
- `product_cardinality_form_invoice_mismatch`: 17 casi.

Le categorie possono sovrapporsi, quindi non vanno sommate come pratiche distinte, ma dimostrano che economia e quantità/misure sono il centro operativo del problema.

## Slice 1 — Contratti L2/L3 e modalità parallela

È il primo pezzo da costruire.

### Nuovi artefatti

`CanonicalFactsArtifact`:

```text
practiceId
customerKey
sourceFingerprint
facts[]
artifactFingerprint
extractorVersion
```

Ogni fatto:

```text
factId
field
value
valueType
status: observed | missing | ambiguous | conflicting
sourceIds[]
sourceLocator
extractionRuleId
extractionMethod
confidence
```

`BusinessDecisionArtifact`:

```text
practiceId
factsFingerprint
registryFingerprint
decisions[]
blockers[]
artifactFingerprint
```

Ogni decisione:

```text
field
resolvedValue
status: resolved | blocked | operator_required
inputFactIds[]
appliedRuleIds[]
sourcePrecedence[]
reason
```

### Regola strutturale

Il livello 2 può dire:

> Ho osservato nella fattura il totale 1.694,00 euro.

Non può dire:

> Questo è il totale da inserire su ENEA.

Questa seconda frase appartiene esclusivamente al livello 3.

### Modalità iniziale

Il nuovo percorso viene eseguito in parallelo al preflight esistente:

```text
fonti congelate
 ├─ percorso legacy
 └─ nuovo percorso L2 → L3
             ↓
      confronto differenziale
```

Nessun cutover nel primo commit.

### Test

- positivo: fatto con fonte univoca;
- negativo: fatto senza fonte rifiutato;
- limite: due valori conflittuali restano distinti e non vengono risolti dal livello 2;
- determinismo: stesso input produce lo stesso hash;
- immutabilità: modificare un fatto dopo la costruzione deve fallire;
- compatibilità: nessuna variazione del risultato legacy sul corpus congelato.

## Slice 2 — Verticale economica

È il primo intervento con effetto diretto sulle priorità operative.

### Livello 2 economico

Estrae esclusivamente:

- identità della fattura;
- numero e data;
- imponibile;
- IVA;
- totale lordo;
- storni e note di credito;
- riferimento a fatture sostituite;
- capitale bonificato;
- commissioni;
- riferimenti del bonifico;
- sorgente ed estratto testuale di ogni valore.

Non somma e non sceglie ancora il valore autorevole.

### Livello 3 economico

Applica esclusivamente regole registrate:

- deduplicazione;
- sostituzione esplicita;
- totale IVA incluso;
- somma delle fatture distinte;
- esclusione delle commissioni;
- prevalenza delle fatture sui bonifici;
- tripla riconciliazione entro la tolleranza già autorizzata;
- blocco fail-closed se le prove non concordano.

Non verranno introdotte nuove regole fiscali.

### Gate di uscita

Prima del cutover economico:

1. test positivo;
2. test negativo;
3. test al confine della tolleranza;
4. doppio replay deterministico dei 125 casi;
5. confronto pratica per pratica con la baseline;
6. nessuna pratica precedentemente corretta può regredire;
7. ogni differenza deve essere spiegata e approvata;
8. gate monotono obbligatorio.

Solo dopo, la sezione economica del preflight legacy potrà essere sostituita dal nuovo `BusinessDecisionArtifact`.

## Slice 3 — Quantità, misure e cardinalità

Dopo la verticale economica si applica lo stesso schema a:

- righe fisiche di prodotto;
- quantità dichiarate;
- misure originarie;
- unità esplicita;
- superfici esplicite;
- pagine dei certificati;
- trasmittanze osservate;
- corrispondenze tra fattura, form e documento tecnico.

Il livello 2 conserva tutte le osservazioni senza scegliere quale prevale.

Il livello 3 applica:

- gerarchia delle fonti;
- espansione quantità → pezzi fisici;
- riconciliazione 1:1;
- conversioni autorizzate;
- tolleranze già registrate;
- blocchi per cardinalità realmente discordante;
- fallback soltanto se già autorizzati.

Anche qui Amelia resterà bloccata finché la regola `APR-P2B-SCREENING-FAMILY-MATERIAL-001` non verrà implementata nella fase prevista. La ristrutturazione non deve correggerla implicitamente.

## Slice 4 — Mapper ENEA puro

Il mapper dovrà ricevere soltanto il `BusinessDecisionArtifact` approvato.

Saranno vietati strutturalmente:

- import dei parser documentali;
- lettura di PDF o testi OCR;
- accesso ai dossier sorgente;
- scelta di fallback;
- riconciliazione economica;
- reinterpretazione della famiglia prodotto;
- creazione di nuove decisioni business.

Il mapper potrà soltanto trasformare:

```text
decisione approvata
→ campo ENEA
```

Ogni campo conterrà:

- valore;
- `decisionId`;
- `ruleIds`;
- fonti indirettamente referenziate;
- stato;
- fingerprint del mapping.

Un test architetturale controllerà anche le dipendenze vietate, non soltanto il risultato funzionale.

## Slice 5 — Matrice dei cinque livelli

Per ogni pratica verrà creato un ledger persistente:

| Livello | Stato ammesso |
|---|---|
| L1 | `PASS`, `FAIL`, `NOT_RUN` |
| L2 | `PASS`, `FAIL`, `NOT_RUN` |
| L3 | `PASS`, `FAIL`, `NOT_RUN` |
| L4 | `PASS`, `FAIL`, `NOT_RUN` |
| L5 | `PASS`, `FAIL`, `NOT_RUN` |

Ogni riga conterrà:

- fingerprint input;
- fingerprint output;
- versione del componente;
- orario;
- motivo;
- blocker;
- prossima azione;
- artefatto di prova.

Se L2 fallisce, L3–L5 devono risultare `NOT_RUN`, non un generico fallimento aggregato.

`caseStatusTruth` continuerà a essere la verità pubblica finale, ma dovrà derivarla da questa matrice senza reinterpretare gli artefatti.

## Slice 6 — AcquisitionArtifact completo

Solo dopo aver separato economia e misure verrà completato il livello 1 pagina-per-pagina.

Conterrà:

- file atteso e ricevuto;
- hash;
- tipo dichiarato e rilevato;
- numero totale pagine;
- una voce per pagina;
- metodo di lettura;
- hash del testo per pagina;
- stato leggibile/illeggibile;
- eventuale OCR;
- classificazione del documento;
- fingerprint complessivo.

Non è una funzione secondaria: sarà obbligatoria prima della certificazione finale. Semplicemente non deve ritardare la separazione urgente dei livelli 2/3.

## Slice 7 — Ammissione rigida al browser

Il worker potrà accettare un pacchetto soltanto con una ricevuta firmata localmente contenente:

```text
L1 PASS
L2 PASS
L3 PASS
L4 PASS
hash concatenato dei quattro artefatti
packageFingerprint corrispondente
```

Qualunque discordanza produrrà `TECHNICAL_BLOCK` prima di aprire o modificare una pagina.

Il livello 5 continuerà a gestire esclusivamente:

- interazione con i campi;
- selezioni autocomplete;
- salvataggi;
- checkpoint;
- verifica server;
- retry read-only;
- crash recovery.

## Strategia di commit

Ogni slice sarà divisa in commit piccoli:

1. contratto e tipi;
2. adattatore legacy;
3. motore puro;
4. test positivo/negativo/limite;
5. confronto corpus;
6. cutover separato, soltanto dopo approvazione.

Nessun commit mescolerà ristrutturazione architetturale e nuova regola business.

## Verdetto

L’ordine corretto non è `L1 → L2 → L3 → L4 → L5`.

L’ordine operativo più efficace è:

```text
contratto minimo delle fonti esistenti
→ separazione L2/L3 economica
→ separazione L2/L3 quantità e misure
→ mapper L4 puro
→ matrice dei livelli
→ L1 pagina-per-pagina completo
→ ammissione rigida al browser
```

Questo permette di intervenire prima sulle famiglie che bloccano più pratiche, conservando comunque il livello 1 completo come gate obbligatorio prima della certificazione.

Il piano è basato su tre riscontri concordanti: baseline dei 125 casi, dipendenze effettive del codice e contratti/test locali esistenti. Non è stato scritto codice, non è stata effettuata alcuna installazione e non è stato avviato alcun test operativo CRM/ENEA.
