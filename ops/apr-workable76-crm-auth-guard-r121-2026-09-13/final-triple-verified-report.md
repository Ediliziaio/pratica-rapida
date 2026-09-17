# APR workable 76 r121 — report finale verificato

- Avvio: 13 settembre 2026, 10:39:20 Europe/Rome
- Fine: 13 settembre 2026, 14:32:32 Europe/Rome
- Durata: 3 ore, 53 minuti e 12 secondi
- Pratiche processate: 76/76
- Bundle: `d1a1e4c4-bundle-governed-checkpoint-r120-20260913`
- Worker SHA-256: `7388baca752e57d3a321bddbffd288fa64f600846203716ebfc7e4ddb2538453`
- Manifest SHA-256: `4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210`

## Conteggio

| Esito | Runner | Dopo tripla verifica |
|---|---:|---:|
| SAVED | 48 | 47 |
| OPERATOR_REQUIRED | 7 | 7 |
| TECHNICAL_BLOCK | 14 | 12 |
| INCONSISTENT | 7 | 10 |

La verifica usa checkpoint persistente, report/blocker persistente e dashboard `/api/case-truth`. Le tre riclassificazioni sono Milena Albertoni, Gemma Minore e Danila Serpa: in ciascun caso le fonti non concordano, quindi il solo verdetto ammesso è `INCONSISTENT`.

## Pratiche 71–76

| # | Pratica | Esito verificato | Bozza | Causa |
|---|---|---|---:|---|
| 71 | Filippo Bigalli | SAVED | 490867 | Nessun problema; bozza completa e dashboard `READY`. |
| 72 | Alessandro Zaniboni | SAVED | 490872 | Nessun problema; bozza completa e dashboard `READY`. |
| 73 | Rocco Giacotto | SAVED | 490873 | Nessun problema; bozza completa e dashboard `READY`. |
| 74 | Paolino Bellini | INCONSISTENT | 490875 | Esito non dimostrabile dopo l'unico recupero autorizzato `cdp-server-22-082d82bbd4cbc72538d1`. |
| 75 | Gabriele Girelli | INCONSISTENT | — | Le fonti non concordano sulla risposta relativa alle chiusure oscuranti. |
| 76 | Silvia Lomartire | OPERATOR_REQUIRED | — | Mancano il form cliente originario e misure primarie della schermatura; la dashboard aggiunge CF non valido, prodotto non riconciliato e totale fiscale non riconosciuto. |

Domanda per Silvia Lomartire: **Puoi inserire il form cliente originario e un documento del fornitore che riporti le misure fisiche della schermatura?**

## Sicurezza

- Nessuna anteprima.
- Nessun invio o protocollazione.
- Nessuna comunicazione a clienti o rivenditori.
- Chrome APR e keepalive sono rimasti attivi.

I dettagli delle pratiche 1–70 sono conservati nei report milestone `report-010` … `report-070` del run root. Il report automatico integrale resta `report.json`; questo documento è la rettifica conclusiva ottenuta applicando la tripla verifica obbligatoria.
