# APR — Fase 0: inventario e congelamento

Data di rilevazione: `2026-08-27T09:01:37Z` (`2026-08-27T11:01:37+02:00`)

Ambito: sola lettura di repository e stato persistente locale. Nessun accesso o modifica a CRM, ENEA o browser. Nessun servizio avviato, arrestato o riavviato. Nessun test operativo eseguito.

## 1. Sorgente Git congelata

- Repository: `/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida`
- Branch: `codex/apr-monotonic-gate`
- Commit HEAD: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`
- Tree HEAD: `52e05ecb7cb69b6bed2c68195e69192ceb87636e`
- Ultimo commit: `feat(apr): resolve verified municipality name changes`
- Data commit: `2026-08-27T01:25:39+02:00`

Il commit è congelato come riferimento immutabile. Il working tree non è pulito: le modifiche preesistenti sono censite e non sono state alterate.

## 2. Working tree preesistente: classificazione

Fingerprint aggregato dei nove elementi preesistenti, calcolato sulle righe ordinate `SHA-256 + percorso`: `d2502a61bf51cc8ac41393618b432c7bf6e045ef5d26c7cd215747069bb275bf`.

| Percorso | Stato Git | SHA-256 | Classificazione Fase 0 | Decisione |
|---|---|---|---|---|
| `AGENTS.md` | modificato, +7 righe | `1cd6b6a5e4df662870ce0393f7f9fe07dc4b9dd5f5a3718595e2b60da714c844` | `STABLE_CANDIDATE_PENDING_REVIEW` — regola autorizzazioni ENEA coerente con gli accordi, ma non committata | preservare; nessun commit automatico |
| `docs/APR_FIXED_CORPUS_BLOCK_01_2026-08-25.json` | non tracciato | `d464356533b074ab3dec3119a40893ba1244d5763a70d26c4420be5cd4a1b67a` | `STABLE_EVIDENCE_CANDIDATE` — corpus fisso di 10 identità e 4 esclusioni | preservare; revisione prima del commit |
| `docs/APR_FIXED_CORPUS_BLOCK_01_OPERATIONAL_MANIFEST_2026-08-25.json` | non tracciato | `1956cca2dcbcacfee07ac5c778b33a05940ca672b93baee7efd3c141c7e76c4f` | `STABLE_EVIDENCE_CANDIDATE` — manifest operativo storico autorizzato, 10 candidati | preservare; revisione prima del commit |
| `docs/APR_FIXED_CORPUS_BLOCK_01_RESULTS_2026-08-25.md` | non tracciato | `f146719aac228be7b5306bb0f5d6bf94dfea7566d6ea9f590596ed3412f86af3` | `STABLE_EVIDENCE_CANDIDATE` — esiti replay locale, non test ENEA | preservare; revisione prima del commit |
| `docs/claude/apr-review-aa77f5d-slice6-completo.md` | non tracciato | `58885938f1e7a675599d0274321e9257685e01527f0a62611ebc50f76038b2e4` | `ARCHIVAL_REVIEW_CANDIDATE` — pacchetto storico di revisione, non sorgente runtime | preservare; valutare archivio documentale |
| `docs/claude/apr-review-recovery-slice6-completo.md` | non tracciato | `90dd77e11ba18987ada528159b69fc7b66de1780f1aab50d4f5a9f8cc07b2be3` | `ARCHIVAL_REVIEW_CANDIDATE` — pacchetto storico di revisione, non sorgente runtime | preservare; valutare archivio documentale |
| `docs/claude/apr-slice6-review-completo-con-diff.md` | non tracciato | `a2f806f4c9de5cf9112480d46cad47edc9bf0f8b4933d3f6fc31ec34c527e9b2` | `ARCHIVAL_REVIEW_CANDIDATE` — pacchetto storico di revisione, non sorgente runtime | preservare; valutare archivio documentale |
| `docs/diagnostics/apr-wide-current-code-replay-2026-08-26.json` | non tracciato | `a2d7b078c3cfd400165d0661ee145ca68777d6a0493b9fb47baf9e28128d342e` | `WIP_DIAGNOSTIC_EVIDENCE` — replay di 126 casi su commit precedente all'HEAD corrente | preservare; non usarlo come verità dell'HEAD attuale |
| `docs/diagnostics/report-riverifica-manifest-etichette-2026-08-26.md` | non tracciato | `2a04ee38536b42865d0da83f21333e9405c34c8b0607ab963824b2499d9c9271` | `WIP_DIAGNOSTIC_EVIDENCE` — descrive regressioni e richiede consolidamento | preservare; non dichiarare certificato |

La classificazione non promuove né elimina alcun file. `STABLE_*_CANDIDATE` significa soltanto candidato alla revisione; non equivale a codice o documentazione stabile già committata.

## 3. Corpus e manifest censiti

### Corpus fisso nel repository

- ID: `apr-fixed-corpus-block-01`
- Versione: `apr-fixed-growing-corpus-v1`
- Congelato il: `2026-08-25T10:00:00+02:00`
- Candidati: 10
- Esclusioni esplicite registrate nel corpus: 4
- Manifest operativo: `apr-cohort-seed-v1`, 10 candidati
- Autorizzazione storica registrata: `user-fixed-corpus-operational-retest-2026-08-25`

### Replay ampio locale

- Schema: `apr-wide-current-code-replay-v1`
- Casi: 126
- Generato: `2026-08-26T15:31:38.472Z`
- Revisione codice del replay: `d89ed7613b6b10c28741116e94363599439d7d45`
- HEAD Fase 0: `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`
- Esito storico del replay: 38 READY, 88 bloccati, 6 miglioramenti, 12 regressioni READY→bloccato, 63 set di blocker cambiati.

Il replay ampio non è una baseline corrente riproducibile dell'HEAD, perché è stato prodotto su una revisione precedente. Resta prova diagnostica storica, non certificazione della versione attuale.

## 4. Stato persistente locale censito

Root: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts`

- Directory di coorte: 76
- File `checkpoint.json`: 1.501
- Artefatti nominati come prove: 40
  - `server-readonly-proof.json`: 25
  - `rule-test-evidence.json`: 15
- Fingerprint aggregato dei checkpoint/prove chiave delle coorti 69–76: `6dc5c4bb4108f2dc43bbe92834ef580ff83cd07e7f4889b6a0283c4bc99458ce`

Coorti recenti rilevanti:

| Coorte | Checkpoint | Prova server nominata | Osservazione |
|---|---:|---:|---|
| 69 — fixed corpus operational | 37 | sì | corpus fisso operativo storico |
| 70 — fixed corpus repeat approved | 38 | sì | repeat autorizzato |
| 71 — generator retry | 39 | sì | correzione retry generatore |
| 72 — after operator unlock | 39 | sì | percorso sblocco operatore |
| 73 — wide operational A | 38 | sì | primo lotto del test ampio |
| 74 — wide operational B | 38 | sì | secondo lotto del test ampio |
| 75 — operator 18 after fixes | 38 | sì | checkpoint worker in `technical_block` al censimento |
| 76 — balanced 10 | 36 | no | draft execution in `blocked_preflight`; nessuna prova server nominata |

La presenza di un file chiamato “prova server” viene censita, ma non certifica automaticamente il contenuto o la completezza pratica per pratica. Tale verifica appartiene alle fasi successive.

## 5. Bundle e servizi

Non esiste un singolo puntatore globale identificato come bundle APR corrente. Le coorti recenti possiedono installazioni separate.

Hash bundle coorti 75 e 76, identici fra loro:

- supervisor: `ba6fa4897762ab727560c616b0c86c1806701462e626c51709b458611a1cda72`
- worker: `908791c85f446636cae9b9172eb12728f5b5d78c38f30d0d183061de73077107`
- watchdog: `f2c5e9f7d75abd88454b9e18dd2e778141b4423e69612c9fec4b9339174d3663`

Verifica processi, senza mutazioni:

1. `launchctl list` non ha restituito etichette `com.praticarapida.apr*`.
2. Nessuna porta 4498, 4499, 4500 o 4501 risultava in ascolto tramite `lsof`.
3. L'enumerazione processi tramite `pgrep` non è disponibile nel sandbox (`Cannot get process list`).

Conclusione ammessa: nessun servizio è visibile con i primi due metodi; lo stato processi non è certificato con tre fonti e resta `NOT_CERTIFIED`. Non sono stati caricati o scaricati LaunchAgent.

## 6. Stato test automatici/locali

- `npm run typecheck:enea-runner`: PASS.
- Test mirati a corpus, gate monotono, verità caso e matrice regole: 4 file PASS, 38/38 test PASS.
- `npm test -- --maxWorkers=1`: avviato, nessun avanzamento visibile per circa quattro minuti, interrotto in modo controllato; esito `NOT_COMPLETED`, non verde.
- Test operativi CRM/ENEA/browser in Fase 0: NON ESEGUITI per mandato.
- Disponibilità in produzione: NON CERTIFICATA.

## 7. Valutazione del gate Fase 0

Stato: `ARTIFACT_PRODUCED_GATE_NOT_GREEN`.

Motivi:

1. Il working tree contiene nove elementi preesistenti ancora da revisionare e consolidare.
2. Il replay ampio di 126 casi è riferito a un commit precedente all'HEAD congelato.
3. La suite completa locale non ha prodotto un esito conclusivo.
4. Non è identificato un unico bundle installato canonico; esistono installazioni per coorte.
5. Lo stato processi non dispone di tre verifiche concordanti.

La Fase 1 non deve iniziare prima della revisione esplicita di questo artefatto e della decisione sui cinque punti aperti. Nessuna delle condizioni sopra autorizza azioni su CRM o ENEA.
