import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[process-automations] Missing env: ${k}`);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isBusinessHour(): boolean {
  // Use Intl to correctly handle Rome timezone (CET=+1, CEST=+2 during DST).
  const romeHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  return romeHour >= 9 && romeHour < 18;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

function buildFormLink(token: string): string {
  return `https://app.praticarapida.it/form/${token}`;
}

/**
 * Invoca una edge function interna. Controlla che la risposta sia 2xx,
 * altrimenti throw — così il chiamante può decidere se ritentare o
 * lasciare la pratica "non claimed" per il prossimo cron tick.
 *
 * Prima del fix: questa funzione faceva fire-and-forget — un 4xx/5xx
 * dell'edge function veniva ignorato e il flow continuava marcando
 * `ultimo_sollecito_*` come se fosse partito (perdita di sollecito).
 */
async function invoke(
  supabase: ReturnType<typeof createClient>,
  fnName: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`invoke ${fnName} failed: HTTP ${res.status} — ${JSON.stringify(json)}`);
  }
  // Anche con 2xx, l'edge function può ritornare { success: false } nel body
  // (es. send-whatsapp con token scaduto risponde 200 + success:false).
  if (json && typeof json === "object" && "success" in json && json.success === false) {
    throw new Error(`invoke ${fnName} returned success:false — ${JSON.stringify(json)}`);
  }
  return json as Record<string, unknown>;
}

serve(async () => {
  if (!isBusinessHour()) {
    return Response.json({ processed: 0, reason: "outside_business_hours" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_enabled", true)
    .order("order_index");

  if (!rules?.length) return Response.json({ processed: 0 });

  let processed = 0;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const rule of rules) {
    try {
      const romeHour = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Europe/Rome",
          hour: "numeric",
          hour12: false,
        }).format(new Date()),
        10,
      );
      const ruleMin = (rule as { min_hour?: number }).min_hour ?? 9;
      const ruleMax = (rule as { max_hour?: number }).max_hour ?? 18;
      if (romeHour < ruleMin || romeHour >= ruleMax) continue; // skip rule outside its window

      switch (rule.trigger_event) {

        case "days_waiting_7": {
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale)")
            .eq("tipo_servizio", "servizio_completo")
            .is("archived_at", null)
            .is("form_compilato_at", null)
            .or(`ultimo_sollecito_privato.is.null,ultimo_sollecito_privato.lt.${sevenDaysAgo}`);

          for (const p of practices ?? []) {
            // Per-practice try/catch: se un invio fallisce vogliamo loggare
            // e continuare con le altre, non bloccare l'intero loop. La
            // pratica fallita verrà riprovata al prossimo cron tick perché
            // `ultimo_sollecito_privato` non viene aggiornato.
            try {
              if (rule.channel === "email" && p.cliente_email) {
                await invoke(supabase, "send-email", {
                  to: p.cliente_email,
                  template: "sollecito_privato",
                  data: {
                    nome: p.cliente_nome,
                    link: buildFormLink(p.form_token),
                    practice_id: p.id,
                  },
                });
              }
              if (rule.channel === "whatsapp" && p.cliente_telefono) {
                await invoke(supabase, "send-whatsapp", {
                  to: normalizePhone(p.cliente_telefono),
                  template_name: "sollecito_compilazione",
                  components: [{
                    type: "body",
                    parameters: [
                      { type: "text", text: p.cliente_nome },
                      { type: "text", text: buildFormLink(p.form_token) },
                      { type: "text", text: "30 giorni" },
                    ],
                  }],
                  practice_id: p.id,
                });
              }
              // Solo se l'invio è andato a buon fine aggiorniamo il marker
              // di idempotency. Altrimenti la pratica resta "eligible" per
              // il prossimo cron tick.
              await supabase.from("enea_practices").update({
                ultimo_sollecito_privato: new Date().toISOString(),
                conteggio_solleciti: (p.conteggio_solleciti ?? 0) + 1,
              }).eq("id", p.id);
            } catch (sendErr) {
              console.error(`[days_waiting_7] practice ${p.id} send failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
                channel: rule.channel,
              });
            }
          }
          processed++;
          break;
        }

        case "days_waiting_fornitore_30":
        case "days_waiting_fornitore_60":
        case "days_waiting_fornitore_90": {
          const days = parseInt(rule.trigger_event.split("_").pop() ?? "30");
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          // Idempotency: require that either no fornitore sollecito has ever been sent,
          // OR the last one is older than `days` — so a second cron tick in the same
          // hour/day won't re-send for practices that already received a reminder.
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale, email)")
            .is("archived_at", null)
            .is("form_compilato_at", null)
            .lt("created_at", cutoff)
            .or(`ultimo_sollecito_fornitore.is.null,ultimo_sollecito_fornitore.lt.${cutoff}`);

          for (const p of practices ?? []) {
            const resellerEmail = (p.companies as { email?: string })?.email;
            if (!resellerEmail) continue;
            try {
              await invoke(supabase, "send-email", {
                to: resellerEmail,
                template: "sollecito_fornitore",
                data: {
                  giorni: String(days),
                  cliente_nome: p.cliente_nome,
                  cliente_cognome: p.cliente_cognome,
                  stato: "In attesa",
                  tentativi: String(p.conteggio_solleciti),
                  practice_id: p.id,
                },
              });
              // Mark to prevent duplicate sends on subsequent cron ticks
              await supabase
                .from("enea_practices")
                .update({ ultimo_sollecito_fornitore: new Date().toISOString() })
                .eq("id", p.id);
            } catch (sendErr) {
              console.error(`[days_waiting_fornitore_${days}] practice ${p.id} failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
              });
            }
          }
          processed++;
          break;
        }

        case "recensione_7d_followup": {
          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*")
            .is("archived_at", null)
            .is("recensione_ricevuta_at", null)
            .lt("recensione_richiesta_at", sevenDaysAgo);

          for (const p of practices ?? []) {
            try {
              // Skip if we already sent a review follow-up (prevents re-sending every cron tick).
              // NB: matchamo solo entry con status='sent' — se l'ultimo tentativo è
              // failed vogliamo riprovare al prossimo tick.
              const { data: alreadySent } = await supabase
                .from("communication_log")
                .select("id")
                .eq("practice_id", p.id)
                .in("channel", ["email", "whatsapp"])
                .eq("status", "sent")
                .or("subject.ilike.%recensione%,body_preview.ilike.%sollecito_recensione%")
                .limit(1)
                .maybeSingle();
              if (alreadySent) continue;

              if (p.cliente_email) {
                await invoke(supabase, "send-email", {
                  to: p.cliente_email,
                  template: "recensione",
                  data: {
                    nome: p.cliente_nome,
                    token: p.form_token,
                    base_url: "https://app.praticarapida.it",
                    practice_id: p.id,
                  },
                });
              }
              if (p.cliente_telefono) {
                await invoke(supabase, "send-whatsapp", {
                  to: normalizePhone(p.cliente_telefono),
                  template_name: "sollecito_recensione",
                  components: [{
                    type: "body",
                    parameters: [{ type: "text", text: p.cliente_nome }],
                  }],
                  practice_id: p.id,
                });
              }
            } catch (sendErr) {
              console.error(`[recensione_7d_followup] practice ${p.id} failed:`, sendErr);
              await reportError(sendErr, {
                fn: "process-automations",
                rule_name: rule.name,
                trigger_event: rule.trigger_event,
                practice_id: p.id,
              });
            }
          }
          processed++;
          break;
        }
      }
    } catch (err) {
      console.error(`Error processing rule ${rule.name}:`, err);
      await reportError(err, {
        fn: "process-automations",
        rule_name: rule.name,
        rule_id: (rule as { id?: string }).id,
        trigger_event: rule.trigger_event,
      });
    }
  }

  return Response.json({ processed });
});
