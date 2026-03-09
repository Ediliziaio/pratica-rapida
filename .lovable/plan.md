

# Analisi Landing Page /home

## Stato Attuale
La pagina e' ben strutturata, il copy e' persuasivo e il flusso di conversione e' logico. Ci sono pero' alcune migliorie concrete che porterebbero benefici reali.

---

## Problemi Identificati

### 1. CSS Morto
- `animate-marquee` (riga 252-258 di index.css) — residuo del logo slider rimosso. Mai usato.
- `animate-count-up` (riga 243-249) — mai referenziato da nessun componente.

### 2. StickyBottomBar — gap di visibilita' troppo lungo
La barra CTA:
- Parte visibile (showBottomBar: true)
- Si nasconde a 200px di scroll
- Ricompare solo alla sezione Team (circa 70-80% della pagina)

Risultato: per la maggior parte dello scroll la CTA e' invisibile. Sarebbe meglio invertire la logica: nasconderla all'inizio (quando la CTA hero e' visibile) e mostrarla dopo che l'utente ha scrollato oltre la hero section (~600px).

### 3. Performance — immagini non lazy-loaded
- `hero-bg.jpg` e `team-illustration.jpg` sono importati staticamente. L'immagine del team potrebbe beneficiare di `loading="lazy"` dato che e' molto in basso nella pagina.

### 4. FloatingIcons — render inutile su mobile
Le icone sono nascoste via CSS (`hidden lg:block`) ma il componente viene comunque montato e le animazioni girano in background. Meglio un check con media query per non renderizzarle affatto sotto lg.

---

## Riepilogo Modifiche

| File | Azione |
|------|--------|
| `src/index.css` | Rimuovere `animate-marquee` e `animate-count-up` (CSS morto) |
| `src/pages/Home.tsx` | Invertire logica sticky bar: nascosta inizialmente, visibile dopo scroll oltre hero |
| `src/components/landing/TeamSection.tsx` | Aggiungere `loading="lazy"` all'immagine team |
| `src/components/landing/FloatingIcons.tsx` | Usare hook `useMediaQuery` per evitare render su mobile |

4 modifiche chirurgiche. Zero cambi funzionali o di design.

