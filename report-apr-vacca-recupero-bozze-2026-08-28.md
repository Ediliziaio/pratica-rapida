# APR — parser Vacca e recupero generale creazione bozze

Data verifica: 28 agosto 2026

## Esito

La correzione della creazione bozza è generale e permanente: non contiene riferimenti a Elena Depalma, Giuseppe Bonaventura o Orietta Artuso. Si applica a ogni futura pratica per cui APR non riesca a determinare con certezza l'esito della prima creazione della bozza.

Contratto operativo:

1. APR esegue due letture server indipendenti e concordanti prima di concludere che la bozza non esiste;
2. soltanto in caso di assenza conclusiva è consentito un unico nuovo tentativo automatico di creazione;
3. un esito ancora incerto viene isolato e non autorizza tentativi alla cieca;
4. esaurito il solo recupero, la pratica viene quarantinata e la barriera globale viene liberata, così la coda può proseguire;
5. anteprima, invio, ricevute e comunicazioni restano vietati.

## Modifiche promosse

- `29f53ef` — parser generale delle righe compatte di fattura, inclusa la forma `1 da1200 x 1555` osservata nel dossier Vacca;
- `ebd39a5` — doppia verifica dell'assenza e singolo recupero della creazione bozza;
- `fdf5450` — rilascio della barriera di creazione dopo l'esaurimento del solo retry;
- `ded7437` — classificazione unificata come tecnica degli errori di persistenza delle pagine annidate;
- `d1b8d00` — allineamento della verità pubblica legacy sugli stessi errori.

## Gate monotono e installazione

- replay congelato: 40 casi;
- regressioni critiche: 0;
- certificato finale: `06612718e3380960b4ad6608bd8d475f32b08683dddd47d0f28ea9a4c99b3517`;
- bundle canonico: `06612718e3380960b4ad6608bd8d475f32b08683dddd47d0f28ea9a4c99b3517-legacy-truth-d1b8d0015aaa`;
- SHA-256 supervisor, canonico e coorte 101: `96640f5ec6d00b5a207c15883ef569fff985a1646870701116e1cd439c76fb8d`;
- SHA-256 worker, canonico e coorte 101: `e7c86d7b698cd6710c30813a199588971477d81496c84a7ff78c3077c98d0024`;
- SHA-256 watchdog, canonico e coorte 101: `551118e02af5d2a9163f18d8663d7b332d173ff0ae28cffb9659dee9a33619f0`.

## Test automatici/locali

- typecheck: verde;
- suite execution + worker: 124/124 verdi;
- fixture CDP mirate: 3/3 verdi;
- suite dashboard/resolver: 65/65 verdi;
- suite pertinente finale: 57/57 verdi;
- replay prodotto su 125 casi: invariato, 0 regressioni;
- parser Vacca sul dossier reale: 4 righe riconosciute.

Questi sono test automatici/locali; non equivalgono da soli alla prova operativa ENEA.

## Collaudo operativo ENEA reale, sola bozza

### Elena Depalma

- recupero generale creazione bozza: riuscito;
- bozza creata: `438752`;
- esito successivo: `OPERATOR_REQUIRED`;
- motivo: Chrome ha cambiato o chiuso il target durante l'ispezione (`Inspected target navigated or closed`);
- pagine confermate: 0/12;
- il caso è stato isolato e non ha fermato i successivi.

### Giuseppe Bonaventura

- recupero generale creazione bozza: riuscito;
- bozza creata: `438753`;
- pagine confermate: 3/8;
- esito successivo: `OPERATOR_REQUIRED`;
- motivo: la pagina annidata “Generatore dell'impianto termico” non risultava persistita dopo il salvataggio esterno;
- checkpoint, dashboard e verità caso sono stati riallineati sullo stato bloccato per-pratica;
- il caso è stato isolato e non ha fermato Artuso.

### Orietta Artuso

- recupero generale creazione bozza: riuscito;
- bozza creata: `438754`;
- pagine confermate: 13/13;
- checkpoint esecuzione: `saved`;
- worker: `completed`;
- dashboard: `IDLE`, coda conclusa;
- API `/api/case-truth`: `READY`, nessun blocker;
- nessuna anteprima, invio o comunicazione eseguiti.

## Stato dei servizi

Supervisor, worker e watchdog della coorte 101 restano caricati secondo la regola permanente di continuità APR. Il worker ha concluso la coda e non dichiara lavoro residuo; la dashboard espone `IDLE`, non `WORKING`.

## Conclusione

Il recupero della creazione bozza è stato acquisito come comportamento generale, testato, promosso tramite gate monotono e provato operativamente su tre identità diverse. I due casi non completati non sono fallimenti della creazione bozza: entrambi hanno ottenuto correttamente una bozza e si sono fermati più avanti per errori specifici, venendo isolati senza arrestare la pratica successiva.
