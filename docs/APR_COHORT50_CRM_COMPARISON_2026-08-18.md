# APR — confronto read-only cohort50 con pratiche chiuse CRM

Data: 18 agosto 2026

## Ambito e sicurezza

APR ha confrontato le bozze ENEA `416583`, `416675` e `416646` con:

1. dossier CRM e fonti originarie gia acquisite con GET;
2. prove server delle pagine salvate nelle bozze APR;
3. PDF ENEA storico della pratica chiusa, quando associato nel CRM.

Il confronto ha escluso dati impianto termico, risparmio energetico stimato, finestre protette e data fine lavori TEST. I PDF storici sono stati usati soltanto come benchmark post-bozza: nessun loro valore e stato propagato al mapper o alle bozze. CRM ed ENEA non sono stati modificati.

## Risultato

### Elisa Moro — bozza APR 416583

- Dossier CRM, fonti originarie, mapping e prove server: coerenti, nessuna differenza.
- Confronto con la pratica manuale chiusa: non completabile, perche il CRM non associa alcun PDF ENEA storico consentito a questa pratica.
- Non viene dichiarata concordanza campo-per-campo con l'output manuale in assenza del benchmark.

### Lia Chiericati — bozza APR 416675

- 34 campi confrontati; 33 coincidenti.
- Differenza verificabile: `schermature.0.materiale`.
  - bozza APR: `Tessuto`;
  - pratica manuale chiusa CRM: `Metallo`;
  - fonte originaria: fattura Rinaldi `758/26`, che distingue `STRUTTURA IN ALLUMINIO` da `TESSUTO ECLISSI OSCURANTE IN TRIPLO STRATO PVC`.
- In base alla fonte originaria e alla regola gia attiva che separa la struttura dal materiale della schermatura, il valore APR `Tessuto` e coerente; il valore storico `Metallo` non coincide con la fattura.

### Giovanni Zucchini — bozza APR 416646

- 35 campi confrontati; 34 coincidenti.
- Differenza verificabile: `schermature.0.materiale`.
  - bozza APR: `Tessuto`;
  - pratica manuale chiusa CRM: `Metallo`;
  - fonte originaria: fattura Rinaldi `793/26`, che distingue `STRUTTURA IN ALLUMINIO` da `TESSUTO ECLISSI OSCURANTE IN TRIPLO STRATO PVC`.
- In base alla fonte originaria e alla regola gia attiva che separa la struttura dal materiale della schermatura, il valore APR `Tessuto` e coerente; il valore storico `Metallo` non coincide con la fattura.

## Correzione del comparatore

Il primo passaggio aveva segnalato come differenza il titolo beneficiario di Lia: `Detentore / affittuario` contro `Detentore o co-detentore (es. locatario, comodatario, usufruttuario, ecc.)`. Le due diciture sono semanticamente equivalenti. Il normalizzatore APR e stato corretto e coperto da test; il secondo confronto non segnala piu questa falsa differenza.

## Verifica tripla

1. Checkpoint `crm-manual-comparison`: tre bozze coerenti con dossier/fonti CRM, zero discrepanze di consistenza.
2. Checkpoint `historical-benchmark`: due PDF storici confrontati, 69 campi totali, due differenze residue; PDF storico Elisa non disponibile.
3. Rilettura indipendente delle fatture originarie: entrambe riportano esplicitamente tessuto/PVC e distinguono la struttura in alluminio. La dashboard APR conferma che le stesse tre bozze restano salvate, senza nuovi salvataggi, anteprima o submit.

## Evidenze automatiche

- 8 test del comparatore e benchmark storico passati.
- 2 test del confronto dossier/checkpoint passati.
- controllo TypeScript completato senza errori.

Checkpoint persistenti:

- `crm-manual-comparison/checkpoint.json`
- `historical-benchmark/checkpoint.json`
