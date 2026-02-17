
# Tre Miglioramenti alla Landing Page

## 1. Trustpilot Badge in alto (nella Hero)

Aggiungere subito sotto gli stats della Hero (riga 287) un blocco Trustpilot con:
- 5 stelle verdi/gialle
- Testo "Oltre 122 recensioni su Trustpilot"
- Link cliccabile a `https://it.trustpilot.com/review/praticarapida.it` che apre in nuova tab
- Stile: stelle colorate, testo `text-white/50`, icona Star di lucide-react, link con hover underline

## 2. Logo Slider delle aziende partner (dopo la Hero, prima della sezione "Il Problema")

Inserire dopo la Hero (riga 289) e prima della sezione "Il Problema" (riga 291) un banner scuro con:
- Testo sopra: "Ci hanno scelto" in `text-white/30` uppercase piccolo
- Una riga di loghi placeholder (testi stilizzati in assenza di loghi reali) che scorrono con animazione CSS `marquee` infinita
- Loghi placeholder: "Serramenti Rossi", "Infissi Bianchi", "Pergole Italia", "TendeSu", "Finestre Top", "Alluminio Pro", "Serramenti Milano", "InfissiGroup"
- Animazione: `@keyframes marquee` da `translateX(0)` a `translateX(-50%)` con duplicazione dei loghi per loop seamless
- Lo slider va aggiunto in `src/index.css` come keyframe custom

## 3. CTA Finale migliorata (righe 900-927)

Redesign completo della CTA con:
- **Badge** "NON ASPETTARE" con icona Zap sopra il titolo
- **Titolo** piu' grande e incisivo
- **3 mini-card** orizzontali sotto il testo principale che riassumono i benefit:
  - "Zero Rischi" con Shield icon
  - "65euro/pratica" con CreditCard icon  
  - "Consegna 24h" con Clock icon
- **CTA button** piu' grande con effetto glow e freccia
- **Gradiente radiale verde** di sfondo per dare calore
- **PS e PPS** restano ma con stile migliorato: icona a sinistra e sfondo leggermente diverso per ognuno
- **Trustpilot** anche qui: una riga con stelle e "122+ recensioni" per rafforzare la fiducia prima del click

## Dettaglio tecnico

### Trustpilot nella Hero (dopo riga 287):
```text
<a href="https://it.trustpilot.com/review/praticarapida.it" target="_blank" rel="noopener noreferrer"
   className="inline-flex items-center gap-2 mt-6 text-white/40 hover:text-white/60 transition-colors text-sm">
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-green-400 text-green-400" />)}
  </div>
  <span>Oltre 122 recensioni su <strong className="text-white/60">Trustpilot</strong></span>
</a>
```

### Logo slider (nuovo blocco tra Hero e "Il Problema"):
- CSS in `src/index.css`:
```css
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-marquee {
  animation: marquee 25s linear infinite;
}
```
- JSX: div con `overflow-hidden`, dentro un flex con i loghi duplicati (array ripetuto 2x) che scorre con `animate-marquee`
- I loghi saranno testi stilizzati in box con bordo `border-white/10` e font bold `text-white/20` per sembrare placeholder professionali, facilmente sostituibili con immagini reali

### CTA Finale redesign:
- Gradiente radiale verde di sfondo: `radial-gradient(circle at 50% 0%, ${PR_GREEN}12 0%, transparent 50%)`
- 3 mini benefit card in `grid grid-cols-3` con icona + testo, sfondo `bg-white/5` e bordo `border-white/10`
- Trustpilot ripetuto sotto il bottone CTA
- PS/PPS in card separate con icone `FileText` e `Sparkles`

### File modificati

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | 1) Trustpilot badge dopo stats Hero (riga ~287), 2) Logo slider tra Hero e sezione Problema (riga ~289), 3) Redesign CTA finale (righe 900-927) |
| `src/index.css` | Aggiunta keyframe `marquee` e classe `animate-marquee` |
