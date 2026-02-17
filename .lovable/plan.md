

# Redesign Sezione "Chi c'e' dietro Pratica Rapida"

## Stato attuale
La sezione (righe 843-866) ha un layout semplice a due colonne: testo a sinistra e immagine a destra. Il testo e' lungo e uniforme, senza elementi visivi che spezzino la lettura. Manca il riferimento ai 10+ anni di esperienza e al supporto durante il bonus sconto in fattura.

## Contenuto aggiornato
- Aggiungere il riferimento a **oltre 10 anni di esperienza** nel settore
- Menzionare il **supporto durante il bonus dello sconto in fattura** come prova concreta di competenza
- Riscrivere i paragrafi per essere piu' concisi e incisivi

## Miglioramenti grafici

### 1. Header con badge e sottotitolo
- Badge "IL NOSTRO TEAM" con icona Users sopra il titolo
- Separatore decorativo verde sotto il titolo

### 2. Contatori di esperienza (stats bar)
- Una riga di 3 numeri impattanti tra titolo e testo:
  - **10+** anni di esperienza
  - **Migliaia** di pratiche gestite
  - **100%** pratiche assicurate
- Stile: numeri grandi in verde, testo descrittivo piccolo sotto in grigio
- Sfondo leggero verde (`bg-green-50`) con bordo arrotondato

### 3. Testo riorganizzato con punti chiave evidenziati
- Primo paragrafo: introduzione con enfasi sull'esperienza decennale
- Secondo paragrafo: menzione esplicita del supporto durante lo sconto in fattura
- Terzo paragrafo: il team e la cura per i clienti
- Parole chiave in **grassetto** per facilitare la scansione

### 4. Immagine migliorata
- Bordo verde sottile invece del grigio
- Ombra piu' definita (`shadow-lg`)
- Badge sovrapposto sull'immagine: "Oltre 10 anni nel settore" posizionato in basso a sinistra con sfondo verde

### 5. Citazione con stile migliorato
- Box dedicato con icona virgolette e sfondo verde chiaro
- Testo della citazione piu' grande e leggibile

## Dettaglio tecnico

### Stats bar:
```text
<div className="grid grid-cols-3 gap-4 my-8 bg-green-50 rounded-xl p-6 border border-green-100">
  <div className="text-center">
    <span className="text-3xl font-black" style={{ color: PR_GREEN }}>10+</span>
    <p className="text-xs text-gray-500 mt-1">Anni di esperienza</p>
  </div>
  <div className="text-center border-x border-green-200">
    <span className="text-3xl font-black" style={{ color: PR_GREEN }}>Migliaia</span>
    <p className="text-xs text-gray-500 mt-1">Pratiche gestite</p>
  </div>
  <div className="text-center">
    <span className="text-3xl font-black" style={{ color: PR_GREEN }}>100%</span>
    <p className="text-xs text-gray-500 mt-1">Pratiche assicurate</p>
  </div>
</div>
```

### Immagine con badge:
```text
<div className="relative rounded-xl overflow-hidden shadow-lg border" style={{ borderColor: `${PR_GREEN}30` }}>
  <img src={teamImg} alt="Il team di Pratica Rapida" className="w-full h-auto" />
  <div className="absolute bottom-4 left-4 px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: PR_GREEN }}>
    Oltre 10 anni nel settore
  </div>
</div>
```

### Testo aggiornato (paragrafi):
- "Da oltre 10 anni ci occupiamo di pratiche nel settore degli infissi, delle tende da sole, delle pergole e dei serramenti. Non siamo l'ennesima startup che ha scoperto ieri cosa sia una pratica ENEA."
- "Abbiamo supportato centinaia di aziende durante il periodo del bonus dello sconto in fattura, gestendo volumi enormi di pratiche con precisione e puntualita'. Quella esperienza ci ha reso ancora piu' veloci, affidabili e organizzati."
- "Il nostro team e' composto da professionisti specializzati. Ogni pratica e' seguita con cura, verificata e assicurata. Ci presentiamo a nome della vostra azienda e trattiamo i vostri clienti come se fossero i nostri."

### Citazione rivisitata:
```text
<div className="mt-8 bg-green-50 border-l-4 rounded-r-lg p-5" style={{ borderColor: PR_GREEN }}>
  <p className="text-gray-700 font-semibold italic text-lg">
    "Permetterti di offrire un servizio completo ai tuoi clienti senza aggiungere un solo minuto di lavoro alla tua giornata."
  </p>
</div>
```

### Icone da importare
- `Users` da lucide-react (se non gia' importata)
- `Quote` non necessaria, usiamo il border-left come indicatore visivo

### File modificato

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | Righe 843-866: redesign completo sezione "Chi c'e' dietro" con stats bar, testo aggiornato (10+ anni, sconto in fattura), immagine con badge, citazione stilizzata |

