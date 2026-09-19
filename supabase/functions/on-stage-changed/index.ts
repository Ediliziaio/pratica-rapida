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
    const responseText = await res.text();
    let responseBody: { success?: boolean; ok?: boolean; error?: unknown } | null = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }
    const logicalSuccess = responseBody?.success !== false && responseBody?.ok !== false;
    if (!res.ok || !logicalSuccess) {
      const errText = responseText || JSON.stringify(responseBody ?? {});
      console.error(`invoke(${fnName}) failed: ${res.status} ${errText}`);
      await reportError(new Error(`invoke(${fnName}) failed: ${res.status}`), {
        fn: "on-stage-changed",
        invoked: fnName,
        status: res.status,
        body: errText,
      });
    }
    return res.ok && logicalSuccess;
  } catch (err) {
    console.error(`invoke(${fnName}) threw:`, err);
    await reportError(err, { fn: "on-stage-changed", invoked: fnName });
    return false;
  }
}

/**
 * Pacchetto ENEA + F-Gas (dati_form.fgas): letto in modo difensivo, perche'
 * il JSON e' compilato dal form del rivenditore e potrebbe mancare o essere
 * malformato. Nessuna eccezione deve fermare la consegna delle pratiche
 * ENEA normali.
 */
function fgasPackageInfo(datiForm: unknown): { requested: boolean; status: string | null; completionPaths: string[] } {
  const dati = datiForm && typeof datiForm === "object" && !Array.isArray(datiForm) ? datiForm as Record<string, unknown> : null;
  const fgas = dati?.fgas && typeof dati.fgas === "object" && !Array.isArray(dati.fgas) ? dati.fgas as Record<string, unknown> : null;
  if (!fgas || fgas.requested !== true) return { requested: false, status: null, completionPaths: [] };
  const raw = Array.isArray(fgas.completion_document_urls) ? fgas.completion_document_urls : [];
  const completionPaths = raw.filter((p): p is string => typeof p === "string" && p.trim().length > 0 && !p.includes("..") && !p.startsWith("/"));
  return { requested: true, status: typeof fgas.status === "string" ? fgas.status : null, completionPaths };
}

/**
 * Recupera tutti i file collegati a una pratica e li converte in attachments
 * Resend (base64). Limit Resend 40 MB totali — limitiamo a 35 MB con margine
 * per il body HTML dell'email.
 *
 * La fonte autorizzata per la consegna al cliente è esclusivamente
 * `enea_practices.pratica_enea_conclusa_urls[]` nel bucket `enea-documents`:
 * contiene i PDF finali caricati dallo staff con "Carica pratica conclusa".
 *
 * Non alleghiamo i record della tabella `documenti`: lì può esserci la
 * Dichiarazione Requisiti Tecnici HTML generata per uso interno, che non fa
 * parte del pacchetto conclusivo caricato dall'operatore.
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

    // File della pratica conclusa (bucket enea-documents)
    // Source: enea_practices.pratica_enea_conclusa_urls[] (text[])
    const { data: practiceRow } = await supabase
      .from("enea_practices")
      .select("pratica_enea_conclusa_urls, cliente_nome, cliente_cognome, dati_form")
      .eq("id", practiceId)
      .maybeSingle();

    const conclusaPaths = (practiceRow?.pratica_enea_conclusa_urls as string[] | null) ?? [];
    // Pacchetto ENEA + F-Gas: la ricevuta F-Gas caricata dallo staff sta in
    // dati_form.fgas.completion_document_urls (bucket enea-documents,
    // {id}/fgas-conclusa/...). Va nella STESSA e-mail dei documenti ENEA.
    const fgas = fgasPackageInfo(practiceRow?.dati_form);
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

    let fgasCounter = 1;
    for (const path of fgas.completionPaths) {
      const ext = path.split(".").pop()?.toLowerCase() ?? "pdf";
      const filename = `ricevuta_fgas_${clienteSlug}_${fgasCounter}.${ext}`;
      const encoded = await downloadAndEncode("enea-documents", path, filename);
      if (!encoded) continue;
      if (total + encoded.size > MAX_TOTAL_BYTES) {
        console.warn(`[collectPracticeAttachments] Skip ${filename}: oltre budget 35MB`);
        continue;
      }
      const mime = ext === "pdf" ? "application/pdf" : ext === "p7m" ? "application/pkcs7-mime" : "application/octet-stream";
      out.push({ filename: encoded.filename, content: encoded.content, content_type: mime });
      total += encoded.size;
      fgasCounter++;
    }

    if (out.length === 0) {
      console.warn(`[collectPracticeAttachments] practice ${practiceId}: NESSUN allegato conclusivo trovato (conclusaPaths=${conclusaPaths.length})`);
    }
    // Pacchetto F-Gas richiesto ma ricevuta assente o non scaricabile: non si
    // consegna una commessa incompleta. Il chiamante tratta la lista vuota
    // come "missing_attachments" e non invia.
    if (fgas.requested && fgasCounter === 1) {
      console.warn(`[collectPracticeAttachments] practice ${practiceId}: pacchetto F-Gas richiesto ma nessuna ricevuta F-Gas allegabile (status=${fgas.status}, paths=${fgas.completionPaths.length})`);
      return [];
    }
    console.log(`[collectPracticeAttachments] practice ${practiceId}: allegati=${out.map((a) => a.filename).join(", ")}`);
    return out;
  } catch (err) {
    console.error("[collectPracticeAttachments] failed:", err);
    return [];
  }
}

async function isRuleEnabled(
  supabase: ReturnType<typeof createClient>,
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

async function hasSuccessfulTemplateCommunication(
  supabase: ReturnType<typeof createClient>,
  practiceId: string,
  channel: "email" | "whatsapp",
  template: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("communication_log")
    .select("metadata, body_preview")
    .eq("practice_id", practiceId)
    .eq("channel", channel)
    .in("status", ["sent", "delivered", "read"])
    .limit(50);

  return (data ?? []).some((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    return metadata?.template === template ||
      (typeof row.body_preview === "string" && row.body_preview.startsWith(`[${template}]`));
  });
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

    // Messaggio 4 + Notifica C — pratica inviata → email+WA al cliente + email al rivenditore.
    // `gestionale` è il tipo DB della colonna "Da inserire su Excel".
    // Manteniamo anche `da_inviare` per compatibilità con il flusso storico:
    // l'idempotenza sottostante impedisce doppi invii se la pratica attraversa entrambe.
    case "da_inviare":
    case "gestionale": {
      const stageEmailEnabled = await isRuleEnabled(supabase, "stage_changed", "email");
      const stageWhatsappEnabled = await isRuleEnabled(supabase, "stage_changed", "whatsapp");

      // Traccia l'esito degli invii al cliente: l'auto-spostamento in
      // "da inserire su Excel" avviene solo se gli invii sono andati a buon fine.
      let clientEmailOk = true;
      let clientWaOk = true;

      // Per "documenti forniti" il cliente finale non va contattato: ha fatto
      // tutto il rivenditore. UNICA eccezione, scelta da lui nel form: se ha
      // risposto sì a "mandiamo la pratica ENEA al cliente una volta conclusa?"
      // (invia_pratica_al_cliente), gli arriva la mail con la pratica allegata.
      // Il default della colonna è false, quindi le pratiche già a sistema e chi
      // non ha risposto restano al comportamento storico.
      const skipClientMessages =
        practice.tipo_servizio === "documenti_forniti" && !practice.invia_pratica_al_cliente;
      // In quell'eccezione gli mandiamo SOLO la mail con la pratica allegata:
      // è quello che il form promette al rivenditore ("gli inviamo la pratica
      // tramite mail"), niente WhatsApp.
      const soloMailAlCliente =
        practice.tipo_servizio === "documenti_forniti" && practice.invia_pratica_al_cliente === true;

      // Email al cliente finale (gated by stage_changed/email; no such rule in DB → defaults to enabled).
      // CON ALLEGATI: recupera tutti i documenti della pratica e li allega base64.
      // Resend limita gli allegati totali a 40MB.
      if (!skipClientMessages && stageEmailEnabled) {
        const emailAlreadySent = await hasSuccessfulTemplateCommunication(
          supabase, practice_id, "email", "pratica_inviata",
        );
        if (emailAlreadySent) {
          steps.client_email = "already_sent";
        } else if (!practice.cliente_email) {
          clientEmailOk = false;
          steps.client_email = "missing_recipient";
        } else {
          const attachments = await collectPracticeAttachments(supabase, practice_id);
          if (attachments.length === 0) {
            // Mai dichiarare consegnata una pratica senza il documento conclusivo.
            clientEmailOk = false;
            steps.client_email = "missing_attachments";
          } else {
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
              attachments,
            });
            steps.client_email = clientEmailOk ? "sent" : "failed";
          }
        }
      }

      // WA al cliente finale (gated by stage_changed/whatsapp — recensione rule).
      // Il template unisce conferma di consegna e richiesta recensione, così
      // il cliente riceve un solo messaggio anziché due messaggi consecutivi.
      // Escluso il caso "documenti forniti + invia_pratica_al_cliente": lì il
      // form promette al rivenditore la sola mail, e il suo cliente non è mai
      // stato contattato prima — un WhatsApp a sorpresa sarebbe fuori posto.
      if (!skipClientMessages && !soloMailAlCliente && stageWhatsappEnabled && clientEmailOk && practice.cliente_telefono) {
        const waAlreadySent = await hasSuccessfulTemplateCommunication(
          supabase, practice_id, "whatsapp", "invio_avvenuto_recensione",
        );
        if (waAlreadySent) {
          steps.client_whatsapp = "already_sent";
        } else {
          clientWaOk = await invoke("send-whatsapp", {
            to: normalizePhone(practice.cliente_telefono),
            template_name: "invio_avvenuto_recensione",
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: practice.cliente_nome },
                { type: "text", text: practice.cliente_email ?? "—" },
              ],
            }],
            practice_id,
          });
          steps.client_whatsapp = clientWaOk ? "sent" : "failed";
        }
      }

      // Richiesta recensione — per TUTTI i clienti la cui pratica è stata
      // portata a termine, inclusi i casi "documenti_forniti". È separata
      // dalla consegna così ha audit e idempotenza propri sui due canali.
      // I link ufficiali Google/Trustpilot sono nei template DB.
      let reviewEmailOk = false;
      let reviewWhatsappOk = false;
      const reviewEligible = practice.tipo_servizio === "documenti_forniti" || clientEmailOk;

      if (!reviewEligible) {
        steps.review_email = "blocked_delivery_incomplete";
      } else if (practice.cliente_email) {
        const reviewEmailAlreadySent = await hasSuccessfulTemplateCommunication(
          supabase, practice_id, "email", "recensione",
        );
        if (reviewEmailAlreadySent) {
          reviewEmailOk = true;
          steps.review_email = "already_sent";
        } else {
          reviewEmailOk = await invoke("send-email", {
            to: practice.cliente_email,
            template: "recensione",
            data: {
              nome: practice.cliente_nome,
              cognome: practice.cliente_cognome,
              practice_id,
              trigger_event: "recensione_initial",
            },
          });
          steps.review_email = reviewEmailOk ? "sent" : "failed";
        }
      } else {
        steps.review_email = "missing_recipient";
      }

      if (!reviewEligible) {
        steps.review_whatsapp = "blocked_delivery_incomplete";
      } else if (practice.cliente_telefono) {
        const reviewWaAlreadySent = await hasSuccessfulTemplateCommunication(
          supabase, practice_id, "whatsapp", "invio_avvenuto_recensione",
        );
        if (reviewWaAlreadySent) {
          reviewWhatsappOk = true;
          steps.review_whatsapp = "already_sent";
        } else {
          reviewWhatsappOk = await invoke("send-whatsapp", {
            to: normalizePhone(practice.cliente_telefono),
            template_name: "invio_avvenuto_recensione",
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: practice.cliente_nome },
                { type: "text", text: practice.cliente_email ?? "—" },
              ],
            }],
            practice_id,
          });
          steps.review_whatsapp = reviewWhatsappOk ? "sent" : "failed";
        }
      } else {
        steps.review_whatsapp = "missing_recipient";
      }

      // Notifica C — email al rivenditore (always-on, no DB rule)
      if (resellerEmail) {
        const resellerEmailAlreadySent = await hasSuccessfulTemplateCommunication(
          supabase, practice_id, "email", "notifica_pratica_disponibile",
        );
        if (resellerEmailAlreadySent) {
          steps.reseller_email = "already_sent";
        } else {
          const resellerEmailOk = await invoke("send-email", {
            to: resellerEmail,
            template: "notifica_pratica_disponibile",
            data: {
              cliente_nome: practice.cliente_nome,
              cliente_cognome: practice.cliente_cognome,
              app_url: APP_URL,
              practice_id,
            },
          });
          steps.reseller_email = resellerEmailOk ? "sent" : "failed";
        }
      }

      if (!skipClientMessages && stageEmailEnabled && clientEmailOk) {
        await supabase
          .from("enea_practices")
          .update({ data_invio_pratica: new Date().toISOString() })
          .eq("id", practice_id)
          .is("data_invio_pratica", null);
      }

      // Il timer dei 7 giorni parte soltanto se almeno uno dei due canali ha
      // realmente accettato la richiesta (o risultava già inviato). Non
      // dichiariamo più "recensione richiesta" quando entrambi falliscono.
      if (reviewEmailOk || reviewWhatsappOk) {
        await supabase.from("enea_practices").update({
          recensione_richiesta_at: practice.recensione_richiesta_at ?? new Date().toISOString(),
        }).eq("id", practice_id);
      }

      // CRM#9 — Auto-spostamento: dopo che mail + WhatsApp di chiusura sono
      // partiti correttamente, sposta la pratica in "da inserire su Excel"
      // (stage di sistema per il brand), così lo staff sa che va loggata.
      if (new_stage_type === "da_inviare" && clientEmailOk && clientWaOk) {
        const { data: excelStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .is("reseller_id", null)
          .eq("stage_type", "gestionale")
          .eq("brand", practice.brand)
          .maybeSingle();
        if (excelStage?.id) {
          await supabase
            .from("enea_practices")
            .update({ current_stage_id: excelStage.id })
            .eq("id", practice_id);
        } else {
          console.warn(`[on-stage-changed] stage gestionale (Da inserire su Excel) non trovato per brand ${practice.brand}`);
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

  const failedSteps = Object.entries(steps)
    .filter(([, value]) => ["failed", "missing_recipient", "missing_attachments"].includes(value))
    .map(([key]) => key);
  const ok = failedSteps.length === 0;
  if (!ok) {
    await reportError(new Error(`Automazione incompleta: ${failedSteps.join(", ")}`), {
      fn: "on-stage-changed",
      practice_id,
      new_stage_type,
      steps,
    });
  }
  return new Response(JSON.stringify({
    ok,
    stage: new_stage_type,
    ...steps,
    ...(ok ? {} : { error: `Automazione incompleta: ${failedSteps.join(", ")}` }),
  }), {
    status: ok ? 200 : 502, headers: { ...CORS, "Content-Type": "application/json" },
  });
  } catch (err) {
    await reportError(err, { fn: "on-stage-changed", practice_id, new_stage_type });
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
