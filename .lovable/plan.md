

# Stabilizzazione Sezione Pratiche — Piano

## Bug Identificati

### 1. Console Error: Badge senza forwardRef (ATTIVO IN CONSOLE)
Il componente `Badge` in `src/components/ui/badge.tsx` non usa `React.forwardRef()`. Questo causa il warning ripetuto visibile in console: "Function components cannot be given refs. Check the render method of ListView."

**Fix**: Wrappare `Badge` con `React.forwardRef`.

### 2. PipelineView — click/drag conflict (NON RISOLTO)
In `src/components/pratiche/PipelineView.tsx` riga 47, `DraggableCard` usa `onClick={() => !isDragging && navigate(...)}` — lo stesso bug che era stato corretto in `AdminDraggableCard` con il pattern `dragActivated ref`. La fix precedente ha toccato solo AdminPratiche, non PipelineView.

**Fix**: Applicare lo stesso pattern `dragActivated.current` ref usato in AdminDraggableCard.

## Verifiche Completate (gia' OK)

- `NuovaPratica.tsx`: spinner + testo su bottoni, step cliccabili — gia' implementati
- `PraticaDetail.tsx`: `Number(datiPratica.importo_lavori)` — gia' robusto
- `CodaPratiche.tsx`: queryKey stabilizzata con `.sort().join(",")` — gia' fixata
- `AdminPratiche.tsx`: forwardRef non necessario (AdminDraggableCard usa `setNodeRef` direttamente, non `React.forwardRef`) — il pattern `dragActivated` ref gia' presente
- `PraticaCard.tsx`: import puliti, nessun re-export legacy, nessun import inutilizzato
- `PraticheSummaryBar.tsx`, `PraticheFilters.tsx`: puliti, nessun problema

## Riepilogo Modifiche

| File | Azione |
|------|--------|
| `src/components/ui/badge.tsx` | Aggiungere `React.forwardRef` per eliminare warning console |
| `src/components/pratiche/PipelineView.tsx` | Fix click/drag conflict in DraggableCard con pattern `dragActivated` ref |

Due modifiche chirurgiche, zero cambi funzionali.

