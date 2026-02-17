

# Redesign Sezione "Due Garanzie"

## Stato attuale
La sezione (righe 671-698) ha due card scure piatte con icona piccola, titolo e paragrafo. Funzionale ma poco impattante, manca differenziazione visiva e non ci sono immagini o elementi grafici che catturino l'attenzione.

## Soluzione

### 1. Header migliorato
- Badge "GARANZIE ESCLUSIVE" con icona Shield sopra il titolo
- Sottotitolo descrittivo sotto il titolo principale
- Separatore decorativo verde

### 2. Card Garanzia #1 "Assicurazione Blindata" - layout orizzontale
- Layout a due colonne: a sinistra illustrazione/grafica, a destra testo
- Illustrazione: un div decorativo con icona Shield grande (w-20 h-20) dentro un cerchio con anelli concentrici che creano un effetto "scudo protettivo" (cerchi con bordi verdi a opacita' decrescente)
- Sfondo card piu' chiaro (`bg-[#0f1d32]`) con bordo verde e barra verde in cima
- Badge "INCLUSA" in alto a destra
- Testo con bullet points invece di un unico paragrafo per maggiore leggibilita'

### 3. Card Garanzia #2 "Paghi Solo a Pratica Effettuata" - layout orizzontale
- Stessa struttura a due colonne ma speculare (testo a sinistra, grafica a destra)
- Illustrazione: icona CreditCard grande con un badge "0 euro" sovrapposto e effetto "crossed out" sulle voci di costo (canone, abbonamento, attivazione) per comunicare visivamente che non ci sono costi nascosti
- Badge "ZERO RISCHI" in alto a destra

### 4. Elementi grafici decorativi
- Anelli concentrici attorno alle icone principali per creare profondita'
- Piccole icone decorative (checkmark, star) sparse nella grafica
- Effetto glow verde sottile attorno alle card

### Dettaglio tecnico

**Struttura card con illustrazione (Garanzia 1)**:
```text
<div className="bg-[#0f1d32] rounded-2xl p-8 relative overflow-hidden border" style={{ borderColor: `${PR_GREEN}30` }}>
  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: PR_GREEN }} />
  <span className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full font-bold text-white" style={{ backgroundColor: PR_GREEN }}>INCLUSA</span>
  <div className="grid md:grid-cols-2 gap-8 items-center">
    <!-- Illustrazione: cerchi concentrici con Shield -->
    <div className="flex items-center justify-center">
      <div className="relative">
        <div className="w-40 h-40 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}10` }}>
          <div className="w-28 h-28 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}20` }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15` }}>
              <Shield className="w-10 h-10" style={{ color: PR_GREEN }} />
            </div>
          </div>
        </div>
        <!-- piccoli badge decorativi -->
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
    <!-- Testo -->
    <div>
      <h3 className="text-2xl font-bold mb-4">Garanzia #1: Assicurazione Blindata</h3>
      <ul className="space-y-3 text-white/60 text-sm">
        <li className="flex items-start gap-2">
          <CheckCircle2 /> Ogni pratica coperta dalla nostra assicurazione
        </li>
        <li>Errori? Responsabilita' nostra al 100%</li>
        <li>Nessun costo aggiuntivo per te</li>
        <li>Pratiche in mani sicure e assicurate</li>
      </ul>
    </div>
  </div>
</div>
```

**Illustrazione Garanzia 2 (costi barrati)**:
```text
<div className="flex flex-col items-center gap-3">
  <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15` }}>
    <CreditCard className="w-10 h-10" style={{ color: PR_GREEN }} />
  </div>
  <div className="space-y-2 text-center">
    <p className="line-through text-red-400/60 text-sm">Canone mensile</p>
    <p className="line-through text-red-400/60 text-sm">Abbonamento</p>
    <p className="line-through text-red-400/60 text-sm">Costo attivazione</p>
  </div>
  <span className="text-xl font-black" style={{ color: PR_GREEN }}>0€ anticipati</span>
</div>
```

Su mobile le card tornano a layout verticale (illustrazione sopra, testo sotto).

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 671-698: redesign completo sezione Garanzie con layout orizzontale, illustrazioni grafiche (cerchi concentrici + costi barrati), badge e bullet points |

