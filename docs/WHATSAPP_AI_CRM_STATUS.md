# WhatsApp + AI + CRM — stato laboratorio

Ramo: `agent/whatsapp-ai-crm`

Stato: laboratorio separato da `main`; nessuna migration applicata in produzione e nessuna risposta AI automatica attivata.

## Base già esistente nel CRM

La piattaforma possiede già:

- conversazioni WhatsApp;
- storico messaggi;
- assegnazione a operatore;
- collegamento opzionale a `practice_id`;
- invio manuale e template;
- gestione finestra Meta e realtime.

Il lavoro V1 aggiunge un livello AI controllabile sopra questa base, non sostituisce la chat esistente.

## Modalità AI predisposte

Migration `20260811000200_whatsapp_ai_handoff.sql`:

- `assist`: AI può preparare/suggerire, non auto-invia;
- `auto`: risposte automatiche consentite soltanto se passano la policy applicativa;
- `paused`: presa in carico umana, AI bloccata.

Fail-safe database:

- le conversazioni già assegnate a un operatore vengono portate a `paused` quando la migration viene applicata;
- una nuova conversazione creata già assegnata nasce con AI `paused`;
- ogni successiva assegnazione o cambio operatore forza `paused`;
- la rimozione dell'assegnazione non riattiva automaticamente l'AI: la ripresa deve essere esplicita.

## Policy di routing

`routingPolicy.ts` separa classificazione e azione reale.

Categorie potenzialmente auto-consentite, solo con modalità `auto`, confidenza >= 0,90 e grounding sufficiente:

- stato pratica;
- documenti mancanti;
- FAQ approvate.

Categorie sempre umane:

- reclami;
- normativa;
- prezzi/sconti;
- eccezioni;
- richieste non classificate.

Mismatch di dati sensibili → sempre umano.

## Grounding CRM / isolamento cliente

`crmGrounding.ts` richiede contemporaneamente:

- `practice_id` persistito sulla conversazione;
- stessa pratica recuperata dal CRM;
- telefono WhatsApp coerente con il telefono del cliente della pratica.

Se manca uno di questi elementi, una risposta sullo stato/documenti della pratica non può essere auto-inviata. Il gate resta fail-closed.

## Minimizzazione dati

`minimalCrmContext.ts` riduce il contesto CRM prima di qualunque uso AI. Per stato pratica/documenti mancanti espone soltanto:

- id e codice pratica;
- stato;
- prodotto;
- timestamp ultimo aggiornamento;
- elenco limitato dei documenti mancanti.

Per default non propaga codice fiscale, indirizzi, URL dei documenti, importi o altre colonne non necessarie.

## Modalità Assist: contratto e pipeline

`draftContract.ts` definisce l'unico artefatto generato dalla V1: una `operator_draft` che ha sempre `requiresApproval=true`. Il contratto non possiede campi di destinatario, endpoint, template, token o invio.

`assistPipeline.ts` compone i gate in ordine deterministico:

1. verifica identità/pratica con `crmGrounding`;
2. applica `routingPolicy`;
3. produce una bozza soltanto se la policy non richiede intervento umano esclusivo;
4. produce il record di audit.

La pipeline è provider-independent e non contiene chiamate a Meta/WhatsApp né effetti collaterali. Anche se in futuro la policy restituisse `auto_send`, nel laboratorio il risultato resta una bozza destinata all'operatore: l'invio reale non esiste in questo modulo.

## Audit decisionale

Migration `20260811000201_whatsapp_ai_audit_log.sql` e `auditRecord.ts` registrano soltanto metadati utili a verificare la decisione:

- conversazione e messaggio inbound di riferimento;
- modalità AI;
- categoria;
- azione (`human_only`, `draft_only`, `auto_send`);
- confidenza;
- esito grounding CRM;
- motivo sintetico.

L'audit non duplica body della chat, prompt, documenti, URL o altri dati cliente. Questo permette di misurare falsi positivi e decisioni prima di autorizzare qualsiasi modalità automatica.

## Gate tecnici

Workflow `.github/workflows/whatsapp-ai-ci.yml`:

- test delle policy;
- test handoff/grounding;
- test minimizzazione contesto;
- test contratto bozza e pipeline Assist end-to-end;
- test audit data-minimal;
- regressione statica sugli invarianti della migration di presa in carico;
- typecheck TypeScript.

Stato ultimo checkpoint: CI verde anche con pipeline Assist end-to-end, minimizzazione dati e audit decisionale.

## Gate ancora aperti

1. Non applicare le migration al database reale senza autorizzazione esplicita.
2. Non scegliere/integrare un provider LLM finché il livello di policy/grounding non è stabilizzato.
3. Implementare il recupero read-only del contesto CRM usando esclusivamente il contratto minimizzato.
4. Collegare la pipeline `assist` all'interfaccia operatore esistente senza introdurre alcun invio automatico.
5. Valutare `auto` solo dopo log, metriche, audit dei falsi positivi e autorizzazione esplicita.
6. Nessun messaggio automatico su normativa, prezzi, reclami o eccezioni.
