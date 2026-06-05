-- Drop support tickets — feature rimossa dal gestionale.
-- Nessun'altra tabella ha FK verso support_tickets (verificato grep su supabase/migrations).
-- support_ticket_messages ha FK su support_tickets ON DELETE CASCADE, ma DROP TABLE non
-- segue ON DELETE: la droppiamo esplicitamente per prima.
--
-- Sicurezza: niente CASCADE su support_tickets — se in futuro qualcosa avesse
-- aggiunto una FK in arrivo non dichiarata qui, la migration fallisce in modo
-- esplicito invece di cancellare silenziosamente dati non previsti.

BEGIN;

-- Rimuovi righe email_templates orfane (i 4 trigger_event ticket_*)
DELETE FROM public.email_templates
WHERE trigger_event IN (
  'ticket_conferma',
  'ticket_risposta_staff',
  'ticket_replica_cliente',
  'ticket_nuovo'
);

-- Rimuovi automation_rules con trigger_event ticket_*
DELETE FROM public.automation_rules
WHERE trigger_event IN ('ticket_aperto', 'ticket_chiuso');

-- Drop tabelle ticket (messages prima, poi parent)
DROP TABLE IF EXISTS public.support_ticket_messages;
DROP TABLE IF EXISTS public.support_tickets;

COMMIT;
