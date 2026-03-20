

## Piano: Aggiungere immagine di burocrazia sfumata a destra nella Hero

### Cosa si fa
Generare con AI un'immagine a tema burocrazia (documenti, moduli, timbri, pratiche cartacee impilate) e posizionarla sul lato destro della hero section, sfumata con un gradient da sinistra (bianco → trasparente) così che si dissolva nel contenuto senza coprire il testo.

### Modifiche

**1. Generare l'immagine** (`src/assets/hero-bureaucracy.png`)
- Prompt AI: immagine fotorealistica di una scrivania con pile di documenti, moduli burocratici, timbri, pratiche ENEA — toni neutri/caldi, alta risoluzione
- Usare il modello `google/gemini-3-pro-image-preview` per qualità migliore

**2. Aggiornare `src/components/landing/HeroSection.tsx`**
- Rimuovere l'attuale `heroBg` (immagine generica) dal background full-screen
- Aggiungere la nuova immagine posizionata `absolute right-0 top-0 h-full w-1/2 lg:w-3/5 object-cover`
- Applicare un gradient overlay `bg-gradient-to-r from-background via-background/95 to-transparent` sopra l'immagine per sfumarla verso sinistra
- L'immagine sarà visibile solo sulla metà destra, dietro il dashboard mockup
- Su mobile nascondere l'immagine (`hidden lg:block`) per non appesantire il layout

### Risultato
Il lato sinistro resta pulito con testo leggibile, il lato destro mostra l'immagine di burocrazia che sfuma verso il centro, creando un effetto visivo professionale che comunica subito il tema "pratiche e documenti".

