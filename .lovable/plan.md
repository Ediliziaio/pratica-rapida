
# Fix: Barra in Basso Resta Visibile da "Il Nostro Team" Fino in Fondo

## Problema
Quando si supera la sezione "Il Nostro Team", lo scroll listener (`scrollY > 200`) nasconde di nuovo la barra, annullando l'effetto dell'IntersectionObserver.

## Soluzione
Aggiungere un `useRef` booleano (`teamReached`) che diventa `true` quando la sezione "Il Nostro Team" entra in viewport. Da quel momento lo scroll listener non nasconde piu' la barra.

## Dettaglio tecnico

### File: `src/pages/Home.tsx`

**Riga 175** - Aggiungere ref booleano:
```
const teamReached = useRef(false);
```

**Riga 181** - Modificare lo scroll listener per rispettare il flag:
```
if (window.scrollY > 200 && !teamReached.current) setShowBottomBar(false);
```

**Riga 188** - Nell'IntersectionObserver, settare il flag:
```
([entry]) => {
  if (entry.isIntersecting) {
    teamReached.current = true;
    setShowBottomBar(true);
  }
}
```

### Riepilogo

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | 1) Aggiungere `teamReached` ref (riga 175). 2) Condizionare il `setShowBottomBar(false)` a `!teamReached.current` (riga 181). 3) Settare `teamReached.current = true` nell'observer (riga 188). |
