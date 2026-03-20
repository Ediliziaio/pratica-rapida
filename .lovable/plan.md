

## Piano: Navbar trasparente + Miglioramento ProblemSection

### 1. Navbar trasparente nella Hero, bianca on scroll

**`Navbar.tsx`** — Cambiare il comportamento:
- **In cima (scrollY <= 20)**: sfondo trasparente (`bg-transparent`), nessun bordo, nessuna ombra — si fonde con la Hero
- **Dopo scroll**: sfondo bianco solido (`bg-background/95 backdrop-blur-xl`), ombra e bordo come adesso
- I link e il logo mantengono lo stesso colore (già scuro, funziona su entrambi gli sfondi dato che la Hero ha sfondo chiaro)

### 2. Miglioramento ProblemSection

**`ProblemSection.tsx`** — Redesign per maggiore impatto:
- **Aggiungere badge/label** sopra il titolo: "IL PROBLEMA" in pill verde per dare contesto
- **Evidenziare la frase chiave** "Ore che non vengono pagate. Ore tolte alla vendita." con bordo sinistro verde e sfondo leggero (blockquote style)
- **Sostituire immagine stock** con un layout più d'impatto: icone animate che rappresentano i dolori (telefono, documenti, orologio) con numeri/statistiche
- **Migliorare la transizione** "Ecco perché esistiamo" — renderla più grande e centrata con una linea verde animata che la collega alla sezione successiva
- **Aggiungere pain-point pills** animati: "Raccolta documenti", "Moduli ENEA", "Follow-up telefonici", "Portali" come tag che appaiono staggered
- **Mobile**: su schermi piccoli, invertire ordine (testo prima, visual dopo)

### File modificati
- `src/components/landing/Navbar.tsx`
- `src/components/landing/ProblemSection.tsx`

