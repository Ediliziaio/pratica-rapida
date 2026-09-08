# APR r49 — correzione e verifica operativa

## Esito

La causa di `recovery_filling_checkpoint_invalid` e stata provata e corretta in modo generale con la regola `system-sequencer-recovery-prepared-window-lifecycle-v1`. Il bundle canonico `9a77fc9f-recovery-prepared-window-r49-20260904` e installato. Il gate monotono e verde: 444 suite, 1.750 test, zero fallimenti e 131 regole provate.

Il replay operativo ha confermato su Claudia Sellati che il sequencer non termina piu erroneamente durante la finestra `filling/prepared`. Subito dopo e pero emersa un'anomalia tecnica distinta, `enea_verified_package_recovery_intent_accounting_state_invalid`, fra `save_page_once` e la sonda server. L'esito della persistenza non e determinabile: la coorte e stata fermata in sicurezza e nessun altro replay e stato avviato.

## Causa e correzione r49

Il worker, dopo il claim del recupero, registra correttamente la pagina come `prepared` prima dell'intento dell'unico Salva. Il sequencer precedente accettava soltanto `pending` e interpretava questa finestra transitoria come checkpoint invalido.

r49 ammette `prepared` esclusivamente con tutte le condizioni fail-closed: stessa bozza canonica, una sola GET `not_saved`, una sola pagina autorizzata, `preparedEvidenceId` coerente, assenza di `savedEvidenceId`, contatori `save=1` e `recovery=0`. Qualunque divergenza continua a chiudere il gate.

## Verifica dei cinque casi

- **Lucia Droghetti, bozza 464067:** le cinque pagine gia salvate sono intatte. r49 elimina il falso verdetto del sequencer, ma l'unico recupero della pagina tecnica era gia stato tentato prima dell'installazione e la GET canonica ha provato `not_saved`; non e sicuro effettuare un terzo Salva. Stato complessivo: `INCONSISTENT` per divergenza fra checkpoint terminale e report/dashboard storico. Domanda: “Autorizzi una nuova generazione pulita per Lucia Droghetti, mantenendo intatta la bozza 464067, dato che l'unico recupero consentito sulla generazione corrente risulta gia consumato e non persistito?”
- **Claudia Sellati, bozza 460570:** conferma operativa della correzione r49. Il driver ha poi registrato `save_page_once` (`cdp-server-24`), ma il nuovo errore di accounting ha impedito la sonda server. Stato: `INCONSISTENT`; nessun verdetto sulla persistenza. Domanda: “Autorizzi la diagnosi e l'eventuale correzione generale di `enea_verified_package_recovery_intent_accounting_state_invalid`, preceduta da una verifica server read-only della pagina Anagrafica Beneficiario della bozza 460570?”
- **Cristina Ricchi, bozza 462183:** cinque pagine salvate e recupero ancora disponibile; replay non avviato per evitare di attraversare il nuovo difetto comune. Stato: `INCONSISTENT`. Domanda: “Dopo la correzione del difetto di accounting emerso su Sellati, autorizzi la ripresa controllata di Cristina Ricchi dalla bozza 462183?”
- **Orietta Artuso, bozza 462232:** cinque pagine salvate; recupero gia consumato, successiva prova server inconcludente. r49 non ricrea budget. Stato: `INCONSISTENT`. Domanda: “Puoi verificare in sola lettura se la Riga tecnica 1 della bozza 462232 contiene tutti i dati attesi e rispondere SALVATA, NON SALVATA oppure INDETERMINABILE?”
- **Angelina Stricelli, bozza 464009:** cinque pagine salvate; recupero gia consumato e GET canonica `not_saved`; resta congelata per decisione precedente. Stato: `INCONSISTENT`. Domanda: “Confermi di mantenere Angelina Stricelli assegnata all'operatore, senza nuove mutazioni sulla bozza 464009?”

## Sicurezza e continuita

Sono stati arrestati soltanto worker, supervisore e watchdog della coorte Sellati 3059. Keepalive e Chrome APR non sono stati riavviati: `launchctl` mostra keepalive attivo (PID 42593), il checkpoint ha heartbeat aggiornato e il controllore globale ha rilasciato la lease. Chrome APR resta PID 3785. Anteprima, submit e comunicazioni: zero.

## Limite della verifica

La correzione r49 e dimostrata dai test locali ed e stata confermata operativamente fino alla finestra che causava il falso blocco. Non e invece dimostrato che Sellati sia stata salvata, e non e sicuro riprendere Ricchi o mutare Lucia, Artuso e Angelina finche il nuovo errore di accounting non viene diagnosticato. Non viene quindi dichiarato alcun caso `READY`.
