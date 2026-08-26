# APR — fonti originarie ed elaborazione ex novo

Questa policy è vincolante per i test APR e per le future regole costruite con lo stesso metodo.

## Fonti tecniche ammesse

- La fattura originaria è fonte valida.
- Un certificato tecnico è fonte valida soltanto quando è esplicitamente classificato come certificato reale di terza parte.
- Il “documento tecnico” caricato nel CRM è prodotto internamente: non è una fonte tecnica terza e non può fornire quantità, misure, trasmittanze o altre specifiche.
- Un allegato generico (`additional`) non viene promosso implicitamente a certificato: in assenza di classificazione esplicita viene escluso e auditato.

Regola registro: `user-2026-08-25-crm-internal-technical-document-untrusted-v1`.

## Classificazione deterministica dei certificati Infissi

Il tipo storage CRM resta immutato. Dopo l'estrazione locale del testo, un allegato `additional` diventa semanticamente `third_party_certificate` soltanto se soddisfa integralmente uno dei profili seguenti:

1. `formal_declaration` — 5 criteri su 5 obbligatori: titolo contenente dichiarazione/asseverazione di prestazione, conformita energetica o trasmittanza; famiglia serramenti/infissi/finestre; valore numerico `Uw`/`Ud` o trasmittanza compreso fra 0,1 e 8; riferimento normativo `UNI EN ISO 10077`, `EN 14351-1`, Reg. UE 305/2011 o D.Lgs. 192/2005; soggetto dichiarante/produttore oppure firma/timbro.
2. `structured_product_dop` — 6 criteri su 6 obbligatori: famiglia Infissi; valore termico numerico 0,1–8; norma `EN 14351-1`; riferimento prodotto nel formato `Numero:` o `Rif. tipologia:` seguito da `Modello:`; dimensioni etichettate `dimensioni: NNN[x]NNN`; almeno due blocchi prodotto distinti completi.

Una sola parola tecnica, un numero, una misura o una nota interna che cita `trasmittanza` non bastano. Tutti i casi incompleti restano `additional`; le appendici ENEA storiche non possono essere promosse.

Il certificato promosso conserva inoltre uno scope deterministico: la presenza esplicita di `infissi/serramenti/finestre vecchi, esistenti, dismessi, rimossi o preesistenti` produce `removed_windows`. Questa fonte resta un vero certificato di terza parte ma non puo essere usata come tabella tecnica dei nuovi infissi installati.

Regola registro: `user-2026-08-26-third-party-technical-certificate-classification-v1`.

## Elaborazione ex novo

APR ricostruisce ogni test come se la pratica non fosse mai stata lavorata. Sono input ammessi soltanto fattura, form cliente e certificato tecnico reale di terza parte. Pipeline storica, decisioni dell’operatore, vecchie bozze o pratiche ENEA e documenti interni derivati non possono orientare mapping, blocker o payload. Un confronto con la lavorazione precedente è ammesso soltanto dopo l’esecuzione, in un benchmark read-only separato.

Regola registro: `user-2026-08-25-test-ex-novo-original-sources-only-v1`.
