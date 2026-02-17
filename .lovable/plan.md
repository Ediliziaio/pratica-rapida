

# Fix Barra Fissa in Alto e in Basso

## Problema 1: La barra verde in alto copre la Navbar

La barra verde (`z-[60]`, `fixed top-0`) e la navbar (`z-50`, `fixed top-0`) si sovrappongono perche' entrambe partono da `top-0`. La navbar deve scendere sotto la barra verde.

**Soluzione:** Aggiungere `top-10` (40px, l'altezza della barra verde) alla navbar, cosi' parte subito sotto. Anche il `pt-10` del container va aumentato a `pt-20` per compensare entrambe le barre (top banner + navbar).

## Problema 2: Barra in basso troppo invasiva su mobile

Su mobile la barra mostra 3 righe di testo + bottone, occupando troppo spazio verticale.

**Soluzione:** Su mobile nascondere il sottotitolo lungo e il sotto-sottotitolo, mostrando solo la riga principale e il bottone. Usare classi `hidden md:block` sulle righe secondarie. Ridurre il padding su mobile.

## Dettaglio tecnico

### Navbar (riga 202):
Da:
```
className={`fixed top-0 left-0 right-0 z-50 ...`}
```
A:
```
className={`fixed top-10 left-0 right-0 z-50 ...`}
```

### Container principale (riga 192):
Da: `pt-10 pb-28`
A: `pt-24 pb-28` (per compensare top bar + navbar)

### Bottom bar - testo secondario (righe 1120-1125):
- Aggiungere `hidden md:block` alla riga del sottotitolo verde
- Aggiungere `hidden md:block` alla riga del sotto-sottotitolo grigio
- Ridurre padding mobile: da `py-3` a `py-2`
- Bottone mobile: ridurre padding a `px-4 py-2`

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | 1) Riga 202: aggiunta `top-10` alla navbar. 2) Riga 192: `pt-10` diventa `pt-24`. 3) Righe 1120-1125: `hidden md:block` sui testi secondari della bottom bar. 4) Riga 1115: padding mobile ridotto |

