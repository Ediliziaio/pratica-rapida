-- Rete di sicurezza per i lead Meta Ads: ogni ora importa i lead degli ultimi
-- 30 giorni (dedup su leadgen_id), così entrano nel CRM anche se il webhook
-- realtime non viene consegnato da Meta. Applicata direttamente in produzione
-- il 05/10/2026.
select cron.unschedule('meta-leads-sync-hourly')
where exists (select 1 from cron.job where jobname = 'meta-leads-sync-hourly');

select cron.schedule('meta-leads-sync-hourly', '7 * * * *', $$
  select net.http_get(
    url := 'https://xmkjrhwmmuzaqjqlvzxm.supabase.co/functions/v1/meta-leads-webhook?action=import_recent&days=30&token=pr_3dbfa0f498ea36c8b85729e89531a009',
    timeout_milliseconds := 120000
  );
$$);
