# ENEA Lab — protocollo collaudo live

Stato: candidato di laboratorio, **non produzione**.

## Obiettivo

Verificare sul portale ENEA 2026 che il comando unico riconosca e compili i controlli osservati senza salvare, avanzare o inviare la pratica.

## Prerequisiti

- ramo `agent/crm-ombra-enea-lab` con CI verde;
- pratica schermature già nota e controllabile;
- accesso ENEA autenticato dall'operatore;
- nessun test su `main` o sul CRM di produzione in scrittura;
- usare il workflow **test** solo per il collaudo dei valori convenzionali;
- usare il workflow **official** soltanto per verificare campi già validati e senza valori `testOnly`.

## Invarianti obbligatorie

1. Il runtime non chiama `submit()` e non preme pulsanti Salva/Avanti/Conferma/Invia.
2. Un gTot non documentato o non verificato non viene scritto in `id-gtot`.
3. Potenza e rendimento convenzionali del generatore non entrano nel workflow `official`.
4. Campi mancanti, opzioni non disponibili o autocomplete non risolti restano esplicitamente in `notFound`, `notAvailable` o `notSelected`.
5. La compilazione di una pagina deve essere verificata visivamente prima di qualsiasi salvataggio manuale.
6. Il CRM resta sorgente in sola lettura; correzioni e conferme del laboratorio restano locali.

## Ordine del collaudo

Per ogni pagina: aprire la pagina, eseguire lo stesso comando, confrontare i valori compilati con il pacchetto e **non salvare** finché il confronto non è concluso.

1. Generatore impianto termico
2. Anagrafica beneficiario
3. Immobile
4. Intervento
5. Impianto termico esistente
6. Riepilogo schermature / spesa
7. Una schermatura alla volta

## Esito per pagina

Registrare soltanto:

- pagina riconosciuta sì/no;
- campi compilati correttamente;
- `notFound`;
- `notAvailable`;
- `notSelected`;
- eventuali differenze fra valore atteso e valore mostrato dal portale.

## Stop immediato

Interrompere il collaudo se:

- compare un tentativo di salvataggio o navigazione automatica;
- un valore di prova appare in un workflow `official`;
- un gTot non verificato viene compilato;
- il portale presenta ID/opzioni diversi dal contratto osservato;
- una pagina non viene riconosciuta in modo univoco.

## Criterio di uscita dal laboratorio

La V1 Schermature può essere proposta per un test operativo controllato solo dopo:

- CI verde;
- contratto campi osservati verde;
- collaudo live di tutte le pagine senza scritture automatiche;
- almeno una pratica completa confrontata campo per campo;
- seconda revisione critica del diff prima di qualsiasi integrazione con `main`.
