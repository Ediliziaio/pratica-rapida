

# Redesign Sezione "Prezzi" + Fix Testo

## Correzione contenuto
- Riga 621: sostituire "Inseguire clienti per fatture e certificazioni" con "Inseguire clienti"

## Redesign grafico della sezione Prezzi

### 1. Header piu' impattante
- Badge "PREZZO TRASPARENTE" con icona CreditCard sopra il titolo
- Mantenere il contatore animato del prezzo (65 euro) ma renderlo piu' grande e con un effetto glow verde
- Aggiungere un separatore decorativo verde sotto il sottotitolo
- Testo "Non 200 euro. Non 150 euro. Non 100 euro." con effetto barrato sui prezzi alti per enfatizzare il risparmio

### 2. Card "Tutto quello che ottieni" (sinistra) - stile premium
- Sfondo bianco con bordo verde sottile (`border-green/20`) invece del grigio piatto
- Barra verde in cima alla card (come nella sezione Confronto)
- Icona CheckCircle2 piu' grande nell'header (w-6 h-6)
- Ogni voce della lista con testo leggermente piu' grande e spaziatura migliore
- Ombra piu' definita di default (`shadow-md`)

### 3. Card "Cosa NON devi piu' fare" (destra) - stile negativo
- Sfondo con leggera sfumatura rossa (`bg-red-50`) e bordo rosso sottile (`border-red-200`)
- Barra rossa in cima alla card
- Testo delle voci con effetto barrato (`line-through`) e colore rosso attenuato per comunicare visivamente "eliminato"
- Fix del testo: "Inseguire clienti" al posto di "Inseguire clienti per fatture e certificazioni"

### 4. Box prezzo centrale sotto le card
- Aggiungere un box evidenziato con sfondo verde sfumato tra le card e il CTA
- Dentro: prezzo grande "65 euro", testo "a pratica completata", badge "ZERO CANONI" e badge "24H"
- Bordo verde e shadow verde sottile

### 5. CTA piu' grande
- Bottone piu' grande con padding aumentato
- Testo sotto il bottone invariato

### Dettaglio tecnico

**Prezzi barrati nell'header**:
```text
<p className="text-gray-500 text-lg mb-2">
  Non <span className="line-through text-red-400">200€</span>. 
  Non <span className="line-through text-red-400">150€</span>. 
  Non <span className="line-through text-red-400">100€</span>.
</p>
```

**Card sinistra (premium)**:
```text
<div className="bg-white border rounded-2xl p-8 shadow-md relative overflow-hidden" style={{ borderColor: `${PR_GREEN}30` }}>
  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: PR_GREEN }} />
  ...lista con icone e testo text-sm/text-base...
</div>
```

**Card destra (eliminato)**:
```text
<div className="bg-red-50 border border-red-200 rounded-2xl p-8 shadow-md relative overflow-hidden">
  <div className="absolute top-0 left-0 right-0 h-1 bg-red-400" />
  ...voci con line-through text-red-400/60...
</div>
```

**Box prezzo centrale**:
```text
<div className="mx-auto max-w-md rounded-2xl p-6 text-center mb-8 shadow-lg" style={{ backgroundColor: `${PR_GREEN}08`, border: `2px solid ${PR_GREEN}30` }}>
  <span className="text-4xl font-black" style={{ color: PR_GREEN }}>65€</span>
  <span className="text-gray-500 ml-2">a pratica completata</span>
  <div className="flex justify-center gap-3 mt-3">
    <span className="bg-green/10 text-green px-3 py-1 rounded-full text-xs font-bold">ZERO CANONI</span>
    <span className="bg-green/10 text-green px-3 py-1 rounded-full text-xs font-bold">24H</span>
  </div>
</div>
```

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 576-641: redesign completo sezione Prezzi con card asimmetriche, prezzi barrati, box prezzo evidenziato e fix testo "Inseguire clienti" |

