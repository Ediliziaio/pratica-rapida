

# Gestione Pagamenti Super Admin

## Panoramica
Il super admin deve poter:
1. **Ricaricare il wallet** di un'azienda (ricarica prepagata)
2. **Segnare pratiche come pagate** (per pagamenti tramite bonifico o altri metodi esterni)
3. Vedere lo storico dei movimenti con causali chiare

## Modifiche

### 1. `src/pages/AziendaDetail.tsx` — Tab Wallet potenziato

Aggiungere nel tab Wallet (visibile solo per super admin):

- **Pulsante "Ricarica Wallet"**: apre un Dialog con importo + causale (es. "Bonifico ricevuto", "Ricarica manuale"). Chiama la funzione DB `wallet_topup` gia esistente.
- **Pulsante "Rimborso"**: Dialog con importo + causale + pratica opzionale. Chiama `wallet_refund`.

### 2. `src/pages/AziendaDetail.tsx` — Tab Pratiche: azione "Segna come pagata"

Nella tabella pratiche del dettaglio azienda, aggiungere per ogni riga con `pagamento_stato != 'pagata'`:
- Un dropdown/pulsante per cambiare lo stato pagamento: "Pagata", "In verifica", "Non pagata"
- Metodo di pagamento visibile come nota (wallet, bonifico, altro)

### 3. `src/pages/AdminPratiche.tsx` — Azione rapida pagamento

Nella vista lista admin, aggiungere un dropdown per il `pagamento_stato` accanto al dropdown stato, cosi il super admin puo segnare le pratiche pagate direttamente dalla lista globale.

### 4. Nessuna modifica DB

Tutte le funzioni necessarie (`wallet_topup`, `wallet_refund`) e le colonne (`pagamento_stato`) esistono gia. Il campo `pagamento_stato` e un enum con valori: `pagata`, `non_pagata`, `in_verifica`, `rimborsata`.

---

## Riepilogo file

| File | Modifica |
|------|----------|
| `src/pages/AziendaDetail.tsx` | Aggiungere Dialog ricarica wallet + Dialog rimborso + dropdown pagamento nelle pratiche |
| `src/pages/AdminPratiche.tsx` | Aggiungere dropdown rapido `pagamento_stato` nella lista |

