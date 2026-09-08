# Test mirato APR — Da inserire su Excel + quattro Pronte da fare

Data: 6 settembre 2026

## Verdetto

Il lotto persistente ha terminalizzato tutti i 12 casi, ma **nessuna pratica è arrivata all'elaborazione ENEA** e nessuna bozza è stata creata. L'esecuzione non costituisce quindi un collaudo funzionale delle pratiche: il sistema ha chiuso fail-closed per due difetti tecnici preliminari comuni.

- Totale selezionato: 12
- Bozze complete: 0
- `OPERATOR_REQUIRED`: 0
- `TECHNICAL_BLOCK`: 12
- `INCONSISTENT`: 0
- Anteprima, invio e comunicazioni: mai tentati

La selezione CRM autenticata e solo GET ha trovato esattamente 8 pratiche nella fase **Da inserire su Excel** e i quattro nominativi richiesti nella fase **Pronte da fare**. Il manifest congelato ha SHA-256 `0d46008ad03b39c4be75b97e2f2b4580889c41e8e9dede0f79bc85cba4aca711`. Il worker r69 realmente referenziato ha SHA-256 `dcb708e6ba7bf4a54f6f4a0d864374ed26de032a34477e8e95923200974ef9cb`.

## Da inserire su Excel

Tutte e otto le pratiche sono state respinte prima dell'acquisizione documentale dal seed della coorte. Causa esatta comune: `apr_cohort_seed_practice_scope_invalid`. Il contratto operativo corrente accetta come `expectedStageType` soltanto `archiviate`, `recensione` e `pronte_da_fare`; la fase CRM reale di questi casi è `gestionale` / “Da inserire su Excel”. Non è un problema dei dati delle singole pratiche.

| Pratica | Esito | Causa esatta |
|---|---|---|
| Giovanni Pietro Sanvito | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Antonio Sacco | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Tanbir Awal | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Donata Zangrossi | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Chiara Chierichetti | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Francesca Scalia | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Massimo Cotta | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |
| Daniele Buoncompagni | `TECHNICAL_BLOCK` | `apr_cohort_seed_practice_scope_invalid`: stage `gestionale` non ammesso dal seed operativo |

`operatorQuestion`: “Autorizzi l'estensione generale e fail-closed del seed APR alla fase CRM `gestionale` / ‘Da inserire su Excel’, mantenendo invariati i controlli su identità pratica, stage effettivo e sola bozza?”

## Pronte da fare — quattro nominativi richiesti

Tutti e quattro i casi hanno superato la selezione, ma il sequencer li ha fermati prima dell'avvio del worker. Causa esatta comune: `apr_governed_bundle_set_incomplete:apr-rule-governance-attestation.json`. Il bundle r69 installato contiene i tre eseguibili, ma non il sidecar obbligatorio `apr-rule-governance-attestation.json`; la ricevuta d'installazione r69 conferma esplicitamente `governanceAttestationStatus: not_performed`. Non è un problema dei dati delle singole pratiche.

| Pratica | Esito | Causa esatta |
|---|---|---|
| Luca Dragotta | `TECHNICAL_BLOCK` | Bundle r69 privo di `apr-rule-governance-attestation.json` |
| Lidia Marchisio | `TECHNICAL_BLOCK` | Bundle r69 privo di `apr-rule-governance-attestation.json` |
| Massimo Grimaldi | `TECHNICAL_BLOCK` | Bundle r69 privo di `apr-rule-governance-attestation.json` |
| Aldo Gebbia | `TECHNICAL_BLOCK` | Bundle r69 privo di `apr-rule-governance-attestation.json` |

`operatorQuestion`: “Autorizzi la costruzione e il gate completo di un bundle governato successivo a r69, con sidecar valido e hash dei tre eseguibili, prima di ripetere gli stessi quattro casi?”

## Verifiche

Le conclusioni concordano tra:

1. report terminale persistente del lotto;
2. checkpoint e journal append-only del lotto, con 12 eventi `case_terminalized` coerenti;
3. log terminali dei dodici sequencer: i primi otto mostrano il rifiuto nel validatore del seed, gli ultimi quattro il rifiuto dell'insieme bundle governato.

Il LaunchAgent del lotto è terminato con exit code 0 dopo aver isolato ogni caso e aver proseguito fino al dodicesimo. Keepalive e Chrome APR sono rimasti vivi. La scansione dei log non mostra tentativi di anteprima, submit, protocollazione, ricevute o comunicazioni.

Percorso degli artefatti persistenti: `/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs/apr-targeted-excel-ready-r70-20260906`.
