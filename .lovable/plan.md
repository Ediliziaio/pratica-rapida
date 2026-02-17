

# Miglioramento Sezione "Due Garanzie" - Livello Superiore

## Stato attuale
La sezione ha gia' un buon layout a due colonne con illustrazioni a cerchi concentrici e bullet points. Pero' le illustrazioni sono ancora "statiche" e minimali (solo cerchi + icona), le card si assomigliano troppo tra loro, e manca un effetto "wow" visivo.

## Miglioramenti proposti

### 1. Illustrazione Garanzia #1 - Effetto scudo animato con floating badges
- Aggiungere un **anello esterno pulsante** (animazione CSS `animate-pulse`) per dare vita allo scudo
- Aggiungere **3 piccoli badge floating** intorno ai cerchi con testi brevi ("100%", icona Lock, icona ShieldCheck) posizionati con `absolute` e con animazione `animate-float` / `animate-float-delayed`
- L'icona Shield centrale diventa piu' grande (w-12 h-12) con un **effetto glow verde** (`boxShadow: 0 0 30px ${PR_GREEN}40`)
- Aggiungere un **gradiente radiale** di sfondo dietro i cerchi per creare profondita'

### 2. Illustrazione Garanzia #2 - "Calcolatrice visiva" con risparmio
- Sostituire i semplici cerchi concentrici con una composizione piu' narrativa:
  - Icona CreditCard grande al centro con glow
  - I costi barrati diventano **card mini** con sfondo rosso traslucido (`bg-red-500/10`) e icona X, invece di semplice testo
  - Aggiungere una **freccia verso il basso** che porta al badge "0 euro anticipati" piu' grande e con effetto glow
  - Badge floating "GRATIS" e "NO VINCOLI" che orbitano intorno

### 3. Card con sfondo differenziato
- **Garanzia #1**: aggiungere un gradiente radiale verde molto sottile nell'angolo in alto a sinistra (`radial-gradient(circle at 0% 0%, ${PR_GREEN}08 0%, transparent 50%)`) per dare calore
- **Garanzia #2**: aggiungere un gradiente radiale ambra/oro nell'angolo in alto a destra per differenziarla visivamente dalla prima

### 4. Testo piu' impattante
- Ogni bullet point avra' il testo principale in **bianco** (`text-white`) e un sotto-testo in `text-white/40` per aggiungere dettaglio
- Aggiungere un **footer card** con un mini-riassunto: es. "Protetto al 100%" per la #1, "Zero euro anticipati" per la #2, dentro un box con sfondo verde

### 5. Numerazione grande decorativa
- Aggiungere un grande "01" e "02" semi-trasparente (`text-8xl font-black text-white/[0.03]`) posizionato in absolute nell'angolo della card per dare gerarchia

## Dettaglio tecnico

**Illustrazione migliorata Garanzia #1**:
```text
<div className="flex items-center justify-center order-1">
  <div className="relative">
    <!-- Numero decorativo -->
    <span className="absolute -top-8 -left-8 text-8xl font-black select-none" style={{ color: `${PR_GREEN}06` }}>01</span>
    <!-- Anello esterno pulsante -->
    <div className="w-52 h-52 rounded-full border flex items-center justify-center animate-pulse" style={{ borderColor: `${PR_GREEN}08` }}>
      <div className="w-40 h-40 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}15` }}>
        <div className="w-28 h-28 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${PR_GREEN}25` }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15`, boxShadow: `0 0 30px ${PR_GREEN}30` }}>
            <Shield className="w-12 h-12" style={{ color: PR_GREEN }} />
          </div>
        </div>
      </div>
    </div>
    <!-- Badge floating decorativi -->
    <div className="absolute -top-3 right-4 px-2 py-1 rounded-lg text-[10px] font-bold text-white animate-float" style={{ backgroundColor: PR_GREEN }}>100%</div>
    <div className="absolute top-1/2 -right-6 w-8 h-8 rounded-full flex items-center justify-center animate-float-delayed" style={{ backgroundColor: `${PR_GREEN}20` }}>
      <Lock className="w-4 h-4" style={{ color: PR_GREEN }} />
    </div>
    <div className="absolute -bottom-3 left-4 px-2 py-1 rounded-lg text-[10px] font-bold text-white animate-float-slow" style={{ backgroundColor: `${PR_GREEN}80` }}>SICURA</div>
  </div>
</div>
```

**Illustrazione migliorata Garanzia #2 (mini-card costi)**:
```text
<div className="flex flex-col items-center gap-4">
  <div className="relative">
    <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15`, boxShadow: `0 0 30px ${PR_GREEN}30` }}>
      <CreditCard className="w-12 h-12" style={{ color: PR_GREEN }} />
    </div>
    <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white animate-float" style={{ backgroundColor: PR_GREEN }}>GRATIS</div>
  </div>
  <!-- Mini card costi eliminati -->
  <div className="space-y-2 w-full max-w-[200px]">
    <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <span className="line-through text-red-400/60 text-xs">Canone mensile</span>
    </div>
    <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <span className="line-through text-red-400/60 text-xs">Abbonamento</span>
    </div>
    <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <span className="line-through text-red-400/60 text-xs">Costo attivazione</span>
    </div>
  </div>
  <!-- Badge risultato -->
  <div className="px-4 py-2 rounded-xl font-black text-lg" style={{ backgroundColor: `${PR_GREEN}15`, color: PR_GREEN, boxShadow: `0 0 20px ${PR_GREEN}20` }}>
    0€ anticipati
  </div>
</div>
```

**Footer card riassuntivo** (aggiunto in fondo a ogni card):
```text
<div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-3">
  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15` }}>
    <ShieldCheck className="w-5 h-5" style={{ color: PR_GREEN }} />
  </div>
  <p className="text-sm font-semibold text-white/80">Protetto al 100% — senza costi aggiuntivi</p>
</div>
```

**Gradiente sfondo card**: aggiunto via `background` inline style.

### Icone aggiuntive da importare
- `Lock` da lucide-react (se non gia' importata)
- `ShieldCheck` da lucide-react (se non gia' importata)

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 687-788: redesign avanzato illustrazioni garanzie con floating badges animati, mini-card costi, gradienti, numeri decorativi e footer riassuntivi |

