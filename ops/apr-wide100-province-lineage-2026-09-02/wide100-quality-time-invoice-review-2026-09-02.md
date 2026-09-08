# Revisione dati wide100: qualità, tempi e casi fatture

Data: 2026-09-02  
Ambito: 24 bozze ENEA TEST salvate da APR, confronto read-only con le pratiche storiche concluse dall'operatore nel CRM. Nessuna correzione, regola o installazione applicata.

## Riscontro triplo

1. Il report finale del sequencer registra 100/100 casi terminali: 24 `saved`, 73 `operator_required`, 3 `technical_block`, 0 `INCONSISTENT`.
2. Per ognuna delle 24 pratiche, `enea-draft-execution/checkpoint.json` registra `saved`; il benchmark storico separato registra `completed/compared` e non alimenta il mapper APR.
3. Gli snapshot dashboard dei 24 casi sono `IDLE` a coda conclusa. Per tutti i 17 casi economici elencati sotto, il checkpoint preflight è `blocked_case`, `report.blockers` contiene il blocker economico coerente e lo snapshot dashboard è `OPERATOR_REQUIRED`.

## Sintesi qualità

- Campi comuni/prodotto confrontati: **1.194**.
- Identici: **1.110 (92,96%)**.
- Differenze: **84 (7,04%)**; 8 pratiche non hanno alcuna differenza nei campi coperti dal comparatore standard.
- Non emerge un errore APR certo nei 24 casi. Le differenze verificabili sono soprattutto maggiore precisione delle misure, dati espliciti delle fatture correnti o normalizzazioni. Tre casi restano da leggere con cautela perché il razionale storico non è disponibile: Lea Dettori (data), Armando Ranzoni ed Elena Depalma (caratteristiche dei vecchi infissi).
- Per le 17 schermature, il PDF umano riporta sempre **311 kWh/anno**, indipendentemente dalla superficie. APR applica invece la formula corrente documentata `superficie totale × 16,8`, producendo valori diversi e proporzionali: il dato APR è più coerente con le fonti correnti.
- Per i 7 casi infissi, il valore di risparmio è calcolato dal portale; la prova server finale non ne ha persistito il numero. Il confronto numerico dell'energia non è quindi attribuibile in modo verificato.

## Confronto pratica per pratica

| Coorte | Pratica | Campi comuni/prodotto | Risparmio energetico | Valutazione |
|---:|---|---|---|---|
| 2923 | Lucia Droghetti | 35/35 identici | APR 96,77 vs umano 311 kWh/a | Campi identici; energia APR più coerente con la superficie. |
| 2940 | Gregorio Fusco | 80/82; due superfici 1,5 APR vs 1,4 umano | Infissi: numero APR non persistito | APR più accurato: 0,93×1,591=1,47963, arrotondato a 1,5. |
| 2944 | Andrea Trabucco | 37/37 identici | Infissi: numero APR non persistito | Nessuna differenza nei campi confrontabili; energia non attribuibile. |
| 2947 | Luca Cigognetti | 85/90; cognome `Cigognetti` vs `cicognetti`; quattro superfici 2,4 vs 2,5 | Infissi: numero APR non persistito | APR più accurato: CRM corrente conferma il cognome; 1,56×1,56=2,4336 → 2,4. |
| 2949 | Lia Chiericati | 33/34; materiale Tessuto vs Metallo | APR 201,60 vs umano 311 | APR più accurato: fattura corrente esplicita `Tessuto`; energia proporzionale alla superficie. |
| 2952 | Monica Molteni | 43/43 identici | APR 282,24 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 2955 | Claudia Campagna | 34/35; `Tenda o veneziana` vs `Altra schermatura solare` | APR 98,28 vs umano 311 | APR più accurato: descrizione prodotto `Tenda a bracci estensibili`. |
| 2958 | Fabio Sartori | 27/27 identici | APR 100,46 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 2960 | Armando Ranzoni | 29/38; vecchi infissi metallo/doppio/U=6 vs legno/singolo/U=5; 3 righe APR vs 2 umane | Infissi: numero APR non persistito | APR supportato dal dossier corrente (metallo, doppio vetro e tre righe 1,39×1,60); il metodo storico non è recuperabile, quindi non si attribuisce un errore certo. |
| 2961 | Monica Ambra Fioravanti | 39/42; due materiali Misto vs Tessuto; comune solo normalizzato | APR 403,20 vs umano 311 | APR più accurato: fattura corrente esplicita `Misto`; energia proporzionale alla superficie. |
| 2963 | Adelfio Pietro Spinelli | 35/35 identici | APR 226,80 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 2968 | Lea Dettori | 34/35; inizio lavori 23/05/2026 vs 03/02/2026 | APR 158,76 vs umano 311 | APR segue entrambe le fatture correnti del 23/05/2026; senza fonte storica della data umana, differenza non attribuibile con certezza. |
| 2977 | Fares Hassairi | 50/51; luogo nascita `Sfax` vs `EE, Tunisia` | APR 213,53 vs umano 311 | Normalizzazione semantica, nessun errore sostanziale; energia APR più coerente. |
| 2980 | Lucia Lagrasta | 45/59; esposizione Ovest vs Sud; superfici 1,6512/1,5890/2,4648 vs 1,6/1,5/2,4; Tessuto vs Misto; Automatico vs Manuale | APR 247,04 vs umano 311 | APR più accurato: fatture correnti sostengono materiale, movimento e misure esatte; modulo corrente sostiene Ovest. |
| 2981 | Angelina Stricelli | 43/63; vecchi infissi doppio/U=3 vs singolo/U=5; sei superfici diverse | Infissi: numero APR non persistito | APR più accurato: modulo corrente esplicita legno/doppio; le aree APR coincidono con i prodotti esatti, incluso 2,615×1,9=4,9685 → 5,0. |
| 2984 | Milena Albertoni | 32/35; Tenda vs Altra; 5,817 vs 5,8 m²; SW vs S | APR 97,73 vs umano 311 | APR più accurato: descrizione `Tenda da sole`, 2,77×2,10=5,817 e fonte corrente SW. |
| 2985 | Cataldo Cassone | 32/35; 3,822 vs 3,8 m²; civico solo normalizzato | APR 64,21 vs umano 311 | APR più preciso sulla misura; nessun errore sostanziale sul civico. |
| 2987 | Romeo Ropa | 33/35; nascita 12/11/1941 vs 21/11/1941; luogo solo normalizzato | APR 120,46 vs umano 311 | Il modulo cliente corrente sostiene 12/11; probabile trasposizione storica, quindi APR meglio supportato. |
| 2993 | Elena Depalma | 66/73; U vecchio 6 vs 4,1 su 5 righe; aree 1,8/0,9 invertite nell'ordine storico | Infissi: numero APR non persistito | Le aree hanno lo stesso insieme e APR segue le dimensioni esatte; U=6 è sostenuto dalla regola/dossier corrente metallo+doppio. Metodo storico non disponibile: non si attribuisce un errore certo. |
| 2994 | Mauro Ballabio | 51/51 identici | APR 227,53 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 2998 | Flavia Cipriani | 79/82; superfici 1,8/2,8/1,6 vs 1,7/2,7/1,5 | Infissi: numero APR non persistito | APR più accurato: prodotti esatti 1,752→1,8; 2,7531→2,8; 1,5996→1,6. |
| 3003 | Claudio Beghini | 35/35 identici | APR 117,60 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 3004 | Luigi Carfora | 27/27 identici | APR 341,71 vs umano 311 | Campi identici; energia APR più coerente con la superficie. |
| 3007 | Zeno Righetti | 106/115; nove superfici APR a precisione piena vs valori umani troncati/arrotondati | APR 931,13 vs umano 311 | APR più accurato: conserva i prodotti esatti (es. 6,754 vs 6,7; 0,8666 vs 0,8; 0,59 vs 0,5). |

## Tempo di compilazione pura

Metrica: somma delle sole finestre operative `discover_or_create_draft`, `prepare_allowlisted_page` e `save_page_once` registrate dal worker. Sono esclusi intervalli fra tick, claim, keepalive, attese, diagnosi, gate e correzioni.

- **Totale puro: 8.514,623 secondi = 2 h 21 min 54,6 s.**
- **Media: 354,776 secondi = 5 min 54,8 s per pratica.**
- Includendo anche la verifica finale read-only della bozza: 8.542,028 secondi = 2 h 22 min 22,0 s; media 5 min 55,9 s.

Tempi puri per pratica: Lucia Droghetti 4:12,3; Gregorio Fusco 8:11,5; Andrea Trabucco 4:57,3; Luca Cigognetti 9:02,4; Lia Chiericati 6:08,1; Monica Molteni 5:38,1; Claudia Campagna 5:01,1; Fabio Sartori 4:57,9; Armando Ranzoni 6:16,1; Monica Ambra Fioravanti 5:36,2; Adelfio Pietro Spinelli 4:57,4; Lea Dettori 5:00,0; Fares Hassairi 6:05,6; Lucia Lagrasta 6:57,2; Angelina Stricelli 8:58,5; Milena Albertoni 4:59,8; Cataldo Cassone 4:57,2; Romeo Ropa 5:10,4; Elena Depalma 7:34,3; Mauro Ballabio 6:21,3; Flavia Cipriani 8:17,3; Claudio Beghini 4:57,2; Luigi Carfora 2:05,6; Zeno Righetti 5:31,8.

## Fatture/riconciliazione: 17 casi concreti

Tutti i seguenti sono veri casi `blocked_case` con blocker economico persistente e dashboard `OPERATOR_REQUIRED`.

1. **Guido Calvacchi (2921)** — Lordo rilevato €6.135,03, ma due segmenti hanno imponibile/IVA/totale incompatibili; inoltre la “Pratica ENEA compresa” non è quantificata separatamente. Nessun bonifico disponibile. La sola fattura coerente è €4.400,00.
2. **Marco De Marinis (2932)** — La fattura di acconto/originale non presenta una tripla fiscale leggibile. Sono leggibili solo 312/FE €4.500 e 317/FE €10.000: il corpus economico è incompleto e il totale non può chiudere.
3. **Nicla Biagioni (2935)** — Tre fatture OCR da €2.548 ciascuna, ma imponibile e IVA risultano confluiti o incoerenti (254,80/254,80; 1.019,20/1.019,20; 1.274/1.274). Il totale apparente €7.644 non è certificabile.
4. **Gabriele Girelli (2938)** — L'unica immagine classificata come fattura non è un documento fiscale/economico valido; mancano fattura originaria e totale riconciliabile.
5. **Giovanna Atzeni (2943)** — Fattura €3.950,00; bonifico principale €3.950,90, quindi eccedenza €0,90. Il bonifico non contiene inoltre un riferimento fattura completo/coerente (`715/00`).
6. **Giuseppe D'Adduzio (2948)** — Tre documenti fattura senza tripla fiscale valida; si leggono €8.714,99, €12.450,00 e €3.735,01, ma il corpus incompleto non consente di certificare imponibile+IVA=totale.
7. **Santo Giuga (2953)** — Una fattura è priva di tripla fiscale; risultano 124/FE €5.339,01, 184/FE €4.271,21, 200/FE €1.067,86 e 297/FE €275,00. Riconciliazione bonifici non verificata e riferimenti fattura mancanti/incompleti.
8. **Loretta Riviera (2957)** — Totali OCR €2.192, €5.480 e €5.480, ma imponibile/IVA sono confluiti o incoerenti; €13.152 è solo un totale apparente, non certificato.
9. **Massimo Cappello (2970)** — Totali €7.751,50 + €8.753,50 = €16.505,00, ma mancano imponibile, IVA e importi d'intervento necessari alla tripla riconciliazione.
10. **“prova rivenditore 1 30/04” (2975)** — Nessuna fonte fiscale/economica valida: fattura e totale risultano assenti; nessun bonifico.
11. **Ivana Mastrangelo (2978)** — Tre documenti senza tripla fiscale; si leggono 128/FE €3.743,33, 243/FE €2.246,00 e 265/FE €1.497,34, ma il corpus non consente la chiusura contabile.
12. **Claudia Sellati (2988)** — Fatture 44/2026 €1.869 e 129/2026 €6.230. Nella seconda, imponibile €3.964,55 + IVA €396,45 = €4.361,00, non €6.230; anche l'importo intervento è €4.361. Totale complessivo €8.099 non certificabile.
13. **Maurizia Coreggioli (2990)** — La fattura 99/2026 non ha totale/IVA validi (imponibile rilevato zero); è leggibile solo il saldo 434/2025 da €5.000. Aggregato incompleto.
14. **Elena Marcella Berti (2992)** — Fattura €660; due bonifici da €660 ciascuno, totale principale €1.320: eccedenza €660. Riferimento `FATTURA195/2026` mancante/incompleto.
15. **Francesca Pisanu (2995)** — L'unico documento OCR restituisce totale lordo zero e IVA 10%, senza imponibile: nessuna tripla fiscale valida.
16. **Giovanni Amadu (2999)** — Unica fattura OCR: lordo €802,16 ma imponibile €6.144,70 e IVA 22%; estrazione incompatibile e non riconciliabile.
17. **Antonio Scaparrotta (3014)** — Fatture €4.361,27 + €2.616,77 + €1.735,92 = €8.713,96; bonifici principali €8.905,55, eccedenza €191,59. La 317/FE presenta anche imponibile/IVA/totale incompatibili.

## Limiti del confronto

- Il benchmark confronta i campi estraibili in modo deterministico dal PDF storico; non confronta immagini o decisioni umane non motivate nel documento.
- Il giudizio “APR più accurato” significa “meglio sostenuto dai documenti correnti e/o dal calcolo aritmetico riproducibile”, non una modifica automatica della pratica CRM storica.
- Le bozze sono state salvate in ENEA TEST; non sono state visualizzate in anteprima, inviate, protocollate né comunicate.
