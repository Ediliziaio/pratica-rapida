# APR R22 — report finale 30x3

Data conclusione: 2026-09-01  
Corpus: 30 pratiche già autorizzate, Beatrice Ciotta esclusa  
Bundle: `4b7bce9-terminal-truth-r22-20260901`  
Source snapshot: `/private/tmp/apr-promote-screening-rounding-final-20260901-R22.bxMYlU`  
Commit: `e891ea92951338b966fd6727ff7fde10c48f25af`  
Freeze: `freeze-r22.json` — SHA-256 `c2f3cb76c1bae4d02260622a82afa33028dde4e3c01277d11b5a9bd19a9970dc`

## Esito sintetico

| Giro | Saved | OPERATOR_REQUIRED | TECHNICAL_BLOCK | INCONSISTENT | Totale |
|---|---:|---:|---:|---:|---:|
| 1 | 17 | 11 | 2 | 0 | 30 |
| 2 | 16 | 11 | 3 | 0 | 30 |
| 3 | 15 | 11 | 4 | 0 | 30 |

La ripetibilità pratica-per-pratica è **24/30 identiche sui tre giri** e **6/30 non ripetibili**. Il requisito numerico di almeno 15 `saved` è raggiunto in tutti e tre i giri, ma il risultato non dimostra ancora piena stabilità strutturale: quattro dei sei casi non ripetibili presentano l'errore CDP `Promise was collected`.

## Verifiche e sicurezza

- Gate locale: 433/433 suite e 1611/1611 test superati; typecheck e build superati.
- Test operativo mirato Armando Ranzoni: `saved`, 10/10 pagine, `/api/case-truth` = `READY`, nessun blocker.
- Ogni giro è stato verificato con tre fonti indipendenti: processo/exit del sequencer; report, checkpoint e journal persistenti; API `/api/case-truth` della coorte.
- In ogni giro: mismatch report/journal = 0; mismatch report/API = 0; casi operatore senza blocker coerente = 0; casi saved con blocker inatteso = 0.
- Anteprima, submit e comunicazioni: tutti `false` nei tre report.
- La sessione Chrome/ENEA e il keepalive read-only sono rimasti attivi anche dopo la conclusione; non sono stati chiusi con i sequencer.

Attestazioni terminali:

- Giro 1: report `36d362c1a52a9bfcd30ac1a535ecce9a20afde1a7a9c5e6b64200df6e5293581`, checkpoint `e7a9fa2ff8f35544ab3becaf20094ef0d8e1b43574d239d8870b74a9baa4c51b`, journal `3daeccca4e4e92f7b04292a8c25eb2986ded6ffa2266d306634bdcbba4218f86`.
- Giro 2: report `ec30e050f0de87140a3c677da9b348541212376a7037570506c6d235b4099de2`, checkpoint `b03229814dbdf865b8797d568260764f2290c7b94dfd6a0dc8fa745f24475658`, journal `30b0002abf5acc23138febf21a79d47a4252258379b6c9035adf65338a8413c8`.
- Giro 3: report `d0e1749c1f8e5b9a1b79c80966b239087f5e7e284d4b9e6b24416f809a93e972`, checkpoint `5ff9dc2ef800a0f64b26c9f7ce4d61926c8135f8e0c2f3e52e588fea7cccfc8d`, journal `d3496c9e8c971f54fab59a03850905ce5cf8164a9d30eaaee9c75f910ac40abc`.

## Pratiche saved

**Giro 1 (17):** Barbara Melis; Mara Elena Maddiotto; Claudio Beghini; Kitenge Ebambi; Gabriella Bruno; Milena Albertoni; Lucia Lagrasta; Daniela Guidotti; Zeno Righetti; Luca Cigognetti; Cristina Ricchi; Emanuela Parolo; Roberto Marcello; Flavia Cipriani; Amelia Lerose; Eleonora Meggiarin; Armando Ranzoni.

**Giro 2 (16):** Barbara Melis; Mara Elena Maddiotto; Claudio Beghini; Kitenge Ebambi; Luca Callegari; Gabriella Bruno; Milena Albertoni; Lucia Lagrasta; Daniela Guidotti; Zeno Righetti; Luca Cigognetti; Cristina Ricchi; Roberto Marcello; Flavia Cipriani; Amelia Lerose; Armando Ranzoni.

**Giro 3 (15):** Barbara Melis; Mara Elena Maddiotto; Claudio Beghini; Kitenge Ebambi; Luca Callegari; Gabriella Bruno; Milena Albertoni; Daniela Guidotti; Zeno Righetti; Cristina Ricchi; Emanuela Parolo; Roberto Marcello; Flavia Cipriani; Eleonora Meggiarin; Armando Ranzoni.

## Confronto pratica per pratica

| Pratica | Giro 1 | Giro 2 | Giro 3 | Ripetibile |
|---|---:|---:|---:|:---:|
| Barbara Melis | saved 14/14 | saved 14/14 | saved 14/14 | sì |
| Cesare Imperiali | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Mara Elena Maddiotto | saved 16/16 | saved 16/16 | saved 16/16 | sì |
| Claudio Beghini | saved 8/8 | saved 8/8 | saved 8/8 | sì |
| Besenval Fortunato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Kitenge Ebambi | saved 14/14 | saved 14/14 | saved 14/14 | sì |
| Vera Buracchi | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Sabrina Eustomi | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Luca Callegari | technical_block 0/11 | saved 11/11 | saved 11/11 | no |
| Eugenio Codognato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Gabriella Bruno | saved 8/8 | saved 8/8 | saved 8/8 | sì |
| Milena Albertoni | saved 8/8 | saved 8/8 | saved 8/8 | sì |
| Milena Fiorini | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Lucia Lagrasta | saved 11/11 | saved 11/11 | technical_block 1/11 | no |
| Giovanni Pescatori | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Daniela Guidotti | saved 8/8 | saved 8/8 | saved 8/8 | sì |
| Zeno Righetti | saved 19/19 | saved 19/19 | saved 19/19 | sì |
| Luca Cigognetti | saved 14/14 | saved 14/14 | technical_block 1/14 | no |
| Cristina Ricchi | saved 10/10 | saved 10/10 | saved 10/10 | sì |
| Emanuela Parolo | saved 8/8 | technical_block 1/8 | saved 8/8 | no |
| Roberto Marcello | saved 16/16 | saved 16/16 | saved 16/16 | sì |
| Flavia Cipriani | saved 13/13 | saved 13/13 | saved 13/13 | sì |
| Mario Donnarumma | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Marco Colombo | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Danila Serpa | technical_block 0/8 | technical_block 0/8 | technical_block 0/8 | sì |
| Amelia Lerose | saved 10/10 | saved 10/10 | technical_block 1/10 | no |
| Caterina Claudia Garbato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |
| Eleonora Meggiarin | saved 12/12 | technical_block 0/0 | saved 12/12 | no |
| Armando Ranzoni | saved 10/10 | saved 10/10 | saved 10/10 | sì |
| Francesco Fumagalli | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | sì |

## Sei pratiche non ripetibili

1. **Luca Callegari:** giro 1 `TECHNICAL_BLOCK` 0/11 per `apr_cdp_enea_co_beneficiary_save_unverified`; giri 2 e 3 `saved` 11/11.
2. **Lucia Lagrasta:** giri 1 e 2 `saved` 11/11; giro 3 `TECHNICAL_BLOCK` 1/11 per `apr_cdp_protocol_error:-32000:Promise was collected`.
3. **Luca Cigognetti:** giri 1 e 2 `saved` 14/14; giro 3 `TECHNICAL_BLOCK` 1/14 per `apr_cdp_protocol_error:-32000:Promise was collected`.
4. **Emanuela Parolo:** giri 1 e 3 `saved` 8/8; giro 2 `TECHNICAL_BLOCK` 1/8 per `apr_cdp_protocol_error:-32000:Promise was collected`.
5. **Amelia Lerose:** giri 1 e 2 `saved` 10/10; giro 3 `TECHNICAL_BLOCK` 1/10 per `apr_cdp_protocol_error:-32000:Promise was collected`.
6. **Eleonora Meggiarin:** giri 1 e 3 `saved` 12/12; giro 2 `TECHNICAL_BLOCK` 0/0 per `infissi_common_applicability_reconciliation_gate_not_ready`.

Il difetto dominante è quindi un errore del runtime CDP, non una prova di mancata persistenza del Generatore: in questo 30x3 non compare il precedente verdetto `Generatore ... non confermato come persistito`. Per Cigognetti il terzo giro termina già a 1/14 con `Promise was collected`, quindi non consente di imputare l'esito alla pagina Generatore.

## Casi obbligatori e casi sorvegliati

- **Mara Elena Maddiotto:** `saved` 16/16 in tutti i giri; nessun problema.
- **Claudio Beghini:** `saved` 8/8 in tutti i giri; nessun problema.
- **Luca Callegari:** non ripetibile; un errore di verifica co-beneficiario nel primo giro, seguito da due `saved` 11/11.
- **Gabriella Bruno:** `saved` 8/8 in tutti i giri; nessun problema.
- **Luca Cigognetti:** non ripetibile; due `saved` 14/14 e un errore CDP a 1/14 nel terzo giro.
- **Cristina Ricchi:** `saved` 10/10 in tutti i giri; nessun problema.
- **Daniela Guidotti:** `saved` 8/8 in tutti i giri; nessun problema.
- **Emanuela Parolo:** non ripetibile per un singolo errore CDP nel giro 2; `saved` negli altri due.
- **Armando Ranzoni:** test mirato e tre giri tutti `saved` 10/10; nessun problema.
- **Danila Serpa:** esito tecnico ripetibile 0/8 in tutti i giri per verifica fallita di `id-comune_nascita`.

## OPERATOR_REQUIRED ripetibili

Gli stessi 11 casi risultano `OPERATOR_REQUIRED` in tutti e tre i giri: Cesare Imperiali; Besenval Fortunato; Vera Buracchi; Sabrina Eustomi; Eugenio Codognato; Milena Fiorini; Giovanni Pescatori; Mario Donnarumma; Marco Colombo; Caterina Claudia Garbato; Francesco Fumagalli.

Per ciascuno, checkpoint persistente, `report.blockers` e `/api/case-truth` concordano su `blocked_case` con almeno un blocker. Sono impedimenti per-pratica isolati e non un arresto globale della coda.

## Conclusione

Il 30x3 R22 è realmente concluso. I tre giri sono terminali, mai sovrapposti e verificati indipendentemente. Il risultato vero è **24/30 ripetibili** e **6/30 non ripetibili**. La stabilità delle pratiche salvate è migliorata per Ranzoni, Ricchi, Guidotti, Mara, Beghini e Bruno, ma la presenza intermittente di `Promise was collected` impedisce di considerare chiusa la stabilità complessiva del driver CDP.
