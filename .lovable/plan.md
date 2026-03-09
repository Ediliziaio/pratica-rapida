

# Analisi Dashboard — Bug, Criticità e Miglioramenti

## 🔴 Bug e Criticità

### 1. SLA Settings in localStorage — Problema di sicurezza
**File:** `Dashboard.tsx` linee 25-32

Le impostazioni SLA vengono lette da `localStorage`. Questo significa:
- Qualsiasi utente può manipolare i valori SLA dal browser DevTools
- Le impostazioni non sono condivise tra utenti/dispositivi
- Se un admin cambia le soglie SLA da `ImpostazioniPiattaforma`, gli altri utenti non vedono l'aggiornamento

**Fix:** Spostare le impostazioni SLA in una tabella database (es. `platform_settings`) e leggerle con una query.

### 2. Nessuna protezione di ruolo sulle route
**File:** `App.tsx`

`ProtectedRoute` verifica solo che l'utente sia autenticato, ma non controlla i ruoli. Un utente `azienda_user` può navigare direttamente a `/admin/pratiche`, `/aziende`, `/analytics`, `/admin/audit-log`, ecc. I dati sono protetti da RLS, ma l'utente vede pagine vuote o errori invece di un redirect/403.

**Fix:** Creare un `RoleGuard` component che verifichi i ruoli richiesti e rediriga se non autorizzato.

### 3. Calcolo "completate del mese" usa `created_at` invece di `updated_at`
**File:** `Dashboard.tsx` linee 107-114

```typescript
const completateMese = pratiche.filter(p => {
  const d = new Date(p.created_at); // ← BUG: dovrebbe essere updated_at
  return p.stato === "completata" && d.getMonth() === thisMonth ...
});
```

Una pratica creata a gennaio e completata a marzo verrà contata come "completata a gennaio". Lo stesso bug si ripete nelle righe 111-114 (mese precedente), 158-165 (revenue), 168-175 (pratiche mese), 178-185 (completate globali).

**Fix:** Usare `updated_at` per le pratiche completate e `created_at` per contare le pratiche "create nel mese".

### 4. SLA Tracking — Calcoli approssimativi e fuorvianti
**File:** `Dashboard.tsx` linee 230-255

Il tempo di presa in carico viene calcolato come `updated_at - created_at`, ma `updated_at` viene aggiornato ad ogni modifica (cambio pagamento, assegnazione, ecc.), non solo al cambio stato. Il calcolo è quindi inaccurato. Servirebbero timestamp dedicati per ogni transizione di stato oppure interrogare l'audit_log per le date esatte.

### 5. Nessun limite sulla query `allPratiche`
**File:** `Dashboard.tsx` linea 68

La query scarica TUTTE le pratiche senza limit. Con migliaia di pratiche questo causa problemi di performance e rischia di colpire il limite di 1000 righe di Supabase, causando dati parziali silenziosamente.

**Fix:** Aggiungere paginazione o limitare il periodo temporale (es. ultimi 12 mesi).

### 6. `companyId` null per utenti interni senza company
Per gli utenti interni (super_admin, operatore) che non hanno una `user_company_assignment`, `companyId` sarà `null`. La sezione azienda della dashboard (linea 326: `{companyId && ...}`) non viene mostrata, il che è corretto, ma il testo "Ecco la situazione delle tue pratiche ENEA" è fuorviante per un super_admin.

## 🟡 Miglioramenti Consigliati

### 7. ActivityFeed — Dettagli audit log non corrispondono ai campi del trigger
Il trigger `audit_pratica_stato_change` salva `stato_precedente` e `stato_nuovo`, ma l'ActivityFeed cerca `old_stato` e `new_stato` (linea 104). I dettagli non vengono mai mostrati.

### 8. Mancanza di loading/error states
Le query non mostrano spinner durante il caricamento né messaggi di errore in caso di fallimento. L'utente vede semplicemente "0" ovunque.

### 9. Performance — Troppi `useMemo` e filtri ripetuti
Lo stesso array `allPratiche` viene filtrato molte volte con logiche simili. Si potrebbe calcolare tutti i KPI in un singolo `useMemo` per ridurre i passaggi.

### 10. Emoji nei titoli delle card
Titoli come "📊 KPI Interni", "🔴 Activity Feed", "💰 Pratiche Completate Non Pagate" usano emoji. Meglio usare icone Lucide per coerenza visiva.

## Riepilogo priorità

| # | Criticità | Gravità |
|---|-----------|---------|
| 1 | SLA in localStorage | 🔴 Sicurezza |
| 2 | Route non protette per ruolo | 🔴 Sicurezza |
| 3 | created_at vs updated_at | 🔴 Bug dati |
| 4 | SLA calcoli inaccurati | 🟡 Dati fuorvianti |
| 5 | Query senza limit (1000 row cap) | 🟡 Scalabilità |
| 6 | Testo dashboard fuorviante per interni | 🟢 UX |
| 7 | ActivityFeed campi sbagliati | 🔴 Bug |
| 8 | Mancanza loading/error states | 🟡 UX |
| 9 | Performance filtri ripetuti | 🟢 Ottimizzazione |
| 10 | Emoji vs icone | 🟢 Coerenza UI |

Vuoi che proceda con la correzione di tutti questi punti, oppure preferisci indicarmi quali priorità affrontare per prime?

