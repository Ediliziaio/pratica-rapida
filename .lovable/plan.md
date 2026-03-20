

## Piano: Miglioramento UX Hero Section

### Problemi attuali
1. **Titolo troppo grande** — il h1 occupa quasi metà schermo, il testo verde "le gestiamo noi..." è enorme e domina tutto
2. **Badge target in alto poco visibile** — il pill "PER AZIENDE DI SERRAMENTI..." è piccolo e si perde
3. **Sottotitolo troppo lungo senza gerarchia visiva** — il paragrafo descrittivo è un blocco unico grigio
4. **Dashboard mockup piatta** — la card sembra un wireframe, poco convincente come "social proof"
5. **CTA poco prominente** — il pulsante verde si confonde con il titolo verde, manca contrasto
6. **Immagine burocrazia troppo sfumata** — quasi invisibile, non aggiunge valore visivo
7. **Troppo spazio vuoto sotto la CTA** — la sezione è min-h-screen ma il contenuto finisce prima
8. **Nessun elemento di urgenza/scarcity** — manca un micro-badge tipo "Oltre 120 aziende ci affidano le pratiche"
9. **Mobile: dashboard e Trustpilot nascosti** — su mobile si perde tutta la social proof

### Modifiche proposte

**`HeroSection.tsx` — redesign completo**

1. **Ridurre font titolo** — da `text-7xl` a `text-5xl xl:text-6xl`, più leggibile e professionale
2. **Aggiungere social proof sotto il badge** — piccola riga con avatar stack + "120+ aziende ci affidano le pratiche" visibile anche su mobile
3. **Migliorare sottotitolo** — spezzare in 2 frasi distinte con icone check verdi per i vantaggi chiave (raccolta documenti, trasmissione, concentrati sulle vendite)
4. **CTA più grande e con contrasto** — padding maggiore, aggiungere sotto-CTA secondaria (numero di telefono clickabile)
5. **Immagine sfondo: aumentare opacità** — da 0.50 a 0.60, ridurre gradient di copertura
6. **Dashboard mockup migliorata** — aggiungere leggera animazione ai numeri, bordo più definito, ombra più marcata
7. **Trustpilot visibile su mobile** — spostare il badge Trustpilot sopra o sotto la CTA, visibile su tutti i device
8. **Scroll indicator** — aggiungere freccia animata in basso per invitare allo scroll

### Risultato
Hero più compatta, leggibile, con social proof visibile su tutti i device, CTA più prominente e gerarchia visiva chiara.

