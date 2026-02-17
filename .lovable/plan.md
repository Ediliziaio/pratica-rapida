

# Miglioramenti Home Page Pratica Rapida

## Modifiche previste

### 1. Nuovo logo
- Copiare il logo caricato (`pratica_rapida_logo-2.png`) come `public/pratica-rapida-logo.png` (sostituisce il precedente)
- Il logo e' verde su sfondo trasparente, quindi serve una versione bianca per la navbar scura
- Creare una versione bianca del logo usando CSS filter (`brightness(0) invert(1)`) quando la navbar ha sfondo scuro

### 2. Navbar: fissa in alto con transizione scuro -> bianco
- La navbar parte con sfondo scuro trasparente (come ora)
- Al scroll (dopo ~40px), la navbar diventa **bianca** (`bg-white`) con ombra, e il logo torna verde (naturale)
- I link del menu diventano scuri (`text-gray-700`) quando la navbar e' bianca
- Il bottone CTA "Attiva Ora" resta verde in entrambi gli stati
- Su mobile, l'hamburger cambia colore (bianco su scuro, scuro su bianco)

### 3. Sezioni alternate: sfondo scuro e bianco
Alternare le sezioni tra sfondo scuro e sfondo bianco per creare contrasto visivo:

| Sezione | Sfondo |
|---------|--------|
| Top Banner | Verde (#00843D) |
| Hero | Scuro (#0a1628) |
| Il Problema | **Bianco** |
| Parliamoci chiaro + Trappole | Scuro (#0d1a2d) |
| Come Funziona | **Bianco** |
| Confronto | Scuro (#0d1a2d) |
| Prezzi | **Bianco** |
| Garanzie | Scuro (#0d1a2d) |
| Chi c'e' dietro | **Bianco** |
| CTA Finale | Scuro (#0d1a2d) |
| Footer | Scuro |

Nelle sezioni bianche, il testo diventa scuro (`text-gray-900`, `text-gray-600`), le card hanno bordo grigio chiaro, e gli accenti restano verde `#00843D`.

### 4. File modificati

| File | Azione |
|------|--------|
| `public/pratica-rapida-logo.png` | Sostituito con il nuovo logo caricato |
| `src/pages/Home.tsx` | Aggiornamento navbar (transizione bianca), sezioni alternate bianche/scure, filtro CSS per logo bianco/verde |
| `src/index.css` | Aggiungere classe `.navbar-scrolled` con sfondo bianco e testo scuro |

### Dettagli tecnici

**Navbar scroll behavior:**
- Stato iniziale: `bg-[#0a1628]/90 backdrop-blur-md`, testo bianco, logo con `filter: brightness(0) invert(1)` (diventa bianco)
- Stato scrolled: `bg-white shadow-lg`, testo `text-gray-800`, logo senza filtro (resta verde naturale)
- Transizione fluida con `transition-all duration-300`

**Sezioni bianche:**
- Sfondo `bg-white`, testi `text-gray-900` per titoli, `text-gray-600` per paragrafi
- Card con `bg-gray-50 border-gray-200` invece di `bg-[#0f1d32] border-white/10`
- Icone e accenti restano verdi `#00843D`

