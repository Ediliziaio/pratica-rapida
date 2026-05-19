/**
 * /admin/integrazioni — Health check delle integrazioni esterne.
 *
 * Mostra lo stato di salute di ogni canale di comunicazione + cron job:
 *  - Email transazionali (Resend) → ultimo successo da `email_logs`
 *  - WhatsApp Business API (Meta) → ultimo successo da `communication_log`
 *  - Cron jobs Supabase (process-automations, send-reminders) → `cron.job_run_details`
 *
 * Per ogni integrazione: status pill (verde/giallo/rosso) + timestamp ultimo
 * successo + ultimo errore (se presente). Permette al super_admin di
 * accorgersi al volo se un canale è giù SENZA scorrere log.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Mail, MessageCircle, Clock, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, ExternalLink, Database,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

type HealthStatus = "ok" | "warning" | "down" | "unknown";

interface IntegrationHealth {
  id: string;
  label: string;
  icon: typeof Mail;
  status: HealthStatus;
  lastSuccess: Date | null;
  lastError: { message: string; at: Date } | null;
  details: string;
  /** Azione consigliata se status != ok. */
  recoveryHint?: string;
}

/**
 * Calcola lo stato di salute a partire da ultimo successo + ultimo errore.
 * - ok: ultimo successo nelle ultime 24h E nessun errore dopo l'ultimo successo
 * - warning: ultimo successo > 24h E < 7gg (può essere normale per cron daily)
 * - down: ultimo errore dopo l'ultimo successo OPPURE ultimo successo > 7gg
 */
function computeStatus(
  lastSuccess: Date | null,
  lastError: Date | null,
  freshnessHours = 24,
): HealthStatus {
  if (!lastSuccess && !lastError) return "unknown";
  if (lastError && (!lastSuccess || lastError > lastSuccess)) return "down";
  if (!lastSuccess) return "unknown";
  const ageH = (Date.now() - lastSuccess.getTime()) / 3_600_000;
  if (ageH > freshnessHours * 7) return "down";
  if (ageH > freshnessHours) return "warning";
  return "ok";
}

function StatusPill({ status }: { status: HealthStatus }) {
  const config = {
    ok:      { bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200",  label: "Operativo",     Icon: CheckCircle2 },
    warning: { bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200",    label: "Attenzione",    Icon: AlertTriangle },
    down:    { bg: "bg-red-50",      text: "text-red-700",      border: "border-red-200",      label: "Non funziona",  Icon: XCircle },
    unknown: { bg: "bg-slate-50",    text: "text-slate-600",    border: "border-slate-200",    label: "Nessun dato",   Icon: AlertTriangle },
  }[status];
  const I = config.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.bg} ${config.text} ${config.border} text-xs font-semibold`}>
      <I className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function timeAgo(d: Date | null): string {
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true, locale: it });
}

export default function Integrazioni() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-integrations-health"],
    queryFn: async (): Promise<IntegrationHealth[]> => {
      // === 1. EMAIL ===
      // NB: email_logs ha colonna `sent_at` (non created_at) — vedi migration
      // 20260327000001_megaprompt_phase1_tables.sql.
      const { data: emailSuccess } = await supabase
        .from("email_logs")
        .select("sent_at")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: emailFailed } = await supabase
        .from("email_logs")
        .select("sent_at")
        .eq("status", "failed")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count: emailFailedCount } = await supabase
        .from("email_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("sent_at", new Date(Date.now() - 7 * 24 * 3_600_000).toISOString());

      const emailLastSuccess = emailSuccess?.sent_at ? new Date(emailSuccess.sent_at) : null;
      const emailLastFailed = emailFailed?.sent_at ? new Date(emailFailed.sent_at) : null;

      // === 2. WHATSAPP ===
      const { data: waSuccess } = await supabase
        .from("communication_log")
        .select("sent_at")
        .eq("channel", "whatsapp")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: waFailed } = await supabase
        .from("communication_log")
        .select("sent_at, error_message")
        .eq("channel", "whatsapp")
        .eq("status", "failed")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count: waFailedCount } = await supabase
        .from("communication_log")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .eq("status", "failed")
        .gte("sent_at", new Date(Date.now() - 7 * 24 * 3_600_000).toISOString());

      const waLastSuccess = waSuccess?.sent_at ? new Date(waSuccess.sent_at) : null;
      const waLastFailed = waFailed?.sent_at ? new Date(waFailed.sent_at) : null;
      const waErrorMessage = waFailed?.error_message ?? null;

      // === 3. CRON: process-automations-daily + send-reminders-daily ===
      // pg_cron è in schema separato non esposto via PostgREST → leggi tramite
      // RPC wrapper SECURITY DEFINER `public.get_cron_health` (vedi migration
      // 20260518000001_get_cron_health_rpc.sql).
      let cronData: Array<{ jobname: string; status: string; start_time: string }> = [];
      let cronError: string | null = null;
      try {
        const { data: crons, error } = await supabase.rpc("get_cron_health" as never);
        if (error) cronError = error.message;
        else if (Array.isArray(crons)) cronData = crons as typeof cronData;
      } catch (e) {
        cronError = e instanceof Error ? e.message : "RPC failed";
      }

      const out: IntegrationHealth[] = [
        {
          id: "email",
          label: "Email transazionali (Resend)",
          icon: Mail,
          status: computeStatus(emailLastSuccess, emailLastFailed, 24),
          lastSuccess: emailLastSuccess,
          lastError: emailLastFailed ? { message: "Errore invio", at: emailLastFailed } : null,
          details: emailFailedCount && emailFailedCount > 0
            ? `${emailFailedCount} errori invii negli ultimi 7 giorni`
            : "Nessun errore recente",
          recoveryHint: emailFailedCount && emailFailedCount > 5
            ? "Verifica RESEND_API_KEY nei secrets Supabase Edge Functions."
            : undefined,
        },
        {
          id: "whatsapp",
          label: "WhatsApp Business API (Meta)",
          icon: MessageCircle,
          status: computeStatus(waLastSuccess, waLastFailed, 24),
          lastSuccess: waLastSuccess,
          lastError: waLastFailed && waErrorMessage
            ? { message: waErrorMessage, at: waLastFailed }
            : waLastFailed ? { message: "Errore invio", at: waLastFailed } : null,
          details: waFailedCount && waFailedCount > 0
            ? `${waFailedCount} errori invii negli ultimi 7 giorni`
            : "Nessun errore recente",
          recoveryHint: waErrorMessage && /oauth|token|expired/i.test(waErrorMessage)
            ? "⚠️ Token scaduto. Ruota WA_ACCESS_TOKEN nel dashboard Supabase → Edge Functions → Secrets. Genera nuovo Permanent Token da Meta Business Manager → WhatsApp → Configurazione API."
            : undefined,
        },
      ];

      // Cron jobs (1 per ognuno trovato)
      const cronJobs = ["process-automations-daily", "send-reminders-daily"];
      for (const jobname of cronJobs) {
        const last = cronData.find((r) => r.jobname === jobname);
        const lastDate = last?.start_time ? new Date(last.start_time) : null;
        const lastWasSuccess = last?.status === "succeeded";
        out.push({
          id: `cron-${jobname}`,
          label: jobname === "process-automations-daily"
            ? "Cron — Process Automations (daily 09:00)"
            : "Cron — Send Reminders (daily 09:00)",
          icon: Clock,
          status: lastDate
            ? lastWasSuccess
              ? computeStatus(lastDate, null, 25) // > 25h = warning (oltre 1 ciclo daily)
              : "down"
            : "unknown",
          lastSuccess: lastWasSuccess ? lastDate : null,
          lastError: !lastWasSuccess && lastDate
            ? { message: last?.status ?? "unknown", at: lastDate }
            : cronError
              ? { message: cronError, at: new Date() }
              : null,
          details: lastDate
            ? `Ultimo run: ${format(lastDate, "d MMM HH:mm", { locale: it })}`
            : cronError
              ? "RPC get_cron_health() ha restituito errore"
              : "Stato cron non disponibile",
          recoveryHint: !lastDate && cronError
            ? "Applica migration 20260518000001_get_cron_health_rpc.sql o verifica permessi (richiesto super_admin)."
            : undefined,
        });
      }

      return out;
    },
    refetchInterval: 60_000, // poll ogni minuto
  });

  const integrations = data ?? [];
  const downCount = integrations.filter((i) => i.status === "down").length;
  const warnCount = integrations.filter((i) => i.status === "warning").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Stato Integrazioni</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Health check delle integrazioni esterne (email, WhatsApp, cron jobs).
            Refresh automatico ogni 60 secondi.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/* Summary banner */}
      {(downCount > 0 || warnCount > 0) && (
        <div className={`rounded-lg border p-4 flex items-start gap-3 ${
          downCount > 0
            ? "bg-red-50 border-red-200 text-red-900"
            : "bg-amber-50 border-amber-200 text-amber-900"
        }`}>
          {downCount > 0 ? <XCircle className="h-5 w-5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="font-semibold">
              {downCount > 0
                ? `${downCount} integrazion${downCount === 1 ? "e non funzionante" : "i non funzionanti"}`
                : `${warnCount} integrazion${warnCount === 1 ? "e in stato di attenzione" : "i in stato di attenzione"}`}
            </p>
            <p className="text-sm mt-0.5">
              {downCount > 0
                ? "Le notifiche ai clienti potrebbero non essere consegnate. Vedi sotto per le azioni di ripristino."
                : "Alcune integrazioni non vengono usate da diverse ore: verifica se è normale."}
            </p>
          </div>
        </div>
      )}

      {/* Integration cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {integrations.map((integ) => {
          const Icon = integ.icon;
          return (
            <Card key={integ.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      integ.status === "ok" ? "bg-emerald-100 text-emerald-700" :
                      integ.status === "down" ? "bg-red-100 text-red-700" :
                      integ.status === "warning" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{integ.label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{integ.details}</p>
                    </div>
                  </div>
                  <StatusPill status={integ.status} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span className="text-muted-foreground">Ultimo successo:</span>
                    <span className="font-medium">{timeAgo(integ.lastSuccess)}</span>
                    {integ.lastSuccess && (
                      <span className="text-muted-foreground/60 ml-1">
                        ({format(integ.lastSuccess, "d MMM HH:mm", { locale: it })})
                      </span>
                    )}
                  </div>
                  {integ.lastError && (
                    <div className="flex items-start gap-1.5">
                      <XCircle className="h-3 w-3 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground">Ultimo errore: </span>
                        <span className="font-medium">{timeAgo(integ.lastError.at)}</span>
                        <p className="text-red-700 mt-0.5 break-words" title={integ.lastError.message}>
                          {integ.lastError.message.slice(0, 200)}
                          {integ.lastError.message.length > 200 && "…"}
                        </p>
                      </div>
                    </div>
                  )}
                  {integ.recoveryHint && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 mt-2">
                      <p className="text-amber-900 leading-relaxed">
                        <strong>Cosa fare:</strong> {integ.recoveryHint}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {integrations.length === 0 && !isFetching && (
          <Card className="lg:col-span-2 border-dashed">
            <CardContent className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <Database className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm">Nessun dato di log disponibile.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer help */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Come funziona</p>
        <ul className="space-y-1 leading-relaxed">
          <li>• <strong>Email</strong>: letto da <code className="text-[10px] bg-muted px-1 rounded">email_logs</code> (filtro <code className="text-[10px]">status</code>)</li>
          <li>• <strong>WhatsApp</strong>: letto da <code className="text-[10px] bg-muted px-1 rounded">communication_log</code> (filtro <code className="text-[10px]">channel='whatsapp'</code>)</li>
          <li>• <strong>Cron</strong>: letto da RPC <code className="text-[10px] bg-muted px-1 rounded">get_cron_health</code> (proxy verso <code className="text-[10px]">cron.job_run_details</code>)</li>
          <li>• <strong>Polling</strong>: la pagina si aggiorna automaticamente ogni 60 secondi</li>
        </ul>
        <a
          href="https://supabase.com/dashboard/project/xmkjrhwmmuzaqjqlvzxm/functions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Dashboard Supabase Edge Functions
        </a>
      </div>
    </div>
  );
}
