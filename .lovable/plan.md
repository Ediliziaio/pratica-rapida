

# Analisi e Piano di Stabilizzazione — Sezione Pratiche

## 1. Bug e Errori Identificati

### A. Console Error: `forwardRef` in AdminPratiche (CRITICO)
`AdminDraggableCard` viene passato come ref a `useDraggable` ma non usa `React.forwardRef()`. Questo causa il warning in console e potenzialmente problemi con il DnD.

**Fix**: Wrappare `AdminDraggableCard` con `React.forwardRef`.

### B. `CodaPratiche` duplica quasi interamente `AdminPratiche`
Entrambe le pagine fanno la stessa query (`pratiche` + `companies` + `clienti_finali`), lo stesso rendering card, lo stesso `quickChangeStato`. `CodaPratiche` ha una query separata ridondante per `assignee-profiles` con una chiave react-query instabile (array di IDs come chiave → re-fetch inutili ad ogni render).

**Fix**: La query `assignee-profiles` in CodaPratiche usa `pratiche.map(p => p.assegnatario_id)` come queryKey — questo cambia ad ogni fetch, causando loop. Stabilizzare con un sorted/joined string. Ma siccome CodaPratiche e AdminPratiche sono quasi identiche, segnalo solo il bug senza rimuovere la pagina (per non cambiare funzionalità).

### C. DnD `onClick` conflict con drag
In `AdminDraggableCard` e `DraggableCard` (PipelineView), `onClick` è sulla Card stessa con `{...listeners}` → il click naviga anche quando il drag fallisce sotto la distanza minima. Il check `!isDragging` non è sufficiente perché `isDragging` è falso quando il drag non si attiva.

**Fix**: Usare un ref per tracciare se il drag è stato attivato, e bloccare la navigazione solo dopo un drag reale.

### D. `PraticaDetail` — `datiPratica.importo_lavori > 0` crash se undefined
Riga 150: `datiPratica.importo_lavori > 0` → se `importo_lavori` è `undefined`, la comparazione non crasha ma non mostra nulla. Tuttavia il `toFixed(2)` a riga 153 crasherebbe se fosse `undefined` e il check passasse. Rischio basso ma da rendere robusto.

**Fix**: `Number(datiPratica.importo_lavori) > 0`

### E. NuovaPratica — nessun loading state sui bottoni durante submit
I bottoni "Invia" e "Salva Bozza" hanno `disabled={submitPratica.isPending}` ma nessun testo/spinner di feedback visivo.

**Fix**: Aggiungere spinner e testo "Invio in corso..." / "Salvataggio..." durante `isPending`.

### F. `usePraticheRealtime` non invalida `admin-all-pratiche`
Il realtime hook invalida solo `["pratiche", companyId]` ma non la query admin. Gli admin non vedono aggiornamenti realtime nella vista AdminPratiche.

**Fix**: Non risolvibile senza cambiare il comportamento funzionale (il hook è company-scoped). Segnalo come nota.

## 2. Codice Morto / Inutilizzato

### Da rimuovere:
- **`PraticaCard.tsx` riga 1-3**: Re-export di `STATO_ORDER`, `STATO_CONFIG`, `PraticaStato` — usato da `Pratiche.tsx` riga 11 (`import { STATO_ORDER, STATO_CONFIG, ListView } from "@/components/pratiche/PraticaCard"`). Questo re-export è un pattern legacy — `Pratiche.tsx` dovrebbe importare direttamente da `pratiche-config.ts` come fa `AdminPratiche.tsx`. Poi rimuovere i re-export da `PraticaCard.tsx`.
- **`PraticaCard.tsx` riga 7**: `Plus` importato da lucide ma mai usato nel file.
- **`CodaPratiche.tsx` riga 105**: `statoOrder` locale che duplica `STATO_ORDER` con ordine diverso — ok funzionalmente ma il nome è confuso.

## 3. Miglioramenti UX

### A. NuovaPratica — feedback submit
Spinner + testo durante `isPending` sui bottoni "Invia" e "Salva Bozza".

### B. AdminPratiche list view — nessun aging/pagamento
La vista lista admin non mostra aging dot ne' badge pagamento (a differenza della vista azienda in `PraticaCard.tsx`). Incoerenza UX.

**Fix**: Aggiungere aging dot e badge pagamento anche nella lista admin.

### C. AdminPratiche pipeline — card troppo minimali
Le card nella pipeline admin non mostrano data creazione ne' pagamento.

**Fix**: Aggiungere data relativa e badge pagamento nelle card DnD admin.

### D. NuovaPratica step indicator — non cliccabile
L'utente non può tornare a uno step precedente cliccando sul pallino. Deve usare "Indietro".

**Fix**: Rendere gli step precedenti cliccabili (solo quelli già visitati).

## 4. Riepilogo Modifiche

| File | Azione |
|------|--------|
| `src/pages/AdminPratiche.tsx` | Fix forwardRef, aggiungere aging/pagamento in list view, data relativa in card pipeline |
| `src/components/pratiche/PraticaCard.tsx` | Rimuovere re-export legacy e import `Plus` inutilizzato |
| `src/pages/Pratiche.tsx` | Aggiornare import per puntare a `pratiche-config` direttamente |
| `src/pages/NuovaPratica.tsx` | Spinner sui bottoni durante submit, step indicator cliccabili |
| `src/pages/PraticaDetail.tsx` | Rendere robusto il check `importo_lavori` |
| `src/pages/CodaPratiche.tsx` | Fix queryKey instabile per `assignee-profiles` |

Nessuna modifica DB. Nessun cambio funzionale — solo bug fix, pulizia e UX.

