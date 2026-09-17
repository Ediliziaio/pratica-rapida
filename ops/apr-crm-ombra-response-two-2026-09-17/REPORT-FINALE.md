# Giro CRM ombra — risposte Miracapillo e Zambella

- Run: `apr-crm-ombra-response-two-20260917`
- Bundle: `855b3373-patch-cf-sequencer-governed-20260916-20260916`
- Worker SHA-256: `be8d0d57304209335d0f99205e41e4aa12a3eb0f8f0d76a27768e78f61b96fd9`
- Sicurezza: generazione fresca, sole bozze; anteprima, invio e comunicazioni non tentati.

## Esiti

| Pratica | Risposta letta come | Colonna finale | Bozza |
|---|---|---|---|
| Marco Zambella | Due tende: tenda a bracci 3100×2000 mm e tenda a caduta 1120×1700 mm, confermate dalla risposta e dalle righe della fattura. | `Da inviare` (`da_inviare`, nome colonna: `Invio pratica chiusa`) | `507811` |
| Daniele Miracapillo | Cinque chiusure, tutte in alluminio. La risposta risolve quantità e materiale, ma non sceglie tra le due serie di misure discordanti delle fatture 290/2026 e 324/2026. | `Richiesto intervento operatore` | Nessuna |

## Domanda persistita per Miracapillo

> La risposta è stata letta: 5 chiusure, tutte in alluminio. Le fatture 290/2026 e 324/2026 riportano però due serie diverse di misure. Quale serie è quella definitiva da usare: 3×1100×2220 + 1×1430×1270 + 1×1600×2220 mm, oppure 3×930×2260 + 1×1450×2260 + 1×1280×1300 mm?

## Verifica delle fonti

- Zambella: checkpoint del lotto `saved`, report individuale `saved` 9/9 e `/api/case-truth` `READY` con zero blocker: nessun problema. La scheda ombra è stata verificata con lettura esatta, lookup della fase e query inversa di appartenenza; tutte e tre confermano `da_inviare` e la nota della bozza 507811.
- Miracapillo: il checkpoint del lotto è `inconsistent`; il preflight persistente è `blocked_case` con blocker sulla cardinalità/materiale; `/api/case-truth` è `BLOCKED` con un solo blocker. Poiché le tre fonti non concordano, il verdetto formale resta esclusivamente `INCONSISTENT`. La scheda ombra è stata verificata con lettura esatta, lookup della fase e query inversa; tutte e tre confermano `intervento_operatore` e la domanda sopra.
