

## Piano: Redesign premium Hero + Problem Section

### Obiettivo
Trasformare le prime due sezioni in un'esperienza visiva da agenzia creativa top-tier: layout asimmetrico, tipografia bold con contrasto, micro-animazioni sofisticate, elementi glassmorphism e composizione spaziale moderna.

### 1. `HeroSection.tsx` — Redesign completo

**Layout**: Full-screen con composizione asimmetrica. Il titolo occupa tutta la larghezza con font size massiccio. Sotto, layout a 2 colonne: sottotitolo + CTA a sinistra, dashboard mockup a destra con effetto glassmorphism e rotazione 3D leggera.

**Elementi innovativi**:
- Badge "PER AZIENDE DI..." con bordo animato (gradient border rotating)
- Titolo H1 enorme (clamp responsive) con la parte verde che ha un highlight animato (underline che si disegna)
- Floating stats pills: 3 mini-badge flottanti attorno alla dashboard ("47 pratiche", "48h", "32 clienti") con animazione float staggerata
- Dashboard card con `backdrop-blur`, bordo semi-trasparente (glassmorphism), leggera rotazione prospettica `perspective(1000px) rotateY(-5deg)`
- Immagine burocrazia: opacity aumentata a 0.6, con un `mix-blend-mode: multiply` per integrarla meglio
- Scroll indicator animato in basso (chevron + linea che pulsa)
- Rimuovere Trustpilot badge dal hero (è ridondante con ticker)

**Animazioni**: Entrate staggerate con spring physics (framer-motion), non semplici fade. Dashboard entra con scale + rotate. Stats pills entrano una alla volta con bounce.

### 2. `ProblemSection.tsx` — Redesign immersivo

**Layout**: Full-width con sfondo scuro (`bg-[hsl(var(--pr-dark))]` = quasi nero). Testo bianco. L'immagine diventa sfondo full-width con overlay scuro, non più in colonna separata.

**Elementi innovativi**:
- Sfondo: immagine documenti full-width con `opacity-20` e overlay gradient scuro
- Titolo centrato, grande, con la parte verde che ha un effetto "glow" sottile (`text-shadow`)
- I 3 paragrafi appaiono in sequenza staggerata (scroll-triggered) con linea verticale verde animata che li connette (timeline verticale)
- "Ore che non vengono pagate" — riga evidenziata con background gradient che si anima da sinistra a destra
- "Ecco perché esistiamo" — testo grande centrato con animazione di reveal (clip-path che si apre) + freccia giù con trail luminoso
- Transizione morbida verso la sezione successiva con un gradient bottom che sfuma dal dark al bianco

### 3. `src/index.css` — Aggiunte CSS

- Classe `.gradient-border-spin` per bordo animato del badge
- Classe `.highlight-draw` per underline che si disegna
- Classe `.text-glow-green` per glow sul testo verde in sezione scura
- Classe `.reveal-highlight` per background animato su riga di testo

### File modificati
1. `src/components/landing/HeroSection.tsx` — Redesign completo layout + animazioni
2. `src/components/landing/ProblemSection.tsx` — Layout dark immersivo con timeline
3. `src/index.css` — Nuove utility CSS per effetti premium

### Risultato
Le prime due sezioni avranno un impatto visivo da sito premiato su Awwwards: composizione asimmetrica, micro-interazioni, glassmorphism, dark/light contrast drammatico, tipografia bold con dettagli animati.

