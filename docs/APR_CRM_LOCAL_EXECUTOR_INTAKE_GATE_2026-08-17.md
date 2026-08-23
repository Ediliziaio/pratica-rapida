# APR — gate intake locale dell'esecutore (17 agosto 2026)

## Risultato

La coda handoff locale è ora consumata, esclusivamente in simulazione locale, dall'identità persistente `apr_enea_draft_executor`.

Luciano Javier Martinez ed Elisa Moro sono stati lavorati una pratica alla volta secondo il ciclo:

1. lock e lease persistiti;
2. artefatto letto e SHA-256 verificato;
3. checkpoint `artifact_verified` persistito;
4. lock e lease rilasciati;
5. stato terminale locale `released_local`.

Il ciclo si ferma prima di browser, CRM ed ENEA.

## Stato installato

- Intake: `completed_local`.
- Pratiche totali: `2`.
- Rilasciate localmente: `2`.
- Pratiche attive: `0`.
- Lock residui: `0`.
- Lease residue: `0`.
- Claim Luciano: `1`.
- Claim Elisa: `1`.
- Azioni esterne: `0`.

## Crash e ripresa

### Test automatico con lease scaduta

Il test interrompe il processo dopo il checkpoint `artifact_verified`, ricrea l'istanza dopo la scadenza della lease e verifica:

- rilascio del lock scaduto;
- incremento auditato di `recoveryCount`;
- riaccodamento dello stesso handoff;
- nuovo claim senza ripetere la verifica già checkpointata;
- rilascio finale;
- avvio del secondo caso soltanto dopo il rilascio del primo.

### Runtime persistente

Il supervisore è stato riavviato mentre Elisa Moro era nello stato `claimed`. Il nuovo PID ha ripreso lo stesso handoff, ha registrato `artifact_verified` e lo ha rilasciato senza incrementare `claimAttemptCount`, perché la lease era ancora valida.

## Idempotenza

Dopo il completamento e più heartbeat, gli hash sono rimasti invariati:

- checkpoint intake: `5862019e4de10f2c633f55a46940b30f8e00a653ff7a61c40411a05e39546a6a`;
- checkpoint handoff: `373684b9ad8ebcd8655818a503f0752f85909dadd4b774a9848c18be377bb2d6`;
- checkpoint pacchetti: `d04385e38d5c41ad6de52d9c3a19ea53ca7ec643f0a53c01943642d8782b98fc`.

Nessun handoff è stato perso o duplicato.

## Fail-closed

Una modifica dell'artefatto dopo il claim produce `technical_block`, azzera il lock attivo e impedisce il passaggio al checkpoint verificato.

Restano falsi:

- `externalActionAllowed`;
- `browserAllowed`;
- `crmMutationAllowed`;
- `eneaActionAllowed`;
- `previewAllowed`;
- `submitAllowed`;
- `receiptAllowed`;
- `communicationsAllowed`.

I checkpoint storici non vengono importati.

## Evidenze automatiche

- Typecheck runner: verde.
- ESLint dei file del gate: verde.
- Test mirati: `20/20` verdi.
- Bundle installato: `5211b391a213f8a96f7af4f487895883e61068f139738085418c1c6ee55aeb66`.
- Supervisor, worker e watchdog: attivi.

## Osservabilità

- Dashboard: <http://127.0.0.1:4472/>
- API intake: <http://127.0.0.1:4472/api/crm-local-executor-intake>
- API handoff: <http://127.0.0.1:4472/api/crm-local-draft-handoff>
- Health: <http://127.0.0.1:4472/healthz>

La dashboard mostra pratica corrente, checkpoint, lock, scadenza lease, claim, riprese, motivo e prossima azione.

## Limite residuo

Questo gate prova la presa in carico da parte dell'identità esecutore APR ma non abilita il trasporto browser né la compilazione del portale ENEA.
