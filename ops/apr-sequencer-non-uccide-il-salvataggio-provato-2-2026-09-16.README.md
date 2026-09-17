# Patch: il sequencer non uccide un salvataggio provato, parte 2 (Droghetti 16/09)

`git apply ops/apr-sequencer-non-uccide-il-salvataggio-provato-2-2026-09-16.patch` a lotto fermo.

Giro r127 (coorte 10370): pagina «Schermature solari» con Salva incerto, risolta `resolved_saved` dalla
GET canonica (server_metadata_get), completata; il worker era gia' passato a «Calcolo costi» e aveva
registrato l'intento di Salva. Coppia `save_intent_recorded/resolved_saved` → `state_status_mismatch`
→ isolata una lavorazione sana. Stessa forma della patch del 15/09 (filling/resolved_saved), un passo
piu' avanti.

Correzione in `sequencerPreflightGuard.mjs`: il ramo `resolved_saved` accetta anche
`save_intent_recorded`, con le stesse prove (una sola sonda saved, checkpoint della pagina risolta
saved con la stessa evidenza, pagina risolta fra le completate). Due test nuovi nel file del gate
(20/20). Eseguito sul checkpoint reale della coorte 10370: guardia attuale → invalid
(state_status_mismatch), guardia corretta → wait_for_worker_resume.

Nota: il bundle installato contiene la copia congelata del guard; serve reinstallare il bundle.
