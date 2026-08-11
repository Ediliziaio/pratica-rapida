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

## Gate tecnici

Workflow `.github/workflows/whatsapp-ai-ci.yml`:

- test delle policy;
- test handoff/grounding;
- regressione statica sugli invarianti della migration di presa in carico;
- typecheck TypeScript.

Stato ultimo checkpoint: CI verde per policy di routing, handoff, isolamento CRM e invarianti della migration.

## Gate ancora aperti

1. Non applicare la migration al database reale senza autorizzazione esplicita.
2. Non scegliere/integrare un provider LLM finché il livello di policy/grounding non è stabilizzato.
3. Implementare il recupero read-only del contesto CRM strettamente necessario alla risposta.
4. Implementare prima la modalità `assist` con bozze e approvazione operatore.
5. Valutare `auto` solo dopo log, metriche, audit dei falsi positivi e autorizzazione esplicita.
6. Nessun messaggio automatico su normativa, prezzi, reclami o eccezioni.
