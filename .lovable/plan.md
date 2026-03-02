

# Analisi Sezione Pratiche — Prospettiva Marketing, Sales & SaaS

## Problemi Identificati

### 1. Mancano KPI di sintesi in alto (zero "at-a-glance" value)
L'utente atterra sulla pagina e vede subito una lista. Non c'e' nessun riassunto numerico. In un SaaS B2B, la prima cosa che un manager vuole vedere e': quante pratiche ho? quante sono in attesa? quanto ho speso? Questo e' il "value moment" — piu' veloce lo mostri, piu' l'utente percepisce valore.

### 2. La card nella ListView e' troppo minimale
Mostra solo titolo, cliente e prezzo. Mancano: data creazione, stato pagamento, tempo trascorso. Un utente non riesce a capire rapidamente cosa richiede attenzione senza cliccare dentro ogni pratica.

### 3. Nessun indicatore di urgenza/aging
Non c'e' modo di capire quali pratiche sono "vecchie" o bloccate. In SaaS operativi, l'aging e' critico per il time-to-value. Una pratica ferma in "attesa documenti" da 7 giorni dovrebbe gridare attenzione.

### 4. Nessun empty state con onboarding guidato
Lo stato vuoto dice solo "Crea la tua prima pratica ENEA". Nessun valore educativo, nessun incentivo. In SaaS, il primo empty state e' il momento piu' critico per l'attivazione.

### 5. Admin pipeline non ha drag & drop
`AdminPratiche.tsx` ha una pipeline statica (senza DnD), mentre `Pratiche.tsx` (lato azienda) ce l'ha. L'admin dovrebbe avere il workflow piu' potente, non il contrario.

### 6. Nessun export dalla vista azienda
Solo AdminPratiche ha il CSV. L'azienda non puo' esportare le sue pratiche.

### 7. NuovaPratica ha solo 2 step, nessun campo ENEA specifico
Il form raccoglie solo dati cliente. Mancano i campi specifici della pratica ENEA (tipo intervento, dati catastali, data fine lavori, importo lavori) che poi vengono mostrati nel dettaglio ma non possono essere inseriti alla creazione.

---

## Piano di Miglioramento

### A. Summary Bar con KPI (Pratiche.tsx + AdminPratiche.tsx)
Aggiungere una riga di 4-5 card compatte sopra i filtri:
- **Totale pratiche** (con variazione rispetto al mese precedente)
- **In lavorazione** (attive)
- **In attesa documenti** (urgenti, in rosso se > 0)
- **Completate questo mese**
- **Spesa totale** (somma prezzi)

Calcolate dai dati gia' in memoria, nessuna query aggiuntiva.

### B. Card ListView arricchita (PraticaCard.tsx)
Aggiungere alla card:
- **Data creazione** formattata ("3 giorni fa" con `date-fns/formatDistanceToNow`)
- **Badge pagamento** (pagata/non pagata)
- **Indicatore aging**: dot rosso se pratica in stato attivo da > 5 giorni, arancione se > 3

### C. Empty State migliorato (PraticaCard.tsx)
Sostituire l'empty state minimalista con:
- Illustrazione/icona piu' grande
- Copy orientata al beneficio: "Invia la tua prima pratica ENEA in meno di 2 minuti"
- 3 bullet point con vantaggi (consegna 24h, prezzo fisso, zero burocrazia)
- CTA primaria prominente

### D. Admin Pipeline con DnD (AdminPratiche.tsx)
Riutilizzare `PipelineView` (gia' esistente con DnD) anche nella vista admin pipeline, adattandola per mostrare azienda + operatore assegnato nelle card.

### E. Export CSV lato azienda (Pratiche.tsx)
Aggiungere bottone export nella toolbar, stesso pattern di AdminPratiche.

### F. NuovaPratica con step ENEA (NuovaPratica.tsx)
Aggiungere step intermedio "Dati Pratica ENEA" tra "Dati Cliente" e "Riepilogo":
- Tipo intervento (select: sostituzione infissi, schermature solari, caldaia, etc.)
- Dati catastali (text)
- Data fine lavori (date picker)
- Importo lavori (number)
- Note aggiuntive (textarea)

Questi dati vengono salvati nel campo JSONB `dati_pratica`.

---

## Riepilogo File

| Azione | File |
|--------|------|
| Modifica | `src/pages/Pratiche.tsx` — summary bar + export button |
| Modifica | `src/pages/AdminPratiche.tsx` — summary bar + DnD pipeline |
| Modifica | `src/components/pratiche/PraticaCard.tsx` — card arricchita + empty state |
| Modifica | `src/pages/NuovaPratica.tsx` — step dati ENEA |

Nessuna modifica DB. Tutti i dati necessari sono gia' presenti nelle tabelle esistenti (`created_at`, `pagamento_stato`, `dati_pratica` JSONB).

