# APR r34 — esclusione fornitori e precedenza anagrafica documentale

## Esito

Bundle canonico installato: `a5883f66-documentary-demographics-r34-20260903`.

Nessuna azione ENEA o scrittura CRM è stata eseguita. La modifica riguarda il preflight, il payload APR e l'instradamento della singola pratica.

## Erre Emme / RM Legno

Montemorra era sfuggito perché il fornitore non era nel campo testuale `fornitore`: era disponibile soltanto nella relazione `companies.ragione_sociale` con valore `rm legno`. Il vecchio filtro futuro controllava principalmente la chiave cliente e le query di campionamento non acquisivano in modo uniforme la relazione azienda.

La regola generale ora:

- acquisisce e controlla `fornitore`, `companies.ragione_sociale` e gli alias esatti Erre Emme/Erremme/RM Legno/Vans;
- esclude tali pratiche dal campionamento;
- se una pratica arriva comunque da un evento diretto, la porta subito a `OPERATOR_REQUIRED` con blocker `permanent_supplier_automation_exclusion`;
- non scarica né analizza allegati, non prepara prodotti o dati economici e non tenta azioni ENEA;
- evita falsi positivi su nomi soltanto simili.

Replay Montemorra: `blocked_case`, zero prodotti, zero evidenze economiche, draft non pronto, azioni esterne disabilitate.

## Identità documentale

Precedenza applicata: documento ufficiale d'identità/sanitario > documento fiscale > CRM/form manuale. Nome, cognome e CF devono essere univoci e coerenti. Giorno, mese e sesso sono decodificati dal CF documentale; il form può fornire soltanto il secolo, e solo se le ultime due cifre dell'anno concordano. Un secolo o fonti documentali discordanti chiudono il gate.

Formisano/Formisabo: carta d'identità e tessera sanitaria concordano su `ANTONINO FORMISANO`, CF `FRMNNN66P27L259X`, nascita `27/09/1966`, sesso `M`. APR usa `FORMISANO`; il CRM non è stato modificato.

La scansione dei 100 casi ha trovato cinque pratiche con discrepanze documentali verificabili:

- Antonino Formisabo → Antonino Formisano;
- Gianluigi Chiolini → Gianluigi Chiolin;
- Della Maria Carla Vigetti → Della Mariacarla Vigetti;
- Riccardo Coda: `30/09/1950` manuale → `30/01/1950` documentale;
- Caterina Claudia Garbato: `09/04/1971` manuale → `04/09/1971` documentale.

Non sono emerse discrepanze ulteriori di CF o sesso nel campione. Tutte le correzioni sono generali e dipendono dalle fonti/CF, mai dal nome della pratica.

## Verifiche

- Suite completa: 444/444 suite e 1693/1693 test, zero fallimenti.
- Gate monotono: baseline r33 1690 test; r34 1693 test.
- Registro `enea-operational-registry-v110`; matrice `apr-enea-rule-test-matrix-v88`; 108/108 regole con prova positiva e negativa.
- Prova positiva anagrafica: CF documentale corregge giorno, mese e sesso con secolo concordante.
- Prova negativa: anno/secolo non ricavabile senza contraddizione resta fail-closed.
- Tripla verifica post-installazione concordante: LaunchAgent/processi; checkpoint/journal persistente; dashboard tramite API CDP locale.
- Keepalive PID 98419 attivo; Chrome APR PID 3785 invariato e non riavviato; dashboard ENEA presente; contatori vietati tutti a zero.
