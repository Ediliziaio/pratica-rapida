

# Fix Logo su Sfondo Scuro

## Problema
Il filtro CSS `brightness(0) invert(1)` trasforma il logo verde in un blocco bianco piatto, perdendo tutti i dettagli. Serve una versione bianca del logo dedicata per lo sfondo scuro.

## Soluzione

### 1. Creare versione bianca del logo
- Copiare il logo verde caricato (`pratica_rapida_logo-3.png`) come `public/pratica-rapida-logo.png` (versione verde, per navbar bianca)
- Usare l'AI image generation per creare una versione bianca del logo a partire dal verde caricato, e salvarla come `public/pratica-rapida-logo-white.png`

### 2. Aggiornare la navbar in Home.tsx
- Rimuovere il filtro CSS `logo-white` dal logo
- Usare due immagini diverse in base allo stato dello scroll:
  - Navbar scura (non scrolled): mostrare `pratica-rapida-logo-white.png`
  - Navbar bianca (scrolled): mostrare `pratica-rapida-logo.png` (verde originale)

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo.png` | Logo verde originale (dal nuovo upload) |
| `public/pratica-rapida-logo-white.png` | Nuova versione bianca generata via AI |
| `src/pages/Home.tsx` | Usare `src` condizionale per il logo invece del filtro CSS |

### Dettaglio tecnico

Nel codice della navbar, il tag `img` del logo passera' da:
```text
src="/pratica-rapida-logo.png"
className={`... ${scrolled ? "" : "logo-white"}`}
```
A:
```text
src={scrolled ? "/pratica-rapida-logo.png" : "/pratica-rapida-logo-white.png"}
```

Questo garantira' un logo nitido e leggibile sia su sfondo scuro che su sfondo bianco, senza filtri CSS che degradano la qualita'.
