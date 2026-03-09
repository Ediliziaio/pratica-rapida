

# Eliminazione di tutte le pratiche di esempio dal database

## Dati trovati

10 pratiche nel database, tutte create come esempio:

| Titolo | Stato |
|--------|-------|
| Dichiarazione IVA 2025 | bozza |
| Consulenza fiscale Q1 | in_lavorazione |
| Fatturazione elettronica setup | completata |
| Pratica ENEA Superbonus | inviata |
| SCIA ristrutturazione | in_attesa_documenti |
| APE certificazione | completata |
| Richiesta mutuo prima casa | bozza |
| Cessione del quinto | in_lavorazione |
| Prestito personale | annullata |
| Pratica ENEA - Florin Andriciuc | completata |

Ci sono anche 2 notifiche collegate all'ultima pratica. Nessun altro dato collegato (documenti, checklist, messaggi, wallet movements, audit log).

## Operazione

1. Eliminare le 2 notifiche collegate a pratiche
2. Eliminare tutte le 10 pratiche usando una edge function temporanea con service role key (per bypassare RLS)
3. Rimuovere la edge function dopo l'uso

