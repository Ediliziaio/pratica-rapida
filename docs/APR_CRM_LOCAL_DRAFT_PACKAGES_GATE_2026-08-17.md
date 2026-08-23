# APR — gate pacchetti di bozza locali (17 agosto 2026)

## Perimetro

Gate eseguito esclusivamente sui checkpoint locali già acquisiti della coorte persistente `apr-pilot-40`.

- Nessuna apertura di browser, CRM o ENEA.
- Nessun download o nuova acquisizione.
- Nessuna mutazione CRM.
- Nessuna creazione o modifica di bozze ENEA.
- Anteprima, submit, ricevute e comunicazioni restano vietati.

## Pacchetti locali verificati

| Pratica | Prodotti | Spesa riconciliata | Fingerprint pacchetto |
| --- | ---: | ---: | --- |
| Luciano Javier Martinez | 2 | € 2.257,00 | `3e20dbd2b932a1123c1bb5c1e107b18d30bff9932b91ee60d6acf1a34b700210` |
| Elisa Moro | 3 | € 1.250,00 | `360014abbe281778f4aff5e5a78ed2fa7c618bc3ef86d237c602ccfe6dab372e` |

I pacchetti sono marcati `verified_local_package` e `executionNotArmed=true`. Non sono stati inseriti nella coda operativa ENEA.

## Otto casi residui

### Modulo non ancora implementato

- Elena Pittau — Infissi / Serramenti.
- Gregorio Fusco — Infissi / Serramenti.
- Mario Ruggeri — Infissi / Serramenti.
- Francesco De Vallier — Infissi / Serramenti.
- Angelo Rivolta — Pompe di Calore / Climatizzazione.
- Filippa Carmela Rita Finocchiaro — Pompe di Calore / Climatizzazione.

I blocker generati dal parser delle schermature sono conservati in audit, ma non vengono presentati come diagnosi attendibile del prodotto non supportato.

### Richiesto intervento operatore

- Nello Farinelli — CF valido e coerente non disponibile nelle fonti originarie.
- Patrizia Muzzi — nessuna fattura fiscale originaria valida riconosciuta.

## Persistenza e idempotenza

Il supervisore è stato riavviato due volte dal LaunchAgent `com.praticarapida.apr-enea-cohort40-supervisor`.

Prima e dopo il secondo riavvio:

- revisione pacchetti locali: `1`;
- firma sorgente: `80deacf12993bd3f1bf770bb52f91ca79c32fbe1a50d1ab8416317a4601af331`;
- SHA-256 checkpoint pacchetti: `3896d4466f16e44024fed65bdc3db4914a8d3671a65366eada70ca1b8e0c4b76`;
- hash proiezione preflight (stato + tentativi): `1e4d9986c97ce635d0cb2ba9427f4c6a788be58e5939c54302318f7876f1e66b`;
- hash proiezione analisi documenti (stato + tentativi): `4048a55ceb635b95ae308263e6cf9db98c86f2ce3d7e2b66732e19ca3d0b3939`;
- pacchetti presenti: esattamente `2`, senza duplicati;
- casi classificati: esattamente `8`, senza perdite.

## Evidenze automatiche

- Typecheck runner: verde.
- Build applicazione: verde.
- ESLint sui file del gate: verde.
- Test mirati: `15/15` verdi in tre file:
  - `crmLocalDraftPackages.test.ts`;
  - `crmLiveProcessing.test.ts`;
  - `localDashboardServer.test.ts`.

## Runtime osservabile

- Dashboard: <http://127.0.0.1:4472/>
- API pacchetti: <http://127.0.0.1:4472/api/crm-local-draft-packages>
- API ciclo live: <http://127.0.0.1:4472/api/crm-live-processing>
- Health: <http://127.0.0.1:4472/healthz>
- Bundle supervisore installato: `da7dce984cbe37b55d3335cc884868ddff06846e328c3019a16c7251dcb897d1`

La dashboard mostra nomi, classificazione, motivo, prossima azione, fingerprint e i vincoli `externalActionAllowed=false`, `preview=false`, `submit=false`, `comunicazioni=false`.

## Limite residuo

Questo gate prova la preparazione locale dei pacchetti e la classificazione dei casi. Non prova né abilita compilazione o salvataggio sul portale ENEA, integrazione mutativa con il CRM, moduli Infissi o Pompe di calore.
