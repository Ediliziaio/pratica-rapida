# ENEA Lab — protocollo collaudo live

Stato: candidato di laboratorio, **non produzione**.

## Obiettivo

Verificare sul portale ENEA 2026 che il comando unico riconosca e compili i controlli osservati senza salvare, avanzare o inviare la pratica.

Prima del collaudo live sul portale, il laboratorio dispone anche di un audit retrospettivo read-only sulle pratiche ENEA concluse: confronta ciò che il mapper produrrebbe oggi con i valori tecnici presenti nel PDF finale ENEA già archiviato.

## Prerequisiti

- ramo `agent/crm-ombra-enea-lab` con CI verde;
- pratica schermature già nota e controllabile;
- accesso ENEA autenticato dall'operatore per il collaudo live;
- nessun test su `main` o sul CRM di produzione in scrittura;
- usare il workflow **test** solo per il collaudo dei valori convenzionali;
- usare il workflow **official** soltanto per verificare campi già validati e senza valori `testOnly`.

## Audit storico automatico — 5 pratiche

Scopo: usare pratiche già concluse come ground truth prima di entrare nel portale ENEA.

Prerequisiti specifici:

- server locale di sviluppo avviato sul ramo laboratorio;
- sessione staff autenticata nel CRM;
- pagina `/admin/enea-lab` aperta in ambiente DEV;
- nessuna necessità di login SPID/ENEA per questa fase.

Il laboratorio espone **solo in DEV** il seguente comando nella console del browser:

```js
await window.__ENEA_LAB_AUDIT_5__?.()
```

Il comando:

1. esegue SELECT sulla view `enea_practices_public`;
2. prende le pratiche schermature nello stato `archiviate` che possiedono almeno un PDF ENEA conclusivo;
3. scarica in lettura le fatture e il PDF finale dal bucket `enea-documents`;
4. ricostruisce il pacchetto che il mapper produrrebbe oggi;
5. confronta i campi tecnici con il PDF finale ENEA;
6. restituisce un report senza nome, email, CF o altri dati personali del cliente.

Non vengono eseguite mutation, RPC, upload, delete, update, salvataggi o invii.

### Esiti dell'audit

- `match`: tutti i campi confrontabili coincidono;
- `blocked`: le differenze esistono, ma il laboratorio le aveva già riconosciute come bloccanti e quindi non avrebbe inviato dati non verificati;
- `difference`: almeno una differenza sarebbe passata come dato pronto; richiede correzione prima del live test;
- `error`: fattura/PDF non leggibile o altra impossibilità tecnica di completare l'audit.

Target operativo del campione iniziale: **5 pratiche disponibili, almeno 4 `match` e l'eventuale quinta correttamente `blocked`**. Il target non va considerato raggiunto se il report restituisce `difference` o `error`: in quel caso si corregge il laboratorio e si ripete il batch.

## Invarianti obbligatorie

1. Il runtime non chiama `submit()` e non preme pulsanti Salva/Avanti/Conferma/Invia.
2. Un gTot non documentato o non verificato non viene scritto in `id-gtot`.
3. Potenza e rendimento convenzionali del generatore non entrano nel workflow `official`.
4. Campi mancanti, opzioni non disponibili o autocomplete non risolti restano esplicitamente in `notFound`, `notAvailable` o `notSelected`.
5. La compilazione di una pagina deve essere verificata visivamente prima di qualsiasi salvataggio manuale.
6. Il CRM resta sorgente in sola lettura; correzioni e conferme del laboratorio restano locali.
7. L'audit storico non trasforma una semplice pratica archiviata in ground truth: serve la presenza effettiva del PDF ENEA conclusivo associato alla stessa pratica.

## Ordine del collaudo live

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
- audit storico sul campione disponibile senza `difference` non spiegate;
- collaudo live di tutte le pagine senza scritture automatiche;
- almeno una pratica completa confrontata campo per campo;
- seconda revisione critica del diff prima di qualsiasi integrazione con `main`.
