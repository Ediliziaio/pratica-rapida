# APR r61 — lignaggio provinciale del Comune immobile e replay Nadia Ragni

Data: 2026-09-05

## Causa provata

Il catalogo ISTAT ufficiale conteneva già `Trinità d'Agultu e Vignola`, codice corrente `113026`, provincia corrente `OT`. La pratica riportava correttamente il nome, con apostrofo tipografico, e la provincia storica `SS`.

Il resolver costruito per Sellati funzionava sulle varianti grafiche, ma il percorso `portalBuilding` non applicava il resolver del lignaggio provinciale già usato dal percorso beneficiario. Di conseguenza il runtime consegnava all'autocomplete ENEA il qualificatore storico `SS`; ENEA offriva l'unica riga corretta `Trinità d'Agultu e Vignola (OT)`, che APR scartava perché la provincia non coincideva.

La normalizzazione del catalogo delle transizioni, inoltre, non equiparava ancora l'apostrofo tipografico `’` a quello ASCII `'`. Non era la congiunzione `e` a causare il difetto.

## Correzione generale

- la risoluzione delle transizioni provinciali normalizza esclusivamente varianti certe dell'apostrofo, senza rimuovere punteggiatura o usare somiglianze;
- il percorso Comune immobile applica lo stesso lignaggio ufficiale di nascita/residenza;
- nome, provincia storica e catalogo devono produrre una sola destinazione;
- APR consegna a ENEA nome canonico, provincia corrente e codice ISTAT corrente;
- provincia estranea, nome incompleto, codice diverso o più risultati restano fail-closed.

La regola generale resta `user-2026-09-02-official-municipality-province-lineage-v1`, ora effettivamente applicata anche alla pagina Immobile.

## Test e installazione

- test positivo diretto: `Trinità d’Agultu e Vignola / SS` → `Trinità d'Agultu e Vignola / OT / 113026`;
- test negativo: stesso nome con provincia `NU` non viene convertito e non riceve alcun codice ISTAT autorevole;
- test negativo lessicale: `Trinità d’Agultu` non coincide con il Comune completo;
- suite completa: 437/437 file, 1.756/1.756 test verdi;
- audit storico: 101 decisioni dichiarate, 96 attive, 5 superseded, 0 irrisolte;
- gate: `active_tested_deployed`;
- fingerprint: `da1f83d165fe704459465b75cfd2991be0254d65bf7f25687f94964792a41307`;
- bundle canonico: `versions/4d517227-municipality-lineage-r61-20260905`.

## Replay operativo pulito

- coorte: `3134`;
- nuova bozza: `465445`;
- nessuna vecchia bozza ripresa;
- Beneficiario: salvata e verificata;
- Immobile: salvata e verificata; il precedente errore `id-comune` è eliminato;
- Intervento: salvata e verificata;
- Generatore e impianto esistente: salvati e verificati;
- la schermatura è stata inserita e il salvataggio esterno della sezione è stato tentato una sola volta.

Dopo il tentativo della sezione Schermature solari, tre sonde read-only hanno prodotto esito inconcludente: nessun redirect conclusivo, 0/1 campi coincidenti nella GET persistente e metadato server assente/non successivo all'intento.

## Verdetto finale

`INCONSISTENT` — nessun altro verdetto è attribuibile.

Le tre fonti divergono:

1. checkpoint execution: `operator_intervention`;
2. report sequencer: `inconsistent`;
3. dashboard `/api/case-truth`: `blocked_case` con `execution_case_operator_required`.

Fatti comunque concordanti: bozza `465445`, cinque pagine confermate, salvataggio schermature non determinabile, zero anteprime, zero invii e zero comunicazioni.

```json
{
  "customerKey": "nadia-ragni",
  "classification": "inconsistent",
  "exactCause": "Le tre fonti terminali classificano diversamente lo stesso salvataggio schermature rimasto inconclusivo dopo tre sonde read-only.",
  "missingDocumentType": null,
  "operatorQuestion": "Autorizzi la correzione generale della convergenza tra checkpoint, report e case-truth per i salvataggi con tre sonde inconclusive, prima di stabilire se la sezione Schermature della bozza 465445 sia salvata o richieda un nuovo replay pulito?",
  "onboardingGap": null
}
```

