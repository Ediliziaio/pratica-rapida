

# Redesign Sezione "Confronto"

## Problemi attuali
- Le due card sono piatte e poco differenziate visivamente
- Manca un elemento che attiri l'attenzione sulla colonna "Pratica Rapida" come scelta vincente
- Il layout e' funzionale ma poco moderno, senza gerarchia visiva chiara
- Mancano etichette o badge che guidino l'occhio del lettore

## Soluzione

### 1. Header migliorato
- Aggiungere un badge "VS" o "CONFRONTO DIRETTO" sopra il titolo con icona Scale
- Sottotitolo descrittivo sotto il titolo principale
- Separatore decorativo verde

### 2. Card "Quello che hai adesso" (sinistra) - stile negativo
- Header con sfondo rosso sfumato (`bg-red-500/10`) e icona XCircle piu' grande
- Badge "METODO TRADIZIONALE" in alto
- Bordo rosso sottile (`border-red-500/20`)
- Icone lista piu' grandi e con spacing migliore
- Footer con un "verdetto" negativo: box con costo stimato alto e tempo perso

### 3. Card "Pratica Rapida" (destra) - stile vincente
- Card leggermente piu' grande o con effetto "sollevato" (shadow-xl, scale-105 su desktop)
- Badge "RACCOMANDATO" o ribbon verde in alto a destra
- Header con sfondo verde sfumato e icona CheckCircle2 piu' grande
- Bordo verde definito (`border-green`)
- Footer con prezzo "65 euro" evidenziato e badge "24h"
- Effetto glow verde sottile attorno alla card

### 4. Elemento centrale "VS"
- Un cerchio con "VS" posizionato tra le due card (solo desktop), sovrapposto al gap
- Crea un effetto visivo di sfida/confronto diretto

### Dettaglio tecnico

**Badge header**:
```text
<span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-4" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN }}>
  <Scale className="w-4 h-4" /> CONFRONTO DIRETTO
</span>
```

**Card sinistra (negativa)**:
```text
<div className="bg-[#0f1d32] border border-red-500/20 rounded-2xl p-8 relative overflow-hidden">
  <div className="absolute top-0 left-0 right-0 h-1 bg-red-500/40" /> <!-- barra rossa in cima -->
  <span className="text-xs bg-red-500/10 text-red-400 px-3 py-1 rounded-full mb-4">METODO TRADIZIONALE</span>
  <h3 con icona XCircle w-6 h-6>
  <ul con icone XCircle e testo piu' grande (text-base)>
  <!-- Footer verdetto -->
  <div className="mt-6 pt-6 border-t border-white/10 bg-red-500/5 rounded-lg p-4">
    <p>"Costo reale stimato: 250-500 euro a pratica"</p>
    <p>"Tempi: da 3 a 15 giorni"</p>
  </div>
</div>
```

**Card destra (vincente) con effetto sollevato**:
```text
<div className="rounded-2xl p-8 relative overflow-hidden md:scale-105 shadow-2xl" style={{ borderColor: PR_GREEN, backgroundColor: `${PR_GREEN}08` }}>
  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: PR_GREEN }} /> <!-- barra verde in cima -->
  <span className="absolute top-4 right-4 text-xs bg-green px-3 py-1 rounded-full text-white font-bold">CONSIGLIATO</span>
  <h3 con icona CheckCircle2 w-6 h-6>
  <ul con icone CheckCircle2 e testo piu' grande>
  <!-- Footer prezzo -->
  <div className="mt-6 pt-6 border-t border-green/20 flex items-center justify-between">
    <div>
      <span className="text-3xl font-bold text-green">65 euro</span>
      <span className="text-white/50 text-sm ml-2">a pratica</span>
    </div>
    <span className="bg-green/20 text-green px-3 py-1 rounded-full text-sm font-bold">24h</span>
  </div>
</div>
```

**Cerchio VS centrale** (solo desktop):
```text
<div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#0d1a2d] border-2 border-white/20 items-center justify-center z-10">
  <span className="text-white font-black text-lg">VS</span>
</div>
```

Il grid wrapper diventa `relative` per posizionare il cerchio VS.

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 483-534: redesign completo sezione Confronto con badge, card asimmetriche, cerchio VS e footer evidenziati |

