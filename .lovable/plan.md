

# Stabilizzazione Finale — Sezione Pratiche

## Stato Attuale

Dopo le iterazioni precedenti, la sezione Pratiche e' in buono stato. Questa analisi ha identificato **solo problemi di pulizia codice e DRY** — nessun bug funzionale, nessun blocco UX, nessun crash.

---

## 1. Codice Morto / Inutilizzato

### A. PipelineView.tsx — variabile `Icon` mai usata
In `DroppableColumn` (riga 17), `const Icon = conf.icon` viene dichiarata ma mai renderizzata. L'icona viene renderizzata solo nell'header della colonna dentro `PipelineView`, non in `DroppableColumn`.

### B. CodaPratiche.tsx — import e variabili inutilizzati
- Riga 4: `useAuth` importato, riga 23: `const { user } = useAuth()` — `user` mai usato nel componente.
- Riga 18: `STATO_ORDER` importato da `pratiche-config` ma mai usato — il componente usa `statoOrder` locale (riga 107) con ordine diverso per prioritizzare gli stati actionable.

---

## 2. Violazione DRY — Costanti Duplicate

`PAGAMENTO_BADGE`, `ACTIVE_STATES` e `getAgingDot`/`getAdminAgingDot` sono definiti identicamente in due file:
- `src/components/pratiche/PraticaCard.tsx` (righe 10-25)
- `src/pages/AdminPratiche.tsx` (righe 29-44)

Soluzione: estrarre in `src/lib/pratiche-config.ts` (gia' il punto centralizzato per le configurazioni pratiche) e importare da li'.

---

## 3. Riepilogo Modifiche

| File | Azione |
|------|--------|
| `src/lib/pratiche-config.ts` | Aggiungere `PAGAMENTO_BADGE`, `ACTIVE_STATES`, `getAgingDot` |
| `src/components/pratiche/PraticaCard.tsx` | Rimuovere definizioni locali, importare da `pratiche-config` |
| `src/pages/AdminPratiche.tsx` | Rimuovere definizioni locali, importare da `pratiche-config` |
| `src/components/pratiche/PipelineView.tsx` | Rimuovere `Icon` inutilizzato in `DroppableColumn` |
| `src/pages/CodaPratiche.tsx` | Rimuovere `useAuth`/`user` e import `STATO_ORDER` inutilizzati |

Zero cambi funzionali. Zero modifiche DB. Solo pulizia e centralizzazione.

