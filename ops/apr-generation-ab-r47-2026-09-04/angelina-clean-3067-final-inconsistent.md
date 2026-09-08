# Angelina Stricelli — esito generazione pulita 3067

## Verdetto

`INCONSISTENT`. Non è corretto attribuire né `OPERATOR_REQUIRED` né `TECHNICAL_BLOCK`, perché le fonti terminali non concordano.

## Disposizione operativa successiva

Giuliano ha classificato il caso come **`OPERATOR_REQUIRED_COMPLEX_CASE`**, con override
caso-specifico e non propagabile. Angelina viene affidata al flusso umano e non deve essere
ritentata automaticamente. Questa disposizione non riscrive la verità storica divergente del
test 3067 e non indebolisce le correzioni generali già acquisite.

- Il checkpoint del worker registra `operator_intervention`: anche l'unico recupero autorizzato del primo infisso non è stato persistito.
- Il report del sequencer registra `technical_block` per `recovery_filling_checkpoint_invalid`.
- Lo snapshot dashboard pubblica `TECHNICAL_BLOCK`, ma usa la motivazione del worker relativa alla mancata persistenza.
- `/api/case-truth` non era raggiungibile alla verifica finale.

## Causa provata

APR ha creato la nuova bozza canonica 464009 e ha salvato con prova server le prime cinque pagine. Il primo `Salva` della modale `screening:1` non ha prodotto persistenza; una GET canonica ha provato `not_saved`. Il solo recupero consentito, autorizzato con quella prova e budget residuo uno, non ha prodotto persistenza neppure lui; una seconda GET canonica ha nuovamente provato `not_saved`.

Durante la transizione finale, il sequencer ha campionato lo stato intermedio `filling/recovery_authorized` con il budget ormai consumato e lo ha dichiarato invalido circa due secondi prima che il worker pubblicasse il proprio stato terminale. Restano quindi due problemi da separare prima di proseguire: il `Salva` della modale Infissi che non raggiunge la mutazione applicativa e la classificazione prematura del sequencer durante la transizione di recovery.

## Sicurezza

Sono state salvate soltanto 5 pagine su 14. Nessun dato del primo infisso risulta persistito. Non sono state aperte anteprima, invio o comunicazioni. Nessun ulteriore salvataggio è consentito sulla generazione e Flavia non è stata avviata.

## Domanda operatore

**Quale operatore prende in carico manualmente Angelina Stricelli dalla bozza 464009, senza riattivare APR su questa pratica?**
