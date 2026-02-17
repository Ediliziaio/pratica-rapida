

# Redesign Sezione "Come Funziona"

## Problemi attuali
- Il grid a 5 colonne (`md:grid-cols-5`) rende le card troppo strette e il testo illeggibile
- I numeri step (01, 02, 03) si sovrappongono alle icone creando confusione visiva
- Le frecce tra le card sono troppo piccole e perse nello spazio
- L'aspetto generale e' disordinato e poco professionale

## Soluzione

### Layout
- Tornare a `md:grid-cols-3` con `gap-8` per dare respiro alle card
- Rimuovere le frecce come elementi separati del grid
- Aggiungere connettori come linea tratteggiata orizzontale dietro le card (solo desktop), oppure piu' semplicemente una linea con pallini numerati sopra le card

### Design Card
- Numero step come badge circolare verde sopra la card (posizionato al centro in alto, leggermente sovrapposto al bordo) invece che come testo gigante sovrapposto
- Icona centrata con dimensione `w-16 h-16` nel contenitore `w-20 h-20`
- Titolo e descrizione con spaziatura corretta
- Bordo piu' definito e ombra leggera di default (non solo hover)

### Connettore visivo (solo desktop)
- Una linea orizzontale tratteggiata verde che collega i 3 pallini numerati, posizionata sopra le card
- I numeri 1, 2, 3 dentro cerchi verdi allineati sopra ogni card
- Questo crea un effetto "timeline" pulito e professionale

### Dettaglio tecnico

**Struttura**:

```text
// Timeline sopra le card (solo desktop)
<div className="hidden md:flex justify-between items-center mb-8 px-16 relative">
  // Linea orizzontale
  <div className="absolute top-1/2 left-16 right-16 h-0.5 bg-green/20" />
  // 3 cerchi numerati
  {[1,2,3].map(n => <div className="w-10 h-10 rounded-full bg-green text-white flex items-center justify-center font-bold z-10">{n}</div>)}
</div>

// Grid card torna a 3 colonne
<div className="grid md:grid-cols-3 gap-8">
  // Card senza numeri sovrapposti, senza frecce nel grid
</div>
```

**Card pulita**:
```text
<div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm hover:shadow-md hover:border-green/30 transition-all duration-300">
  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-green/10">
    <Icon className="w-8 h-8 text-green" />
  </div>
  <h3 className="text-xl font-bold mb-3">Titolo</h3>
  <p className="text-gray-500 text-sm leading-relaxed">Descrizione</p>
</div>
```

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 441-473: rimuovere grid a 5 colonne e frecce, aggiungere timeline orizzontale + grid a 3 colonne con card pulite |

