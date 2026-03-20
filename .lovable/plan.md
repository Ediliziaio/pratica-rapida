

## Piano: Hero Section con sfondo bianco e immagine sfumata

### Cosa cambia
La HeroSection passa da sfondo scuro (`--pr-dark`) a **sfondo bianco** con un'immagine decorativa sfumata in background (gradient overlay che la dissolve ai bordi). Tutti i colori del testo si adattano di conseguenza.

### Modifiche su `src/components/landing/HeroSection.tsx`

1. **Sfondo sezione**: `bg-white` con un `<img>` posizionato absolute (es. foto di serramenti/finestre da Unsplash) coperto da un gradient bianco `from-white via-white/80 to-transparent` per sfumare l'immagine sul lato destro/basso
2. **Testo titolo**: da `text-white` a `text-foreground` (scuro)
3. **Testo "Pratiche ENEA"**: resta verde `hsl(var(--pr-green))`
4. **Paragrafo**: da `text-white/60` a `text-muted-foreground`
5. **Checklist**: da `text-white/50` a `text-muted-foreground`
6. **Sub-text social proof**: da `text-white/40` a `text-muted-foreground`
7. **Dashboard mockup card**: da sfondo scuro a `bg-card border shadow-lg`, testi da `text-white` a `text-foreground`
8. **Trustpilot badge**: da `text-white/40` a `text-muted-foreground`
9. **Floating shapes**: opacità leggermente aumentata per essere visibili su bianco
10. **Immagine background**: foto di alta qualità (serramenti/finestre) posizionata absolute a destra, con opacity e gradient mask per un effetto sfumato elegante

