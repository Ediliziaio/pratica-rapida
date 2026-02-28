

# AUDIT TECNICO + PIANO ENTERPRISE

## A) REPORT AS-IS

### Moduli Principali
- **Landing** (`Home.tsx` - 1170 righe, monolitico)
- **Auth** (login/signup con Supabase Auth)
- **Dashboard** (KPI azienda + KPI interni super_admin)
- **Pratiche ENEA** (CRUD, pipeline, dettaglio, checklist, documenti, chat)
- **Fatturazione** (fatture, note credito, proforma - con righe articoli)
- **Clienti** (anagrafica clienti finali)
- **Wallet** (credito prepagato, movimenti)
- **Aziende** (gestione multi-tenant con impersonificazione)
- **Utenti & Ruoli** (RBAC, assegnazione aziende)
- **Listino Servizi** (catalogo servizi)
- **Analytics** (KPI globali, grafici)

### Architettura Ruoli
6 ruoli: `super_admin`, `admin_interno`, `operatore`, `azienda_admin`, `azienda_user`, `partner`

### Problemi Identificati per Priorita'

#### P0 - CRITICI

1. **6 pagine orfane senza route** - `Analytics.tsx`, `Clienti.tsx`, `Listino.tsx`, `Fatturazione.tsx`, `FatturaDetail.tsx`, `NuovaFattura.tsx` non hanno route in `App.tsx`. Sono navigabili solo tramite link interni (GlobalSearch, navigate) ma restituiscono 404.

2. **STATO_CONFIG duplicato 5 volte** - Definito in `Dashboard.tsx`, `PraticaDetail.tsx`, `CodaPratiche.tsx`, `AdminPratiche.tsx`, `Aziende.tsx` e `PraticaCard.tsx`. Ogni file ha una versione leggermente diversa. Rischio di inconsistenza.

3. **`isInternalUser` logica duplicata** - Calcolata con `roles.some(r => [...].includes(r))` in almeno 4 file diversi. Gia' esiste `isInternal()` in `useAuth.tsx` ma non viene usata ovunque.

4. **Nessuna validazione server-side su input** - `NuovaPratica.tsx` accetta campi senza validazione (nome/cognome senza trim, CF non validato, email non validata). L'edge function `create-user` valida solo campi non vuoti.

5. **Leaked password protection disabilitata** - Rilevato dal linter Supabase.

#### P1 - IMPORTANTI

6. **`any` type spam** - `clienti_finali as any`, `companies as any`, `pratiche as any` usati in quasi tutti i file per accedere a relazioni Supabase. I tipi delle join non sono tipizzati.

7. **Nessun error boundary** - Se un componente crasha, tutta l'app crasha.

8. **Nessun indice DB esplicito** - Query frequenti su `pratiche.company_id`, `pratiche.stato`, `pratiche.created_at` non hanno indici verificati.

9. **GlobalSearch non scoped per ruolo** - La ricerca pratiche non filtra per `company_id` (solo clienti e fatture lo fanno). Un utente azienda potrebbe vedere titoli di pratiche di altre aziende nei risultati.

10. **Delete fatture senza conferma** - `deleteFattura.mutate(f.id)` viene chiamato senza dialog di conferma.

11. **Home.tsx monolitico** - 1170 righe in un singolo file.

#### P2 - MIGLIORAMENTI

12. **Pagine Clienti/Fatturazione/Listino non nella sidebar** - Esistono come pagine ma non sono accessibili dalla navigazione.
13. **`NuovaFattura.tsx` da 685 righe** - File molto grande, rifattorizzabile.
14. **Nessun lazy loading** - Tutte le pagine importate eagerly in `App.tsx`.
15. **Console log pulita** - Non rilevati errori runtime (positivo).

---

## B-J) PIANO DI INTERVENTO

Data la dimensione degli interventi, propongo di procedere in **3 fasi incrementali**. Ogni fase e' indipendente e non rompe nulla.

### FASE 1: Fix Critici (P0)

#### 1. Registrare le 6 route mancanti in `App.tsx`
- `/analytics` -> `Analytics`
- `/clienti` -> `Clienti`
- `/listino` -> `Listino`
- `/fatturazione` -> `Fatturazione`
- `/fatturazione/nuova` -> `NuovaFattura`
- `/fatturazione/:id` -> `FatturaDetail`

#### 2. Centralizzare STATO_CONFIG
- Creare `src/lib/pratiche-config.ts` con `STATO_CONFIG`, `STATO_ORDER`, `PraticaStato` esportati
- Aggiornare tutti i file che lo duplicano per importarlo da li'

#### 3. Unificare `isInternalUser`
- Usare `isInternal(roles)` da `useAuth.tsx` ovunque invece di ricalcolarlo

#### 4. Fix GlobalSearch scoping
- Aggiungere `.eq("company_id", companyId)` alla query pratiche quando l'utente non e' internal

#### 5. Aggiungere voci mancanti alla Sidebar
- Aggiungere Clienti, Fatturazione, Listino e Analytics alle sezioni appropriate

### FASE 2: Sicurezza + Validazione (P0-P1)

#### 6. Input validation con Zod
- Aggiungere schema Zod per `NuovaPratica` (nome, cognome, CF, email, telefono)
- Aggiungere schema Zod per creazione aziende e fatture

#### 7. Conferma delete
- Aggiungere AlertDialog prima di eliminare fatture, note credito, proforma

#### 8. Abilitare leaked password protection
- Documentare che va abilitato dal pannello Lovable Cloud

#### 9. Indici DB
- Creare indici su `pratiche(company_id, stato)`, `pratiche(created_at)`, `documenti(pratica_id)`, `clienti_finali(company_id)`

### FASE 3: Performance + Refactor (P1-P2)

#### 10. Lazy loading pagine
- Usare `React.lazy()` + `Suspense` per tutte le pagine in `App.tsx`

#### 11. Error Boundary
- Creare componente `ErrorBoundary` globale

#### 12. Ridurre `any` types
- Creare tipi helper per le join Supabase piu' usate

---

## MULTI-TENANCY CHECK

| Verifica | Stato |
|----------|-------|
| RLS su tutte le tabelle | OK - Tutte hanno RLS con `company_id` scope |
| `company_id` obbligatorio | OK - Non nullable sulle tabelle principali |
| Funzioni security definer | OK - `has_role`, `is_internal`, `user_belongs_to_company`, `get_user_company_ids` |
| GlobalSearch scoped | FAIL - Pratiche non filtrate per company_id |
| Impersonificazione controllata | OK - Solo super_admin puo' impersonare |

## SICUREZZA CHECK

| Verifica | Stato |
|----------|-------|
| Ruoli in tabella separata | OK |
| RLS attivo ovunque | OK |
| JWT validation edge functions | OK - `getClaims()` usato |
| Segreti nel codice | OK - Nessuno |
| Password leak protection | WARN - Disabilitata |
| Input validation server | FAIL - Minima |

## BACKUP & RESTORE

Il progetto usa Lovable Cloud che gestisce automaticamente i backup del database. La retention e il restore sono gestiti dall'infrastruttura Supabase sottostante. Non sono necessarie configurazioni aggiuntive per il backup.

---

## DICHIARAZIONE

Il progetto NON e' ancora pronto per produzione. Dopo l'implementazione della Fase 1 e Fase 2, il progetto raggiungera' standard accettabili. La Fase 3 e' raccomandata ma non bloccante.

**Vuoi procedere con la Fase 1 (fix critici)?**

