

# Fase B: Intelligence, Export, Activity Feed, Impostazioni + Pratiche Non Pagate

## Panoramica

5 interventi da implementare, tutti indipendenti e behavior-preserving.

---

## 1. SLA Tracking + Carico Operatori (Dashboard Super Admin)

Estendere la sezione interna di `Dashboard.tsx` con:

- **Query aggiuntiva** per pratiche con `assegnatario_id` e timestamps (`created_at`, `updated_at`, `stato`)
- **SLA KPIs**: Tempo medio presa in carico (da `inviata` a `in_lavorazione` usando `updated_at`), tempo medio completamento, numero pratiche oltre soglia (es. 48h senza presa in carico)
- **Carico Operatori**: query `pratiche` raggruppate per `assegnatario_id` con stato aperto, join con `profiles` per nome. Card con lista operatori, pratiche assegnate, indicatore visivo (verde/giallo/rosso per < 5 / 5-10 / > 10)
- **Pratiche Non Pagate**: sezione dedicata che filtra `allPratiche` dove `stato = 'completata'` e `pagamento_stato = 'non_pagata'`, con filtro azienda e link alla pratica

**File:** `src/pages/Dashboard.tsx` (estensione sezione `isInternalUser`)

---

## 2. Export CSV Utility + Bottoni

Creare `src/lib/csv-export.ts` con utility generica:
```
exportToCSV(data: Record<string, any>[], filename: string, columns: {key, label}[])
```
Genera Blob CSV, triggera download browser.

Aggiungere bottone "Esporta CSV" su:
- `AdminPratiche.tsx` - esporta pratiche filtrate
- `Fatturazione.tsx` - esporta fatture tab corrente
- `AziendaDetail.tsx` - esporta wallet movements

**File nuovi:** `src/lib/csv-export.ts`
**File modificati:** `AdminPratiche.tsx`, `Fatturazione.tsx`, `AziendaDetail.tsx`

---

## 3. Activity Feed Realtime (Dashboard Super Admin)

Nuovo componente `src/components/ActivityFeed.tsx`:
- Query ultimi 15 record da `audit_log` ordinati per `created_at DESC`
- Join con `profiles` per mostrare nome utente
- Realtime subscription su `audit_log` per aggiornamento live
- Icone per tipo azione (cambio stato, assegnazione, etc.)
- Formato: timeline verticale compatta

Inserito nella dashboard interna dopo i KPI, prima del grafico globale.

**File nuovi:** `src/components/ActivityFeed.tsx`
**File modificati:** `Dashboard.tsx`

---

## 4. Pagina Impostazioni Piattaforma

Nuova pagina `src/pages/ImpostazioniPiattaforma.tsx` raggiungibile da `/admin/impostazioni`:
- **Tab SLA**: campi per soglie SLA (presa in carico ore, completamento ore) salvati in `localStorage` per ora (non serve tabella DB aggiuntiva, i valori sono solo di visualizzazione)
- **Tab Info Piattaforma**: mostra conteggi (aziende, utenti, pratiche totali, spazio storage)
- Solo super_admin puo' accedere

Aggiungere route in `App.tsx` e voce sidebar.

**File nuovi:** `src/pages/ImpostazioniPiattaforma.tsx`
**File modificati:** `App.tsx`, `AppSidebar.tsx`

---

## 5. Sezione Pratiche Non Pagate (Dashboard)

Integrata nel punto 1 come card nella dashboard interna:
- Filtra pratiche completate con `pagamento_stato = 'non_pagata'`
- Mostra titolo, azienda, prezzo, data completamento
- Select filtro per azienda
- Link diretto alla pratica
- Badge con totale importo non riscosso

---

## Riepilogo File

| Azione | File |
|--------|------|
| Nuovo | `src/lib/csv-export.ts` |
| Nuovo | `src/components/ActivityFeed.tsx` |
| Nuovo | `src/pages/ImpostazioniPiattaforma.tsx` |
| Modifica | `src/pages/Dashboard.tsx` (SLA + operatori + non pagate + feed) |
| Modifica | `src/pages/AdminPratiche.tsx` (bottone export) |
| Modifica | `src/pages/Fatturazione.tsx` (bottone export) |
| Modifica | `src/pages/AziendaDetail.tsx` (bottone export) |
| Modifica | `src/App.tsx` (route impostazioni) |
| Modifica | `src/components/AppSidebar.tsx` (voce impostazioni) |

Nessuna modifica DB necessaria. I dati SLA vengono calcolati dalle colonne esistenti (`created_at`, `updated_at`, `stato`, `assegnatario_id`). L'audit_log ha gia' Realtime abilitato.

