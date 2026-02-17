

# Miglioramento Grafico Sezione "Parliamoci chiaro" + Trappole

## Modifiche previste

### 1. Intestazione "Parliamoci chiaro" piu' impattante
- Aggiungere un'icona o un badge sopra il titolo (es. icona Target o AlertTriangle con sfondo verde semitrasparente)
- Titolo piu' grande (da `text-3xl md:text-4xl` a `text-3xl md:text-5xl`) con punto verde evidenziato
- Aggiungere un separatore decorativo sotto il titolo (linea verde corta centrata)

### 2. Testo introduttivo con evidenziazioni migliori
- Evidenziare parole chiave con colore verde o bianco forte anziche' lasciare tutto in `text-white/50`
- La citazione centrale ("Non e' il migliore che vince...") trasformata in un blockquote con bordo verde a sinistra, sfondo semitrasparente e tipografia piu' grande
- Aggiungere iconcine inline per i concetti chiave (es. icona spada per "campo di battaglia", icona bilancia per "margini")

### 3. Sottotitolo "Le 2 trappole" con badge numerico
- Aggiungere un badge rosso/warning "ATTENZIONE" sopra il titolo trappole
- Titolo piu' grande e con icona AlertTriangle

### 4. Card Trappole ridisegnate
- Aggiungere un numero grande semitrasparente in alto a destra (stile step cards della sezione "Come Funziona")
- Bordo rosso sottile invece di bianco/10 per comunicare pericolo
- Header della card con sfondo rosso sfumato
- Separare i paragrafi con bullet points per i punti chiave (es. "Sei tu che devi..." come lista puntata con icone X rosse)
- Aggiungere in fondo a ogni card un "costo reale" evidenziato (es. box con il vero costo stimato)

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 312-360: redesign sezione Parliamoci chiaro + Trappole |

### Dettaglio tecnico

**Titolo**: badge + titolo piu' grande + divider verde

```text
<span badge verde> IL PROBLEMA DEL SETTORE </span>
<h2 text-5xl> Parliamoci chiaro. </h2>
<div className="w-16 h-1 bg-green mx-auto mt-4 mb-8 rounded" />
```

**Citazione centrale**: blockquote con stile

```text
<blockquote className="border-l-4 border-green bg-green/5 p-6 rounded-r-xl my-8">
  <p className="text-white/90 text-xl italic font-medium">
    "Non e' il migliore che vince..."
  </p>
</blockquote>
```

**Card Trappole**: layout migliorato

```text
- Bordo: border-red-500/20 invece di border-white/10
- Numero grande "#1" semitrasparente in alto a destra
- Lista puntata con icone XCircle rosse per ogni "Sei tu che devi..."
- Box finale evidenziato: "Costo reale: 3-5x di piu'"
```

