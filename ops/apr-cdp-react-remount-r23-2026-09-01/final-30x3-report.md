# Report finale 30x3 R23 CDP React remount

Verifica conclusa il 1 settembre 2026. Tutti i 90 esiti sono terminali. Report, checkpoint, journal e snapshot terminali concordano pratica per pratica; nel giro 3 concordano anche tutte le dashboard statiche finali.

## Risultati aggregati

| Giro | Saved | Operator required | Technical block | Totale | Verifica |
|---|---:|---:|---:|---:|---|
| 1 | 17 | 11 | 2 | 30 | PASS |
| 2 | 17 | 11 | 2 | 30 | PASS |
| 3, dopo correzione osservabilità | 16 | 11 | 3 | 30 | PASS |

I giri 1 e 2 hanno esiti identici su tutte le 30 pratiche. Nel giro 3 cambia una sola pratica: Roberto Marcello passa da `saved` a `technical_block` per `apr_cdp_enea_field_verification_failed:id-comune_nascita`. Gli altri 29 esiti sono invariati.

La discrepanza storica Callegari/Serpa era causata da un errore generale nell'ordine di proiezione dello stato terminale: il finalizzatore salvava correttamente `TECHNICAL_BLOCK`, poi la dashboard statica veniva riscritta dalla proiezione legacy `operator_intervention`. La correzione installata impone che JSON statico, HTML e API derivino dallo stesso snapshot `sequencer_finalizer`. Nel nuovo giro 3, checkpoint, snapshot e dashboard concordano sia per Luca Callegari sia per Danila Serpa.

## Confronto pratica per pratica

| Pratica | Giro 1 | Giro 2 | Giro 3 |
|---|---|---|---|
| Barbara Melis | saved | saved | saved |
| Cesare Imperiali | operator_required | operator_required | operator_required |
| Mara Elena Maddiotto | saved | saved | saved |
| Claudio Beghini | saved | saved | saved |
| Besenval Fortunato | operator_required | operator_required | operator_required |
| Kitenge Ebambi | saved | saved | saved |
| Vera Buracchi | operator_required | operator_required | operator_required |
| Sabrina Eustomi | operator_required | operator_required | operator_required |
| Luca Callegari | technical_block | technical_block | technical_block |
| Eugenio Codognato | operator_required | operator_required | operator_required |
| Gabriella Bruno | saved | saved | saved |
| Milena Albertoni | saved | saved | saved |
| Milena Fiorini | operator_required | operator_required | operator_required |
| Lucia Lagrasta | saved | saved | saved |
| Giovanni Pescatori | operator_required | operator_required | operator_required |
| Daniela Guidotti | saved | saved | saved |
| Zeno Righetti | saved | saved | saved |
| Luca Cigognetti | saved | saved | saved |
| Cristina Ricchi | saved | saved | saved |
| Emanuela Parolo | saved | saved | saved |
| Roberto Marcello | saved | saved | technical_block |
| Flavia Cipriani | saved | saved | saved |
| Mario Donnarumma | operator_required | operator_required | operator_required |
| Marco Colombo | operator_required | operator_required | operator_required |
| Danila Serpa | technical_block | technical_block | technical_block |
| Amelia Lerose | saved | saved | saved |
| Caterina Claudia Garbato | operator_required | operator_required | operator_required |
| Eleonora Meggiarin | saved | saved | saved |
| Armando Ranzoni | saved | saved | saved |
| Francesco Fumagalli | operator_required | operator_required | operator_required |

## Prove e integrità

- Freeze base SHA-256: `d7d0a8c42260a0bfd773a2350524658929de84a57c2e7867bbfb7f9f60c39652`.
- Freeze correzione osservabilità giro 3 SHA-256: `dd75f41096444c7d46852901c7d7b833dcc5987ca53e4da3eb0aca9d0b8b46ad`.
- Manifest SHA-256: `55521654d4d859ad4014b599f951892e46397e11c95ca4a94cf643d612efb6fd`.
- Bundle giro 3: `e52389f5-terminal-observability-r23-fix-20260901`.
- Snapshot terminali presenti e `CONSISTENT`: 30/30 per ciascun giro.
- Mismatch report/checkpoint: 0 per ciascun giro.
- Mismatch journal/checkpoint: 0 per ciascun giro.
- Mismatch dashboard/checkpoint nel nuovo giro 3: 0.
- Sequencer giro 3 terminato con exit code 0 ed eseguito una sola volta; servizio del giro non più caricato.
- Keepalive APR ENEA rimasto attivo con PID 3784 e una sola esecuzione.
- Nessuna anteprima, submit, protocollazione, ricevuta, email o comunicazione eseguita.

## Hash delle fonti terminali

| Giro | report.json | checkpoint.json | sequencer.log |
|---|---|---|---|
| 1 | `7ef92ccfef9c868ba0d64ff8381d0fda31690f2bdd7e9c8c89d2182b8b7986ee` | `c5b3b9c16a711f301a3820c9d01e51a912b4f6ec9060072d65688c265734de01` | `f724909bba9feaf1ac4fe7f312f2dd20633b6b949b5cc6d623e3fef4c7fbdfd3` |
| 2 | `e2a9762ad98739a4fa46812b0a5eebbcc7fb8ee68d8d70da44fa6bc36ab7bbe4` | `3eede1b74f50ef5efc1689b94757d3cc98ff9bb438045ce672a0a1d2aa40e534` | `653007f867673ff0d83594e55dd7042ad9233aded45e117b050a3c33cacfe167` |
| 3 | `4e4663ede88a06ca050f4c4ebfe2af7bf070f95a1fe309b5dbd08cfb8e903b74` | `b4e0130993407b015e2b29a040583c8c51f76a679aabe38bbc463110fbbecfa3` | `fc5c2600787fd9f8889691e82a6da142155d7d1721c5ef04cec8cbe509514992` |
