# Ideal Sistem, esclusioni e confronto campi delle pratiche SAVED

Data: 10 settembre 2026

## Perimetro e sicurezza

- Attività CRM e storage esclusivamente GET/read-only; nessuna scrittura CRM.
- Nessuna pagina ENEA aperta e nessuna bozza creata, modificata o salvata.
- Confronto tra pacchetto canonico immutabile effettivamente usato da APR in una pratica SAVED e PDF ENEA storico chiuso dall'operatore.
- Sono escluse soltanto le misure geometriche dei prodotti; trasmittanze e ogni altro campo tecnico restano inclusi.
- Il PDF umano è un riferimento di confronto, non prova automaticamente che APR abbia torto: ogni scostamento resta da aggiudicare contro il documento originale pertinente.

## Esclusione permanente Ideal Sistem

Ideal Sistem è ora modellato come esclusione generale a monte, analoga a Linea Sole Potito e Erre Emme/RM Legno. Il match è esatto sulla relazione CRM o sul campo fornitore; nomi simili non vengono esclusi. L'esito metrico è `excluded_upstream`: lavorazione manuale, fuori sia dai blocchi sia dal denominatore lavorabile, senza download/analisi degli allegati e senza azione ENEA.

Regola: `user-2026-09-10-ideal-sistem-manual-exclusion-v1`.

## Quante pratiche escono dal perimetro

Tre fonti concordanti per ciascuna pratica: dossier locale, appartenenza a report/checkpoint di lotto e vista CRM live GET-only.

- Tutte le coorti persistite: **287 → 264**, quindi **23** pratiche uniche escluse: 13 Potito, 5 RM Legno, 5 Ideal Sistem.
- Universo dei report finali di lotto: **197 → 177**, quindi **20** escluse: 12 Potito, 4 RM Legno, 4 Ideal Sistem.
- La differenza di tre casi dipende da pratiche presenti in checkpoint di coorte ma senza un report finale top-level: non sono state perse dal conteggio storico complessivo.

### Denominatore per ogni lotto interessato

| Lotto | Prima | Escluse | Dopo | Potito | RM | Ideal |
|---|---:|---:|---:|---:|---:|---:|
| apr-contractual-reliability-r101-long-20260909 | 63 | 10 | 53 | 4 | 2 | 4 |
| apr-current-workable-batch-r86-20260908 | 105 | 11 | 94 | 11 | 0 | 0 |
| apr-expanded-natural-r55 | 28 | 2 | 26 | 1 | 0 | 1 |
| apr-financial-parser-r29-reviewed-eight | 8 | 4 | 4 | 1 | 0 | 3 |
| apr-financial-parser-r30-reviewed-eight | 8 | 4 | 4 | 1 | 0 | 3 |
| apr-financial-parser-r31-remaining-nine | 9 | 1 | 8 | 0 | 1 | 0 |
| apr-global-controller-test10-2026-08-29 | 10 | 1 | 9 | 1 | 0 | 0 |
| apr-global-controller-test10-certified-rerun-2026-08-29 | 10 | 1 | 9 | 1 | 0 | 0 |
| apr-global-controller-test10-rerun-2026-08-29 | 10 | 1 | 9 | 1 | 0 | 0 |
| apr-natural-autonomy11-simple-r53 | 11 | 2 | 9 | 1 | 0 | 1 |
| apr-natural-autonomy12-r52 | 12 | 2 | 10 | 1 | 0 | 1 |
| apr-natural-autonomy12-r52-retry1 | 12 | 2 | 10 | 1 | 0 | 1 |
| apr-preflight-deep-review-propagation-r104-operational-six-20260910 | 6 | 4 | 2 | 4 | 0 | 0 |
| apr-preflight-terminal-propagation-r103-operational-six-20260910 | 6 | 4 | 2 | 4 | 0 | 0 |
| apr-preflight-terminal-propagation-r103-operational-six-v2-20260910 | 6 | 4 | 2 | 4 | 0 | 0 |
| apr-pronte-da-fare-r102-current-flow-20260910 | 31 | 4 | 27 | 4 | 0 | 0 |
| apr-pronte-da-fare-r104-current-flow-20260910 | 19 | 4 | 15 | 4 | 0 | 0 |
| apr-pronte-da-fare-r99-governed-20260909 | 31 | 4 | 27 | 4 | 0 | 0 |
| apr-r85-berti-operational-proof-20260907 | 1 | 1 | 0 | 1 | 0 | 0 |
| apr-r86-berti-deep-review-terminal-proof-20260907 | 1 | 1 | 0 | 1 | 0 | 0 |
| apr-targeted-excel-ready-r70-20260906 | 12 | 1 | 11 | 0 | 1 | 0 |
| apr-targeted-excel-ready-r70-retry1-20260906 | 12 | 1 | 11 | 0 | 1 | 0 |
| apr-wide100-current-cohort-bridge-r25 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-final-r67-20260906 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-final-r68-20260906 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-province-lineage-r24 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r97-20260908 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r98-20260908 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r98-retry1-20260908 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r98-retry2-20260908 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r99-20260909 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide100-r99-governed-20260909 | 100 | 15 | 85 | 8 | 3 | 4 |
| apr-wide99-post-r46 | 99 | 15 | 84 | 8 | 3 | 4 |

## Confronto campo per campo

Pratiche con entrambi i riferimenti disponibili: **41**. Campi direttamente confrontabili: **1904**; coincidenti **1677**; differenti **227**. Una pratica coincide integralmente; 40 hanno almeno uno scostamento.

Le famiglie più frequenti sono:

- impianto.potenza: 38
- impianto.rendimento: 38
- intervento.data_fine: 9
- impianto.generatore: 6
- intervento.data_inizio: 6
- infissi.0.vetro_nuovo: 5
- infissi.1.vetro_nuovo: 5
- infissi.2.vetro_nuovo: 5
- infissi.3.vetro_nuovo: 5
- infissi.0.trasmittanza_vecchio: 4
- infissi.1.trasmittanza_vecchio: 4
- infissi.2.trasmittanza_vecchio: 4

### Verifica mirata del fallback trasmittanza 1,3

Il rischio indicato è confermato come scostamento osservabile: il fallback per fonte mancante è stato usato su **20 righe di 4 pratiche**. In **12 righe** il valore 1,3 differisce dalla pratica umana; in 8 coincide.

- ELENA DEPALMA: 5 righe a fallback; 0 diverse dal riferimento umano.
- EUGENIO CODOGNATO: 8 righe a fallback; 8 diverse dal riferimento umano.
- MATTEO CAPITANELLI: 3 righe a fallback; 0 diverse dal riferimento umano.
- VERA BURACCHI: 4 righe a fallback; 4 diverse dal riferimento umano.

Inoltre Santo Giuga presenta una riga diversa (umano 1,57; APR 1,3) dovuta alla policy distinta di clamp al massimo accettato dal portale, non al fallback per fonte mancante.

Le pagine dei PDF di Codognato e Buracchi sono state anche renderizzate e ispezionate visivamente: mostrano rispettivamente i valori 1,28/1,22/1,27/1,20/1,28/1,28/1,23/1,27 e 1,20/1,20/1,20/1,17. Questo conferma che i dodici scostamenti non sono un artefatto dell'estrazione testuale del PDF.

## Dettaglio nome per nome

### Adelfio Pietro Spinelli

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.4 | 28,9 | — |
| impianto.rendimento | 94.6 | 97,4 | — |

### Andrea Trabucco

42/44 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 24.6 | 27,0 | — |
| impianto.rendimento | 92.8 | 98,4 | — |

### Angela Tuttolani

30/35 campi coincidenti; 5 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| immobile.tipologia | Edificio a schiera e condominio fino a tre piani | Edificio oltre 3 piani (4+) | — |
| impianto.generatore | Caldaia ad acqua calda standard | Altro | — |
| impianto.potenza | 23.1 | 27,6 | — |
| impianto.rendimento | 92.7 | 96,8 | — |
| intervento.data_fine | 28/07/2026 | 27/07/2026 | — |

### Angelina Stricelli

56/86 campi coincidenti; 30 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 25 | 32,5 | — |
| impianto.rendimento | 91.7 | 98,9 | — |
| infissi.0.chiusura_oscurante | No | Sì | — |
| infissi.0.trasmittanza_vecchio | 5 | 3 | — |
| infissi.0.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.0.vetro_vecchio | Singolo | Doppio | — |
| infissi.1.chiusura_oscurante | No | Sì | — |
| infissi.1.trasmittanza_vecchio | 5 | 3 | — |
| infissi.1.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.1.vetro_vecchio | Singolo | Doppio | — |
| infissi.2.chiusura_oscurante | No | Sì | — |
| infissi.2.trasmittanza_vecchio | 5 | 3 | — |
| infissi.2.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.2.vetro_vecchio | Singolo | Doppio | — |
| infissi.3.chiusura_oscurante | No | Sì | — |
| infissi.3.trasmittanza_vecchio | 5 | 3 | — |
| infissi.3.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.3.vetro_vecchio | Singolo | Doppio | — |
| infissi.4.chiusura_oscurante | No | Sì | — |
| infissi.4.trasmittanza_vecchio | 5 | 3 | — |
| infissi.4.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.4.vetro_vecchio | Singolo | Doppio | — |
| infissi.5.chiusura_oscurante | No | Sì | — |
| infissi.5.trasmittanza_vecchio | 5 | 3 | — |
| infissi.5.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.5.vetro_vecchio | Singolo | Doppio | — |
| infissi.6.chiusura_oscurante | No | Sì | — |
| infissi.6.trasmittanza_vecchio | 5 | 3 | — |
| infissi.6.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.6.vetro_vecchio | Singolo | Doppio | — |

### ANNALISA LANZO

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.generatore | Caldaia ad acqua calda standard | Altro | — |
| impianto.potenza | 23.1 | 29,8 | — |
| impianto.rendimento | 92.6 | 97,9 | — |

### Antonella Ferletic

31/35 campi coincidenti; 4 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.generatore | Caldaia ad acqua calda standard | Altro | — |
| impianto.potenza | 24 | 30,9 | — |
| impianto.rendimento | 92.7 | 97,2 | — |
| intervento.data_inizio | 03/02/2026 | 16/06/2026 | — |

### Cataldo Cassone

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 24.3 | 27,6 | — |
| impianto.rendimento | 92.7 | 98,6 | — |

### Claudia Campagna

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 22.4 | 27,2 | — |
| impianto.rendimento | 92.7 | 98,5 | — |

### CLAUDIA SELLATI

64/79 campi coincidenti; 15 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.5 | 28,2 | — |
| impianto.rendimento | 95.3 | 98,0 | — |
| infissi.0.telaio_nuovo | PVC | Legno | — |
| infissi.0.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.1.telaio_nuovo | PVC | Legno | — |
| infissi.1.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.2.telaio_nuovo | PVC | Legno | — |
| infissi.2.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.3.telaio_nuovo | PVC | Legno | — |
| infissi.3.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.4.telaio_nuovo | PVC | Legno | — |
| infissi.4.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.5.telaio_nuovo | PVC | Legno | — |
| infissi.5.vetro_nuovo | A bassa emissione | Doppio | — |
| intervento.data_inizio | 30/01/2026 | 07/02/2026 | — |

### Claudio Beghini

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.5 | 29,7 | — |
| impianto.rendimento | 92.7 | 98,3 | — |
| intervento.data_fine | 31/07/2026 | 30/07/2026 | — |

### Della Mariacarla Vigetti

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| immobile.tipologia | Edificio a schiera e condominio fino a tre piani | Edificio oltre 3 piani (4+) | — |
| impianto.potenza | 25.8 | 26,8 | — |
| impianto.rendimento | 94.3 | 98,2 | — |

### ELENA DEPALMA

59/66 campi coincidenti; 7 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 25.3 | 29,7 | — |
| impianto.rendimento | 93.8 | 98,1 | — |
| infissi.0.trasmittanza_vecchio | 4.1 | 6 | — |
| infissi.1.trasmittanza_vecchio | 4.1 | 6 | — |
| infissi.2.trasmittanza_vecchio | 4.1 | 6 | — |
| infissi.3.trasmittanza_vecchio | 4.1 | 6 | — |
| infissi.4.trasmittanza_vecchio | 4.1 | 6 | — |

### EUGENIO CODOGNATO

49/85 campi coincidenti; 36 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.civico_residenza | 1/c | Località Rupecanina 1/C | — |
| immobile.civico | 1/c | Località Rupecanina 1/C | — |
| impianto.potenza | 23.4 | 28,1 | — |
| impianto.rendimento | 92.6 | 97,9 | — |
| infissi.0.trasmittanza_nuovo | 1.28 | 1,3 | missing_source_fallback_1_3 |
| infissi.0.trasmittanza_vecchio | 5 | 3 | — |
| infissi.0.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.0.vetro_vecchio | Singolo | Doppio | — |
| infissi.1.trasmittanza_nuovo | 1.22 | 1,3 | missing_source_fallback_1_3 |
| infissi.1.trasmittanza_vecchio | 5 | 3 | — |
| infissi.1.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.1.vetro_vecchio | Singolo | Doppio | — |
| infissi.2.trasmittanza_nuovo | 1.27 | 1,3 | missing_source_fallback_1_3 |
| infissi.2.trasmittanza_vecchio | 5 | 3 | — |
| infissi.2.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.2.vetro_vecchio | Singolo | Doppio | — |
| infissi.3.trasmittanza_nuovo | 1.2 | 1,3 | missing_source_fallback_1_3 |
| infissi.3.trasmittanza_vecchio | 5 | 3 | — |
| infissi.3.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.3.vetro_vecchio | Singolo | Doppio | — |
| infissi.4.trasmittanza_nuovo | 1.28 | 1,3 | missing_source_fallback_1_3 |
| infissi.4.trasmittanza_vecchio | 5 | 3 | — |
| infissi.4.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.4.vetro_vecchio | Singolo | Doppio | — |
| infissi.5.trasmittanza_nuovo | 1.28 | 1,3 | missing_source_fallback_1_3 |
| infissi.5.trasmittanza_vecchio | 5 | 3 | — |
| infissi.5.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.5.vetro_vecchio | Singolo | Doppio | — |
| infissi.6.trasmittanza_nuovo | 1.23 | 1,3 | missing_source_fallback_1_3 |
| infissi.6.trasmittanza_vecchio | 5 | 3 | — |
| infissi.6.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.6.vetro_vecchio | Singolo | Doppio | — |
| infissi.7.trasmittanza_nuovo | 1.27 | 1,3 | missing_source_fallback_1_3 |
| infissi.7.trasmittanza_vecchio | 5 | 3 | — |
| infissi.7.vetro_nuovo | A bassa emissione | Doppio | — |
| infissi.7.vetro_vecchio | Singolo | Doppio | — |

### Fabio Sartori

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.5 | 30,6 | — |
| impianto.rendimento | 92.7 | 98,8 | — |
| intervento.data_fine | 04/08/2026 | 23/03/2026 | — |

### Fabrizio Pelizzari

31/35 campi coincidenti; 4 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.cognome | pellizzari | Pelizzari | — |
| impianto.potenza | 23.6 | 31,8 | — |
| impianto.rendimento | 94.2 | 97,7 | — |
| intervento.data_inizio | 03/02/2026 | 15/06/2026 | — |

### Fares Hassairi

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.comune_nascita | EE, Tunisia | Sfax | — |
| impianto.potenza | 23.4 | 27,7 | — |
| impianto.rendimento | 92.8 | 97,3 | — |

### Flavia Cipriani

71/73 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.4 | 26,9 | — |
| impianto.rendimento | 92.8 | 98,5 | — |

### gianfranco lavezzi

28/34 campi coincidenti; 6 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.cognome | lavezzi | beretta | — |
| beneficiario.nome | gianfranco | samuele | — |
| immobile.foglio | 50 | x | — |
| immobile.mappale | 80 | x | — |
| impianto.potenza | 21.4 | 27,2 | — |
| impianto.rendimento | 94.6 | 97,6 | — |

### Gianluigi Chiolin

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 24.3 | 27,9 | — |
| impianto.rendimento | 92.8 | 97,7 | — |

### Giovanni Pescatori

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.4 | 27,2 | — |
| impianto.rendimento | 97.4 | 98,5 | — |
| intervento.data_fine | 15/05/2026 | 14/05/2026 | — |

### gregorio fusco

69/72 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.nome | gregorio | Gregorio S | — |
| impianto.potenza | 23.6 | 30,6 | — |
| impianto.rendimento | 92.8 | 97,4 | — |

### Lia Chiericati

31/34 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.generatore | Altro (energia elettrica) | Altro | — |
| impianto.potenza | 23.5 | 29,3 | — |
| impianto.rendimento | 93.8 | 98,2 | — |

### Luca Cigognetti

74/78 campi coincidenti; 4 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.cognome | cicognetti | Cigognetti | — |
| impianto.potenza | 23.1 | 27,7 | — |
| impianto.rendimento | 92.6 | 98,9 | — |
| intervento.data_fine | 03/08/2026 | 24/03/2026 | — |

### Luca Ronconi

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 25 | 29,3 | — |
| impianto.rendimento | 95 | 97,2 | — |

### LUCIA DROGHETTI

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 26.4 | 26,9 | — |
| impianto.rendimento | 93.8 | 98,2 | — |

### Lucia Lagrasta

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.4 | 30,1 | — |
| impianto.rendimento | 93.8 | 97,4 | — |
| intervento.data_fine | 13/06/2026 | 12/06/2026 | — |

### Luigi Carfora

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 24 | 29,9 | — |
| impianto.rendimento | 95.8 | 98,5 | — |
| intervento.data_fine | 08/07/2026 | 09/04/2026 | — |

### Marco Tocchetti

Esito: coincidenza completa sui 31 campi non geometrici direttamente confrontabili.

### massimo cappello

114/128 campi coincidenti; 14 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.8 | 32,2 | — |
| impianto.rendimento | 95.4 | 97,2 | — |
| infissi.0.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.1.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.10.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.11.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.2.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.3.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.4.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.5.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.6.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.7.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.8.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.9.vetro_nuovo | A bassa emissione | Triplo | — |

### MATTEO CAPITANELLI

49/52 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.indirizzo_residenza | Viale Beata Vergine del Carmelo | Viale Beata Vergine del Carmelo n. 186 | — |
| infissi.numero | 4 | 7 | — |
| intervento.data_inizio | 03/02/2026 | 14/03/2026 | — |

### Mauro Ballabio

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.5 | 30,7 | — |
| impianto.rendimento | 91.7 | 96,8 | — |

### Milena Albertoni

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.generatore | Caldaia ad acqua calda standard | Altro | — |
| impianto.potenza | 24.3 | 30,6 | — |
| impianto.rendimento | 92.7 | 98,7 | — |

### MONICA AMBRA FIORAVANTI

28/30 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.comune_nascita | Sesto San Giovanni (MI) | SESTO S.GIOVANNI | — |
| schermature.spesa | 4950 | 4950,01 | — |

### Monica Molteni

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.7 | 32,0 | — |
| impianto.rendimento | 92.8 | 98,9 | — |

### Nadia Ragni

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.5 | 26,4 | — |
| impianto.rendimento | 92.6 | 97,6 | — |

### Natale Tiraboschi

31/35 campi coincidenti; 4 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.generatore | Caldaia ad acqua calda standard | Altro | — |
| impianto.potenza | 25.3 | 31,7 | — |
| impianto.rendimento | 91.4 | 98,5 | — |
| intervento.data_inizio | 03/02/2026 | 22/05/2026 | — |

### Romeo Ropa

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| beneficiario.data_nascita | 21/11/1941 | 12/11/1941 | — |
| impianto.potenza | 24.3 | 28,4 | — |
| impianto.rendimento | 93.7 | 97,0 | — |

### rosa toscano

32/35 campi coincidenti; 3 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.3 | 30,0 | — |
| impianto.rendimento | 92.6 | 97,4 | — |
| intervento.data_inizio | 03/02/2026 | 11/05/2026 | — |

### Santo Giuga

62/72 campi coincidenti; 10 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 24.3 | 30,5 | — |
| impianto.rendimento | 92.8 | 98,7 | — |
| infissi.0.chiusura_oscurante | No | Sì | — |
| infissi.1.chiusura_oscurante | No | Sì | — |
| infissi.1.trasmittanza_nuovo | 1.57 | 1,3 | explicit_source_clamped_to_1_3_for_portal |
| infissi.2.chiusura_oscurante | No | Sì | — |
| infissi.3.chiusura_oscurante | No | Sì | — |
| infissi.4.chiusura_oscurante | No | Sì | — |
| infissi.spesa | 10678.08 | 10953,08 | — |
| intervento.data_fine | 01/09/2026 | 09/07/2026 | — |

### VERA BURACCHI

45/65 campi coincidenti; 20 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 23.5 | 31,8 | — |
| impianto.rendimento | 92.1 | 98,2 | — |
| infissi.0.trasmittanza_nuovo | 1.2 | 1,3 | missing_source_fallback_1_3 |
| infissi.0.trasmittanza_vecchio | 5 | 3 | — |
| infissi.0.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.0.vetro_vecchio | Singolo | Doppio | — |
| infissi.1.trasmittanza_nuovo | 1.2 | 1,3 | missing_source_fallback_1_3 |
| infissi.1.trasmittanza_vecchio | 5 | 3 | — |
| infissi.1.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.1.vetro_vecchio | Singolo | Doppio | — |
| infissi.2.trasmittanza_nuovo | 1.2 | 1,3 | missing_source_fallback_1_3 |
| infissi.2.trasmittanza_vecchio | 5 | 3 | — |
| infissi.2.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.2.vetro_vecchio | Singolo | Doppio | — |
| infissi.3.trasmittanza_nuovo | 1.17 | 1,3 | missing_source_fallback_1_3 |
| infissi.3.trasmittanza_vecchio | 5 | 3 | — |
| infissi.3.vetro_nuovo | A bassa emissione | Triplo | — |
| infissi.3.vetro_vecchio | Singolo | Doppio | — |
| infissi.numero | 6 | 4 | — |
| intervento.data_fine | 07/07/2026 | 12/03/2026 | — |

### Zeno Righetti

33/35 campi coincidenti; 2 scostamenti.

| Campo | Operatore umano | APR | Policy trasmittanza |
|---|---:|---:|---|
| impianto.potenza | 21.6 | 27,7 | — |
| impianto.rendimento | 92.6 | 97,9 | — |

## Gate e installazione dell'esclusione

- Suite completa locale seriale: **1933/1933** test verdi; suite CDP/socket eseguita nell'ambiente abilitato: **82/82** test verdi; totale **2015/2015**.
- Matrice di governo: **210/210** regole coperte. Audit storico: 161 decisioni dichiarate; unica nuova attivazione `user-2026-09-10-ideal-sistem-manual-exclusion-v1`; restano soltanto i quattro gap storici già autorizzati.
- Gate monotono: **PASS**, artefatto `11a6670bae6ad2f7e945b84e692028ef4b50b554ca551315a50af1dac1e9edfc`.
- Bundle canonico installato: `4c1e381b-ideal-sistem-manual-exclusion-r107-20260910`. Il puntatore `current`, i quattro hash della ricevuta e la presenza della regola nel worker installato concordano.
- Questa attività prova test locali completi e installazione canonica. Non è stato riavviato il worker persistente e non è stato eseguito un replay operativo su ENEA; quindi non viene dichiarata una verifica operativa della nuova esclusione.

## Limiti del verdetto

Questo audit dimostra quali valori APR sono stati materializzati nel pacchetto SAVED e quali valori compaiono nel PDF umano. Non stabilisce, senza rilettura del documento originario per ciascun campo discordante, se sia un errore APR o un errore/approssimazione dell'operatore. Per questo nessuna delle 40 pratiche discordanti viene riclassificata come blocco e nessuna regola tecnica sui valori viene modificata in questa attività.
