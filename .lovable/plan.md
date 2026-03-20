

## Piano: Animazione Dashboard Mockup

### Cosa fare
Aggiungere animazioni staggered alle righe del mockup dashboard nella HeroSection: ogni riga entra con un leggero ritardo, e i valori numerici hanno un effetto di conteggio animato.

### Modifiche a `HeroSection.tsx`

1. **Staggered row entry** — Ogni riga della dashboard (Pratiche completate, Tempo medio, Clienti contattati) entra con `motion.div` con delay incrementale (0.8s, 1.0s, 1.2s) e slide-up + fade-in
2. **Counter animation sui numeri** — I valori "47", "48", "32" partono da 0 e contano fino al valore finale con easing (durata ~1.5s, parte quando la riga è visibile)
3. **Floating animation continua** — Il container del mockup ha un leggero `animate-float` CSS (già definito in index.css) per un effetto di galleggiamento perpetuo
4. **Pulse sui traffic light dots** — I 3 pallini in alto appaiono uno alla volta con delay (0.6s, 0.7s, 0.8s)
5. **Status bar fade-in** — La riga "Dashboard operativa — aggiornata in tempo reale" appare per ultima con fade-in a delay 1.6s

### Implementazione
- Usare `motion.div` di framer-motion (già importato) per le animazioni staggered
- Creare un piccolo hook/effetto inline per il counter (useState + useEffect con requestAnimationFrame)
- Nessun nuovo file, tutto in HeroSection.tsx

