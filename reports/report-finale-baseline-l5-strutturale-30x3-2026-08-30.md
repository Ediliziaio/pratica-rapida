# Report finale baseline L5 strutturale 30 × 3 — 30 agosto 2026

## Verdetto

**Baseline NON stabile.** Lo stesso corpus di 30 pratiche, con lo stesso manifest, lo stesso sequencer, lo stesso bundle e nessuna modifica tra i giri, ha prodotto un esito diverso per **6 pratiche su 30**. Il criterio concordato richiedeva zero differenze: il gate operativo L5 non è quindi superato.

- Pratiche con esito semanticamente identico nei tre giri: **24/30**.
- Pratiche con almeno una variazione di stato, pagine o causa: **6/30**.
- Completate: giro 1 **7/30**, giro 2 **5/30**, giro 3 **4/30**.
- Richiesto intervento operatore: giro 1 **23/30**, giro 2 **25/30**, giro 3 **26/30**.
- Technical block persistiti nei report di giro: **0** in tutti e tre i giri.
- Anteprima, invio e comunicazioni: **mai tentati** in tutti e tre i giri.

## Le sei variazioni che invalidano la baseline

1. **Mara Elena Maddiotto** — giro 1 completa 16/16; giro 2 ferma 3/16 perché il Generatore non risulta persistito dopo Salva; giro 3 ferma 1/16 per errore CDP “Promise was collected”.
2. **Claudio Beghini** — giri 1 e 2 completi 8/8; giro 3 fermo 0/8 per errore CDP “Promise was collected”.
3. **Luca Callegari** — giro 1 fermo 5/11 per verifica campi ENEA fallita; giro 2 completo 11/11; giro 3 fermo 1/11 per timeout CDP `Runtime.evaluate`.
4. **Gabriella Bruno** — giro 1 completa 8/8; giro 2 ferma 3/8 e giro 3 ferma 2/8, entrambi per timeout CDP `Runtime.evaluate`.
5. **Luca Cigognetti** — giri 1 e 3 completi 14/14; giro 2 fermo prima della compilazione perché il gate di riconciliazione Infissi non risultava pronto.
6. **Cristina Ricchi** — giri 1 e 2 ferme 5/10 per salvataggio screening non confermato; giro 3 ferma 3/10 perché il Generatore non risulta persistito dopo Salva.

**Zeno Righetti**, canary obbligatorio, è invece rimasto identico nei tre giri: 5/19, salvataggio screening non confermato.

## Blocco comune non previsto tra giro 2 e giro 3

Si è verificato un blocco operativo comune non attribuibile a una pratica:

- ultima verifica autenticata: **15:03:17Z**;
- worker del giro 2 spento: **15:03:21Z**;
- giro 2 concluso: **15:03:49Z**;
- giro 3 avviato: **15:12:49Z**;
- `login_required` rilevato: **15:14:30Z**.

La causa provata è una finestra di circa **11 minuti senza keepalive ENEA**: l'isolamento spegne correttamente tutte le coorti, ma durante l'attesa del successivo heartbeat non esiste un custode ENEA indipendente. La sessione è quindi scaduta nella transizione. **Non era un blocco della pratica Mara Elena Maddiotto.** Dopo il nuovo accesso SPID dell'operatore il giro 3 è ripreso.

Impatto: il difetto rende la transizione tra giri non autonoma e costituisce da solo un problema strutturale L5. Non spiega però tutte le sei differenze per-pratica: il giro 3 ha completato tutte le 30 pratiche dopo la ri-autenticazione e ha comunque prodotto esiti differenti.

## Matrice completa delle 30 pratiche

| Pratica | Giro 1 | Giro 2 | Giro 3 | Identica |
|---|---|---|---|---|
| Barbara Melis | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Cesare Imperiali | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Mara Elena Maddiotto | **Completa 16/16** | Operatore — Generatore non persistito, 3/16 | Operatore — CDP Promise collected, 1/16 | **No** |
| Claudio Beghini | **Completa 8/8** | **Completa 8/8** | Operatore — CDP Promise collected, 0/8 | **No** |
| Besenval Fortunato | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Kitenge Ebambi | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Vera Buracchi | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Sì |
| Sabrina Eustomi | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Luca Callegari | Operatore — verifica campi ENEA, 5/11 | **Completa 11/11** | Operatore — timeout CDP, 1/11 | **No** |
| Eugenio Codognato | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Gabriella Bruno | **Completa 8/8** | Operatore — timeout CDP, 3/8 | Operatore — timeout CDP, 2/8 | **No** |
| Milena Albertoni | Operatore — Salva non confermato, 5/8 | Operatore — Salva non confermato, 5/8 | Operatore — Salva non confermato, 5/8 | Sì |
| Milena Fiorini | Operatore — preflight, 1 blocker | Operatore — preflight, 1 blocker | Operatore — preflight, 1 blocker | Sì |
| Lucia Lagrasta | Operatore — Salva non confermato, 5/11 | Operatore — Salva non confermato, 5/11 | Operatore — Salva non confermato, 5/11 | Sì |
| Giovanni Pescatori | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Sì |
| Daniela Guidotti | **Completa 8/8** | **Completa 8/8** | **Completa 8/8** | Sì |
| Zeno Righetti | Operatore — Salva non confermato, 5/19 | Operatore — Salva non confermato, 5/19 | Operatore — Salva non confermato, 5/19 | Sì |
| Luca Cigognetti | **Completa 14/14** | Operatore — gate Infissi non pronto, 0/0 | **Completa 14/14** | **No** |
| Cristina Ricchi | Operatore — Salva non confermato, 5/10 | Operatore — Salva non confermato, 5/10 | Operatore — Generatore non persistito, 3/10 | **No** |
| Emanuela Parolo | **Completa 8/8** | **Completa 8/8** | **Completa 8/8** | Sì |
| Roberto Marcello | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Flavia Cipriani | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Mario Donnarumma | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Operatore — preflight, 3 blocker | Sì |
| Marco Colombo | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Danila Serpa | Operatore — verifica comune di nascita, 0/8 | Operatore — verifica comune di nascita, 0/8 | Operatore — verifica comune di nascita, 0/8 | Sì |
| Amelia Lerose | Operatore — Salva non confermato, 5/10 | Operatore — Salva non confermato, 5/10 | Operatore — Salva non confermato, 5/10 | Sì |
| Caterina Claudia Garbato | Operatore — preflight, 4 blocker | Operatore — preflight, 4 blocker | Operatore — preflight, 4 blocker | Sì |
| Eleonora Meggiarin | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Operatore — preflight, 2 blocker | Sì |
| Armando Ranzoni | **Completa 10/10** | **Completa 10/10** | **Completa 10/10** | Sì |
| Francesco Fumagalli | Operatore — preflight, 1 blocker | Operatore — preflight, 1 blocker | Operatore — preflight, 1 blocker | Sì |

## Prove di immutabilità e conclusione

- Manifest: SHA-256 `6c684df774a48899a6ff4e2a6e52dfe83c2b9c357a81a6c6c52034abe687a953`, verificato nuovamente a fine test.
- Sequencer: SHA-256 `528a9e6964e9067ffa5ac9a809260bd3b91a0a2fd433d7c0c843b0efb6f55286`, verificato nuovamente a fine test.
- Source snapshot: commit `e200ebd4a8979f15c8ea3c5fc31eaea5d4f1c088`.
- Bundle canonico: `c66cc0f6f25bea5270b6a619aed50aa7b6aa2e705e29a624d4c997b710b4fa69-l5-structural-4e166ce`, ricevuta PASS.
- Ogni report persistente dichiara `status=completed`, `processed=30`, `remaining=0`.
- I tre journal terminano con `previous_cohorts_quiescent` e `run_completed`.
- Dopo lo spegnimento del sequencer concluso non risultano coorti canary attive; resta soltanto `com.praticarapida.enea-shadow-supervisor`.

Conclusione operativa: le correzioni strutturali hanno eliminato la sovrapposizione di coorti e garantito la quiescenza a fine giro, ma **non hanno ancora reso deterministico il livello browser/ENEA**. Nessun nuovo test su pratiche deve essere considerato una baseline stabile sulla base di questi risultati.
