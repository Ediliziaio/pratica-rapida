

## Piano: Aggiornamento completo copy landing page

L'utente ha fornito un nuovo copy completo per la landing page. Ecco le modifiche sezione per sezione, mantenendo la timeline e le animazioni esistenti.

### Struttura pagina aggiornata

```text
Navbar
HeroSection          ← nuovo copy
TickerStrip          ← invariato
ProblemSection       ← nuovo copy "Quante ore hai perso..."
SolutionSection      ← nuovo copy "Il tuo team pratiche in outsourcing"
BenefitsSection      ← NUOVA sezione (3 colonne: 48h, White label, Conforme)
ProcessSteps         ← invariato (timeline)
PartnerSection       ← nuovo titolo + settori aggiornati (aggiunta caldaie/climatizzatori)
DataWallSection      ← nuovo titolo
ReviewsSection       ← nuove testimonianze (4 specifiche)
WhyUsSection         ← NUOVA sezione "Perché scegliere Pratica Rapida" (3 colonne)
PricingSection       ← invariato
GuaranteeSection     ← invariato
FAQSection           ← invariato
FinalCTA             ← nuovo copy con telefono + email
Footer               ← aggiornare telefono a +39 039 868 2691
```

Sezioni RIMOSSE: `InactionCostSection`, `TrustSection`, `ServicesGrid` (i servizi sono assorbiti in BenefitsSection e WhyUsSection).

### Modifiche per file

**1. `HeroSection.tsx`** — Nuovo copy
- Titolo: "Pratiche ENEA e detrazioni fiscali per i tuoi clienti — le gestiamo noi, a nome tuo, in 48 ore."
- Sottotitolo: "Sei un'azienda di serramenti, tende, fotovoltaico o caldaie?..." (testo completo fornito)
- CTA: "→ Richiedi informazioni gratuite" (link a contatto/auth)
- Rimuovere word-by-word animation, usare fade-in semplice per il titolo
- Mantenere immagine burocrazia sfumata a destra, dashboard mockup

**2. `ProblemSection.tsx`** — Nuovo copy
- Titolo: "Quante ore hai perso l'anno scorso dietro alle pratiche?"
- Testo: paragrafo fornito sulla burocrazia post-installazione
- Transizione: "Ecco perché esistiamo."
- Mantenere layout 2 colonne con immagine a sinistra, rimuovere lista pain points con AlertTriangle

**3. `SolutionSection.tsx`** — Nuovo copy
- Titolo: "Il tuo team pratiche in outsourcing — senza costi fissi, senza assunzioni."
- Testo: descrizione completa del servizio dal 2011
- Sotto-sezione "Come funziona?" con testo fornito
- Chiusura: "Niente intermediari. Niente stress. Niente pratiche ferme in attesa."
- Mantenere layout 2 colonne, rimuovere stats box (14+, 122+, 65€)

**4. NUOVO `BenefitsSection.tsx`** — Sezione benefici 3 colonne
- "Pratiche evase in 48 ore" — testo fornito
- "Chiamiamo noi il cliente, a tuo nome" — testo fornito
- "Documentazione sempre conforme" — testo fornito
- Design: 3 card con icone grandi, sfondo leggero verde

**5. `PartnerSection.tsx`** — Aggiornamento
- Titolo: "Lavori con uno di questi settori? Sei nel posto giusto."
- Settori: Serramenti, Fotovoltaico, Tende da sole e schermature solari, Caldaie e climatizzatori, Vetrate e infissi
- Mantenere card con immagini

**6. `DataWallSection.tsx`** — Nuovo titolo
- Titolo: "Oltre 14 anni. Migliaia di pratiche. Zero pensieri per chi ci affida il lavoro."
- Mantenere contatori animati

**7. `ReviewsSection.tsx`** — 4 testimonianze nuove
- Titolo: "Non è quello che diciamo noi che conta. È quello che dicono loro."
- Zanellato Enrico, Marco Barbieri, Valentina Quagliarella, Silvana — testi forniti
- Rimuovere featured review (Alessandro T.)

**8. NUOVO `WhyUsSection.tsx`** — "Perché scegliere Pratica Rapida"
- 3 colonne: "Diventiamo il tuo ufficio pratiche", "Tutto online, nessuna presenza fisica", "Un numero dedicato per ogni esigenza"
- Testi forniti, design card con icone

**9. `CTASection.tsx`** — Nuovo copy finale
- Headline: "Quante pratiche hai in sospeso in questo momento?"
- Testo: paragrafo fornito
- CTA primaria: "→ Parla con noi adesso — chiama il +39 039 868 2691"
- CTA secondaria: "→ Scrivici a modulistica@praticarapida.it"

**10. `Footer.tsx`** — Aggiornare telefono a +39 039 868 2691

**11. `Home.tsx`** — Nuova struttura sezioni
- Rimuovere: InactionCostSection, TrustSection, ServicesGrid
- Aggiungere: BenefitsSection (dopo SolutionSection), WhyUsSection (dopo ReviewsSection)

**12. `index.ts`** — Aggiornare export

### Note
- Timeline (ProcessSteps), FAQ, Pricing, Guarantees restano invariati
- Tutte le animazioni framer-motion restano
- Immagini Unsplash esistenti mantenute dove possibile

