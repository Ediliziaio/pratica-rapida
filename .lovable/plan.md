

# Miglioramento Grafico Sezione "Come Funziona"

## Modifiche previste

### 1. Header della sezione piu' impattante
- Aggiungere un badge "3 SEMPLICI PASSI" sopra il titolo con icona Sparkles
- Sottotitolo "Tre passi. Zero sforzo." con testo piu' grande e colore piu' visibile (da `text-gray-400` a `text-gray-500 text-xl`)
- Aggiungere un separatore decorativo verde sotto il sottotitolo

### 2. Icone piu' grandi e con animazione
- Aumentare il contenitore icona da `w-14 h-14` a `w-20 h-20`
- Aumentare le icone da `w-7 h-7` a `w-10 h-10`
- Aggiungere un anello esterno decorativo attorno al contenitore icona (ring verde semitrasparente)
- Aggiungere la classe `hover-scale` alle card per animazione hover

### 3. Step number piu' visibile
- Aumentare il numero step da `text-4xl` a `text-6xl` per renderlo piu' decorativo
- Spostare leggermente la posizione per non sovrapporsi al contenuto

### 4. Connettori tra le card (solo desktop)
- Aggiungere frecce o linee tratteggiate tra le 3 card per comunicare sequenza visiva
- Implementato con pseudo-elementi o div assoluti tra le colonne

### 5. Card con bordo verde al hover
- Aggiungere transizione del bordo: da `border-gray-200` a `border-green` al hover
- Ombra verde sottile al hover invece della generica `card-hover-glow`

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 426-465: redesign sezione Come Funziona |

### Dettaglio tecnico

**Badge sopra il titolo**:
```text
<span className="inline-flex items-center gap-2 bg-green/10 text-green px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
  <Sparkles className="w-4 h-4" /> 3 SEMPLICI PASSI
</span>
```

**Icone piu' grandi con anello**:
```text
<div className="relative mx-auto mb-6">
  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto bg-green/10 ring-4 ring-green/5">
    <item.icon className="w-10 h-10 text-green" />
  </div>
</div>
```

**Connettori tra card** (visibili solo su md+):
```text
// Dopo la prima e seconda card, un div con freccia
<div className="hidden md:flex items-center justify-center">
  <ArrowRight className="w-8 h-8 text-green/30" />
</div>
```

Per i connettori, il grid passera' da `md:grid-cols-3` a `md:grid-cols-5` con le card nelle colonne 1, 3, 5 e le frecce nelle colonne 2 e 4.

**Card hover migliorato**:
```text
className="bg-gray-50 border border-gray-200 hover:border-green/40 rounded-xl p-8 text-center relative transition-all duration-300 hover:shadow-lg hover:shadow-green/5"
```
