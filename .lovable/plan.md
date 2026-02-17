

# Fix Logo e Navbar Fissa

## Problemi identificati

1. **Logo non visibile**: Il logo appare come un rettangolo bianco. Il file potrebbe non essere stato copiato correttamente, oppure il filtro CSS `brightness(0) invert(1)` lo rende invisibile. Bisogna verificare il file e assicurarsi che il logo sia visibile sia su sfondo scuro (bianco) che su sfondo bianco (verde naturale).

2. **Navbar non resta fissa**: Attualmente usa `sticky top-0`, ma essendo posizionata dopo il banner verde nel DOM, scorre via con la pagina. Serve `fixed` positioning.

## Soluzione

### 1. Navbar fissa con `fixed`
- Cambiare la navbar da `sticky top-0` a `fixed top-0 left-0 right-0`
- Il banner verde sopra sara' anch'esso fisso, oppure rimarra' scorrevole e la navbar si posizionera' a `top-0` direttamente
- Aggiungere un padding-top al contenuto sotto la navbar per compensare lo spazio occupato (circa 90px: 40px banner + 50px navbar), oppure rendere solo la navbar fissa e lasciar scorrere il banner
- Approccio scelto: il banner verde scorre via normalmente, la navbar diventa `fixed top-0` e tutto il contenuto della pagina riceve un `pt-[72px]` (altezza navbar) per compensare

### 2. Logo corretto
- Ri-copiare il logo caricato dall'utente come `public/pratica-rapida-logo.png`
- Verificare che il filtro CSS `logo-white` (che rende il logo bianco) funzioni correttamente: `filter: brightness(0) invert(1)` trasforma qualsiasi immagine in bianco
- Quando la navbar e' scura (non scrolled): logo bianco tramite filtro
- Quando la navbar diventa bianca (scrolled): logo verde naturale, senza filtro

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo.png` | Ri-copiare il logo dall'upload per assicurarsi che sia corretto |
| `src/pages/Home.tsx` | Cambiare navbar da `sticky` a `fixed`, aggiungere padding-top compensativo al contenuto, verificare classi logo |

### Dettagli tecnici

**Navbar:**
- Da: `sticky top-0 z-50`
- A: `fixed top-0 left-0 right-0 z-50`
- Il banner verde rimane in flusso normale (scorre via)
- Aggiungere `pt-[72px]` o simile al contenitore hero per compensare la navbar fissa

**Logo:**
- Stato non-scrolled (sfondo scuro): `className="logo-white"` applica `filter: brightness(0) invert(1)`
- Stato scrolled (sfondo bianco): nessun filtro, logo appare nel suo colore verde naturale
