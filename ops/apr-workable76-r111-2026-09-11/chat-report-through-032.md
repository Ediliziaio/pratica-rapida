# Report operativo r111 — 32/76

- Fonte temporale: `report.json` aggiornato il 2026-09-11T14:13:02.846Z.
- Riscontri concordanti: `report.json` 32 processate; `checkpoint.json` 32 risultati; `journal.ndjson` 32 eventi `case_terminalized`; sessioni `apr_workable76_r111` e `apr_workable76_r111_monitor` attive.
- Stato: 17 `SAVED`, 7 esiti grezzi `OPERATOR_REQUIRED`, 5 `TECHNICAL_BLOCK`, 3 `INCONSISTENT`; 44 residue.
- Pratica in corso: Annalisa Lanzo, coorte 5933.

## SAVED (17)

1. Vera Buracchi — bozza 486655, 11/11 pagine.
2. Della Maria Carla Vigetti — bozza 486702, 9/9 pagine.
3. Natale Tiraboschi — bozza 486723, 8/8 pagine.
4. Giovanni Pescatori — bozza 486772, 8/8 pagine.
5. Fares Hassairi — bozza 486816, 10/10 pagine.
6. Milena Albertoni — bozza 486839, 8/8 pagine.
7. Cataldo Cassone — bozza 486869, 8/8 pagine.
8. Marco Tocchetti — bozza 486891, 9/9 pagine.
9. Claudio Beghini — bozza 486973, 8/8 pagine.
10. Gianluigi Chiolini — bozza 487008, 9/9 pagine.
11. Gianfranco Lavezzi — bozza 487079, 9/9 pagine.
12. Luca Ronconi — bozza 487137, 8/8 pagine.
13. Antonella Ferletic — bozza 487194, 9/9 pagine.
14. Lia Chiericati — bozza 487233, 8/8 pagine.
15. Monica Molteni — bozza 487307, 9/9 pagine.
16. Claudia Campagna — bozza 487357, 8/8 pagine.
17. Fabio Sartori — bozza 487419, 8/8 pagine.

## Esiti grezzi OPERATOR_REQUIRED (7)

Quattro non sono domande operatore: sono problemi di localizzazione CRM.

1. Rossella Munafò — `crm_practice_exact_match_not_found`; pratica verificata nella fase `archiviate`, mentre il manifest la cercava nella fase congelata precedente.
2. Patrizia Muzzi — `crm_practice_exact_match_not_found`; pratica verificata nella fase `archiviate`, mentre il manifest la cercava nella fase congelata precedente.
3. Stefania Venturi — `crm_practice_exact_match_not_found`; acquisizione non ha trovato l'ID stabile nella fase congelata. Fase corrente non ancora verificata trasversalmente.
4. Angela Tuttolani — `crm_practice_exact_match_not_found`; acquisizione non ha trovato l'ID stabile nella fase congelata. Fase corrente non ancora verificata trasversalmente.

Tre casi hanno un blocker sulle chiusure oscuranti, ma il registro `operator-questions/checkpoint.json` è rimasto vuoto. Le domande operative ricostruite dalle prove sono:

5. Matteo Capitanelli
   - Domanda: **«A quali due dei sette infissi vanno associate le chiusure oscuranti da 750 × 2450 mm e 755 × 2450 mm riportate nei documenti?»**
   - Prova: APR ricostruisce 7 infissi e 2 chiusure, ma non trova l'associazione univoca finestra-chiusura.
6. Andrea Trabucco
   - Nessuna domanda legittima residua: il form indica `NO` e la fattura non riporta chiusure. La regola già autorizzata “sulla fattura comanda il silenzio = NO” dovrebbe coprire il caso; l'esito è un falso `OPERATOR_REQUIRED` da registrare, senza correggerlo durante il lotto.
7. Luca Cigognetti
   - Nessuna domanda legittima residua: il form indica `SÌ` e la fattura cita una zanzariera; la regola già autorizzata assegna la zanzariera alla prima finestra. L'esito è un falso `OPERATOR_REQUIRED` da registrare, senza correggerlo durante il lotto.

## TECHNICAL_BLOCK (5)

1. Vincenzo Falconi — totale finale stampato della fattura non verificato (`invoice_final_printed_total_not_verified`); nessuna bozza creata.
2. Lea Dettori — contratto React della schermatura non pronto (`apr_cdp_enea_screening_react_contract_not_ready:screening:1`); bozza 486755 ferma a 5/9 pagine.
3. Lucia Droghetti — totale finale stampato della fattura non verificato; nessuna bozza creata.
4. Gregorio Fusco — revisione obbligatoria `infissi-transmittance-131-to-13-v1` non completata nel preflight; nessuna bozza creata.
5. Santo Giuga — stessa revisione obbligatoria non completata nel preflight; nessuna bozza creata.

## INCONSISTENT (3)

1. Loretta Riviera — le fonti non concordano sul requisito `infissi_final_printed_invoice_total_required`; nessuna bozza attribuibile a questo tentativo.
2. Milena Fiorini — rilettura server senza prova dopo l'unico recupero autorizzato; bozza 486913 ferma a 5/12 pagine.
3. Eugenio Codognato — divergenza su chiusure oscuranti e totale finale stampato; nessuna bozza attribuibile a questo tentativo.

## Traguardo 30/76

Alle 30 terminalizzate: 15 `SAVED`, 7 esiti grezzi `OPERATOR_REQUIRED`, 5 `TECHNICAL_BLOCK`, 3 `INCONSISTENT`. La notifica ntfy è stata consegnata con HTTP 200.

## Sicurezza

Nessuna anteprima, submit o comunicazione tentata. Il lotto continua isolando i singoli casi.
