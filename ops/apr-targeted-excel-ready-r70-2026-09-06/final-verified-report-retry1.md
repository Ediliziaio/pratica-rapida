# Test mirato APR r70 — report finale verificato

Il test ha rieseguito esattamente le 12 pratiche autorizzate del manifest con SHA-256 `0d46008ad03b39c4be75b97e2f2b4580889c41e8e9dede0f79bc85cba4aca711`, nelle coorti 3413–3424.

## Risultato verificato

- Bozze salvate: **0**
- `OPERATOR_REQUIRED`: **10**
- `TECHNICAL_BLOCK`: **1**
- `INCONSISTENT`: **1**
- Anteprima, invio e comunicazioni: **mai tentati**

Il report grezzo del controller riportava 10 operator e 2 tecnici. Antonio Sacco è stato riclassificato `INCONSISTENT`: l'acquisizione riconosce correttamente RM Legno e non scarica gli allegati, ma checkpoint/report restano `WORKING`, il caseTruth terminale non viene pubblicato e il controller esterno termina il caso per timeout.

## Otto pratiche “Da inserire su Excel”

1. **Giovanni Pietro Sanvito — OPERATOR_REQUIRED.** Identità del cointestatario non univoca e tripla economica incerta su un segmento fattura. Domanda: “Indica nome, cognome e codice fiscale del cointestatario corretto e conferma imponibile, IVA e totale lordo della fattura coinvolta.”
2. **Antonio Sacco — INCONSISTENT.** Fornitore CRM `rm legno` riconosciuto ed escluso prima degli allegati, ma la coorte non pubblica `OPERATOR_REQUIRED` e viene chiusa dal timeout esterno. Domanda: “Puoi prendere in carico manualmente questa pratica, essendo collegata a RM Legno?”
3. **Tanbir Awal — OPERATOR_REQUIRED.** Cointestatario non univoco; il preflight segnala anche riga schermatura con misure/gTot non dimostrata. Domanda: “Indica nome, cognome e codice fiscale del cointestatario e segnala la pagina che riporta prodotto, misure e gTot della schermatura.”
4. **Donata Zangrossi — TECHNICAL_BLOCK.** Il seed `fresh_generation` viene rifiutato per `apr_cohort_seed_prior_draft:donata-zangrossi`. Domanda: “Vuoi autorizzare in un'attività separata la diagnosi del conflitto tra fresh_generation e bozza pregressa per questa pratica?”
5. **Chiara Chierichetti — OPERATOR_REQUIRED.** Numero degli infissi e misure non riconciliati in modo univoco. Domanda: “Indica quanti infissi fisici sono stati installati e le misure larghezza × altezza di ciascuno.”
6. **Francesca Scalia — OPERATOR_REQUIRED.** Tripla economica non dimostrata per due segmenti fattura. Domanda: “Conferma imponibile, IVA e totale lordo di ciascuna delle due fatture indicate.”
7. **Massimo Cotta — OPERATOR_REQUIRED.** Identità cointestatario, cardinalità prodotto, misure schermatura e importo dello scadenziario non dimostrati; fallisce anche la riconciliazione economica. Domanda: “Indica il cointestatario con codice fiscale, conferma quale e quante schermature sono state installate con le loro misure e specifica l'importo mancante nello scadenziario della fattura.”
8. **Daniele Buoncompagni — OPERATOR_REQUIRED.** Identità del cointestatario non univoca. Domanda: “Indica nome, cognome e codice fiscale del cointestatario corretto.”

## Quattro pratiche “Pronte da fare”

1. **Luca Dragotta — OPERATOR_REQUIRED.** Identità cointestatario non univoca; documento da controllare; superficie dichiarata 11,08 m² contro 1.110,624 m² calcolati dalle misure. Domanda: “Indica il cointestatario corretto e conferma per la riga 1 larghezza, altezza, quantità e superficie effettiva: 11,08 m² oppure un altro valore.”
2. **Lidia Marchisio — OPERATOR_REQUIRED.** Identità cointestatario, due prodotti, misure/gTot e totale fiscale non riconciliati; tripla economica incerta. Domanda: “Indica il cointestatario corretto, conferma i due prodotti con misure e gTot e specifica imponibile, IVA e totale lordo del documento fiscale non riconosciuto.”
3. **Massimo Grimaldi — OPERATOR_REQUIRED.** Identità del cointestatario non univoca. Domanda: “Indica nome, cognome e codice fiscale del cointestatario corretto.”
4. **Aldo Gebbia — OPERATOR_REQUIRED.** Numero/misure degli infissi insufficienti e risposta sulle chiusure oscuranti mancante o ambigua. Domanda: “Indica quanti infissi sono stati installati con le misure di ciascuno e conferma sì o no se sono presenti chiusure oscuranti.”

## Configurazione e governo

- `gestionale` è ora ammesso insieme a `archiviate`, `recensione` e `pronte_da_fare`.
- Gate completo: **1786/1786 test verdi**; evidenze formali per **151 regole**.
- Bundle installato: `3a865dd6-gestionale-formal-governance-r70-20260906`.
- Worker SHA-256: `3a865dd6153c967c1fe6a02d2236bbafa6305a36c627819b46d398a6c0e75ded`.
- Attestazione SHA-256: `889c497cda46b0a688984b0878ca21e64fbf2280187e3f2deebe4a3faf2aab1d`.

Le tre fonti usate per ogni verdetto sono checkpoint persistente, `report.blockers` persistente e snapshot terminale `caseTruth`; journal e processi hanno verificato l'esecuzione e la chiusura del lotto. Chrome APR e keepalive sono rimasti attivi; nessun worker delle coorti 3413–3424 è rimasto in esecuzione.
