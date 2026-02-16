

# Miglioramento Dashboard e Pratiche con vista Pipeline

## Dashboard - Miglioramenti

La dashboard attuale mostra solo KPI statici in card. Verra' arricchita con:

### 1. Pratiche recenti
- Aggiungere una sezione sotto le card KPI che mostra le ultime 5 pratiche con stato, cliente e data
- Click su una pratica porta al dettaglio
- Link "Vedi tutte" che porta a `/pratiche`

### 2. Grafico andamento mensile
- Usare `recharts` (gia' installato) per un grafico a barre che mostra pratiche create negli ultimi 6 mesi
- Raggruppamento per mese con colori per stato (completate vs in lavorazione)

### 3. Card KPI migliorate
- Aggiungere sotto-testo con variazione rispetto al mese precedente (es. "+3 rispetto al mese scorso")
- Aggiungere progress bar nella card "Completate (mese)" per mostrare il rapporto completate/totali

### 4. Azioni rapide
- Sezione con bottoni per azioni frequenti: "Nuova Pratica", "Ricarica Wallet"

---

## Pratiche - Vista Pipeline (Kanban)

La pagina Pratiche attualmente mostra solo una lista. Verra' aggiunta una vista pipeline/kanban con toggle per passare tra le due visualizzazioni.

### 1. Toggle Lista/Pipeline
- Aggiungere due bottoni icona (lista e griglia/kanban) sopra i filtri
- Lo stato viene salvato in `useState`

### 2. Vista Pipeline (Kanban)
- Colonne orizzontali scrollabili, una per ogni stato: Bozza, Inviata, In Lavorazione, Attesa Documenti, Completata, Annullata
- Ogni colonna mostra:
  - Header con nome stato, icona e conteggio pratiche
  - Card pratica compatte con: titolo, nome cliente, prezzo
- Click sulla card porta al dettaglio della pratica
- Le colonne vuote mostrano un placeholder discreto

### 3. Contatori per stato
- Sopra la pipeline, mostrare badge con il conteggio per ogni stato (gia' presente, verra' mantenuto)

---

## Dettagli tecnici

| File | Modifica |
|------|----------|
| `src/pages/Dashboard.tsx` | Aggiungere sezione pratiche recenti, grafico recharts, azioni rapide |
| `src/pages/Pratiche.tsx` | Aggiungere toggle lista/pipeline, implementare vista Kanban con colonne per stato |

### Vista Pipeline - Struttura UI

Ogni colonna della pipeline sara' un contenitore verticale con scroll interno:

```text
+----------+----------+----------+----------+----------+----------+
|  Bozza   | Inviata  |In Lavor. | Att.Doc  |Completat.| Annullat.|
|  (2)     |  (3)     |  (1)     |  (2)     |  (5)     |  (0)     |
+----------+----------+----------+----------+----------+----------+
| [Card 1] | [Card 1] | [Card 1] | [Card 1] | [Card 1] |          |
| [Card 2] | [Card 2] |          | [Card 2] | [Card 2] | Nessuna  |
|          | [Card 3] |          |          | [Card 3] | pratica  |
|          |          |          |          | [Card 4] |          |
|          |          |          |          | [Card 5] |          |
+----------+----------+----------+----------+----------+----------+
```

Le colonne saranno scrollabili orizzontalmente su mobile e avranno una larghezza minima fissa su desktop.

