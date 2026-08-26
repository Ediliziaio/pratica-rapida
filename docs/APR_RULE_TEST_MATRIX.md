# APR — Automazione PraticaRapida

ENEA è il primo modulo di APR.

## Matrice regole → test → runtime

Una regola non e' dichiarata attiva soltanto perche' compare in questo documento o nel registro. APR richiede la catena completa: ID nel registro unico, test automatico verde, impronta del contenuto corrente e bundle persistente installato identico a quello testato. Se uno solo di questi passaggi manca, il dashboard mostra `pending_test` oppure `tested_not_deployed`, mai una regola attiva.

Questa matrice è governata da `apr-enea-rule-test-matrix-v59` e dal registro unico `enea-operational-registry-v83`. Una regola appare **attiva/testata** nella dashboard soltanto quando l'evidenza persistente corrisponde sia alla versione della matrice sia alla versione del registro e contiene l'esito positivo della relativa chiave.

La chiave `operator-structured-question-resume` copre il ciclo persistente domanda diretta → risposta caso-specifica → riaccodamento. La nota libera è facoltativa; il valore tecnico deriva sempre da un'opzione controllata. La risposta non diventa una regola generale e `non determinabile` mantiene il caso in intervento operatore.

| Chiave | Regola | Prova automatica |
|---|---|---|
| screening-dimension-unit-surface-coherence | Dimensioni L×S: unità esplicita, altrimenti unica unità coerente con la superficie, altrimenti euristica ≤20 m / <2000 cm / resto mm; `Tot mq` è superficie esplicita e differenze oltre il 5% bloccano | Teotino positivo + conflitto negativo + confine 5%/oltre soglia |
| infissi-portal-managed-energy-savings | Il portale ENEA calcola il risparmio energetico Infissi; APR omette il campo da payload e dry-run e può soltanto auditarne una futura lettura, senza modificarlo | assenza esplicita dal payload + audit read-only con mutationAllowed=false |
| infissi-old-window-transmittance-matrix | Trasmittanza del vecchio infisso dalla combinazione esatta materiale telaio + tipo vetro del form; fallback prudenziale 6,0 W/m²K per dato mancante, ambiguo, non mappabile o dubbio | 20 combinazioni parametrizzate + mancanti + ambigui + dubbio + audit mapping form |
| infissi-invoice-or-technical-source-resolution | Numero e misure dalla fattura se espliciti, altrimenti dai documenti tecnici originari; misura esterna preferita ma altra misura documentata ammessa; cardinalità 1:1 | fattura completa + fonti complementari + misura esterna/altra documentata + conflitto fail-closed |
| infissi-transmittance-fallback | Trasmittanza esplicita prevalente; se assente in tutte le fonti originarie usare 1,3 W/m²K; conflitti espliciti restano bloccanti | fallback 1,3 + precedenza esplicito + conflitto fail-closed |
| infissi-enea-area-rounding | Superficie esatta auditata per pezzo e superficie ENEA arrotondata a un decimale, senza aggregazione | calcolo esatto + arrotondamento accettato/rifiutato |
| infissi-material-glass-fallbacks | Valori espliciti prevalenti; in assenza materiale PVC e vetro a bassa emissione | fallback + precedenza fonte esplicita |
| infissi-shading-closures-form-flag | SI nel form seleziona Chiusure oscuranti, NO lascia vuoto; assente/ambiguo richiede operatore | SI/NO + fail-closed risposta mancante |
| single-case-regression-test | Una pratica già lavorata può essere rifatta da APR in una coorte isolata da uno, senza riusare dossier o bozza e con un nuovo ID | seed singolo auditato + gate worker minimo dinamico |
| invoice-work-date-chronology | Tutte le fatture fiscali uniche partecipano alla cronologia: prima data per inizio lavori, ultima data per fine lavori quando manca nel form | helper cronologico + propagazione campo ENEA con fonte e ID regola |
| screening-surface-material-over-support-structure | Il materiale ENEA è quello della schermatura: struttura in alluminio + telo/tessuto resta `Tessuto`; codice tessuto/colore associato è prova corroborante | regressione Tommaso Cecchi con Tempotest e motore |
| explicit-composite-screening-material | `Misto` solo se materiali diversi appartengono alla superficie schermante stessa, non alla struttura | regressione lamelle schermanti in alluminio + telo in tessuto |
| explicit-motorized-screening-movement | Motore/comando motorizzato esplicito è `Automatico`, anche per pergole e pergotende | regressione pergotenda motorizzata |
| explicit-technical-surface-precision | Superficie esplicita di fattura prima del calcolo; altrimenti prodotto delle misure fino a quattro decimali, mai troncato a una cifra | Khemara + Righetti + Maranesi + mapper precisione |
| linea-sole-potito-paper-form | Solo Linea Sole Potito: modulo cartaceo valido al posto del form inline; orientamento Sud e superficie finestrata 2,0–2,9 sono fallback subordinati ai valori espliciti | scope fornitore/template + stabilità riavvio + mapper/audit + parser fattura |
| invoice-gross-total-vat-included | Totale fattura sempre lordo IVA incluso; totale isolato multipagina ammesso solo se riconciliato con imponibile, IVA e riepilogo aliquote | parser fattura + evidenza finanziaria + preflight Lucia Lagrasta |
| distinct-invoice-numbers-same-customer-sum | Fatture dello stesso dossier con numeri diversi si sommano automaticamente al lordo IVA; gli acconti possono deduplicare solo le righe tecniche | riconciliazione finanziaria OCR + preflight acconto/saldo Silvia Magi |
| missing-invoice-operator-requeue | Fattura mancante: motivo esplicito in intervento operatore e ripresa della stessa pratica dopo nuovo allegato e ritorno in Pronte da fare | preflight locale + registro e fingerprint persistente |
| unique-invoice-base-reference-match | Un riferimento acconto con suffisso anno/serie diverso viene associato per numero base solo a una distinta fattura univoca; la fattura che contiene il richiamo e serie concorrenti non possono soddisfarlo | positivo 162/26→162 e 59→59/A + negativi serie 59/A/59/B e autoriferimento del saldo |
| default-single-unit | Numero appartamenti assente, vuoto o zero: una unità; valore positivo esplicito prevalente | preflight + pacchetto payload locale |
| invoice-total-over-bank-transfers | Totale fatture autorevole; commissioni escluse; operatore solo se il capitale bonificato supera le fatture | classificatore bonifici + riconciliazione preflight |
| operator-structured-question-resume | Domanda controllata e risposta caso-specifica con riaccodamento | operator questions + riavvio |
| ten-case-monday-restart | Dieci pratiche Archiviate in sequenza, ripresa durevole e blocchi isolati | seed 10 + preflight con riavvio + esecuzione che continua dopo un blocco |
| random-pilot-five-of-fifteen | Cinque clienti estratti una sola volta da 15 identità CRM reali univoche | campione, blocchi, idempotenza, riavvio e dashboard |
| source-explicit-over-fallback | Fonte esplicita prima del fallback | pipeline locale + policy schermature |
| valid-original-document-cf | CF valido da fattura originaria solo se il form è invalido e l'identità è coerente | regole operative + preflight locale |
| secondary-home-36-percent-allocation | Abitazione principale NO: totale congruo 2025-2026 al 36% per ogni intervento, 50%=0 e totale invariato | registro + preflight + contratto Calcolo + verifica GET |
| completion-date-latest-invoice | Ultima fattura e alert TEST >90 | pipeline locale |
| cristal-fallback | Cristal 0,33 solo fallback | policy schermature |
| pergola-fallback | Pergola 0,08 solo fallback | pipeline + policy schermature |
| zanzariera-fallbacks | Zanzariera Misto/Manuale/0,33 fallback | pipeline locale |
| screening-fallback-material-category-guard | Una zanzariera con materiale derivato da fallback può usare soltanto Misto; ogni conflitto invalida il payload e impone draftReady:false | positivo Misto + negativo analogo Tessuto con portal gate bloccato |
| physical-cardinality | Una riga per prodotto fisico; una riga form di gruppo può fornire tipo/esposizione a N pezzi solo in assenza di fonte primaria contraria | cardinalità + form-group inheritance + pipeline |
| single-house-floors | Unità unica indipendente dai piani | pipeline locale |
| rinaldi-scoped | Massimo detraibile e separazione VEPA solo Rinaldi | policy Rinaldi + pipeline |
| test-stop-before-external | Stop prima di azione esterna | pipeline + batch 15 casi |
| deduplicate-queue | Deduplica e ripresa senza perdita | piano + batch 15 casi |
| manual-crm-comparison-scope | Esclusioni confronto CRM manuale | comparison policy |
| crm-readonly-adapter | GET/HEAD soltanto, nessun segreto/mutazione, gate chiuso | contratto + fixture + doctor + dashboard |

Il batch locale non apre browser, CRM o ENEA. Un caso bloccato conserva fonti, differenze e motivo, poi la coda passa al caso successivo. Il piano prodotto ha sempre `externalActionAllowed=false`.

## Integrazione con il CRM PraticaRapida

APR è un modulo integrabile nel CRM, non un sistema isolato. Il contratto `apr-crm-integration-contract-v1` riceve eventi pratica ENEA con revisione e identità cliente, quindi produce comandi proposti con precondizione di stato, chiave idempotente, audit e compensazione.

- Un piano locale pronto propone l'avanzamento dello stato del cliente.
- Un caso ambiguo o bloccato propone la pipeline `Richiesto intervento operatore`; il batch continua col caso seguente.
- Automatismi CRM esistenti e integrazione CRM→Cruscotto devono conservare esattamente il proprio fingerprint.
- Upload PDF ENEA, collegamento email/ricevuta, comunicazioni e invio portale sono capacità future esplicitamente non eseguibili nella simulazione locale.

Il test `aprCrmIntegrationContract.test.ts` verifica instradamento, idempotenza, compensazione, preservazione degli automatismi e rifiuto degli artefatti futuri.
