

# Restyling Completo Home Page "Pratica Rapida"

## Obiettivo
Riscrivere completamente `src/pages/Home.tsx` con i colori di Pratica Rapida (verde #00843D e bianco), il nuovo logo, animazioni migliorate ispirate al sito di riferimento, e immagini generate da AI tramite edge function. Tutte le sezioni del PDF devono essere presenti con il testo completo.

## Colori e Branding

- **Verde Pratica Rapida**: `#00843D` (dal logo) come colore primario al posto dell'emerald-500
- **Sfondo scuro**: `#0a1628` / `#0f1d32` (mantenuto dal riferimento)
- **Testo**: bianco su sfondo scuro
- **Accenti**: verde Pratica Rapida per CTA, highlight, badge, icone
- **Card**: bordi sottili con sfondo semitrasparente

## Modifiche ai File

| File | Azione |
|------|--------|
| `public/pratica-rapida-logo.png` | Sostituire con il nuovo logo caricato dall'utente |
| `src/pages/Home.tsx` | Riscrittura completa con nuovo stile, animazioni e tutte le sezioni |
| `src/index.css` | Aggiungere animazioni CSS avanzate (float, pulse, slide-up staggered, navbar scroll) |
| `supabase/functions/generate-landing-images/index.ts` | Nuova edge function per generare immagini AI per la landing |

## Animazioni migliorate (ispirate al riferimento)

1. **Navbar**: effetto glassmorphism con backdrop-blur, transizione su scroll (riduzione padding + ombra)
2. **Hero title**: animazione di entrata staggered parola per parola
3. **Floating icons**: animazione CSS `float` continua su/giu' con tempi sfalsati
4. **Sezioni**: fade-in + slide-up con IntersectionObserver (gia' presente, migliorato con stagger per i children)
5. **Card hover**: scale + glow verde sottile al passaggio del mouse
6. **Dashboard mockup**: animazione di entrata con scale + fade ritardata rispetto al titolo
7. **Counter stats**: animazione contatore numerico (65 euro, 24h, etc.)
8. **CTA buttons**: pulse sottile + hover con glow
9. **Menu mobile**: hamburger menu animato con slide-in da destra (come nel riferimento)
10. **Barra di scorrimento dei loghi/partner**: marquee continuo (se applicabile)

## Immagini AI

Generare via edge function (usando il modello `google/gemini-2.5-flash-image`) 3-4 immagini tematiche:
- Hero background: illustrazione astratta di documenti/pratiche con tonalita' verdi
- Sezione "Il Problema": illustrazione di persona frustrata dalla burocrazia
- Sezione "Come Funziona": icone illustrate per i 3 step
- Sezione "Chi c'e' dietro": illustrazione team professionale

Le immagini verranno generate on-demand e cachate in Supabase Storage.

In alternativa, se piu' pratico, usare delle illustrazioni decorative SVG inline (pattern geometrici, forme astratte) nei colori del brand per arricchire le sezioni senza dipendere da una edge function.

## Struttura completa della pagina (tutte le sezioni dal PDF)

### 1. Top Banner
"ZERO VINCOLI. PAGHI SOLO A PRATICA COMPLETATA."

### 2. Navbar con menu mobile
- Logo nuovo Pratica Rapida
- Link: Come Funziona, Vantaggi, Confronto, Prezzi, Accedi
- CTA "Attiva Ora"
- Hamburger menu animato su mobile con overlay slide-in

### 3. Hero Section
- Badge: "PER AZIENDE DI INFISSI, TENDE, PERGOLE E SERRAMENTI"
- Warning badge: "I tuoi concorrenti stanno gia' offrendo questo servizio. Tu?"
- Titolo con animazione staggered
- Dashboard mockup animato
- Sottotitolo dal PDF
- 2 CTA buttons con glow
- Stats animate: 65 euro/pratica | 24h Consegna | Supporto Italiano

### 4. Sezione "Il Problema" (completa dal PDF)
- "Sai qual e' il modo piu' veloce per perdere un cliente nel 2025?"
- Testo completo con paragrafi dal PDF (pagine 1-3)
- Sezione "Parliamoci chiaro" con testo dal PDF
- Le 2 trappole con card animate

### 5. Sezione "Come Funziona" (3 step)
- Card con numeri grandi, icone e descrizioni complete dal PDF

### 6. Confronto tabellare
- "Quello che hai adesso" vs "Pratica Rapida" (testo esatto dal PDF)

### 7. Sezione Prezzo
- 65 euro drammatizzato con conteggio
- Lista "Tutto quello che ottieni" (10 punti dal PDF)
- Lista "Cosa NON devi piu' fare" (6 punti dal PDF)

### 8. Garanzie (2 card)
- Assicurazione Blindata (testo completo)
- Paghi Solo a Pratica Effettuata (testo completo)

### 9. "Chi c'e' dietro Pratica Rapida?"
- Testo completo dal PDF (pagina 11)
- Missione

### 10. CTA Finale
- "Sei pronto a smettere di perdere vendite?"
- Testo completo
- CTA grande
- P.S. e P.P.S. dal PDF

### 11. Footer
- Logo, link navigazione, copyright

## Dettagli tecnici

### CSS Animations (da aggiungere in index.css)
```text
- @keyframes float: translateY oscillante
- @keyframes slideUpStagger: per entrata staggered
- @keyframes pulse-glow: pulse con box-shadow verde
- @keyframes marquee: scorrimento continuo
- .navbar-scrolled: classe aggiunta via JS per navbar compatta
- .mobile-menu-open: overlay menu mobile
```

### Menu Mobile (come nel riferimento)
- Icona hamburger con 3 linee che si trasformano in X
- Overlay fullscreen con sfondo scuro semitrasparente
- Link con animazione staggered di entrata
- Chiusura al click su link o overlay

### Approccio immagini AI
Usare SVG decorativi inline per le sezioni (piu' affidabile e veloce):
- Pattern di cerchi/linee geometriche come sfondo sezioni
- Gradiente radiale verde nelle sezioni chiave
- Forme astratte flottanti ai lati (miglioramento delle FloatingIcons attuali)

