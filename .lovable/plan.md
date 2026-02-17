
# Aggiunta Sezione FAQ e Sezione Recensioni Trustpilot

## 1. Sezione Recensioni Trustpilot (sfondo scuro)

Posizionata subito dopo la sezione "Chi c'e' dietro Pratica Rapida" e prima della CTA finale.

**Layout:**
- Header con badge "RECENSIONI VERIFICATE" + icona Star
- Titolo: "Cosa dicono i nostri clienti"
- Sottotitolo con link a Trustpilot e 5 stelle
- Griglia responsive di card recensione: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Ogni card ha: nome, badge paese/numero recensioni, data, titolo in grassetto, testo, 5 stelle

**Recensioni da includere (9 totali):**
1. Marcello - "Professionalita'" - 16 ore fa
2. lalli65 - "Veloci e comprensibili" - 9 feb 2026
3. Cadeddu Marina - "Esperienza positiva con pratica rapida" - 18 dic 2025
4. Flavio - "Veloci" - 15 dic 2025
5. Paola Maruca - "Servizio efficente" - 27 nov 2025
6. Valentina Puddu - "Ottimo servizio e super efficienti" - 2 ott 2025
7. Paola Dario - "Super efficienti e veloci, top!" - 2 ott 2025
8. Alex Alex - "Professionali e molto disponibili" - 2 ott 2025
9. Matteo - "Sembrerebbe che dopo aver compilato..." - 2 ott 2025

**Stile card:** `bg-white/5` con `border-white/10`, stelle `fill-yellow-400`, nome in `text-white`, testo in `text-white/60`, data in `text-white/30`

In fondo: link "Vedi tutte le 122+ recensioni su Trustpilot" con freccia

## 2. Sezione FAQ (sfondo bianco)

Posizionata dopo le Recensioni e prima della CTA finale.

**Layout:**
- Badge "DOMANDE FREQUENTI" con icona HelpCircle
- Titolo: "Tutto quello che devi sapere"
- Accordion con 7-8 domande, usando il componente Accordion gia' presente nel progetto (`@radix-ui/react-accordion`)

**Domande:**
1. **Cos'e' la pratica ENEA e quando serve?** - Spiegazione della comunicazione obbligatoria ad ENEA per detrazioni fiscali su infissi, tende da sole, pergole e serramenti.
2. **Quanto costa il servizio?** - 65 euro a pratica, tutto incluso, assicurazione compresa. Nessun canone, abbonamento o costo di attivazione.
3. **In quanto tempo viene completata la pratica?** - Entro 24 ore lavorative dalla ricezione dei documenti completi.
4. **Cosa succede se la pratica contiene un errore?** - Ogni pratica e' coperta da assicurazione professionale. Se c'e' un errore, l'assicurazione copre eventuali danni.
5. **Quali documenti servono per avviare la pratica?** - Elenco dei documenti necessari (fattura, dati catastali, schede tecniche, ecc.)
6. **Come funziona il pagamento?** - Si paga solo a pratica completata e consegnata. Zero anticipi.
7. **Lavorate con aziende di tutta Italia?** - Si', il servizio e' completamente digitale e copriamo tutto il territorio nazionale.
8. **Posso provare il servizio senza impegno?** - Si', basta contattarci. Nessun contratto vincolante, paghi solo le pratiche effettivamente gestite.

**Stile:** Accordion con bordi verdi sottili, trigger con font semibold, content con testo grigio. Sfondo bianco con possibile gradiente radiale verde molto tenue.

## Dettaglio tecnico

### Icone aggiuntive da importare
- `HelpCircle` da lucide-react
- `MessageSquare` da lucide-react (per badge recensioni)

### Componenti da importare
- `Accordion, AccordionItem, AccordionTrigger, AccordionContent` da `@/components/ui/accordion`

### Ordine sezioni aggiornato
1. ... (sezioni esistenti)
2. Chi c'e' dietro Pratica Rapida (bianco) - gia' presente
3. **Recensioni Trustpilot (scuro)** - NUOVA
4. **FAQ (bianco)** - NUOVA
5. CTA Finale (scuro) - gia' presente
6. Footer (bianco) - gia' presente

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Aggiunta import `HelpCircle, MessageSquare` + import Accordion components. Inserimento sezione Recensioni (9 card in griglia) e sezione FAQ (8 domande in accordion) tra "Chi c'e' dietro" e "CTA Finale" (prima di riga 926) |
