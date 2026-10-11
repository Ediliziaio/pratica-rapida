-- Espone `canale` tramite la view enea_practices_public.
--
-- La view elenca le colonne una per una: senza ridefinirla il campo non arriva
-- mai al CRM, e senza il campo non si possono distinguere a vista le pratiche
-- di EneaSubito ne' raggrupparle a parte nel cruscotto.
--
-- ATTENZIONE a chi la ritocchera': il corpo qui sotto NON e' copiato dal file
-- della migrazione precedente, e' il testo che il database restituisce per la
-- view viva (pg_get_viewdef), letto l'11/10/2026. I due divergevano:
-- in produzione `chiamate_assegnato_a` viene prima di `data_fine_lavori`,
-- nel file era il contrario, e CREATE OR REPLACE VIEW pretende lo stesso
-- ordine. Prima di riscrivere questa view, rileggere la definizione vera.
--
-- Cambiamento additivo: una colonna in coda, gated agli operatori interni.
-- Nessuna colonna rimossa, rinominata o spostata, nessun tipo cambiato,
-- security_invoker invariato: nessuna query esistente cambia risultato.

CREATE OR REPLACE VIEW public.enea_practices_public
WITH (security_invoker = true) AS
SELECT id,
    reseller_id,
    current_stage_id,
    brand,
    cliente_nome,
    cliente_cognome,
    cliente_email,
    cliente_telefono,
    cliente_indirizzo,
    cliente_cf,
    prodotto_installato,
    fornitore,
    note,
        CASE
            WHEN is_internal(auth.uid()) THEN note_interne
            ELSE NULL::text
        END AS note_interne,
    fatture_urls,
    documenti_enea_urls,
    documenti_aggiuntivi_urls,
    documenti_mancanti,
    note_documenti_mancanti,
        CASE
            WHEN is_internal(auth.uid()) THEN guadagno_lordo
            ELSE NULL::numeric
        END AS guadagno_lordo,
        CASE
            WHEN is_internal(auth.uid()) THEN guadagno_netto
            ELSE NULL::numeric
        END AS guadagno_netto,
        CASE
            WHEN is_internal(auth.uid()) THEN note_gestionale
            ELSE NULL::text
        END AS note_gestionale,
    data_invio_pratica,
    operatore_id,
    assigned_at,
    ultimo_sollecito_privato,
    conteggio_solleciti,
    ultimo_sollecito_fornitore,
    form_compilato_at,
        CASE
            WHEN is_internal(auth.uid()) THEN form_token
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN form_token
            ELSE NULL::text
        END AS form_token,
    recensione_richiesta_at,
    recensione_ricevuta_at,
    recensione_testo,
    recensione_stelle,
    archived_at,
    created_at,
    updated_at,
    current_stage_entered_at,
    pratica_enea_conclusa_urls,
        CASE
            WHEN is_internal(auth.uid()) THEN tipo_fatturazione
            ELSE NULL::text
        END AS tipo_fatturazione,
        CASE
            WHEN is_internal(auth.uid()) THEN tipo_servizio
            ELSE NULL::text
        END AS tipo_servizio,
    tipo_soggetto,
    archivio_path,
        CASE
            WHEN is_internal(auth.uid()) THEN prezzo
            ELSE NULL::numeric
        END AS prezzo,
        CASE
            WHEN is_internal(auth.uid()) THEN pagamento_stato
            ELSE NULL::pagamento_stato
        END AS pagamento_stato,
        CASE
            WHEN is_internal(auth.uid()) THEN data_incasso
            ELSE NULL::timestamp with time zone
        END AS data_incasso,
        CASE
            WHEN is_internal(auth.uid()) THEN dati_form
            WHEN reseller_id = get_reseller_company_id(auth.uid()) THEN dati_form
            ELSE '{}'::jsonb
        END AS dati_form,
        CASE
            WHEN is_internal(auth.uid()) THEN azienda_dichiarata
            ELSE NULL::text
        END AS azienda_dichiarata,
        CASE
            WHEN is_internal(auth.uid()) THEN chiamate_assegnato_a
            ELSE NULL::text
        END AS chiamate_assegnato_a,
    data_fine_lavori,
        CASE
            WHEN is_internal(auth.uid()) THEN canale
            ELSE NULL::text
        END AS canale
   FROM enea_practices ep;

GRANT SELECT ON public.enea_practices_public TO authenticated;

NOTIFY pgrst, 'reload schema';
