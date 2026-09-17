# Verifica regole trasmittanza e correzione formati tabellari/abbreviati — r108

Data: 2026-09-10

## Esito

- Scostamenti inizialmente `da_valutare`: **133**.
- Riclassificati `atteso` applicando le tre regole esistenti: **75**.
- Scostamenti che restano realmente `da_valutare`: **58**.
- Letture APR già classificate separatamente come errore verificato: **12** (8 Eugenio Codognato, 4 Vera Buracchi).

## Tre regole preesistenti

Le regole risultano presenti nel registro, coperte dalla matrice e incluse nel worker del bundle canonico installato:

1. `user-2026-08-19-infissi-transmittance-1-3-fallback-v1`: usa 1,3 soltanto quando la trasmittanza del nuovo infisso non è dichiarata da una fonte documentale valida.
2. `user-2026-08-19-infissi-pvc-low-e-fallbacks-v1`: in assenza o dubbio sul vetro nuovo, usa bassa emissione.
3. `user-2026-08-19-infissi-old-window-transmittance-matrix-v1`: ricava la trasmittanza del vecchio infisso dalla matrice soltanto quando telaio e vetro vecchi sono identificati univocamente.

Il fallback prudenziale 6,0 per il vecchio infisso non è stato riclassificato come comportamento atteso: l'informazione sul vecchio infisso è obbligatoria. Per questo cinque righe di Elena Depalma, dove la fonte dice soltanto `metallo`, restano da valutare.

## Riclassificazione dei 133

- Vetro nuovo: 37/37 riclassificati `atteso`.
- Vetro vecchio: 19/19 riclassificati `atteso`.
- Trasmittanza vecchio infisso: 19/24 riclassificati `atteso`; 5 restano da valutare.

## Correzione generale

Nuova regola: `user-2026-09-10-infissi-tabular-abbreviated-thermal-evidence-v1`.

La correzione riconosce due formati documentali generali prima non coperti:

- DoP native con colonna numerata e legenda esplicita, per esempio `9.7 Trasmittanza termica`, senza ripetere `Uw` su ogni riga;
- etichette prodotto abbreviate con `Trasm. termica`, norma EN 14351, posizione/pagina e dimensioni L/H.

Il riconoscimento è fail-closed: richiede legenda e struttura complete, associazione univoca cliente/ordine/prodotto, cardinalità coerente e, per etichette multipagina, sequenza completa e valori concordanti. Un valore esplicito riconosciuto prevale sul fallback 1,3.

## Prove sui documenti reali

- Eugenio Codognato: estratti gli otto valori esatti `1,28; 1,22; 1,27; 1,20; 1,28; 1,28; 1,23; 1,27` dalla DoP tabellare.
- Vera Buracchi: estratti e ricondotti alle quattro posizioni i valori `1,20; 1,17; 1,18; 1,17` dalle etichette abbreviate multipagina.
- Replay read-only sui documenti originari: **2/2 PASS**, nessun blocker.

## Test e installazione

- Test mirati finali: **128/128 PASS**.
- Gate composito: **2023/2023 PASS**. Le 47 prove CDP/socket non eseguibili nel sandbox sono state rieseguite fuori dal vincolo ambientale: **82/82 PASS**, con inventario dei test identico e sostituzione limitata ai due file autorizzati.
- Copertura regole: **211/211 PASS**.
- Bundle installato: `c20ee338-tabular-abbreviated-uw-r108-20260910`.
- SHA-256 worker: `122d4164858a3136fa705b24c1af8a84bea18eff4f3b361966fe6f8f3f7be7fd`.
- SHA-256 attestazione: `563170f2f27366945d5d5ea7e600eb14b7050e76bc4ebc3ddc02c65c6cbf679c`.
- Gate installazione: `PASS`; verifica indipendente dei tre eseguibili: `admitted`.

Non è attualmente in esecuzione un worker APR di lotto: la regola è installata e attestata nel bundle canonico, ma in questo intervento non è stata creata né modificata alcuna bozza ENEA.

## I 58 scostamenti residui

| Campo normalizzato | Occorrenze |
|---|---:|
| chiusura oscurante | 12 |
| data fine intervento | 9 |
| telaio nuovo | 6 |
| data inizio intervento | 6 |
| trasmittanza vecchio infisso | 5 |
| cognome | 3 |
| comune di nascita | 2 |
| nome | 2 |
| tipologia immobile | 2 |
| numero infissi | 2 |
| trasmittanza nuovo infisso | 1 |
| civico residenza | 1 |
| data di nascita | 1 |
| indirizzo residenza | 1 |
| civico immobile | 1 |
| foglio catastale | 1 |
| mappale catastale | 1 |
| spesa infissi | 1 |
| spesa schermature | 1 |

Totale: **58**.

## Artefatti verificabili

- `difference-field-triage.json`, SHA-256 `739cec6bdb16982f188bfef94159f2aa2a06d740151713f7e57728e0ed3f84f5`.
- `tabular-abbreviated-uw-real-document-replay.json`, SHA-256 `2e6ccd9c4492e777e4ce9ab1262ade21df537f8b2c98a24b0a589b83bc23c96b`.
- `composite-vitest-report.json`, SHA-256 `ecbaf0ba7986232b4ec2a52bf2b73c47fdfef76cd4f5762c70b0a1f54a1f498b`.
- Ricevuta installazione: `ops/apr-install-tabular-abbreviated-uw-r108-2026-09-10/install-receipt.json`.
