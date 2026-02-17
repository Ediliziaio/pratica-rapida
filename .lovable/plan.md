

# Fix Definitivo Logo Header

## Problema
Il logo bianco continua a essere tagliato: si vede "ticaRap" invece di "PraticaRapida". La classe `h-10` (40px fissi) limita troppo l'altezza, e con un logo molto largo il browser non riesce a mostrarlo intero.

## Soluzione

### 1. Sostituire il file del logo bianco
- Cancellare e ri-copiare `public/pratica-rapida-logo-white.png` dal file appena caricato dall'utente per assicurarsi che il file sia corretto e completo

### 2. Cambiare il dimensionamento del logo nella navbar
- Rimuovere `h-10` (altezza fissa) e `max-w-[240px]`
- Usare `max-h-10` (altezza massima, non fissa) con `w-auto` per lasciare il browser calcolare la larghezza naturale
- Mantenere `object-contain` come sicurezza

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo-white.png` | Re-copia dal file caricato |
| `src/pages/Home.tsx` | Cambiare classi img del logo |

### Dettaglio tecnico

```text
// Da:
className="h-10 w-auto max-w-[240px] object-contain transition-all duration-300"

// A:
className="max-h-10 w-auto object-contain transition-all duration-300"
```

La differenza: `h-10` forza esattamente 40px di altezza (il browser potrebbe tagliare in larghezza), mentre `max-h-10` dice "non superare 40px" ma permette all'immagine di essere piu' piccola se serve per entrare nello spazio disponibile. Questo, combinato con `w-auto`, lascia il logo mostrare il testo completo.
