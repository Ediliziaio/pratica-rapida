# Verifica operativa r108 e audit chiusure/date

Generato il 10 settembre 2026. Attività read-only salvo le due bozze TEST espressamente richieste; nessuna anteprima, submit, protocollazione o comunicazione.

## Verifica operativa r108: Codognato e Buracchi

Bundle: `c20ee338-tabular-abbreviated-uw-r108-20260910`  
SHA-256 worker: `122d4164858a3136fa705b24c1af8a84bea18eff4f3b361966fe6f8f3f7be7fd`  
Report run: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-tabular-abbreviated-uw-r108-operational-two-20260910/report.json`  
SHA-256 report: `6cc8fd494f66e9325193223ae86d5502ab99c5c31b9760a7c9b71542d2b04fa9`

| Pratica | Esito formale | Evidenza |
|---|---|---|
| EUGENIO CODOGNATO | `INCONSISTENT` | Il preflight locale riconosce gli otto valori Uw tabellari reali, ma registra ancora `invoice_929a8665` e riconciliazione economica non verde; il terminal snapshot/case-truth pubblica `INCONSISTENT` senza blocker. Nessuna bozza è stata creata. Non è attribuito un verdetto di blocco. |
| VERA BURACCHI | `SAVED` | Bozza TEST `484301`, 11/11 pagine salvate; preflight economico €6.426,92 verde, execution `completed`, terminal snapshot `READY`, zero blocker. |

Conclusione limitata: r108 è dimostrato operativamente sul riconoscimento del formato tabellare abbreviato e sul percorso completo Buracchi. Codognato conferma il riconoscimento tecnico ma non consente un verdetto finale a causa della divergenza fra fonti.

## Lotto operativo delle 24

Manifest invariato per casi, ordine, fasi e safety; è stato completato soltanto il contratto di esecuzione richiesto dal runner copiando i quattro `excludedCustomerKeys` dal manifest wide100 autorizzato.

- vecchio SHA-256: `199389c693...`
- nuovo SHA-256 completo: `3d08eaea759af7c5c5d4a33866d0c7b76a58ca8652c26f2f153b8a4c6ad54bff`
- casi: 24, tutti unici e tutti appartenenti al manifest wide100 già autorizzato
- stato: **IN CORSO** dal 10 settembre 2026 alle 21:17:49Z, run `apr-r108-remeasurement-24-20260910`; il manifest con SHA-256 completo sopra è stato autorizzato esplicitamente e consumato senza modifiche dal bundle r108 congelato

## Chiusure oscuranti: 12 scostamenti

I 12 scostamenti appartengono a due sole pratiche:

| Pratica | Righe | Operatore | APR | Fonte APR |
|---|---:|---|---|---|
| Angelina Stricelli | 7 | No | Sì | form CRM `prodotto.zanzariere_tapparelle_persiane=true`; regola `user-2026-08-19-infissi-shading-closures-form-flag-v1` |
| Santo Giuga | 5 | No | Sì | form CRM `prodotto.zanzariere_tapparelle_persiane=true`; stessa regola |

Pacchetti verificati:

- Stricelli: SHA-256 `29b9fa8e4e56d190e7145b74fca24037ead906940bfeed3b8f79109eacddc81b`
- Giuga: SHA-256 `d9803df7ff0cda33092e699f15bb59021295309baa9cb5bd8fe12c89fb0b895a`

Verdetto aggiornato dopo la decisione di Giuliano: **i 12/12 scostamenti hanno ora una decisione generale deterministica**, implementata localmente e in attesa di gate/installazione:

- Stricelli: le cinque fatture descrivono soltanto analisi/sostituzione di serramenti BluEvolution 82 e non fatturano alcuna chiusura aggiuntiva. **La fattura comanda anche quando tace:** il valore corretto è `NO` per tutte le 7 righe, anche contro il `SI` del form. Le DoP restano corroborazione, non requisito.
- Giuga: la fattura 297/FE del 09/07/2026 riporta espressamente la produzione e posa di una zanzariera nella stessa pratica Infissi. La risposta corretta è **`SI`** per le 5 righe: zanzariera insieme agli infissi = chiusura oscurante aggiuntiva; zanzariera autonoma = schermatura solare.

La nuova precedenza non usa i nomi dei clienti: richiede prova del fascicolo fatture completo, usa le righe fatturate in positivo e il silenzio dell'intero fascicolo in negativo; se l'acquisizione delle fatture non è completa, resta fail-closed. La vecchia regola basata sul solo form è marcata `superseded`.

`operatorQuestion` Stricelli: **nessuna, decisione acquisita (NO).**

`operatorQuestion` Giuga: **nessuna, decisione acquisita (SÌ).**

## Date: origine APR e origine operatore

Metodo di verifica a tre fonti:

1. checkpoint preflight APR e relativo `startDateSource`/`completionDateSource`;
2. documenti originari e testo estratto, cercando sia la data APR sia la data dell'operatore e frasi causali di inizio/fine/collaudo;
3. PDF ENEA storico chiuso dall'operatore, verificato direttamente a pagina 1.

Il form digitale non contiene campi di inizio/fine lavori in nessuno dei 15 casi. APR applica la regola registrata `user-2026-08-18-invoice-work-date-chronology`: prima fattura per l'inizio e ultima fattura per la fine, salvo prova originaria esplicita di completamento. La data dell'operatore proviene con certezza dal PDF ENEA storico; quando non ricompare nei documenti originari disponibili, la fonte primaria usata dall'operatore non è ricostruibile dal dossier.

| Pratica | Campo | APR e fonte | Operatore | Riscontro nei documenti originari | Classificazione / domanda operatore |
|---|---|---|---|---|---|
| Angela Tuttolani | Fine | 27/07/2026, fattura 217/2026 | 28/07/2026 | 28/07 assente; il dossier mostra solo la fattura del 27/07 | Fonte operatore non documentata. **Confermi che la fine lavori reale è 28/07/2026, distinta dalla fattura del 27/07/2026?** |
| Antonella Ferletic | Inizio | 16/06/2026, fattura 25/2026 | 03/02/2026 | 03/02 assente | Fonte operatore non documentata. **Qual è la data reale di inizio lavori: 03/02/2026 o 16/06/2026?** |
| CLAUDIA SELLATI | Inizio | 07/02/2026, fattura 44/2026 | 30/01/2026 | 30/01 è presente, ma come data dell'ordine 18174, non come inizio lavori | Differenza di semantica, non OCR. **Confermi che l'ordine del 30/01/2026 coincide con l'effettivo inizio lavori?** |
| Claudio Beghini | Fine | 30/07/2026, fattura 182 | 31/07/2026 | 31/07 assente; “posa in opera” è una riga della fattura, senza data finale separata | Fonte operatore non documentata. **Confermi che la fine lavori reale è 31/07/2026, il giorno dopo la fattura?** |
| Fabio Sartori | Fine | 23/03/2026, fattura 55/001 | 04/08/2026 | 04/08 assente | Fonte operatore non documentata. **Confermi che la fine lavori reale è 04/08/2026 e indica quale documento la prova?** |
| Fabrizio Pelizzari | Inizio | 15/06/2026, fattura 129 | 03/02/2026 | 03/02 assente; “collaudo” compare solo nella descrizione del servizio elettrico | Fonte operatore non documentata. **Qual è la data reale di inizio lavori: 03/02/2026 o 15/06/2026?** |
| Giovanni Pescatori | Fine | 14/05/2026, fattura 18/2026 | 15/05/2026 | 15/05 assente | Fonte operatore non documentata. **Confermi che la fine lavori reale è 15/05/2026, il giorno dopo la fattura?** |
| Luca Cigognetti | Fine | 24/03/2026, fattura 10 | 03/08/2026 | esiste un verbale originario di collaudo e consegna datato e firmato 09/07/2026; 03/08 è assente | **Errore APR confermato e decisione acquisita:** usare il 09/07/2026 del verbale. La regola generale `user-2026-09-10-dated-commissioning-report-completion-precedence-v1` è implementata e testata localmente; installazione e verifica operativa restano da eseguire dopo il lotto attivo. |
| Lucia Lagrasta | Fine | 12/06/2026, fattura 161/2026 | 13/06/2026 | 13/06 assente | Fonte operatore non documentata. **Confermi che la fine lavori reale è 13/06/2026, il giorno dopo la fattura?** |
| Luigi Carfora | Fine | 09/04/2026, fattura 69/001 | 08/07/2026 | 08/07 assente | Fonte operatore non documentata. **Confermi che la fine lavori reale è 08/07/2026 e indica quale documento la prova?** |
| MATTEO CAPITANELLI | Inizio | 14/03/2026, fatture 91/2026 e 92/2026 | 03/02/2026 | 03/02 assente | Fonte operatore non documentata. **Qual è la data reale di inizio lavori: 03/02/2026 o 14/03/2026?** |
| Natale Tiraboschi | Inizio | 22/05/2026, fattura 84 | 03/02/2026 | 03/02 assente | Fonte operatore non documentata. **Qual è la data reale di inizio lavori: 03/02/2026 o 22/05/2026?** |
| Rosa Toscano | Inizio | 11/05/2026, fattura 4 (la seconda è del 28/05) | 03/02/2026 | 03/02 assente | Fonte operatore non documentata. **Qual è la data reale di inizio lavori: 03/02/2026 o 11/05/2026?** |
| Santo Giuga | Fine | 09/07/2026, fattura 297/FE | 01/09/2026 | la fattura e il bonifico del 09/07 dicono “saldo fine lavori”; 01/09 è assente | La prova disponibile sostiene 09/07; fonte operatore non documentata. **Confermi che la fine lavori è 09/07/2026, come indicato da fattura e bonifico, e non 01/09/2026?** |
| VERA BURACCHI | Fine | 12/03/2026, fattura 1512 | 07/07/2026 | 07/07 assente | Fonte operatore non documentata. **Confermi che la fine lavori reale è 07/07/2026 e indica quale documento la prova?** |

Sintesi date:

- 1 errore APR dimostrato: Luca Cigognetti, perché un verbale di collaudo originario datato 09/07/2026 è stato ignorato;
- 1 differenza semantica dimostrata: Sellati, ordine 30/01 contro prima fattura 07/02;
- 1 data APR sostenuta anche dalla causale esplicita “saldo fine lavori”: Santo Giuga, 09/07;
- 12 casi in cui APR applica la regola fatture e il valore dell'operatore non è rintracciabile nei documenti originari disponibili: serve conferma della data effettiva, non una correzione automatica.

Pattern sospetti da discutere prima di modificare regole:

- cinque pratiche usano tutte `03/02/2026` come inizio operatore senza che la data compaia nei dossier;
- quattro pratiche usano come fine operatore il giorno successivo alla fattura;
- modificare APR per imitare questi pattern senza fonte primaria fabbricherebbe una data.

## Cinque trasmittanze del vecchio infisso

Tutte e cinque riguardano ELENA DEPALMA: operatore `4,1`, APR `6`. La descrizione del vecchio infisso non determina univocamente materiale telaio e tipo di vetro, quindi la tabella autorizzata non può essere applicata in modo fail-closed.

- `classification`: `OPERATOR_REQUIRED`
- `exactCause`: caratteristiche del vecchio infisso insufficienti per scegliere una riga univoca della tabella di trasmittanza
- `missingDocumentType`: `null` (manca un dato tecnico, non necessariamente un documento)
- `operatorQuestion`: **Indica per ciascuno dei 5 infissi esistenti il materiale del telaio e il tipo di vetro (singolo, doppio o triplo), oppure conferma un unico abbinamento valido per tutti.**
- `onboardingGap`: rendere obbligatori materiale telaio e tipo vetro del vecchio infisso, per ogni riga o come valore comune dichiarato.
