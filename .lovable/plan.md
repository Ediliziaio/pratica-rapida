

# Analisi Sezione Pratiche — Bug, Criticità e Miglioramenti

## 🔴 Bug e Criticità

### 1. PipelineView — Utenti azienda possono trascinare pratiche in qualsiasi stato
**File:** `src/components/pratiche/PipelineView.tsx` linee 94-123

Il drag & drop non ha alcuna validazione. Un utente azienda può spostare una pratica da "completata" a "bozza" o da "annullata" a "in_lavorazione". Dovrebbero poter solo: bozza → inviata (inviare) e al massimo annullare le proprie bozze.

**Fix:** Aggiungere regole di transizione stato. Un utente azienda dovrebbe poter solo: `bozza → inviata`. Gli admin possono fare qualsiasi transizione.

### 2. AdminPratiche — Query senza limit, rischio 1000 row cap
**File:** `src/pages/AdminPratiche.tsx` linea 137

La query globale scarica TUTTE le pratiche di tutte le aziende senza limit. Stesso problema del Dashboard.

**Fix:** Aggiungere filtro temporale o paginazione.

### 3. CodaPratiche — Query duplicata identica ad AdminPratiche
**File:** `src/pages/CodaPratiche.tsx` linea 32

La stessa query globale senza filtro né limit. `CodaPratiche` e `AdminPratiche` fanno quasi la stessa cosa — `CodaPratiche` potrebbe essere eliminata o unificata.

### 4. DocumentUpload — Eliminazione senza AlertDialog di conferma
**File:** `src/components/DocumentUpload.tsx` linea 211

Il pulsante elimina documento non ha conferma, viola lo standard progetto (AlertDialog obbligatorio per azioni distruttive).

**Fix:** Aggiungere `AlertDialog` come nelle altre azioni distruttive.

### 5. NuovaPratica — Race condition tra insert cliente e insert pratica
**File:** `src/pages/NuovaPratica.tsx` linee 127-163

Se la creazione pratica fallisce dopo aver creato il cliente, il cliente resta "orfano" nel database senza pratica associata. Non c'è rollback.

**Fix:** Wrappare in una transazione via edge function, oppure gestire il cleanup in caso di errore.

### 6. NuovaPratica — Crea sempre un nuovo cliente (duplicati)
**File:** `src/pages/NuovaPratica.tsx` linea 127

Ogni volta che si crea una pratica, viene creato un nuovo `clienti_finali`, anche se un cliente con lo stesso codice fiscale esiste già. Nel tempo si accumulano duplicati.

**Fix:** Verificare se esiste un cliente con lo stesso CF/nome nella stessa azienda e riutilizzarlo, oppure offrire un autocomplete.

### 7. PraticaDetail — Nessuna verifica di appartenenza
**File:** `src/pages/PraticaDetail.tsx` linea 31

La query carica la pratica solo per `id` senza verificare che l'utente abbia accesso. RLS protegge i dati, ma un utente potrebbe ricevere un errore generico "Pratica non trovata" senza capire che non ha permesso.

### 8. Pratiche — Query company senza limit
**File:** `src/pages/Pratiche.tsx` linea 43

La query della lista pratiche per company non ha limit. Con centinaia di pratiche per azienda, potrebbe colpire il cap di 1000 righe.

**Fix:** Aggiungere paginazione o `.limit()`.

## 🟡 Miglioramenti Consigliati

### 9. PraticaDetail — Nessun pulsante per cambiare stato lato azienda
L'utente azienda non ha modo di inviare una pratica in bozza dalla pagina dettaglio. Il cambio stato è riservato solo agli utenti interni. L'utente deve tornare alla pipeline e trascinare.

**Fix:** Aggiungere pulsante "Invia pratica" per le bozze (lato azienda).

### 10. PraticaDetail — Nessun campo per output/consegna
I campi `output_urls` e `note_consegna` esistono nel DB ma non vengono mostrati nel dettaglio. Quando una pratica è completata, l'utente non vede il risultato.

**Fix:** Mostrare una sezione "Documenti di output" e "Note di consegna" quando presenti.

### 11. AdminPratiche vs CodaPratiche — Duplicazione logica
Due pagine (`AdminPratiche` e `CodaPratiche`) fanno sostanzialmente la stessa cosa con piccole differenze. `CodaPratiche` ha il dialog di assegnazione, `AdminPratiche` ha l'inline select. Codice duplicato > 300 righe.

**Fix:** Unificare in una sola pagina o estrarre componenti condivisi.

### 12. PipelineView — Nessun feedback tattile su mobile
Il drag & drop usa solo `PointerSensor` con `distance: 8`. Su mobile potrebbe essere poco usabile. Nessun feedback visivo durante il drag.

### 13. Aging dot basato su `created_at` — potenzialmente fuorviante
**File:** `src/lib/pratiche-config.ts` linea 43

L'aging dot calcola i giorni da `created_at`. Una pratica creata 10 giorni fa ma spostata in "in_lavorazione" ieri mostrerà un dot rosso anche se è stata appena presa in carico. Dovrebbe usare `updated_at` (o meglio, il timestamp dell'ultimo cambio stato dall'audit log).

### 14. BulkActionsBar — Nessuna validazione transizione stato
Il cambio stato bulk non verifica le transizioni valide. Un utente azienda potrebbe tecnicamente impostare tutte le pratiche selezionate su "completata" via bulk action.

### 15. Export CSV — Nessun feedback per file vuoto
Se `filtered` è vuoto, il pulsante CSV è disabilitato in `Pratiche.tsx` ma non in `AdminPratiche.tsx`.

## Riepilogo priorità

| # | Criticità | Gravità |
|---|-----------|---------|
| 1 | Pipeline DnD senza regole di transizione stato | 🔴 Sicurezza/Logica |
| 2 | AdminPratiche query senza limit | 🟡 Scalabilità |
| 3 | CodaPratiche query duplicata senza limit | 🟡 Scalabilità |
| 4 | DocumentUpload elimina senza conferma | 🔴 UX/Integrità |
| 5 | NuovaPratica race condition cliente/pratica | 🟡 Integrità dati |
| 6 | NuovaPratica duplicazione clienti | 🟡 Integrità dati |
| 7 | PraticaDetail nessuna verifica appartenenza | 🟢 UX |
| 8 | Pratiche query senza limit | 🟡 Scalabilità |
| 9 | PraticaDetail nessun pulsante invio per azienda | 🟡 UX |
| 10 | Output/consegna non mostrati | 🟡 Feature mancante |
| 11 | AdminPratiche vs CodaPratiche duplicazione | 🟢 DRY |
| 12 | Pipeline mobile usabilità | 🟢 UX |
| 13 | Aging dot usa created_at | 🟡 Dati fuorvianti |
| 14 | Bulk actions senza validazione transizione | 🟡 Logica |
| 15 | Export CSV feedback inconsistente | 🟢 UX |

Vuoi che proceda con la correzione di tutti questi punti?
