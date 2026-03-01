

# Menu a Tendina Reportistica per Azienda

Aggiungere un pannello espandibile (Collapsible/Accordion) su ogni card azienda nella pagina `/aziende` che mostra statistiche dettagliate.

## Dati da mostrare nel pannello espanso

Per ogni azienda, calcolati dai dati gia' disponibili + una query aggiuntiva per prezzo/pagamento:

- **Pratiche totali** (gia' disponibile)
- **Breakdown per stato** (gia' disponibile, spostato dentro il pannello)
- **Revenue totale** (somma `prezzo` delle pratiche)
- **Revenue incassata** (pratiche con `pagamento_stato = 'pagata'`)
- **Revenue da incassare** (pratiche completate con `pagamento_stato = 'non_pagata'`)
- **Prezzo medio per pratica**
- **Utenti assegnati** (gia' disponibile)
- **Wallet balance** (gia' disponibile)
- **Data registrazione** (`created_at` della company)

## Implementazione

### 1. Query aggiuntiva pratiche con prezzo e pagamento
Estendere la query `admin-pratiche-by-stato` per includere anche `prezzo` e `pagamento_stato`, aggregando per company:
- Totale revenue
- Revenue pagata vs non pagata
- Conteggio per stato (gia' presente)

### 2. UI con Collapsible
Ogni card azienda avra' un bottone "Reportistica" (icona ChevronDown) che espande una sezione sotto la card con:
- Griglia di KPI cards (revenue, pratiche, media, incassato/da incassare)
- I badge per stato (attualmente visibili) vengono spostati dentro il pannello espanso per pulizia

### File modificati
- `src/pages/Aziende.tsx` - Aggiunta Collapsible, query estesa, sezione reportistica

Nessuna modifica DB necessaria - tutti i dati sono gia' nelle tabelle esistenti.

