

## Piano: Miglioramento completo Landing Page

### Problemi identificati
1. **Navbar**: Menu links invisibili (bianco su bianco) quando non scrollato — lo sfondo hero è bianco ma i link sono `text-white/80`
2. **Logo**: Mostra logo bianco su sfondo bianco (illeggibile) — deve sempre usare il logo verde
3. **Immagine hero**: Troppo sfumata/invisibile (`opacity-30` + gradient pesante) — va aumentata visibilità
4. **Mancano immagini**: Tutte le sezioni sono solo testo/icone, nessuna foto reale
5. **UX generica**: Sezioni tutte simili visivamente, manca varietà e impatto

### Modifiche per file

**1. `src/components/landing/Navbar.tsx`**
- Logo sempre verde: rimuovere condizionale, usare sempre `/pratica-rapida-logo.png`
- Menu links: sempre scuri (`text-foreground/70` → `text-foreground` on hover), non più bianco
- Hamburger: sempre scuro
- Background: `bg-white/80 backdrop-blur` sempre, non trasparente inizialmente

**2. `src/components/landing/HeroSection.tsx`**
- Immagine burocrazia: aumentare opacità da `0.30` a `0.50`, ridurre gradiente di copertura
- Estendere immagine a `w-2/3` e rimuovere gradient via troppo forte
- Aggiungere leggero gradient top/bottom per eleganza

**3. `src/components/landing/ProblemSection.tsx`**
- Aggiungere immagine stock (frustrazione/documenti) a sinistra, testo a destra — layout 2 colonne
- Usare Unsplash URL per immagine di persona stressata con documenti

**4. `src/components/landing/SolutionSection.tsx`**
- Layout 2 colonne: testo sx, immagine team/ufficio dx
- Aggiungere foto di team professionale al lavoro

**5. `src/components/landing/ServicesGrid.tsx`**
- Aggiungere piccole icone/illustrazioni più grandi nelle card
- Migliorare hover con shadow più pronunciato

**6. `src/components/landing/HowItWorksSection.tsx`**
- Aggiungere immagini/illustrazioni per ogni step (screenshot mockup)

**7. `src/components/landing/PartnerSection.tsx`**
- Aggiungere immagini rappresentative per ogni settore (serramenti, fotovoltaico, etc.)
- Layout card con immagine + icona + label

**8. `src/components/landing/ReviewsSection.tsx`**
- Aggiungere avatar placeholder per ogni recensore
- Migliorare card design con foto profilo

**9. `src/components/landing/PricingSection.tsx`**
- Aggiungere illustrazione/icona grande sopra il prezzo
- Background con pattern sottile

**10. `src/components/landing/CTASection.tsx`**
- Aggiungere immagine di sfondo (ufficio moderno) con overlay scuro

**11. Nuova sezione: `src/components/landing/TrustSection.tsx`**
- Sezione "Perché Fidarsi di Noi" con badge: 14 anni, Assicurazione RC, GDPR, Made in Italy
- Con icone grandi e descrizioni

**12. `src/pages/Home.tsx`**
- Aggiungere TrustSection tra SolutionSection e ServicesGrid

**13. `src/components/landing/index.ts`**
- Esportare TrustSection

**14. `src/components/landing/constants.ts`**
- Aggiungere URL immagini Unsplash per le varie sezioni

### Immagini
Utilizzerò URL Unsplash gratuiti per tutte le immagini decorative (serramenti, uffici, team, documenti) — caricamento rapido e nessun asset da generare.

### Risultato
- Navbar sempre leggibile con logo verde e menu scuro
- Hero con immagine burocrazia ben visibile
- Ogni sezione ha almeno un elemento visivo (foto/illustrazione)
- Nuova sezione Trust per credibilità
- UX più varia e professionale

