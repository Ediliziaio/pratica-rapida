import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of REQUIRED_ENV) {
  if (!Deno.env.get(k)) console.error(`[on-stage-changed] Missing env: ${k}`);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.praticarapida.it";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0039/, "39").replace(/^\+/, "");
}

async function invoke(fnName: string, body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`invoke(${fnName}) failed: ${res.status} ${errText}`);
      await reportError(new Error(`invoke(${fnName}) failed: ${res.status}`), {
        fn: "on-stage-changed",
        invoked: fnName,
        status: res.status,
        body: errText,
      });
    }
    return res.ok;
  } catch (err) {
    console.error(`invoke(${fnName}) threw:`, err);
    await reportError(err, { fn: "on-stage-changed", invoked: fnName });
    return false;
  }
}

/**
 * Recupera i documenti collegati a una pratica e li converte in attachments
 * Resend (base64). Filtra automaticamente quelli oltre 35MB cumulativi per
 * non sforare il limite Resend (40MB totale, lasciamo margine per body).
 *
 * Schema documenti: id, pratica_id, nome_file, mime_type, storage_path, tipo.
 * Bucket: documenti / enea-documents (entrambi privati con service role access).
 */
async function collectPracticeAttachments(
  supabase: ReturnType<typeof createClient>,
  practiceId: string,
): Promise<Array<{ filename: string; content: string; content_type?: string }>> {
  try {
    const { data: docs, error } = await supabase
      .from("documenti")
      .select("nome_file, mime_type, storage_path, size_bytes")
      .eq("pratica_id", practiceId)
      .order("created_at", { ascending: true });
    if (error || !docs) return [];

    const MAX_TOTAL_BYTES = 35 * 1024 * 1024;
    let total = 0;
    const out: Array<{ filename: string; content: string; content_type?: string }> = [];

    for (const d of docs) {
      const size = Number(d.size_bytes ?? 0);
      if (total + size > MAX_TOTAL_BYTES) {
        console.warn(`[on-stage-changed] Skipping ${d.nome_file}: would exceed 35MB email budget`);
        continue;
      }
      // Tentiamo entrambi i bucket noti (lo schema non distingue univocamente)
      let blob: Blob | null = null;
      for (const bucket of ["documenti", "enea-documents"]) {
        const { data: file } = await supabase.storage.from(bucket).download(d.storage_path);
        if (file) { blob = file; break; }
      }
      if (!blob) continue;

      const buf = await blob.arrayBuffer();
      // Encode base64 manually (Deno doesn't have btoa for arbitrary bytes)
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      out.push({
        filename: d.nome_file,
        content: base64,
        ...(d.mime_type ? { content_type: d.mime_type } : {}),
      });
      total += size;
    }
    return out;
  } catch (err) {
    console.error("[on-stage-changed] collectPracticeAttachments failed:", err);
    return [];
  }
}

async function isRuleEnabled(
  supabase: any,
  triggerEvent: string,
  channel: "email" | "whatsapp",
): Promise<boolean> {
  const { data } = await supabase
    .from("automation_rules")
    .select("is_enabled")
    .eq("trigger_event", triggerEvent)
    .eq("channel", channel)
    .maybeSingle();
  // If no matching rule exists, default to enabled (hardcoded flow is the source of truth)
  if (!data) return true;
  return data.is_enabled !== false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let practice_id: string | undefined;
  let new_stage_type: string | undefined;
  let note_docs_mancanti: string | undefined;
  try {
    const body = await req.json();
    practice_id = body.practice_id;
    new_stage_type = body.new_stage_type;
    note_docs_mancanti = body.note_docs_mancanti;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!practice_id || !new_stage_type) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load practice with reseller company
  const { data: practice } = await supabase
    .from("enea_practices")
    .select("*, companies:reseller_id(ragione_sociale, email)")
    .eq("id", practice_id)
    .single();

  if (!practice) {
    return new Response(JSON.stringify({ ok: false, error: "Practice not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const resellerName = (practice.companies as { ragione_sociale?: string })?.ragione_sociale ?? "";

  // Risolve email rivenditore con fallback: companies.email → azienda_admin/rivenditore email
  const { data: emailResolved } = await supabase.rpc("get_reseller_contact_email", {
    p_company_id: practice.reseller_id,
  });
  const resellerEmail: string | null = emailResolved ?? null;

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
      const stageEmailEnabled = await isRuleEnabled(supabase, "stage_changed", "email");
      const stageWhatsappEnabled = await isRuleEnabled(supabase, "stage_changed", "whatsapp");

      // Email al cliente finale (gated by stage_changed/email; no such rule in DB → defaults to enabled).
      // CON ALLEGATI: recupera tutti i documenti della pratica e li allega base64.
      // Resend limita gli allegati totali a 40MB.
      if (stageEmailEnabled && practice.cliente_email) {
        const attachments = await collectPracticeAttachments(supabase, practice_id);
        await invoke("send-email", {
          to: practice.cliente_email,
          template: "pratica_inviata",
          data: {
            nome: practice.cliente_nome,
            cognome: practice.cliente_cognome,
            brand: practice.brand === "enea" ? "ENEA" : "Conto Termico",
            base_url: "https://app.praticarapida.it",
            token: practice.form_token,
            practice_id,
          },
          ...(attachments.length > 0 ? { attachments } : {}),
        });
      }

      // WA al cliente finale (gated by stage_changed/whatsapp — recensione rule)
      if (stageWhatsappEnabled && practice.cliente_telefono) {
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

      // Notifica C — email al rivenditore (always-on, no DB rule)
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
        const formEmailEnabled = await isRuleEnabled(supabase, "form_compiled", "email");

        // Email al cliente (gated by form_compiled/email)
        if (formEmailEnabled && practice.cliente_email) {
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
        // WA al cliente (always-on, no DB rule for form_compiled/whatsapp)
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

  return new Response(JSON.stringify({ ok: true, stage: new_stage_type }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
  } catch (err) {
    await reportError(err, { fn: "on-stage-changed", practice_id, new_stage_type });
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
