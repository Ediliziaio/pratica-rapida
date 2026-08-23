# APR — gate handoff locale verso esecutore (17 agosto 2026)

## Risultato

I pacchetti locali verificati di Luciano Javier Martinez ed Elisa Moro sono ora artefatti persistenti e sono staged in una coda handoff dedicata all'esecutore APR.

La coda è separata dal checkpoint storico `enea-draft-execution` e non può ancora reclamare, creare, compilare o salvare pratiche ENEA.

## Artefatti

| Pratica | SHA-256 artefatto | Fingerprint logico |
| --- | --- | --- |
| Luciano Javier Martinez | `815803d5f9a89189efa1130685796e7961d6d062ac682321ddb671459a4eadc3` | `3e20dbd2b932a1123c1bb5c1e107b18d30bff9932b91ee60d6acf1a34b700210` |
| Elisa Moro | `666027cf6e0f8b34df06c42f5878a37bfd996da9ec447ae09cebc0e2b9c40463` | `360014abbe281778f4aff5e5a78ed2fa7c618bc3ef86d237c602ccfe6dab372e` |

Il timestamp volatile `payload.generatedAt` è escluso dall'artefatto persistente e verrà rigenerato soltanto dopo un futuro claim autorizzato. Campi, fonti, payload e workflow restano nel pacchetto.

## Coda handoff

- Stato: `staged_fail_closed`.
- Elementi: `2`.
- Dispatch: `0`.
- Pratiche attive: `0`.
- Tentativi per elemento: `0`.
- Lock e lease: assenti.
- Esecutore futuro: `apr_enea_draft_executor` con identità `apr_persistent_runtime`.
- Scope: `crm_live_processing_runtime`.
- Checkpoint storici importati: `false`.

## Sicurezza

Tutti i flag restano falsi:

- `externalActionAllowed`;
- `crmMutationAllowed`;
- `eneaActionAllowed`;
- `previewAllowed`;
- `submitAllowed`;
- `receiptAllowed`;
- `communicationsAllowed`;
- `externalDispatchAllowed` su ogni elemento.

La manomissione dell'artefatto produce `technical_block` per l'intera coda prima di qualunque dispatch.

## Riavvio e idempotenza

Dopo più heartbeat e dopo il riavvio del supervisore:

- revisione pacchetti: `50` invariata;
- revisione handoff: `49` invariata;
- SHA-256 checkpoint pacchetti: `d04385e38d5c41ad6de52d9c3a19ea53ca7ec643f0a53c01943642d8782b98fc` invariato;
- SHA-256 checkpoint handoff: `373684b9ad8ebcd8655818a503f0752f85909dadd4b774a9848c18be377bb2d6` invariato;
- hash proiezione preflight: `1e4d9986c97ce635d0cb2ba9427f4c6a788be58e5939c54302318f7876f1e66b` invariato;
- hash proiezione analisi documenti: `4048a55ceb635b95ae308263e6cf9db98c86f2ce3d7e2b66732e19ca3d0b3939` invariato;
- handoff ID: esattamente `2`, nessun duplicato;
- tentativi dispatch: `0`.

Le revisioni 50/49 includono l'audit del difetto transitorio individuato durante il collaudo: il timestamp di generazione causava revisioni spurie a ogni heartbeat. Il bundle instabile è stato sostituito e conservato come `rejected-volatile`; la regressione automatica verifica ora che timestamp differenti producano lo stesso artefatto e lo stesso checkpoint.

## Evidenze

- Typecheck runner: verde.
- ESLint dei file del gate: verde.
- Test mirati: `18/18` verdi.
- Supervisore, worker e watchdog LaunchAgent: `running`.
- Bundle supervisore installato: `088bb4577710a22ec2af47bd9961de06980d43abccf51e31c1d87befb3988194`.

## Osservabilità

- Dashboard: <http://127.0.0.1:4472/>
- API handoff: <http://127.0.0.1:4472/api/crm-local-draft-handoff>
- API pacchetti: <http://127.0.0.1:4472/api/crm-local-draft-packages>
- Health: <http://127.0.0.1:4472/healthz>

## Limite residuo

Il gate collega i pacchetti all'identità dell'esecutore ma mantiene intenzionalmente chiuso il dispatch. Non costituisce ancora una prova di compilazione o salvataggio reale sul portale ENEA.
