

## Piano: Aggiungere vista Tabella alle Pratiche Admin

L'utente si trova su `/admin/pratiche` che attualmente ha 2 viste: **List** (card) e **Pipeline** (kanban). Voglio aggiungere una terza vista **Tabella** con colonne e righe usando i componenti `Table` gia presenti nel progetto.

### Modifiche

**1. `src/pages/AdminPratiche.tsx`**
- Estendere `ViewMode` da `"list" | "pipeline"` a `"list" | "pipeline" | "table"`
- Aggiungere un terzo bottone nel toggle group con icona `TableIcon` (da lucide-react)
- Aggiungere il rendering della vista tabella nel blocco condizionale

**2. Nuovo componente `src/components/pratiche/PraticheTableView.tsx`**
- Tabella HTML con i componenti `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` gia esistenti
- Colonne: Checkbox (selezione), Titolo, Azienda, Cliente, Stato (con badge colorato + select per cambio rapido), Pagamento (select), Prezzo, Operatore (select), Data, Azioni (elimina + naviga)
- Stesse props del list view: selezione, cambio stato/pagamento, assegnazione operatore, delete con conferma
- Righe cliccabili per navigare al dettaglio
- Indicatore aging dot sul titolo
- Ordinamento visivo coerente con le altre viste

### Dettagli tecnici

- Il componente riceve le stesse props gia passate alla list view (pratiche filtrate, selectedIds, callbacks per mutazioni, assigneeMap, internalOperators)
- Riusa `STATO_CONFIG`, `PAGAMENTO_BADGE`, `getAgingDot` da `pratiche-config`
- Riusa `AlertDialog` per conferma eliminazione come nella list view attuale
- Nessuna modifica al database necessaria

