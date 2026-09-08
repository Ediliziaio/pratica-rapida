# Arresto di sicurezza wide100 r27 — gap del gate `recovery_queued`

- Rilevato: 2026-09-02 13:40 CEST
- Lotto: `apr-wide100-current-cohort-bridge-r25`
- Bundle: `canonical-bundle/versions/7ec0aaf1-global-browser-lock-atomic-r27-20260902`
- Manifest SHA-256: `51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0`
- Freeze SHA-256: `123899be794f49b763ccbe429ee922318fae5970198e4b6dfb0239d734e2afde`
- Stato conservato: 28/100 risultati; 4 `saved`, 23 `operator_required`, 1 `technical_block`, 0 `inconsistent`.

## Prova concreta

Il resume autorizzato ha avviato una sola istanza del sequencer e ha ricopiato i bundle r27 nella coorte 2949. Il sequencer ha saltato i 28 risultati già terminali e si è fermato in `preflight_wait` su Lia Chiericati.

Il checkpoint della pratica, SHA-256 `523ed6e456b5402aff05de056f0558d010923745288efe3d46e681e540d9726b`, è valido e dichiara:

- stato `recovery_queued`;
- stessa bozza `453823`;
- 0/8 pagine completate;
- pagina Anagrafica con un solo Salva primario già tentato;
- GET canonica `persisted_fields_get` con esito `not_saved`;
- un solo recupero automatico autorizzato, senza ulteriori tentativi ammessi.

Il gate `prepare()` del sequencer accetta soltanto:

1. `queued` con execution `ready`;
2. `operator_intervention` riconosciuto come transitorio pre-Salva;
3. `filling` con draft esistente;
4. `saved` completo.

Non esiste un ramo per `recovery_queued`. Poiché il worker viene avviato soltanto dopo che `prepare()` supera questo gate, nessun componente può consumare la transizione già autorizzata. Il supervisor continua correttamente a pubblicare heartbeat, ma osserva il runner locale vuoto e non modifica il checkpoint business. È un deadlock deterministico del protocollo di resume, non un problema del caso e non un nuovo verdetto per Lia.

## Arresto e continuità

Sono stati scaricati soltanto:

- `com.praticarapida.apr-wide100-current-cohort-bridge-r25`;
- `com.praticarapida.apr-enea-cohort2949-supervisor`.

Worker e watchdog 2949 non erano mai stati caricati. Keepalive r27 e Chrome non sono stati spenti:

- keepalive PID 24612, `runs=3`, `last exit code=0`;
- Chrome PID 3785, avvio invariato 2026-09-01 16:00:32;
- checkpoint globale con `system-global-browser-lock-atomic-publication-v1`;
- prova read-only corrente su `https://bonusfiscali.enea.it/dashboard`;
- anteprima, submit e comunicazioni tutti a zero.

Checkpoint sequencer SHA-256 `9d015f5f5e50784a3ef66f05cba82522a0f9b824b987f160397ac92e5c2d3832`; report aggregato SHA-256 `8e9e25adcbcd0a8f6f991c6721c93b6bc4bba6531d9cbfacb8ac92a45ffbbaa6`.

## Azione richiesta

Serve autorizzazione esplicita per una correzione generale distinta: il gate di preparazione deve riconoscere `recovery_queued` soltanto quando esistono bozza, pagina, prova server `not_saved`, evidence ID di autorizzazione e budget di recupero residuo esattamente pari a uno. La correzione deve avere test positivo, test negativo fail-closed, registro/matrice, gate monotono e nuovo bundle prima di riprendere nuovamente dal caso 29.
# Risoluzione r28

La causa generale era nel gate `prepare()` del sequencer: prima del bootstrap del worker riconosceva `queued`, alcuni `operator_intervention`, `filling` e `saved`, ma non lo stato persistente `recovery_queued`. Per Lia il checkpoint era invece valido e completo: `persisted_fields_get=not_saved` sulla stessa bozza `453823`, evidence ID `cdp-server-11-361135f1f9a8235e5764`, primo tentativo pari a uno e contatore recuperi pari a zero. Il sequencer rimaneva quindi in `preflight_wait` senza poter avviare il worker che avrebbe reclamato il recupero.

La regola generale `system-sequencer-recovery-queued-server-proof-v1` ammette ora lo stato soltanto quando tutte le condizioni concordano: esecuzione `ready`, una sola prova server `not_saved` sulla stessa bozza, evidence ID persistito, una sola pagina autorizzata, primo Salva già tentato e budget residuo esattamente pari a uno. Qualunque variante incompleta produce un errore tecnico fail-closed prima del bootstrap.

Gate integrale: 416/416 suite e 1593/1593 test; 90/90 regole provate. Registro `enea-operational-registry-v102`, matrice `apr-enea-rule-test-matrix-v80`. Bundle installato `064100d8-recovery-queued-gate-r28-20260902`; stato monotono finale `active_tested_deployed`.
