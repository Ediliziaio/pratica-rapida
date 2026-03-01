

# Analisi Super Admin -- Cosa Manca per un SaaS Enterprise

## Stato Attuale

Il pannello Super Admin ha: Dashboard con KPI interni, gestione Aziende (CRUD + impersonificazione + wallet topup), Pratiche globali (lista + pipeline + assegnazione operatori), Coda Pratiche, Utenti & Ruoli, Listino Servizi, Analytics (grafici base).

Esiste gia' una tabella `audit_log` nel DB ma non viene usata da nessuna parte nel frontend. Le `notifications` esistono nel DB ma sono usate solo lato utente.

---

## Cosa Integrerebbe un CEO/CTO di un SaaS

### 1. Audit Log Viewer (PRIORITA' ALTA)
La tabella `audit_log` esiste gia' ma non ha UI. Un SaaS serio ha bisogno di visibilita' su chi ha fatto cosa e quando.

**Cosa costruire:**
- Nuova pagina `/admin/audit-log` con tabella filtrable per azione, utente, azienda, pratica, data
- Registrare automaticamente le azioni critiche (cambio stato pratica, assegnazione operatore, wallet topup, creazione/eliminazione utenti) tramite trigger DB o chiamate esplicite
- Aggiungere alla sidebar Super Admin

### 2. Pagina Dettaglio Azienda (PRIORITA' ALTA)
Oggi le aziende sono solo card in lista. Manca una pagina dedicata `/aziende/:id` con:
- Anagrafica completa + modifica inline
- Lista pratiche dell'azienda
- Storico wallet (movimenti)
- Utenti assegnati
- Fatture emesse
- KPI specifici dell'azienda (revenue, tempo medio, pratiche completate)

### 3. Notifiche Interne per Operatori (PRIORITA' ALTA)
Le notifiche esistono nel DB ma gli operatori non vengono avvisati quando:
- Una pratica viene assegnata a loro
- Un'azienda invia una nuova pratica
- Un documento viene caricato su una pratica in lavorazione

**Cosa costruire:**
- Trigger DB che crea notifiche per gli operatori sugli eventi chiave
- Il `NotificationBell.tsx` esiste gia', verificare che funzioni per gli interni

### 4. Dashboard Operativa Migliorata (PRIORITA' MEDIA)
La dashboard interna mostra KPI ma manca:
- **SLA Tracking**: tempo medio di presa in carico (da "inviata" a "in_lavorazione"), tempo medio di completamento, pratiche oltre SLA
- **Carico operatori**: quante pratiche ha ciascun operatore, chi e' sovraccarico
- **Revenue forecast**: proiezione mensile basata su trend
- **Churn indicator**: aziende che non inviano pratiche da 30+ giorni

### 5. Impostazioni Piattaforma (PRIORITA' MEDIA)
Manca una pagina di configurazione globale:
- **SLA settings**: tempi target per stato (es. max 24h per presa in carico)
- **Email templates**: configurazione notifiche email
- **Wallet settings**: soglia minima wallet, alert automatico
- **Whitelabel**: logo, colori, nome piattaforma per branding personalizzato

### 6. Export & Reporting (PRIORITA' MEDIA)
Nessuna funzione di export presente:
- Export CSV/Excel di pratiche, fatture, movimenti wallet
- Report periodico automatico (settimanale/mensile) con KPI
- Generazione PDF report per singola azienda

### 7. Gestione Pagamenti Centralizzata (PRIORITA' MEDIA)
Il campo `pagamento_stato` esiste sulle pratiche ma non c'e' una vista dedicata:
- Lista pratiche non pagate / in verifica
- Riconciliazione pagamenti
- Alert per pratiche completate ma non pagate

### 8. Activity Feed / Timeline (PRIORITA' BASSA)
Un feed in tempo reale sulla dashboard interna che mostra:
- Ultime pratiche inviate
- Ultimi cambi di stato
- Ultimi documenti caricati
- Ultimi messaggi in chat

---

## Piano di Implementazione Proposto

Procederei in 2 fasi per non rompere nulla:

### Fase A: Visibilita' e Controllo (4 interventi)

| # | Intervento | File |
|---|-----------|------|
| 1 | **Audit Log Viewer** - Nuova pagina con tabella filtrabile + trigger DB per registrare azioni | Nuovo: `src/pages/AuditLog.tsx`, route in `App.tsx`, sidebar |
| 2 | **Dettaglio Azienda** - Pagina dedicata con tabs (anagrafica, pratiche, wallet, utenti, KPI) | Nuovo: `src/pages/AziendaDetail.tsx`, route `/aziende/:id` |
| 3 | **Notifiche Operatori** - Trigger DB per notifiche su assegnazione e nuove pratiche | Migration SQL + verifica `NotificationBell.tsx` |
| 4 | **Vista Pagamenti** - Sezione nella dashboard o pagina dedicata per pratiche non pagate | Nuovo: sezione in dashboard o pagina dedicata |

### Fase B: Intelligence e Export (4 interventi)

| # | Intervento | File |
|---|-----------|------|
| 5 | **SLA Tracking + Carico Operatori** nella dashboard | Modifica `Dashboard.tsx` sezione interna |
| 6 | **Export CSV** su pratiche, fatture, movimenti | Utility + bottoni nelle pagine esistenti |
| 7 | **Activity Feed realtime** sulla dashboard interna | Nuovo componente + realtime subscription |
| 8 | **Impostazioni Piattaforma** - Pagina settings globali | Nuovo: `src/pages/ImpostazioniPiattaforma.tsx` |

### Dettaglio tecnico

**DB Changes (Fase A):**
- Trigger su `pratiche` per INSERT in `audit_log` su cambio stato
- Trigger su `pratiche` per INSERT in `notifications` quando `assegnatario_id` cambia
- Trigger su `pratiche` per INSERT in `notifications` quando stato = 'inviata' (notifica a tutti gli interni)
- Indice su `audit_log(created_at)` e `audit_log(company_id)`

**Nuove Route:**
- `/admin/audit-log` -> AuditLog
- `/aziende/:id` -> AziendaDetail

**Sidebar Update:**
- Aggiungere "Audit Log" agli `internalItems` nella sidebar

