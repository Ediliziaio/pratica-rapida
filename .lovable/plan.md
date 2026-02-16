

# Miglioramenti Area Super Admin

## 1. Dashboard Super Admin migliorata

La sezione "KPI Interni" attuale mostra solo 4 card basiche. Verra' arricchita con:

- **KPI con variazioni mensili**: Revenue, Pratiche Totali, Completate e Backlog mostreranno la variazione rispetto al mese precedente
- **Grafico andamento globale**: grafico a barre con tutte le pratiche di tutte le aziende (ultimi 6 mesi), divise per completate/in corso
- **Top 5 aziende per pratiche**: mini-classifica delle aziende piu' attive
- **Pratiche in attesa**: alert visivo con conteggio delle pratiche che richiedono attenzione (in_attesa_documenti, inviate non ancora prese in carico)

## 2. Sezione Aziende migliorata

Ogni card azienda mostrera' un breakdown dettagliato delle pratiche per stato:

- Icone colorate con conteggi per: Bozza, Inviata, In Lavorazione, Attesa Documenti, Completata, Annullata
- Solo gli stati con conteggio > 0 verranno mostrati come mini-badge nella card
- Query aggiornata per caricare i conteggi raggruppati per company_id e stato

## 3. Nuova pagina "Tutte le Pratiche" (Super Admin)

Pagina dedicata accessibile dalla sidebar Super Admin che mostra tutte le pratiche di tutte le aziende:

- **Tabella/lista** con: Titolo, Azienda, Cliente, Stato, Prezzo, Data creazione, Assegnatario
- **Filtri**: ricerca testuale, filtro per stato, filtro per azienda (select con tutte le aziende)
- **Toggle lista/pipeline** come nella pagina Pratiche dell'area azienda
- **Cambio stato rapido** tramite select inline (come nella Coda Pratiche)
- **Click** sulla riga porta al dettaglio della pratica

### Sidebar aggiornata
- Aggiungere voce "Pratiche" nel menu Super Admin tra "Aziende" e "Attivita'"
- Nuova route `/admin/pratiche`

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `src/pages/Dashboard.tsx` | Arricchire sezione KPI Interni con grafico globale, top aziende, alert pratiche in attesa |
| `src/pages/Aziende.tsx` | Aggiungere query per conteggi pratiche per stato per company, mostrare mini-badge stati nella card |
| `src/pages/AdminPratiche.tsx` | **Nuovo file** - lista globale pratiche con filtri, pipeline view, cambio stato rapido |
| `src/components/AppSidebar.tsx` | Aggiungere voce "Pratiche" nel menu Super Admin |
| `src/App.tsx` | Aggiungere route `/admin/pratiche` |

### Query principali (AdminPratiche)
- Carica tutte le pratiche con join su `companies(ragione_sociale)` e `clienti_finali(nome, cognome)`
- Carica lista aziende per il filtro select
- Carica profili assegnatari per mostrare nome operatore

### Query aggiornata (Aziende)
- Carica pratiche con `company_id` e `stato` per calcolare i conteggi raggruppati

