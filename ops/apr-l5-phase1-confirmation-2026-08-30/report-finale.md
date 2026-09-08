# APR L5 — Fase 1, conferma 30 × 3

Data di chiusura: 30 agosto 2026

## Esito sintetico

- Confronto artefatti persistenti: **24/30 pratiche identiche nei tre giri** e **6/30 non ripetibili**.
- Giri terminali: giro 1 `5 saved / 25 operator_required`; giro 2 `6 / 24`; giro 3 `7 / 23`.
- Ogni giro ha elaborato 30/30 pratiche, con `technicalBlock=0`, `remaining=0`.
- Sicurezza: in tutti i giri `previewAttempted=false`, `submitAttempted=false`, `communicationsAttempted=false`.
- Il confronto considera identici stato, pagine completate/attese e causa persistita; ignora volutamente coorte e `draftId`, diversi per esecuzione.
- **Stato della tripla verifica finale: `INCONSISTENT` sul piano dashboard/API.** LaunchAgent/processo, report/checkpoint e journal concordano sulla conclusione, ma dopo la quiescenza dei servizi di coorte `/api/status` e `/api/case-truth` non erano più raggiungibili. I numeri 24/30 e 6/30 sono quindi verificati come confronto degli artefatti persistenti, non come verità finale indipendentemente riconfermata dalla dashboard.

## Identità del freeze

- Source snapshot: `/private/tmp/apr-promote-4e166ce`
- Commit: `e200ebd4a8979f15c8ea3c5fc31eaea5d4f1c088`
- Manifest SHA-256: `6c684df774a48899a6ff4e2a6e52dfe83c2b9c357a81a6c6c52034abe687a953`
- Sequencer SHA-256: `528a9e6964e9067ffa5ac9a809260bd3b91a0a2fd433d7c0c843b0efb6f55286`
- Bundle canonico: `c66cc0f6f25bea5270b6a619aed50aa7b6aa2e705e29a624d4c997b710b4fa69-l5-structural-4e166ce`
- Gli hash e il commit sono stati riverificati dopo il terzo giro e coincidono con il freeze.

## Confronto pratica per pratica

Legenda persistenza: `saved x/x` = bozza completa salvata; `operator_required x/y` = esecuzione isolata con richiesta operatore persistita, con `x` pagine completate su `y`; `0/0` = fermata nel preflight prima della creazione/compilazione della bozza.

| Pratica | Giro 1 | Giro 2 | Giro 3 | Ripetibile | Causa/persistenza |
|---|---:|---:|---:|:---:|---|
| Barbara Melis | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Cesare Imperiali | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Mara Elena Maddiotto | operator_required 0/16 | saved 16/16 | saved 16/16 | **No** | Giro 1: `apr_cdp_enea_create_result_not_identifiable`; giri 2–3: bozza completa persistita. |
| Claudio Beghini | saved 8/8 | saved 8/8 | operator_required 1/8 | **No** | Giro 3: `apr_cdp_protocol_error:-32000:Promise was collected`; giri 1–2 completi. |
| Besenval Fortunato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Kitenge Ebambi | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Vera Buracchi | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 3 impedimenti per-pratica; richiesta operatore persistita. |
| Sabrina Eustomi | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Luca Callegari | saved 11/11 | saved 11/11 | saved 11/11 | Sì | Bozza completa salvata e persistita in tutti i giri; nessuna causa negativa. |
| Eugenio Codognato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Gabriella Bruno | saved 8/8 | saved 8/8 | saved 8/8 | Sì | Bozza completa salvata e persistita in tutti i giri; nessuna causa negativa. |
| Milena Albertoni | operator_required 5/8 | operator_required 5/8 | operator_required 5/8 | Sì | Esito incerto dopo `Salva` screening 1; nessun retry automatico. |
| Milena Fiorini | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 1 impedimento per-pratica; richiesta operatore persistita. |
| Lucia Lagrasta | operator_required 5/11 | operator_required 5/11 | operator_required 5/11 | Sì | Esito incerto dopo `Salva` screening 2; nessun retry automatico. |
| Giovanni Pescatori | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 3 impedimenti per-pratica; richiesta operatore persistita. |
| Daniela Guidotti | operator_required 1/8 | saved 8/8 | saved 8/8 | **No** | Giro 1: timeout `Runtime.evaluate`; giri 2–3 completi. |
| Zeno Righetti | operator_required 5/19 | operator_required 5/19 | operator_required 5/19 | Sì | Esito incerto dopo `Salva` screening 1; nessun retry automatico. |
| Luca Cigognetti | saved 14/14 | operator_required 3/14 | saved 14/14 | **No** | Giro 2: pagina annidata “Generatore dell’impianto termico” non persistita dopo il salvataggio esterno. |
| Cristina Ricchi | operator_required 5/10 | operator_required 5/10 | operator_required 5/10 | Sì | Esito incerto dopo `Salva` screening 1; nessun retry automatico. |
| Emanuela Parolo | saved 8/8 | operator_required 3/8 | saved 8/8 | **No** | Giro 2: pagina annidata “Generatore dell’impianto termico” non persistita dopo il salvataggio esterno. |
| Roberto Marcello | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Flavia Cipriani | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Mario Donnarumma | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 3 impedimenti per-pratica; richiesta operatore persistita. |
| Marco Colombo | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Danila Serpa | operator_required 0/8 | operator_required 0/8 | operator_required 0/8 | Sì | Verifica campo fallita: `id-comune_nascita`; richiesta operatore persistita. |
| Amelia Lerose | operator_required 5/10 | operator_required 5/10 | operator_required 5/10 | Sì | Esito incerto dopo `Salva` screening 2; nessun retry automatico. |
| Caterina Claudia Garbato | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 4 impedimenti per-pratica; richiesta operatore persistita. |
| Eleonora Meggiarin | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 2 impedimenti per-pratica; richiesta operatore persistita. |
| Armando Ranzoni | operator_required 3/10 | saved 10/10 | saved 10/10 | **No** | Giro 1: pagina annidata “Generatore dell’impianto termico” non persistita dopo il salvataggio esterno; giri 2–3 completi. |
| Francesco Fumagalli | operator_required 0/0 | operator_required 0/0 | operator_required 0/0 | Sì | Preflight: 1 impedimento per-pratica; richiesta operatore persistita. |

## Analisi obbligatoria dei casi indicati

- **Mara Elena Maddiotto — non ripetibile.** Il primo giro non identifica in modo sicuro il risultato della creazione e persiste `operator_required 0/16`; i due giri seguenti persistono entrambi `saved 16/16`. Il miglioramento si ripete due volte, ma la terna non è identica e il sintomo del giro 1 non è stato riprodotto.
- **Claudio Beghini — non ripetibile.** I primi due giri persistono `saved 8/8`; il terzo si ferma a `operator_required 1/8` per `Promise was collected`. È una regressione episodica del terzo giro e impedisce di considerare confermata la stabilità.
- **Luca Callegari — ripetibile.** Tre volte `saved 11/11`, senza causa negativa persistita: nessun problema negli artefatti di esecuzione.
- **Gabriella Bruno — ripetibile.** Tre volte `saved 8/8`, senza causa negativa persistita: nessun problema negli artefatti di esecuzione.
- **Luca Cigognetti — non ripetibile.** `saved 14/14`, poi `operator_required 3/14` per mancata persistenza della pagina annidata, quindi ancora `saved 14/14`. Il sintomo strutturale non è deterministico nella terna.
- **Cristina Ricchi — ripetibile.** Tre volte `operator_required 5/10` con la stessa causa: esito incerto dopo `Salva` screening 1 e nessun retry automatico. La richiesta operatore è coerentemente persistita; non è una bozza completa.

## Verifiche e limiti

1. **Processo/launchd:** il sequencer del giro 3 ha terminato con codice 0; il servizio non risulta più caricato e non restano servizi delle coorti 660–689.
2. **Persistenza:** `report.json` e `checkpoint.json` sono `completed`, riportano 30 risultati; il journal termina con `run_completed` e `resultCount=30`.
3. **Dashboard/API:** gli endpoint delle coorti terminali non sono raggiungibili dopo la quiescenza. Durante l’esecuzione l’API mostrava inoltre il runner come non avviato anche quando worker e sequencer avanzavano. Questa fonte non concorda/risulta indisponibile, quindi la tripla verifica di disponibilità operativa non può essere dichiarata superata.

Categoria di verifica: sono conclusi i **test operativi sul portale ENEA TEST limitati a creazione, compilazione e salvataggio di bozze**. Non sono stati eseguiti preview, submit, protocollazione, ricevute, email o comunicazioni. Questo report non attesta disponibilità in produzione.

## Conclusione

La baseline non supera il criterio di identità 30/30: **24/30 identiche e 6/30 non ripetibili**. Le sei non ripetibili sono Mara Elena Maddiotto, Claudio Beghini, Daniela Guidotti, Luca Cigognetti, Emanuela Parolo e Armando Ranzoni. La diagnosi di stabilità complessiva resta quindi non confermata; inoltre l’incoerenza di osservabilità dashboard/API deve essere corretta prima di una diagnosi finale di verità-caso basata sulla tripla fonte.
