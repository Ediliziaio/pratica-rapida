# APR · gate parser locale sui 10 dossier CRM · 17 agosto 2026

## Ambito

Gate eseguito esclusivamente sui 38 allegati originari già persistiti nella coorte `apr-pilot-40`.
Non sono state effettuate nuove letture CRM, aperture browser o ENEA, mutazioni CRM, preview, submit o comunicazioni. Tutti i flag di azione esterna sono rimasti `false`.

## Esito ricalcolo idempotente

| Cliente | Esito locale | Evidenza deterministica | Limite residuo |
|---|---|---|---|
| Luciano Javier Martinez | piano locale verde | 2 schermature distinte, gTot 0,13, totale lordo € 2.257,00; imponibile € 1.850,00 + IVA € 407,00 | nessuno nel preflight locale |
| Elisa Moro | piano locale verde | 3 schermature distinte, gTot 0,10, due fatture € 375,00 + € 875,00 = € 1.250,00 | nessuno nel preflight locale |
| Nello Farinelli | intervento operatore | 1 schermatura, totale lordo multipagina € 3.400,00 correttamente riconciliato | CF form/CRM e CF fattura divergono; nessun valore inventato |
| Patrizia Muzzi | intervento operatore | gli allegati economici sono ordini di vendita, non una fattura fiscale valida | serve fattura originaria valida |
| Elena Pittau | modulo non disponibile | dossier `Infissi / Serramenti` | modulo infissi non implementato |
| Gregorio Fusco | modulo non disponibile | dossier `Infissi / Serramenti` | modulo infissi non implementato |
| Mario Ruggeri | modulo non disponibile | dossier `Infissi / Serramenti` | modulo infissi non implementato |
| Francesco De Vallier | modulo non disponibile | dossier `Infissi / Serramenti` | modulo infissi non implementato |
| Angelo Rivolta | modulo non disponibile | dossier `Pompe di Calore / Climatizzazione`; totale € 4.246,00 leggibile | modulo pompe di calore non implementato |
| Filippa Carmela Rita Finocchiaro | modulo non disponibile | dossier `Pompe di Calore / Climatizzazione` | modulo pompe di calore non implementato |

Risultato della coorte: **2 piani locali verdi, 8 casi isolati**, senza arrestare la lista.

## Correzioni incrementali applicate

- parser narrativo Suman: due coppie di misure producono due righe fisiche, senza aggregazione;
- totale documento multipagina: il totale lordo viene letto dopo il riepilogo IVA, senza scambiare l'IVA per il totale;
- riconciliazione fiscale: le etichette `Totale imponibile` e `Totale IVA` prevalgono sulle intestazioni tabellari generiche;
- un OCR è utilizzabile soltanto quando totale documento, imponibile+IVA e ricostruzione intervento coincidono entro € 0,01;
- ricevute `BONIFICO AGEVOLAZIONE FISCALE` classificate come bonifici e non come fatture;
- riferimento abbreviato `fatt.` riconosciuto per evitare duplicazioni tecniche fra acconto e saldo;
- immagini di solo logo escluse esplicitamente dal preflight anche in presenza di un vecchio risultato parser;
- lettura del grande checkpoint adapter CRM memorizzata e invalidata sulla sostituzione atomica; lookup degli ID regola indicizzato, senza alterare lo storico audit.

## Prove indipendenti

1. **Test automatici:** 98/98 test mirati verdi; ulteriore gruppo dashboard/servizio 36/36 verde; typecheck e build di produzione verdi.
2. **Checkpoint persistenti:** hash acquisizione dossier invariato `6aaf0d3...c4965`; hash allegati invariato `9aeca957...d071`; i tentativi analisi restano 74 e i tentativi preflight restano 10. Sono cambiate una sola revisione analisi e una sola revisione preflight.
3. **Servizio installato:** supervisor, worker e watchdog risultano `running`; bundle supervisor `79ec3eeb...c8838`; API locale HTTP 200 in circa 34 ms dopo il riavvio.

Dashboard locale: <http://127.0.0.1:4472/>

## Limiti reali

- Il risultato è un **preflight locale**; non è un test operativo ENEA e non è produzione.
- I moduli infissi e pompe di calore non sono implementati.
- Nello Farinelli richiede una decisione operatore sul CF; Patrizia Muzzi richiede una fattura originaria valida.
- Preview, submit, ricevute, email e comunicazioni restano vietati.
