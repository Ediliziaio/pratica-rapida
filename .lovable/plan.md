

# Impostazioni Azienda + Ticket Assistenza

## Panoramica
Due nuove funzionalita per gli utenti azienda:
1. **Pagina Impostazioni Azienda** — per visualizzare/modificare i dati della propria azienda
2. **Sistema Ticket di Assistenza** — per aprire e tracciare richieste di supporto

---

## 1. Database — Nuova tabella `support_tickets`

```sql
CREATE TYPE ticket_stato AS ENUM ('aperto', 'in_lavorazione', 'risolto', 'chiuso');
CREATE TYPE ticket_priorita AS ENUM ('bassa', 'normale', 'alta');

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  oggetto text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  stato ticket_stato NOT NULL DEFAULT 'aperto',
  priorita ticket_priorita NOT NULL DEFAULT 'normale',
  risposta text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Utenti azienda vedono i propri ticket
CREATE POLICY "Users see own company tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR company_id IN (SELECT get_user_company_ids(auth.uid())));

-- Utenti azienda creano ticket
CREATE POLICY "Company users create tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id IN (SELECT get_user_company_ids(auth.uid())));

-- Super admin e interni aggiornano ticket
CREATE POLICY "Authorized users update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR is_internal(auth.uid()) OR (user_id = auth.uid()));
```

## 2. Sidebar — Aggiungere 2 voci ad `aziendaItems`

| Voce | URL | Icona |
|------|-----|-------|
| Assistenza | `/assistenza` | `LifeBuoy` |
| Impostazioni | `/impostazioni` | `Settings` |

File: `src/components/AppSidebar.tsx`

## 3. Nuova pagina `src/pages/ImpostazioniAzienda.tsx`

Pagina per utenti azienda con i dati della propria company (ragione sociale, P.IVA, email, telefono, indirizzo). Carica i dati dalla tabella `companies` tramite `get_user_company_ids`. Permette la modifica dei campi editabili.

## 4. Nuova pagina `src/pages/Assistenza.tsx`

- Lista ticket aperti dall'azienda con stato, priorita, data
- Dialog per creare un nuovo ticket (oggetto + descrizione + priorita)
- Badge colorati per stato
- Click su ticket per vedere dettaglio/risposta

## 5. Route in `src/App.tsx`

Aggiungere:
- `/impostazioni` → `ImpostazioniAzienda`
- `/assistenza` → `Assistenza`

## 6. Vista Admin — Tab Ticket nel pannello Super Admin

Aggiungere nella sidebar interna una voce "Ticket" (`/admin/ticket`) con pagina per gestire tutti i ticket ricevuti, cambiare stato e rispondere.

---

## Riepilogo file

| File | Azione |
|------|--------|
| Migration SQL | Creare tabella `support_tickets` con RLS |
| `src/components/AppSidebar.tsx` | Aggiungere Assistenza + Impostazioni in aziendaItems, Ticket in internalItems |
| `src/pages/ImpostazioniAzienda.tsx` | Nuovo — impostazioni azienda |
| `src/pages/Assistenza.tsx` | Nuovo — lista/creazione ticket |
| `src/pages/AdminTicket.tsx` | Nuovo — gestione ticket lato admin |
| `src/App.tsx` | 3 nuove route |

