# APR Infissi — preparazione primo test shadow

## Stato del gate

`ready_for_external_authorization` esclusivamente per un futuro test shadow. Non equivale ad abilitazione CRM/ENEA reale o produzione.

Il caso locale selezionato è `Cristina Fabbro` (`cristina-fabbro`), modalità `TEST`. La preparazione usa soltanto la fixture locale versionata e non ha aperto browser, CRM o ENEA.

## Expected values

- cardinalità: 8 infissi fisici, 8 righe distinte;
- totale fatture lordo IVA: 7.600,02 euro;
- telaio nuovo: PVC;
- vetro nuovo: Triplo vetro basso emissivo;
- trasmittanza vecchio infisso: 3,0 W/m²K, da `Legno + Vetro doppio` del form;
- chiusure oscuranti: non selezionate;
- risparmio energetico: campo non valorizzato da APR, calcolo demandato al portale;
- fingerprint payload: `49c945faea17aec87a4397b3db942173f211be0631345f689712552b01928a48`.

Misure, superfici arrotondate e trasmittanza del nuovo infisso sono conservate riga per riga nel checkpoint del mapping.

## Criteri PASS

1. Cardinalità e tutti i valori tecnici coincidono col payload locale auditato.
2. Il risparmio energetico resta non valorizzato da APR.
3. Ogni futura lettura server possiede `evidenceId`, timestamp e ID regola.
4. Nessuna anteprima, submit, ricevuta o comunicazione viene eseguita.

## Criteri FAIL

1. Differenza in cardinalità, misure, superficie, Uw nuovo/vecchio, materiale, vetro, chiusure o totale.
2. Tentativo APR di calcolare o scrivere il risparmio energetico.
3. Fingerprint sorgenti o payload differente, checkpoint perso o duplicato.
4. Qualunque azione esterna non autorizzata.

## Checkpoint

- mapping: `.artifacts/apr-infissi-shadow-test-gate/infissi-local-mapping/checkpoint.json`;
- preparazione shadow: `.artifacts/apr-infissi-shadow-test-gate/infissi-shadow-test/checkpoint.json`.

Una seconda esecuzione del comando di preparazione ha conservato esattamente revisione e SHA-256 di entrambi i checkpoint. Il blocker residuo locale è `null`; l’interazione esterna resta intenzionalmente disabilitata.

Comando ripetibile:

```sh
npm run apr:infissi-shadow-prepare -- --state-dir .artifacts/apr-infissi-shadow-test-gate
```
