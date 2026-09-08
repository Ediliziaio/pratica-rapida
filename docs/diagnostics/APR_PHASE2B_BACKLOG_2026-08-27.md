# APR — Backlog Fase 2B

Data registrazione: 27 agosto 2026  
Stato: backlog approvato; non implementato nella Fase 0.

## Resolver materiale zanzariere dopo riconciliazione della famiglia

- Backlog ID: `APR-P2B-SCREENING-FAMILY-MATERIAL-001`.
- Origine: replay locale ampio su HEAD `4cccfd97eb56b80b2c09f20d1d7daa0ff94bc6ee`.
- Casi di regressione: Amelia Lerose (3 righe) e Renzo Paolo De Grandi (4 righe).
- Difetto generale: `resolveProductTechnicalAttributes()` sceglie il fallback del materiale usando la descrizione tecnica prima che la famiglia fattura+form sia riconciliata. Una descrizione generica come `Schermatura solare MOBILE` cade su `Tessuto`; il mapping successivo riconosce invece il tipo form `altro` come zanzariera.
- Guardia esistente: il commit `47c00c4` blocca correttamente ogni zanzariera con materiale da fallback diverso da `Misto`; la guardia non deve essere indebolita o rimossa.
- Correzione richiesta in Fase 2B: determinare una sola famiglia riconciliata da fonti fattura+form e passarla al resolver prima della scelta del fallback. Se la famiglia finale e zanzariera e non esiste materiale esplicito contrario, usare `Misto` come fallback autorizzato.
- Vincoli: nessuna dipendenza da nome cliente/pratica/coorte; precedenza invariata per materiale esplicito; audit con ID regola e fonti; test positivo, negativo e limite; replay del corpus completo; gate monotono senza regressioni; bundle testato uguale al bundle installabile.
- Criterio di uscita: entrambi i casi di regressione diventano coerenti senza ridurre la protezione fail-closed e senza modificare casi con materiale esplicito.

Questa voce non autorizza implementazione, installazione o test operativo ENEA. Richiede il gate specifico della Fase 2B.
