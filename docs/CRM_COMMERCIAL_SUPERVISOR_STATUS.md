# CRM Commerciale / Supervisor AI — stato laboratorio

Ramo: `agent/crm-commerciale-supervisor`

Stato: laboratorio separato da `main`; nessuna migration applicata al database di produzione e nessun contatto automatico attivato.

## Obiettivo V1

Creare una coda unica per Samuele/operatore che evidenzi solo ciò che merita attenzione:

- lead nuovi dimenticati;
- follow-up rimasti fermi;
- aziende registrate ma mai attivate;
- clienti appena attivati da accompagnare alla seconda pratica;
- clienti in calo o a rischio;
- clienti inattivi.

Clienti stabili o in crescita non devono generare solleciti inutili.

## Componenti predisposti

### Salute rivenditori

Migration `20260811000100_crm_commercial_health_view.sql`:

- totale pratiche ENEA;
- pratiche ultimi 30 giorni e 30 precedenti;
- mese corrente e precedente;
- prima/ultima pratica;
- variazione percentuale;
- classificazione deterministica;
- punteggio attenzione;
- motivo leggibile dal Supervisor.

Classificazioni:

- `mai_attivato`;
- `nuovo_attivo`;
- `stabile`;
- `in_crescita`;
- `in_calo`;
- `a_rischio`;
- `inattivo`.

La prima attivazione entro 30 giorni ha precedenza sul semplice confronto di crescita: un cliente nuovo non viene scambiato per un cliente maturo in crescita.

### Lead

Migration `20260811000101_crm_lead_attention_view.sql` e policy `leadPolicy.ts`:

- nessun primo contatto dopo 24 ore → alta attenzione;
- lead già contattato ma fermo in `lead/contatto` da almeno 72 ore → follow-up;
- `demo`, `onboarding`, `attivo` → nessun sollecito automatico.

### Suggerimenti azione

`actionPolicy.ts` decide in modo trasparente il tipo di azione suggerita e il canale preferibile.

Regola congelata: **il Supervisor suggerisce, non contatta il cliente da solo**. Tutte le azioni hanno `requiresHumanApproval=true`.

### Coda unica

`supervisorQueue.ts` unisce clienti e lead, elimina il rumore (`monitor`, crescita, lead già in avanzamento) e ordina gli elementi realmente azionabili per punteggio.

## Gate tecnici

Workflow `.github/workflows/crm-commercial-ci.yml`:

- installazione dipendenze;
- test Vitest di tutte le policy commerciali;
- typecheck TypeScript.

Stato ultimo checkpoint: CI verde sulle policy e sulla coda unica.

## Gate ancora aperti

1. Non applicare le migration al database reale senza autorizzazione esplicita.
2. Prima dell'integrazione UI verificare i risultati su dati reali in sola lettura e confrontare manualmente un campione di rivenditori noti.
3. Definire l'interfaccia operatore della coda unica.
4. Collegare WhatsApp soltanto come canale suggerito/assistito, rispettando la policy di handoff del ramo `agent/whatsapp-ai-crm`.
5. Nessun messaggio commerciale automatico finché non esiste una policy esplicitamente autorizzata e testata.
