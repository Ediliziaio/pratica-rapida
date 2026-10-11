-- Gli eventi FIC `invoices.email_sent` in formato CloudEvents binary hanno
-- il payload `{ "data": { "ids": [...] } }`. Il vecchio webhook cercava
-- soltanto `payload.ids`, registrava quindi resource_ids vuoto e non portava
-- a `ready` ordini per i quali l'e-mail era stata realmente inviata.

WITH parsed AS (
  SELECT
    event_id,
    ARRAY(
      SELECT value::bigint
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(payload -> 'data' -> 'ids') = 'array'
            THEN payload -> 'data' -> 'ids'
          ELSE '[]'::jsonb
        END
      ) AS values_from_payload(value)
      WHERE value ~ '^[0-9]+$'
    ) AS ids
  FROM public.fic_webhook_events
  WHERE event_type = 'it.fattureincloud.webhooks.issued_documents.invoices.email_sent'
    AND cardinality(resource_ids) = 0
)
UPDATE public.fic_webhook_events AS event
SET resource_ids = parsed.ids
FROM parsed
WHERE event.event_id = parsed.event_id
  AND cardinality(parsed.ids) > 0;

WITH delivered AS (
  SELECT DISTINCT ON (invoice_id)
    invoice_id,
    received_at AS emailed_at
  FROM public.fic_webhook_events
  CROSS JOIN LATERAL unnest(resource_ids) AS invoice(invoice_id)
  WHERE event_type = 'it.fattureincloud.webhooks.issued_documents.invoices.email_sent'
    AND status = 'processed'
  ORDER BY invoice_id, received_at DESC
)
UPDATE public.cf_payment_orders AS payment
SET
  customer_emailed_at = COALESCE(payment.customer_emailed_at, delivered.emailed_at),
  status = CASE WHEN payment.status = 'sdi_pending' THEN 'ready' ELSE payment.status END,
  last_error_code = CASE WHEN payment.last_error_code = 'INVOICE_EMAIL_FAILED' THEN NULL ELSE payment.last_error_code END,
  last_error_message = CASE WHEN payment.last_error_code = 'INVOICE_EMAIL_FAILED' THEN NULL ELSE payment.last_error_message END,
  updated_at = GREATEST(payment.updated_at, delivered.emailed_at)
FROM delivered
WHERE payment.fic_invoice_id = delivered.invoice_id
  AND payment.customer_emailed_at IS NULL;
