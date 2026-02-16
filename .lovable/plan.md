

# Drag & Drop Pipeline + Filtri Data/Cliente

## 1. Drag & Drop nella Pipeline

Installare `@dnd-kit/core` e `@dnd-kit/sortable` (libreria leggera e moderna per React DnD) e integrarlo nella `PipelineView`.

### Comportamento
- Ogni card pratica diventa **draggable**
- Ogni colonna di stato diventa una **drop zone**
- Trascinando una card da una colonna all'altra, lo stato della pratica viene aggiornato nel database
- Feedback visivo: la colonna di destinazione si evidenzia durante il drag
- Aggiornamento ottimistico: la card si sposta subito, poi conferma col database
- Toast di conferma dopo lo spostamento (es. "Pratica spostata in In Lavorazione")

### Implementazione tecnica
- Wrappare la `PipelineView` con `DndContext` di `@dnd-kit/core`
- Ogni colonna usa `useDroppable` con id = stato
- Ogni card usa `useDraggable` con id = pratica.id
- `onDragEnd`: se la colonna di destinazione e' diversa da quella di origine, eseguire `supabase.from("pratiche").update({ stato: newStato }).eq("id", praticaId)`
- Invalidare la query `["pratiche", companyId]` dopo l'update

## 2. Filtri per Data e Cliente

Aggiungere nella barra filtri (sopra la lista/pipeline):

### Filtro per data
- Un **date range picker** con due campi "Da" e "A" usando il componente `Calendar` + `Popover` gia' presenti
- Filtra le pratiche per `created_at` nel range selezionato
- Bottone "Reset" per togliere il filtro data

### Filtro per cliente
- Un **Select** (combobox) che mostra la lista dei clienti unici presenti nelle pratiche
- Popolato dai dati gia' caricati (nomi unici da `clienti_finali`)
- Opzione "Tutti i clienti" per resettare

### Layout filtri
I filtri saranno in una riga sotto la barra di ricerca, visibili in entrambe le viste (lista e pipeline):

```text
[Cerca pratiche...______] [Lista|Pipeline]
[Da: gg/mm/aaaa] [A: gg/mm/aaaa] [Cliente: Tutti ▼] [Reset filtri]
```

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `package.json` | Aggiungere `@dnd-kit/core` e `@dnd-kit/utilities` |
| `src/pages/Pratiche.tsx` | Aggiungere stati per filtri data/cliente, logica di filtro, UI filtri, integrare DnD nella PipelineView |

### Nuove dipendenze
- `@dnd-kit/core` - gestione drag & drop
- `@dnd-kit/utilities` - utility CSS per trasformazioni

### Nuovi stati nel componente Pratiche
- `filterDateFrom: Date | undefined`
- `filterDateTo: Date | undefined`
- `filterCliente: string` (id del cliente o stringa vuota per "tutti")

### Logica di filtro aggiornata
Il filtro `filtered` terra' conto anche di:
- `created_at >= filterDateFrom` (se impostato)
- `created_at <= filterDateTo` (se impostato)
- `cliente_finale_id === filterCliente` (se impostato)

