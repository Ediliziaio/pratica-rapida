

# Fix Logo Tagliato nella Navbar

## Problema
Il logo nella navbar ha `h-8` (32px) che e' troppo piccolo per un'immagine larga come "PraticaRapida". Il risultato e' che il logo viene tagliato e si vede solo "ticaRap".

## Soluzione

### 1. Aggiornare il logo con la versione caricata
- Copiare `pratica_rapida_logo-4.png` come `public/pratica-rapida-logo.png`
- Generare una nuova versione bianca del logo per sfondo scuro e salvarla come `public/pratica-rapida-logo-white.png`

### 2. Aumentare la dimensione del logo nella navbar
- Cambiare la classe del logo da `h-8` a `h-10` (40px) per mostrare il testo completo
- Opzionalmente aggiungere `w-auto` per assicurarsi che il rapporto venga mantenuto

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo.png` | Nuovo logo verde dall'upload |
| `public/pratica-rapida-logo-white.png` | Nuova versione bianca generata |
| `src/pages/Home.tsx` | Cambiare `h-8` a `h-10` sul tag img del logo |

### Dettaglio tecnico

```text
// Da:
className="h-8 transition-all duration-300"

// A:
className="h-10 w-auto transition-all duration-300"
```

