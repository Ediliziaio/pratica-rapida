

# Logo Header Scuro + Footer Bianco con Dati Aziendali

## Modifiche

### 1. Logo bianco/grigio per header scuro
- Copiare il logo caricato (`Edilizia_in_Cloud_Logo_1.png`) come `public/pratica-rapida-logo-white.png`
- Nella navbar, usare di nuovo il `src` condizionale: logo bianco su sfondo scuro, logo verde su sfondo bianco dopo scroll

### 2. Footer bianco con logo verde e dati aziendali
- Cambiare il footer da sfondo scuro (`bg-[#0a1628]`) a sfondo bianco (`bg-white`)
- Usare il logo verde (`pratica-rapida-logo.png`) nel footer
- Aggiungere i dati di contatto forniti:
  - Telefono: +39 351 7935227
  - Email: modulistica@praticarapida.it
  - Sede: Lissone (MB)
  - P.IVA 03937130791
- Aggiornare i colori del testo da bianco a grigio scuro per leggibilita' su sfondo bianco

### File modificati

| File | Modifica |
|------|----------|
| `public/pratica-rapida-logo-white.png` | Logo grigio/bianco dall'upload per header scuro |
| `src/pages/Home.tsx` | Header: src condizionale logo; Footer: sfondo bianco, logo verde, dati aziendali |

### Dettaglio tecnico

**Header (navbar):**
```text
// Da:
src="/pratica-rapida-logo.png"

// A:
src={scrolled ? "/pratica-rapida-logo.png" : "/pratica-rapida-logo-white.png"}
```

**Footer:**
```text
// Da: sfondo scuro con testo bianco
<footer className="border-t border-white/5 py-10 px-6 bg-[#0a1628]">

// A: sfondo bianco con testo grigio, logo verde, dati contatto
<footer className="border-t border-gray-200 py-10 px-6 bg-white">
  - Logo verde (pratica-rapida-logo.png)
  - Telefono, email, sede, P.IVA
  - Link navigazione in grigio
  - Copyright aggiornato
```

