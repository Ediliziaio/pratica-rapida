# APR Infissi - gate fonti tecniche del 19/08/2026

## Regole attivate

- Quantita e misure: fattura originaria quando le espone per pezzo; altrimenti documenti tecnici originari allegati.
- Trasmittanza: valore esplicito associabile allo stesso infisso, proveniente da fattura o documento tecnico; se assente in tutte le fonti originarie, fallback autorizzato `1,3 W/m²K`. Due valori espliciti discordanti restano un conflitto e non vengono risolti col fallback.
- Cardinalita: una riga APR per ogni infisso fisico; nessuna superficie tecnica aggregata.
- Conflitti tra fonti: fail-closed e intervento operatore, senza scelta arbitraria.
- Misure: la coppia esterna complessiva e preferita; se non e isolabile con certezza, APR puo usare un'altra coppia documentata, conservandone tipo e provenienza.
- Superficie: valore matematico esatto conservato nel ledger; valore ENEA arrotondato a un decimale in metri quadrati (per esempio `3,1`).
- Materiale e vetro: i valori espliciti delle fonti originarie prevalgono; se assenti, fallback autorizzati `PVC` e `Bassa emissivita`.
- Chiusure oscuranti: risposta `SI` del form alla domanda su infissi, zanzariere o persiane = flag ENEA selezionato; `NO` = flag vuoto; risposta assente/ambigua = intervento operatore.
- Trasmittanza vecchio infisso: combinazione esatta di materiale del telaio e tipo di vetro dichiarati nel form secondo la matrice autorizzata di 20 valori; se un dato manca, e ambiguo/non mappabile o esiste qualunque dubbio, fallback prudenziale fisso `6,0 W/m²K` (`Metallo senza taglio termico + Vetro singolo`). Il generico `Metallo` senza indicazione del taglio termico e ambiguo.
- Risparmio energetico: APR non lo calcola, non lo stima e non lo inserisce. Il payload e il dry-run lasciano il campo alla gestione automatica ENEA; un futuro valore del portale potrà soltanto essere letto e auditato senza mutazione.

ID registro:

- `user-2026-08-19-infissi-invoice-or-technical-source-resolution-v1`
- `user-2026-08-19-infissi-enea-square-meter-rounding-v1`
- `user-2026-08-19-infissi-pvc-low-e-fallbacks-v1`
- `user-2026-08-19-infissi-shading-closures-form-flag-v1`
- `user-2026-08-19-infissi-transmittance-1-3-fallback-v1`
- `user-2026-08-19-infissi-old-window-transmittance-matrix-v1`
- `user-2026-08-19-infissi-portal-managed-energy-savings-v1`
- `user-2026-08-14-preserve-technical-product-cardinality`

## Riparazione dell'acquisizione PDF

Il dossier locale Elena Pittau ha provato un difetto riproducibile: il testo PDF nativo conteneva quantita e trasmittanza, mentre le misure erano visibili soltanto nei disegni tecnici. L'estrattore sceglieva il testo nativo perche sufficientemente lungo e perdeva i numeri del diagramma.

`apr-pdf-ocr` ora applica un'acquisizione ibrida esclusivamente alle pagine riconosciute come dichiarazioni di prestazione degli infissi:

1. conserva il testo nativo;
2. aggiunge OCR Vision locale della pagina;
3. marca il blocco `APR_VISUAL_OCR`;
4. conserva separazione pagina/prodotto per la futura deduplica.

Le normali fatture continuano a usare `native_text`; nessun documento viene inviato a servizi esterni.

Hash SHA-256 dell'eseguibile costruito e installato: `6a65d593225b842de16ac353afdb9a5a89427fc8ed181e106422c5708d21a228`.

## Evidenze indipendenti

1. Test mirati Infissi: 55/55 verdi; regressioni correlate Infissi/registro/dashboard: 94/94 verdi.
2. Suite completa repository: 141 file e 952 test verdi.
3. Build applicativa Vite e typecheck applicazione, Node e runner persistente verdi.
4. Verifica reale locale del PDF tecnico: 6 pagine, 5 pagine prodotto, 5 blocchi OCR visivo, quantita e trasmittanza conservate, misure del diagramma ora visibili al flusso OCR.
5. Verifica di non regressione su fattura Homnium 245/2026: `native_text`, una pagina, anagrafica e totale invariati.

## Comandi riproducibili della suite

- `npm run test:infissi`: contratti di dominio, fonti tecniche, regole prodotto,
  parser delle fonti originarie e checkpoint persistente. Non apre socket e non
  richiede CRM, ENEA, browser o rete.
- `npm run test:infissi:related`: registro unico, riconciliazione economica,
  verita caso, watchdog, classificazione dossier e dashboard/API locali. Il test
  della dashboard usa esclusivamente un server effimero su `127.0.0.1`; in un
  sandbox che vieta il bind loopback deve essere eseguito con il relativo
  permesso locale. Un errore `listen EPERM 127.0.0.1` indica il limite
  dell'ambiente prima delle asserzioni, non un fallimento del modulo Infissi.

I due comandi usano liste esplicite e versionate: l'esecuzione non dipende da una
ricerca manuale dei file e resta separata tra nucleo Infissi e regressioni
condivise.

## Limite residuo prima del mapping reale

Il criterio sulle famiglie di misure e ora definito e testato localmente. Resta da osservare e versionare il mapping effettivo della pagina tecnica ENEA per gli Infissi e da provarlo in un gate reale dedicato. Fino ad allora la bozza Infissi resta disabilitata.
