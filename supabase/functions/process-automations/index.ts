import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isBusinessHour(): boolean {
  const now = new Date();
  // Rome timezone offset: CET=+1, CEST=+2; approximate with +1 always (conservative)
  const romeHour = (now.getUTCHours() + 1) % 24;
  return romeHour >= 9 && romeHour < 18;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

function buildFormLink(token: string): string {
  return `https://pratica-rapida.it/form/${token}`;
}

async function invoke(supabase: ReturnType<typeof createClient>, fnName: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
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
            await supabase.from("enea_practices").update({
              ultimo_sollecito_privato: new Date().toISOString(),
              conteggio_solleciti: (p.conteggio_solleciti ?? 0) + 1,
            }).eq("id", p.id);
          }
          processed++;
          break;
        }

        case "days_waiting_fornitore_30":
        case "days_waiting_fornitore_60":
        case "days_waiting_fornitore_90": {
          const days = parseInt(rule.trigger_event.split("_").pop() ?? "30");
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          const nextDay = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString();

          const { data: practices } = await supabase
            .from("enea_practices")
            .select("*, companies:reseller_id(ragione_sociale, email)")
            .is("archived_at", null)
            .is("form_compilato_at", null)
            .lt("created_at", cutoff)
            .gt("created_at", nextDay);

          for (const p of practices ?? []) {
            const resellerEmail = (p.companies as { email?: string })?.email;
            if (resellerEmail) {
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
            if (p.cliente_email) {
              await invoke(supabase, "send-email", {
                to: p.cliente_email,
                template: "recensione",
                data: {
                  nome: p.cliente_nome,
                  token: p.form_token,
                  base_url: "https://pratica-rapida.it",
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
          }
          processed++;
          break;
        }
      }
    } catch (err) {
      console.error(`Error processing rule ${rule.name}:`, err);
    }
  }

  return Response.json({ processed });
});
