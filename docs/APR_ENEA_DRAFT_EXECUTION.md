# APR · esecuzione persistente della bozza ENEA TEST

## Ambito

Questa capability è separata dal preflight locale e consente esclusivamente:

1. creare una bozza ENEA dopo un preflight interamente verde;
2. compilare soltanto le pagine e i campi presenti nel workflow allowlistato;
3. salvare la bozza una sola volta dopo il checkpoint di tutte le pagine;
4. verificare lato server che la stessa bozza risulti salvata.

Anteprima, submit, ricevute, email e comunicazioni sono sempre vietati. Beatrice Ciotta è conservata come `deferred_operator` e non può entrare nell'esecuzione.

## Checkpoint e ripresa

Il checkpoint è `state/enea-draft-execution/checkpoint.json` nell'installazione permanente. Ogni transizione è atomica, protetta da lock e contiene `commandId` idempotente e ID delle regole applicate.

Prima di creare una bozza APR salva `create_intent_recorded` e porta `createAttemptCount` da 0 a 1. Dopo un arresto in questo stato la sola ripresa ammessa è `discover_existing_draft_readonly`: una seconda creazione alla cieca è vietata.

Prima di salvare APR salva `save_intent_recorded` e porta `saveAttemptCount` da 0 a 1. Dopo un arresto in questo stato la sola ripresa ammessa è `verify_saved_state_readonly`: un secondo salvataggio alla cieca è vietato.

### Esito incerto dopo il Salva di una pagina

Un timeout del controller dopo il click non dimostra né successo né fallimento. APR registra quindi `uncertainPageSave` nello stesso checkpoint della bozza e tenta, senza mutazioni, tre fonti indipendenti:

1. avanzamento/redirect server verso una route allowlistata della stessa bozza;
2. rilettura GET dei valori persistiti della pagina;
3. metadato server `Ultima modifica` successivo all'intento di salvataggio.

Se una prova dimostra `saved`, APR marca la pagina salvata, riaggancia lo stesso `draftId` e prosegue senza un secondo Salva. Se una prova dimostra `not_saved`, oppure tutte e tre restano inconcludenti, la pratica entra in `Richiesto intervento operatore` mentre la coda continua.

Il gate operatore accetta soltanto una decisione con `operatorId`, `evidenceId` e nota:

- `saved`: ripresa dalla pagina successiva, senza nuovo Salva;
- `not_saved`: autorizza un solo salvataggio di recupero sulla stessa bozza; i contatori conservano sia il primo intento sia il recupero;
- `indeterminate`: il caso resta isolato e non viene ritentato.

Se anche l'unico recupero autorizzato ha esito incerto, APR torna in `operator_required` e vieta ogni ulteriore tentativo. Riavvio, lock e `commandId` idempotenti conservano prove, decisione e contatori.

Gli stati di ripresa sono:

- `claim_next`: nessuna pratica attiva;
- `login_required`: autenticazione ENEA richiesta, blocco globale e non ticket pratica;
- `discover_existing_draft_readonly`: intento di creazione già registrato, ID ancora da recuperare;
- `resume_existing_draft`: riprendere esclusivamente l'ID bozza registrato;
- `verify_saved_state_readonly`: intento di salvataggio già registrato, verificare il server senza retry;
- `operator_intervention`: errore reale circoscritto e auditato.

La dashboard mostra una sezione dedicata con cliente, bozza/pagina, stato della risoluzione, tutte le prove read-only, decisione operatore e prossima azione. La dashboard rimane solo osservazione: non può emettere Salva o altri comandi verso ENEA.

## Comandi locali del servizio

Il bundle permanente espone comandi `draft-*` sullo stesso `--state-dir` del supervisore:

- `draft-status`
- `draft-login-required`
- `draft-session-ready`
- `draft-create-intent`
- `draft-created`
- `draft-page`
- `draft-save-intent`
- `draft-saved`
- `draft-operator-block`
- `draft-uncertain-page-decision --customer-key … --decision saved|not_saved|indeterminate --operator-id … --evidence-id … --note … --command-id …`

Questi comandi registrano stato e prove; non controllano il browser da soli e non possono aggirare l'allowlist. La dashboard espone lo snapshot read-only in `/api/enea-draft-execution`.

## Criterio di successo

Una pratica TEST è conclusa soltanto quando:

- l'ID bozza è unico e associato alla pratica corrente;
- tutte le pagine attese hanno un checkpoint con prova;
- esiste un intento di salvataggio persistente precedente all'azione;
- una lettura server successiva prova la bozza salvata;
- `createAttemptCount=1` e `saveAttemptCount=1`;
- `previewAllowed=false`, `submitAllowed=false`, `communicationsAllowed=false`.
