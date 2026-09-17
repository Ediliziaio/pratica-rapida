# Osservazioni da diagnosticare dopo il mirato r115

Queste osservazioni sono state registrate durante il lotto, senza modificare codice, bundle o configurazione dell'esecuzione.

## Chiusure oscuranti: esiti divergenti nella stessa famiglia

- `SAVED`: Matteo Capitanelli, Andrea Trabucco, Flavia Cipriani.
- `OPERATOR_REQUIRED`: Luca Cigognetti, Claudia Sellati.
- Cigognetti aveva una decisione generale esplicita già autorizzata: una zanzariera aggiuntiva non associata documentalmente va attribuita al primo infisso.
- Da diagnosticare dopo il lotto: quale differenza di evidenza o ramo runtime impedisce a Cigognetti e Sellati di applicare le stesse regole già usate dai tre casi salvati.

## OPERATOR_REQUIRED senza domanda

- Cigognetti, Sellati ed Elena Depalma sono stati pubblicati `OPERATOR_REQUIRED`, ma il checkpoint `operator-questions` non contiene alcuna domanda persistita.
- Un esito operatore privo di domanda non è rispondibile e va trattato come difetto distinto del canale runtime.

## Regola economica applicata solo su alcuni rami

- Eugenio Codognato richiede ancora `infissi_final_printed_invoice_total_required` nonostante la regola r115 sul totale finale stampato.
- Ivana Mastrangelo e Antonio Scaparrotta si fermano in `bridge_prepare_economic_unresolved`.
- Da diagnosticare dopo il lotto: censire i rami che leggono o validano gli importi e verificare se la regola r115 è collegata a tutti, senza assumere che esista un unico percorso economico.
