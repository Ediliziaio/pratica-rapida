import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { reportError } from "../_shared/error.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { resellerDisplayName } from "../_shared/reseller.ts";
import {
  buildDichiarazioneData,
  renderDichiarazioneHtml,
} from "../_shared/dichiarazione.ts";

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
 * Recupera tutti i file collegati a una pratica e li converte in attachments
 * Resend (base64). Limit Resend 40 MB totali — limitiamo a 35 MB con margine
 * per il body HTML dell'email.
 *
 * I file della pratica vivono in DUE posti:
 *
 *  A. `enea_practices.pratica_enea_conclusa_urls[]` — array di storage_path
 *     in bucket `enea-documents`. È QUI che vanno i PDF finali della pratica
 *     chiusa caricati dallo staff con "Carica pratica conclusa".
 *  B. tabella `public.documenti` con riga per file, bucket dipende dal `tipo`:
 *     - `dichiarazione_tecnica` → bucket `documenti`
 *     - altri tipi → bucket `documenti`
 *
 * La query precedente leggeva SOLO da (B), missing tutti i file di (A) —
 * quindi le email "pratica completata" arrivavano senza allegati per la
 * maggior parte delle pratiche.
 *
 * Ordine di priorità: prima i file della pratica conclusa (A), poi gli
 * altri documenti rilevanti (B filtrati su tipi pubblici/per-cliente).
 */
async function collectPracticeAttachments(
  supabase: ReturnType<typeof createClient>,
  practiceId: string,
): Promise<Array<{ filename: string; content: string; content_type?: string }>> {
  try {
    const MAX_TOTAL_BYTES = 35 * 1024 * 1024;
    let total = 0;
    const out: Array<{ filename: string; content: string; content_type?: string }> = [];

    // Helper: download blob da bucket + encode base64
    async function downloadAndEncode(
      bucket: string,
      storagePath: string,
      filename: string,
    ): Promise<{ filename: string; content: string; size: number } | null> {
      try {
        const { data: file, error } = await supabase.storage.from(bucket).download(storagePath);
        if (error || !file) return null;
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return { filename, content: btoa(binary), size: bytes.length };
      } catch (e) {
        console.warn(`[collectPracticeAttachments] download ${bucket}/${storagePath} failed:`, e);
        return null;
      }
    }

    // ── A. File della pratica conclusa (bucket enea-documents) ───────────────
    // Source: enea_practices.pratica_enea_conclusa_urls[] (text[])
    const { data: practiceRow } = await supabase
      .from("enea_practices")
      .select("pratica_enea_conclusa_urls, cliente_nome, cliente_cognome")
      .eq("id", practiceId)
      .maybeSingle();

    const conclusaPaths = (practiceRow?.pratica_enea_conclusa_urls as string[] | null) ?? [];
    const clienteSlug = `${practiceRow?.cliente_nome ?? ""}_${practiceRow?.cliente_cognome ?? ""}`
      .trim().replace(/\s+/g, "_").toLowerCase() || "pratica";

    let counter = 1;
    for (const path of conclusaPaths) {
      // Filename "pulito" per il cliente: derivato dal nome cliente + n. progressivo
      const ext = path.split(".").pop()?.toLowerCase() ?? "pdf";
      const filename = `pratica_chiusa_${clienteSlug}_${counter}.${ext}`;
      const encoded = await downloadAndEncode("enea-documents", path, filename);
      if (!encoded) continue;
      if (total + encoded.size > MAX_TOTAL_BYTES) {
        console.warn(`[collectPracticeAttachments] Skip ${filename}: oltre budget 35MB`);
        continue;
      }
      const mime = ext === "pdf" ? "application/pdf" : ext === "p7m" ? "application/pkcs7-mime" : "application/octet-stream";
      out.push({ filename: encoded.filename, content: encoded.content, content_type: mime });
      total += encoded.size;
      counter++;
    }

    // ── B. Documenti dalla tabella documenti — dichiarazione tecnica ─────────
    // Solo i tipi rilevanti per il cliente. Altri tipi (identità, fatture)
    // restano in bucket privati staff-only.
    const { data: docs } = await supabase
      .from("documenti")
      .select("nome_file, mime_type, storage_path, size_bytes, tipo")
      .eq("pratica_id", practiceId)
      .in("tipo", ["dichiarazione_tecnica"])
      .order("created_at", { ascending: true });

    for (const d of (docs ?? [])) {
      const size = Number(d.size_bytes ?? 0);
      if (total + size > MAX_TOTAL_BYTES) {
        console.warn(`[collectPracticeAttachments] Skip ${d.nome_file}: oltre budget 35MB`);
        continue;
      }
      // Tipologie note vivono in bucket `documenti`
      const encoded = await downloadAndEncode("documenti", d.storage_path, d.nome_file);
      if (!encoded) continue;
      out.push({
        filename: encoded.filename,
        content: encoded.content,
        ...(d.mime_type ? { content_type: d.mime_type } : {}),
      });
      total += encoded.size;
    }

    if (out.length === 0) {
      console.warn(`[collectPracticeAttachments] practice ${practiceId}: NESSUN allegato trovato (conclusaPaths=${conclusaPaths.length}, docs=${docs?.length ?? 0})`);
    }
    return out;
  } catch (err) {
    console.error("[collectPracticeAttachments] failed:", err);
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
    // piva/indirizzo/citta/provincia servono alla Dichiarazione Requisiti
    // Tecnici generata allo stage "recensione".
    .select("*, companies:reseller_id(ragione_sociale, email, piva, indirizzo, citta, provincia)")
    .eq("id", practice_id)
    .single();

  if (!practice) {
    return new Response(JSON.stringify({ ok: false, error: "Practice not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const resellerName = resellerDisplayName(practice);

  // Risolve email rivenditore con fallback: companies.email → azienda_admin/rivenditore email
  const { data: emailResolved } = await supabase.rpc("get_reseller_contact_email", {
    p_company_id: practice.reseller_id,
  });
  const resellerEmail: string | null = emailResolved ?? null;

  // Esito dei passi opzionali, riportato nella risposta per diagnosi.
  const steps: Record<string, string> = {};

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

      // Traccia l'esito degli invii al cliente: l'auto-spostamento in
      // "da inserire su Excel" avviene solo se gli invii sono andati a buon fine.
      let clientEmailOk = true;
      let clientWaOk = true;

      // Per "documenti forniti" il cliente finale non va contattato: ha fatto
      // tutto il rivenditore. UNICA eccezione, scelta da lui nel form: se ha
      // risposto sì a "mandiamo la pratica ENEA al cliente una volta conclusa?"
      // (invia_pratica_al_cliente), qui il cliente riceve la pratica come nel
      // servizio completo. Il default della colonna è false, quindi le pratiche
      // già a sistema e chi non ha risposto restano al comportamento storico.
      const skipClientMessages =
        practice.tipo_servizio === "documenti_forniti" && !practice.invia_pratica_al_cliente;

      // Email al cliente finale (gated by stage_changed/email; no such rule in DB → defaults to enabled).
      // CON ALLEGATI: recupera tutti i documenti della pratica e li allega base64.
      // Resend limita gli allegati totali a 40MB.
      if (!skipClientMessages && stageEmailEnabled && practice.cliente_email) {
        const attachments = await collectPracticeAttachments(supabase, practice_id);
        clientEmailOk = await invoke("send-email", {
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
      if (!skipClientMessages && stageWhatsappEnabled && practice.cliente_telefono) {
        clientWaOk = await invoke("send-whatsapp", {
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

      // CRM#9 — Auto-spostamento: dopo che mail + WhatsApp di chiusura sono
      // partiti correttamente, sposta la pratica in "da inserire su Excel"
      // (stage di sistema per il brand), così lo staff sa che va loggata.
      if (clientEmailOk && clientWaOk) {
        const { data: excelStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .is("reseller_id", null)
          .eq("stage_type", "da_inserire_excel")
          .eq("brand", practice.brand)
          .maybeSingle();
        if (excelStage?.id) {
          await supabase
            .from("enea_practices")
            .update({ current_stage_id: excelStage.id })
            .eq("id", practice_id);
        } else {
          console.warn(`[on-stage-changed] stage da_inserire_excel non trovato per brand ${practice.brand}`);
        }
      }

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

    // Dichiarazione Requisiti Tecnici — generata quando la pratica entra in
    // "recensione": a quel punto il form del cliente è compilato e i lavori
    // sono conclusi, quindi indirizzo immobile, residenza e C.F. ci sono.
    //
    // Generata per OGNI tipo di intervento (scelta esplicita del committente).
    // Nota: il modulo dichiara interventi su infissi e schermature solari, e i
    // prodotti fuori da questi due (pompe di calore, insufflaggio) escono con
    // le caselle tecniche vuote — vedi classificaIntervento in
    // _shared/dichiarazione.ts.
    //
    // I dati dell'azienda che mancano in anagrafica restano righe vuote da
    // riempire a penna: oggi quasi nessuna company ha P.IVA e sede legale.
    case "recensione": {
      if (!practice.reseller_id) break;

      // Idempotenza: la pratica può rientrare in "recensione" più volte, e non
      // vogliamo una pila di dichiarazioni duplicate nella card.
      const { data: esistente } = await supabase
        .from("documenti")
        .select("id")
        .eq("pratica_id", practice_id)
        .eq("tipo", "dichiarazione_tecnica")
        .limit(1)
        .maybeSingle();
      if (esistente) {
        steps.dichiarazione = "already_present";
        break;
      }

      try {
        const dati = buildDichiarazioneData({
          practice,
          company: practice.companies as Record<string, string | null> | null,
          datiForm: (practice.dati_form ?? null) as Record<string, unknown> | null,
        });
        const html = renderDichiarazioneHtml(dati);
        const bytes = new TextEncoder().encode(html);
        const storagePath = `${practice.reseller_id}/${practice_id}/dichiarazione_tecnica_${Date.now()}.html`;

        const { error: uploadErr } = await supabase.storage
          .from("documenti")
          .upload(storagePath, bytes, { contentType: "text/html;charset=utf-8", upsert: false });
        if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);

        const cliente = `${practice.cliente_nome ?? ""} ${practice.cliente_cognome ?? ""}`.trim();
        // caricato_da resta NULL: nessun utente ha caricato il file, l'ha
        // generato il sistema (vedi migration 20260716140000).
        const { error: insertErr } = await supabase.from("documenti").insert({
          company_id: practice.reseller_id,
          pratica_id: practice_id,
          nome_file: `Dichiarazione Requisiti Tecnici${cliente ? ` — ${cliente}` : ""}.html`,
          tipo: "dichiarazione_tecnica",
          mime_type: "text/html",
          size_bytes: bytes.byteLength,
          storage_path: storagePath,
          visibilita: "azienda_interno",
        });
        if (insertErr) {
          // Niente file orfani nel bucket se il metadata non entra.
          await supabase.storage.from("documenti").remove([storagePath]);
          throw new Error(`insert: ${insertErr.message}`);
        }
        steps.dichiarazione = "created";
      } catch (docErr) {
        // Non-fatale: lo spostamento di stage resta valido anche se il
        // documento non si genera. Il super_admin può sempre crearlo a mano
        // dal dialog "Dichiarazione Requisiti Tecnici".
        console.error("[on-stage-changed] dichiarazione fallita:", docErr);
        await reportError(docErr, { fn: "on-stage-changed", step: "dichiarazione", practice_id });
        steps.dichiarazione = "failed";
      }
      break;
    }
  }

  return new Response(JSON.stringify({ ok: true, stage: new_stage_type, ...steps }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
  } catch (err) {
    await reportError(err, { fn: "on-stage-changed", practice_id, new_stage_type });
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
