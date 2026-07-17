# Tutorial — sorgenti

Sorgenti delle due guide PDF. **Modifica questi HTML, mai i PDF**: i PDF sono generati.

Prima d'ora il sorgente viveva solo sul Mac di chi l'aveva fatto e nel repo c'era il solo PDF:
per cambiare una riga bisognava ricostruire il documento da zero. Adesso sta qui.

| Sorgente | PDF generato | Dove appare |
|---|---|---|
| `sito-web.html` | `public/guida-pratica-enea-sito.pdf` | Sito pubblico, accanto al form di `/area-riservata-vecchia/pratica-enea` |
| `area-riservata.html` | `public/tutorial-area-riservata.pdf` | Area riservata, ultima voce del menu ("Come usare il portale") |

Le due guide sono separate di proposito: chi arriva dal sito non ha un account e non deve
leggere della pipeline; chi è nel portale non deve leggere dei campi azienda, che lì non esistono.

## Rigenerare i PDF

Serve solo Google Chrome. Da questa cartella:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf="../public/guida-pratica-enea-sito.pdf" "sito-web.html"
"$CHROME" --headless=new --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf="../public/tutorial-area-riservata.pdf" "area-riservata.html"
```

Poi committa sia gli HTML sia i PDF: sono i PDF che vengono serviti.

## Come sono fatti

- Una `<section class="page">` = una pagina A4 (`@page { size: A4; margin: 0 }`).
- I mockup del portale sono **HTML/CSS, non screenshot**: si aggiornano modificando il markup.
  Il CSS sta nel `<head>` di ciascun file — `sito-web.html` nasce come copia di quello di
  `area-riservata.html`, quindi se tocchi lo stile ricordati che sono due file.
- I loghi sono i PNG di questa cartella, referenziati relativi: Chrome li carica dal disco,
  quindi genera i PDF **da dentro questa cartella**.
- I numeri di pagina nei footer sono scritti a mano: se aggiungi o togli una pagina, risistemali.

## Contenuti da tenere allineati all'app

Se cambiano nel portale, vanno aggiornati qui:

- Nomi delle colonne **lato rivenditore** (`pipeline_stages.name_reseller`), non quelli interni:
  il rivenditore vede "Pratica inviata", non "Recensione".
- Prodotti disponibili e documenti richiesti per prodotto.
- Prezzo del servizio (oggi € 65 + IVA 22%) e sezioni del form pubblico.
