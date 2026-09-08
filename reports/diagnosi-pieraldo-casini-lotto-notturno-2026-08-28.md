# Diagnosi Pieraldo Casini e arresto lotto APR

Data verifica: 28 agosto 2026.

## Verdetto

- Il lotto non ha isolato soltanto Pieraldo: il sequencer si e' arrestato globalmente su Pieraldo e tutte le 36 pratiche non ancora concluse sono rimaste in attesa.
- Al momento dell'arresto risultavano 14 esiti terminali su 50; Pieraldo era la pratica corrente e le 35 successive non erano state avviate.
- Lo stato formale di Pieraldo e' `INCONSISTENT`: il preflight comune la classifica `blocked_case`, mentre il gate Infissi la classifica `ready_local_plan`; la dashboard della coorte risulta `off` e non pubblica una verita' caso risolutiva.

## Perche' la coda si e' fermata

Il sequencer isola correttamente una pratica solo quando riceve un blocco esplicito di preflight oppure quando il worker, gia' avviato, termina con un errore circoscritto alla pratica. Per Pieraldo non e' accaduto nessuno dei due casi.

Durante la preparazione il codice ha rilevato contemporaneamente:

- preflight comune `blocked_case`;
- gate Infissi `ready_local_plan`.

Questa combinazione viene trasformata in un'attesa (`return null`) anziche' in una decisione. Dopo 20 minuti l'attesa e' scaduta con `timeout:pieraldo-casini:preflight`. Il timeout generico non viene classificato come problema per-pratica: risale fino al gestore globale, che imposta `stopped_common_technical_block` e termina il sequencer. Il worker di Pieraldo non e' mai stato avviato; le coorti successive non sono state create.

## Origine dell'incoerenza

Il preflight comune ha applicato la lettura legacy Schermature a un dossier Infissi e ha prodotto due blocker non pertinenti al modulo reale:

1. `screenings_missing`: nessun prodotto di schermatura riconciliato;
2. `invoice_332a5af9`: nessuna riga di schermatura con dimensioni e gTot.

Il gate Infissi, sullo stesso dossier, ha invece riconosciuto correttamente:

- 5 infissi fisici mappati 1:1;
- totale fatture IVA inclusa pari a 7.700 euro;
- dimensioni e trasmittanze per tutte e cinque le righe;
- nessun blocker Infissi.

Nel codice esiste gia' la riconciliazione generale `infissi-authoritative-product-applicability-v66`, che rimuove precisamente questi blocker Schermature quando il gate Infissi autorevole e' pronto. Nel checkpoint comune di Pieraldo tale revisione non risulta applicata (`validationRevisionsApplied` vuoto). Il sequencer attende la convergenza prima di avviare il worker, mentre la riconciliazione autorevole e' eseguita nel percorso del supervisor/worker. Si crea quindi un circolo: il sequencer aspetta uno stato riconciliato, ma non arriva al percorso che lo riconcilia.

## Rapporto con il difetto corretto ieri

E' la stessa famiglia logica del problema di routing corretto ieri: blocker Schermature non applicabili a una pratica Infissi. Non risulta pero' una regressione o una sovrascrittura del resolver gia' corretto. Il difetto e' in un punto d'integrazione diverso e ancora scoperto: il sequencer notturno usa un proprio gate preliminare, prima del worker, e non invoca la riconciliazione autorevole gia' disponibile. Non e' una eccezione legata al nome Pieraldo e potrebbe ripetersi per qualunque pratica Infissi con la stessa combinazione dei due gate.

## Evidenze indipendenti

1. Checkpoint sequencer: `stopped_common_technical_block`, pratica corrente `pieraldo-casini`, 14 risultati su 50, motivo `timeout:pieraldo-casini:preflight`.
2. Journal: preparazione Pieraldo alle 08:05:30Z, gate Infissi preparato alle 08:06:59Z, arresto globale alle 08:27:00Z; nessun evento `case_worker_started` per Pieraldo.
3. LaunchAgent/dashboard: sequencer non in esecuzione con exit code 2; supervisor della coorte vivo ma dashboard `off`, worker e watchdog mai caricati; le coorti successive non esistono.

Nessuna correzione, riavvio o azione ENEA e' stata eseguita durante questa diagnosi.
