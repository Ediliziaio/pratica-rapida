# Atzeni e Amadu — chiusure oscuranti e confronto campo per campo

Data: 10 settembre 2026

## Perimetro e sicurezza

- Confronto esclusivamente read-only.
- Nessuna pagina ENEA aperta, nessuna bozza creata o salvata, nessuna anteprima o comunicazione.
- Il lotto di 24 pratiche resta `PREPARED_NOT_LAUNCHED`.
- Le superfici/misure geometriche dei singoli prodotti (`infissi.N.superficie`) sono escluse dal confronto come richiesto; restano inclusi tutti gli altri campi, comprese le trasmittanze.
- Il lato umano è il PDF ENEA storico chiuso dall'operatore; il lato APR è un replay locale integrale dei documenti originari con il sorgente corrente. I valori APR marcati `candidate_blocked` non costituiscono una bozza salvata né un verdetto operativo.

## Chiusure oscuranti: decisione generale

La nuova regola `user-2026-09-10-infissi-explicit-no-screen-negative-closure-evidence-v1` accetta `NO` senza il flag del form soltanto se:

1. il form non contiene una risposta esplicita;
2. il documento tecnico selezionato contiene esattamente una dichiarazione `Senza schermo` per ogni infisso fisico;
3. nessuna fattura contiene una chiusura reale (persiana, tapparella, avvolgibile, scuro o chiusura oscurante);
4. testi generici/boilerplate del modulo non vengono interpretati come una chiusura reale;
5. copertura parziale, cardinalità diversa o qualunque contraddizione restano fail-closed.

Riscontro sui documenti reali:

- **Giovanna Atzeni:** 8 infissi, 8 dichiarazioni `Senza schermo`, zero menzioni reali di chiusure in fattura; risultato APR `technical_explicit_none`, otto flag `No` e nessun blocker chiusure.
- **Giovanni Amadu:** 5 infissi, 5 dichiarazioni `Senza schermo`, zero menzioni reali di chiusure in fattura; risultato APR `technical_explicit_none`, cinque flag `No` e nessun blocker chiusure.

La frase di boilerplate del modulo che contiene le parole “chiusure oscuranti o schermature solari” è stata esclusa esplicitamente; una fattura che nomina davvero una persiana/tapparella continua invece a chiudere il gate.

## Confronto sintetico

### Giovanna Atzeni

- Campi non gestiti dal portale confrontati: **105**.
- Coincidenze: **44**.
- Differenze effettive tra valore umano e candidato APR: **26**.
- Campi assenti dagli input APR correnti: **32**.
- Valori anagrafici grezzi presenti nel CRM ma rifiutati dal gate di autorità documentale: **3**.
- Campi calcolati/gestiti dal portale, non scritti da APR: **6**.

Coincidono, tra gli altri: modulo 345A, data inizio 26/11/2025, 8 infissi, assenza cointestatari, vetro vecchio singolo, nuovo telaio PVC, vetro nuovo basso-emissivo, confine verso esterno e tutti gli 8 flag chiusura `No`.

Scostamenti non geometrici da riesaminare:

- fine lavori: operatore `31/03/2026`, APR `31/12/2025`;
- spesa: operatore `7.900,00`, APR `4.582,66` — anomalia economica separata già nota;
- vecchi infissi, 8/8: operatore `Legno` e U `5`, APR fallback `Metallo, no taglio termico` e U `6`;
- nuovi infissi: operatore U `1,40; 1,40; 1,38; 1,40; 1,37; 1,39; 1,37; 1,39`; APR `1,3` su sette righe e `0,54` sulla sesta.

### Giovanni Amadu

- Campi non gestiti dal portale confrontati: **81**.
- Coincidenze: **28**.
- Differenze effettive tra valore umano e candidato APR: **15**.
- Campi assenti dagli input APR correnti: **35**.
- Valori anagrafici grezzi presenti nel CRM ma rifiutati dal gate di autorità documentale: **3**.
- Campi calcolati/gestiti dal portale, non scritti da APR: **6**.

Coincidono, tra gli altri: modulo 345A, 5 infissi, assenza cointestatari, vetro vecchio singolo, nuovo telaio PVC, vetro nuovo basso-emissivo, confine verso esterno e tutti i 5 flag chiusura `No`.

Scostamenti non geometrici da riesaminare:

- spesa: operatore `7.800,00`, APR non produce un importo eseguibile — anomalia economica separata già nota;
- vecchi infissi, 5/5: operatore `Legno` e U `5`, APR fallback `Metallo, no taglio termico` e U `6`;
- nuovi infissi: operatore U `1,38; 1,36; 1,36; 1,38; 1,41`, APR fallback `1,3` su tutte le righe;
- date: operatore inizio `19/12/2025` e fine `31/03/2026`, entrambe assenti dagli input APR correnti.

## Perché molti campi risultano assenti

Il riscontro indipendente sulla vista CRM corrente conferma che `dati_form` è vuoto per entrambe le pratiche, non soltanto nelle vecchie copie di coorte. Per questo APR non dispone oggi di indirizzi, dati catastali, dati edificio/impianto e parte dell'anagrafica necessari a ricostruire una pratica completa. I campi mancanti non sono stati conteggiati come “valori APR sbagliati”: sono una categoria separata.

Nome, cognome e codice fiscale top-level concordano con il PDF storico, ma il preflight corrente non li accetta da soli perché manca una fonte fiscale/ufficiale originaria ammessa. Anche questi tre campi sono separati dalle differenze vere.

## Conclusione

La decisione sulle chiusure oscuranti è risolta in modo generale e fail-closed sui documenti reali di entrambi i casi. Non basta però a rendere eseguibili Atzeni o Amadu: restano le anomalie economiche già indicate e ulteriori differenze di date, vecchi infissi e trasmittanze. Nessuna di queste ulteriori differenze è stata corretta o decisa in questa attività.

Le domande dirette, `missingDocumentType` e `onboardingGap` per le questioni residue sono conservati in `residual-review-items.json` e non sono stati inviati.

## Gate e installazione

- Test funzionali e di non regressione: **2.012/2.012 verdi** su 235 file di test.
- I 1.930 test eseguibili nel sandbox sono verdi; le due suite CDP/socket escluse dal sandbox sono state eseguite serialmente nell'ambiente locale appropriato: 82/82 verdi.
- Matrice e prove: **209/209** regole provate.
- Audit storico: 160 decisioni dichiarate; la nuova decisione è l'unica `newly_activated_now`; restano esclusivamente i quattro gap del 6 agosto già autorizzati.
- Gate di attivazione: `PASS`, artefatto `d9707d68814610d0bf7bb4334b3ac31eae114009b364b69d609bd772f03ad161`.
- Bundle installato: `742f23d6-infissi-explicit-no-screen-r106-20260910`.
- SHA-256 worker: `ba7d1243fe03b31061cecfebd9b56a34dffcbd9f681c24e8d6f007b793ca7403`.
- Supervisor, worker e watchdog risultano tutti `admitted` dall'attestazione di governo.
- Non è stato eseguito alcun replay operativo ENEA: la validazione operativa resta distinta dalla prova locale e non viene dichiarata.

## Artefatti verificabili

- `field-by-field-comparison.json`: ogni campo, valore umano, valore APR, esito e stato di prontezza.
- `field-by-field-comparison.sha256`: hash del confronto.
- `current-crm-dossiers.json`: riscontro GET-only della vista CRM corrente.
- `current-readonly-replay.json`: replay locale corrente delle due pratiche.
- `historical-inputs.json` e `historical-pdfs/`: riferimenti umani e PDF storici.
- `residual-review-items.json`: domande specifiche e lacune onboarding residue.
- `full-vitest-report.json`: report unificato dei 2.012 test.
- `../apr-infissi-no-screen-r106-gate-2026-09-10/historical-audit-report-r106.json`: audit storico del bundle.
- `../apr-install-infissi-explicit-no-screen-r106-2026-09-10/install-receipt.json`: ricevuta atomica di gate e installazione.
