

## Piano: Ricreare la Home Page di Pratica Rapida

Riscrittura completa della landing page `/home` ispirandosi alla UX/struttura del progetto "Impresa Leggera Portal" (layout pulito, light theme, framer-motion animations, sezioni ben distinte) ma con i contenuti specifici di praticarapida.com.

### Cambio di paradigma
- **Da**: Dark theme (#0a1628), stile aggressivo "sales letter", animazioni CSS custom
- **A**: Light theme professionale (sfondo bianco/grigio chiaro), animazioni framer-motion, design card-based moderno, ancora con accento verde #00843D

### Struttura sezioni (ispirata a Impresa Leggera)

1. **Navbar** — Fixed top, glass-blur su scroll, logo + link + CTA "Attiva Gratis". Dropdown mobile. No banner top fisso.
2. **HeroSection** — Layout 60/40 (copy a sx, dashboard mockup a dx). Badge "Per aziende di serramenti, tende, pergole". Title animato word-by-word con framer-motion. Checklist "Zero canoni / 24h consegna / Supporto italiano". CTA primario + sub-text social proof.
3. **TickerStrip** — Marquee orizzontale con stats chiave ("122+ recensioni Trustpilot", "14+ anni di esperienza", "Consegna in 48h", "65€ a pratica").
4. **ProblemSection** — Grid di pain points per aziende di serramenti (cards con icona AlertTriangle, sfondo rosso leggero). "Quanto tempo perdi dietro alle pratiche ENEA?"
5. **InactionCostSection** — Counter animato "€ che perdi ogni mese" gestendo internamente le pratiche. Bullet points costi nascosti.
6. **SolutionSection** — "Il tuo partner n°1 per detrazioni fiscali". Chi siamo + 14 anni esperienza. Descrizione servizio completo.
7. **ServicesGrid** — 6 card servizi: Compilazione ENEA, Invio telematico, Raccolta documenti, Contatto cliente a nome tuo, Assicurazione RC, Consegna 24h.
8. **ProcessSteps** — Timeline 3 step verticale con numbered circles: Registrati → Invia pratica → Ricevi in 24h.
9. **PartnerSection** — "Collaboriamo con aziende di:" — grid icone (Serramenti, Fotovoltaico, Tende, Caldaie, Vetrate, Schermature solari).
10. **DataWallSection** — Muro di numeri animati su sfondo scuro: Pratiche gestite, Aziende soddisfatte, Anni esperienza, Prezzo fisso.
11. **TestimonialsSection** — Carousel swipeable con recensioni reali (Zanellato Enrico, Marco Barbieri, Silvana, Valentina Quagliarella). Featured testimonial in evidenza.
12. **PricingSection** — Card singola "65€ a pratica" con lista incluso/escluso, su sfondo chiaro.
13. **GuaranteeSection** — 4 card garanzie su sfondo gradient verde: Assicurazione RC, Zero canoni, Consegna 24h, Correzione gratuita.
14. **FAQSection** — Accordion 2 colonne con domande specifiche pratiche ENEA.
15. **FinalCTA** — Sfondo gradient scuro, CTA grande, trust badges (GDPR, Made in Italy, Trustpilot).
16. **Footer** — 4 colonne: Brand, Servizi, Azienda, Contatti (tel, email, orari da praticarapida.com).

### File da modificare/creare

**Nuovi file** (sostituzione completa dei componenti landing):
- `src/components/landing/TickerStrip.tsx` — Nuovo marquee
- `src/components/landing/InactionCostSection.tsx` — Counter costo inazione
- `src/components/landing/SolutionSection.tsx` — Chi siamo / soluzione
- `src/components/landing/ServicesGrid.tsx` — Griglia servizi inclusi
- `src/components/landing/PartnerSection.tsx` — Settori serviti
- `src/components/landing/DataWallSection.tsx` — Muro numeri

**File riscritti** (stessa posizione, contenuto nuovo):
- `src/components/landing/Navbar.tsx` — Light theme, glass blur, senza TopBanner
- `src/components/landing/HeroSection.tsx` — Layout 2 colonne, light theme
- `src/components/landing/ProblemSection.tsx` — Pain points card grid
- `src/components/landing/HowItWorksSection.tsx` → rinominato logicamente in ProcessSteps
- `src/components/landing/PricingSection.tsx` — Card singola, light theme
- `src/components/landing/GuaranteesSection.tsx` — Card su gradient verde
- `src/components/landing/ReviewsSection.tsx` — Carousel swipeable con recensioni reali
- `src/components/landing/FAQSection.tsx` — 2 colonne accordion
- `src/components/landing/CTASection.tsx` — FinalCTA con gradient
- `src/components/landing/Footer.tsx` — 4 colonne con contatti reali
- `src/components/landing/hooks.ts` — Aggiungere useScrollAnimation e useCounterAnimation
- `src/components/landing/constants.ts` — Aggiornare nav links
- `src/components/landing/index.ts` — Aggiornare exports
- `src/pages/Home.tsx` — Nuova composizione sezioni

**File rimossi** (non più necessari):
- `src/components/landing/TopBanner.tsx`
- `src/components/landing/StickyBottomBar.tsx`
- `src/components/landing/FloatingIcons.tsx`
- `src/components/landing/TrapsSection.tsx`
- `src/components/landing/ComparisonSection.tsx`
- `src/components/landing/TeamSection.tsx`
- `src/components/landing/SocialProofBar.tsx`
- `src/components/landing/DashboardMockup.tsx`
- `src/components/landing/Section.tsx`

### Dettagli tecnici
- Aggiungere `framer-motion` come dipendenza (già disponibile nel progetto di riferimento)
- Tutti i contenuti testuali presi da praticarapida.com (14 anni esperienza, settori, recensioni reali, contatti)
- Brand color `#00843D` mantenuto
- Light theme: `bg-background`, `bg-card`, `text-foreground` etc. usando le CSS variables Tailwind
- Responsive: mobile-first, grid collassabili
- Nessuna modifica al database

