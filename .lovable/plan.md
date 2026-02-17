

# Fix Logo Tagliato nell'Header

## Problema
Il logo bianco nell'header viene tagliato e si vede solo "ticaRap" invece di "PraticaRapida" completo. La classe `h-10` forza un'altezza fissa di 40px, ma il logo ha un aspect ratio molto largo (testo orizzontale) e lo spazio non basta.

## Soluzione

### 1. Aggiornare il file del logo bianco
- Copiare il logo caricato (`Edilizia_in_Cloud_Logo_1-2.png`) come `public/pratica-rapida-logo-white.png`, sovrascrivendo quello attuale

### 2. Aumentare lo spazio per il logo nella navbar
- Cambiare la classe dell'immagine da `h-10 w-auto` a `h-8 w-auto max-w-[220px]` per dare piu' larghezza al logo senza farlo troppo alto
- In alternativa, rimuovere il vincolo di altezza fisso e usare `max-h-12` per permettere al logo di occupare lo spazio necessario

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo-white.png` | Nuovo logo grigio/bianco dall'upload |
| `src/pages/Home.tsx` | Aggiustare dimensioni img del logo nella navbar |

### Dettaglio tecnico

```text
// Da:
className="h-10 w-auto transition-all duration-300"

// A:
className="h-10 w-auto max-w-[240px] object-contain transition-all duration-300"
```

Aggiungendo `max-w-[240px] object-contain` il logo potra' estendersi in larghezza mostrando il nome completo, mantenendo il contenimento entro la navbar.

