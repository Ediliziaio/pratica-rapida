import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.praticarapida.it";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

async function invoke(fnName: string, body: unknown) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const { practice_id, new_stage_type, note_docs_mancanti } = await req.json();
  if (!practice_id || !new_stage_type) {
    return Response.json({ ok: false, error: "Missing required fields" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load practice with reseller company
  const { data: practice } = await supabase
    .from("enea_practices")
    .select("*, companies:reseller_id(ragione_sociale, email)")
    .eq("id", practice_id)
    .single();

  if (!practice) return Response.json({ ok: false, error: "Practice not found" });

  const resellerEmail = (practice.companies as { email?: string })?.email;
  const resellerName = (practice.companies as { ragione_sociale?: string })?.ragione_sociale ?? "";

  switch (new_stage_type) {
    // Notifica A — documenti mancanti → email al rivenditore
    case "documenti_mancanti": {
      if (resellerEmail) {
        await invoke("send-email", {
          to: resellerEmail,
          template: "notifica_docs_mancanti",
          data: {
            cliente_nome: practice.cliente_nome,
            cliente_cognome: practice.cliente_cognome,
            note: note_docs_mancanti ?? "Nessuna nota aggiuntiva.",
            link: `${APP_URL}/kanban`,
            practice_id,
          },
        });
      }
      break;
    }

    // Messaggio 4 + Notifica C — pratica inviata → email+WA al cliente + email al rivenditore
    case "da_inviare": {
      // Email al cliente finale
      if (practice.cliente_email) {
        await invoke("send-email", {
          to: practice.cliente_email,
          template: "pratica_inviata",
          data: {
            nome: practice.cliente_nome,
            cognome: practice.cliente_cognome,
            brand: practice.brand === "enea" ? "ENEA" : "Conto Termico",
            base_url: "https://pratica-rapida.it",
            token: practice.form_token,
            practice_id,
          },
        });
      }

      // WA al cliente finale
      if (practice.cliente_telefono) {
        await invoke("send-whatsapp", {
          to: normalizePhone(practice.cliente_telefono),
          template_name: "pratica_completata",
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: practice.cliente_nome },
            ],
          }],
          practice_id,
        });
      }

      // Notifica C — email al rivenditore
      if (resellerEmail) {
        await invoke("send-email", {
          to: resellerEmail,
          template: "notifica_pratica_disponibile",
          data: {
            cliente_nome: practice.cliente_nome,
            cliente_cognome: practice.cliente_cognome,
            app_url: APP_URL,
            practice_id,
          },
        });
      }

      // Mark recensione_richiesta_at
      await supabase.from("enea_practices").update({
        recensione_richiesta_at: new Date().toISOString(),
      }).eq("id", practice_id);

      break;
    }

    // Messaggio 3 — form compilato, pronte da fare → email+WA conferma al cliente
    case "pronte_da_fare": {
      if (practice.tipo_servizio === "servizio_completo" && practice.form_compilato_at) {
        if (practice.cliente_email) {
          await invoke("send-email", {
            to: practice.cliente_email,
            template: "form_compilato",
            data: {
              nome: practice.cliente_nome,
              brand: practice.brand === "enea" ? "ENEA" : "Conto Termico",
              practice_id,
            },
          });
        }
        if (practice.cliente_telefono) {
          await invoke("send-whatsapp", {
            to: normalizePhone(practice.cliente_telefono),
            template_name: "conferma_dati_ricevuti",
            components: [{
              type: "body",
              parameters: [{ type: "text", text: practice.cliente_nome }],
            }],
            practice_id,
          });
        }
      }
      break;
    }
  }

  return Response.json({ ok: true, stage: new_stage_type });
});
