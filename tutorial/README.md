# Tutorial — sorgenti

Sorgenti delle guide PDF. **Modifica gli HTML, mai i PDF**: i PDF sono generati.

## Le guide

| Sorgente | PDF generato | Dove appare |
|---|---|---|
| `sito-web.html` | `public/guida-pratica-enea-sito.pdf` | Sito pubblico, accanto al form di `/area-riservata-vecchia/pratica-enea` |
| `area-riservata.html` | *(non pubblicato — è la fonte delle pagine)* | Master da cui `build_guide.py` ricava le tre guide dell'area riservata |
| ↳ `area-riservata-inserire.html` | `public/guida-inserire-pratica-enea.pdf` | Area riservata → menu «Come usare il portale» → *Inserire una pratica ENEA* |
| ↳ `area-riservata-portale.html` | `public/guida-come-funziona-portale.pdf` | Area riservata → menu «Come usare il portale» → *Come funziona il portale* |
| ↳ `area-riservata-documenti.html` | `public/guida-documenti-da-scaricare.pdf` | Area riservata → menu «Come usare il portale» → *Documenti da scaricare* |

Nell'area riservata «Come usare il portale» è un **sottomenu a tendina** (AppSidebar.tsx,
`TUTORIAL_NAV_ITEM`) con le tre guide sopra. La guida del sito pubblico è separata.

## Rigenerare i PDF

Serve solo Google Chrome. Da questa cartella:

```bash
python3 build_guide.py   # ricompone le 3 guide area-riservata-*.html da area-riservata.html

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
gen() { "$CHROME" --headless=new --no-pdf-header-footer --virtual-time-budget=4000 --print-to-pdf="$2" "$1"; }
gen sito-web.html                 ../public/guida-pratica-enea-sito.pdf
gen area-riservata-inserire.html  ../public/guida-inserire-pratica-enea.pdf
gen area-riservata-portale.html   ../public/guida-come-funziona-portale.pdf
gen area-riservata-documenti.html ../public/guida-documenti-da-scaricare.pdf
```

Poi committa gli HTML e i PDF: sono i PDF che vengono serviti.

## Come sono fatti

- Le tre guide dell'area riservata sono **composte** da `build_guide.py`: riusa le pagine di
  `area-riservata.html` (byte-esatte) e aggiunge le pagine nuove (copertine, panoramiche,
  dashboard, archivio) definite nello script. Piè di pagina e numerazione li ricalcola lui.
  Quindi: per cambiare un passo condiviso → modifica `area-riservata.html`; per cambiare la
  struttura o le pagine nuove di una guida → modifica `build_guide.py`.
- Una `<section class="page">` = una pagina A4 (`@page { size: A4; margin: 0 }`).
- I mockup del portale sono **HTML/CSS, non screenshot**.
- I loghi sono i PNG di questa cartella: genera i PDF **da dentro questa cartella**.

## Contenuti da tenere allineati all'app

- Nomi delle colonne **lato rivenditore** (`pipeline_stages.name_reseller`): il rivenditore
  vede "Pratica inviata", non "Recensione".
- Sezioni della Dashboard, dell'Archivio e di Documenti utili, se cambiano nel portale.
- Prodotti disponibili e documenti richiesti per prodotto.
- Niente prezzi nelle guide dell'area riservata: il costo varia per ogni rivenditore.
