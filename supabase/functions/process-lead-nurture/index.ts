import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://app.praticarapida.it";
const OFFSETS = [0, 1, 3, 6, 10, 16, 24, 34, 46, 60] as const;

const STEPS = [
  {
    channel: "email", subject: "Grazie per aver contattato Pratica Rapida",
    body: `Grazie per la richiesta. Pratica Rapida è il tuo ufficio pratiche esterno: tu segui il cliente, noi gestiamo la pratica ENEA dall'inizio alla consegna. La prima pratica è in omaggio, così puoi verificare direttamente come lavoriamo.`,
  },
  {
    channel: "whatsapp", subject: "La prima pratica è in omaggio",
    body: `Ciao {{nome}}, sono Giuliano di Pratica Rapida. Anche se oggi non hai una pratica pronta, salva questo numero: quando finirai il prossimo lavoro ci penseremo noi. La prima pratica ENEA è in omaggio. Per qualsiasi domanda puoi rispondere qui.`,
  },
  {
    channel: "email", subject: "Affidare una pratica richiede meno di un minuto",
    body: `Inserisci pochi dati e la fattura dalla tua area riservata. Da quel momento lavorano persone vere: contattiamo il cliente in nome tuo, raccogliamo ciò che manca, controlliamo e trasmettiamo la pratica. Se vuoi vedere il portale in funzione, rispondi a questa email: ti mandiamo una breve dimostrazione.`,
  },
  {
    channel: "whatsapp", subject: "Non serve aspettare il prossimo preventivo",
    body: `Ciao {{nome}}, per provare Pratica Rapida non devi aspettare un nuovo preventivo. Puoi scegliere anche un lavoro concluso di recente e regalare al cliente la pratica ENEA: la prima la offriamo noi. Tu vedi subito come lavoriamo, senza alcun impegno.`,
  },
  {
    channel: "email", subject: "Il portale è semplice. Ma dietro ci sono persone vere",
    body: `L'area riservata serve per inserire e seguire le pratiche in tempo reale. Il valore vero, però, sono gli operatori: rispondiamo al telefono, parliamo con il cliente, controlliamo i documenti e gestiamo i casi particolari. Con documentazione completa lavoriamo entro 48 ore lavorative.`,
  },
  {
    channel: "whatsapp", subject: "Quanto ti costa davvero una pratica fatta internamente?",
    body: `Ciao {{nome}}, con Pratica Rapida non acquisti un software e non devi imparare a usare un altro portale. A 65 € + IVA affidaci il lavoro: nessun abbonamento, nessun anticipo e a fine mese paghi soltanto le pratiche concluse.`,
  },
  {
    channel: "email", subject: "Il cliente ricorda chi gli risolve anche la burocrazia",
    body: `Quando consegni al cliente anche la pratica ENEA pronta, il servizio non finisce con l'installazione. Aumenti il valore percepito, mantieni il rapporto e puoi includere o rivendere la pratica nel tuo servizio senza occuparti della compilazione.`,
  },
  {
    channel: "whatsapp", subject: "La tua area riservata resta pronta",
    body: `Ciao {{nome}}, la tua area Pratica Rapida ti permette di inserire una richiesta, vedere lo stato in tempo reale e ritrovare i documenti conclusi. Quando arriva il lavoro giusto, scrivici: ti aiutiamo noi anche al telefono.`,
  },
  {
    channel: "email", subject: "Una prova concreta, senza vincoli",
    body: `Non chiediamo canoni, pacchetti prepagati o volumi minimi. Ti omaggiamo la prima pratica proprio perché il modo più semplice per valutare Pratica Rapida è vederci lavorare su un caso reale. Rispondi a questa email: prepariamo noi la tua area riservata.`,
  },
  {
    channel: "email", subject: "Quando avrai la prossima pratica, siamo qui",
    body: `Chiudiamo qui i promemoria automatici. Quando terminerai un lavoro su infissi, schermature solari, pompe di calore, climatizzazione o insufflaggio, ricorda che puoi affidare a noi l'intera pratica ENEA. Rispondi a questa email o chiamaci allo 039 868 2691.`,
  },
] as const;

function inBusinessHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday");
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  if (day === "Sun") return false;
  if (day === "Sat") return mins >= 510 && mins < 840;
  return mins >= 510 && mins < 1320;
}

async function invoke(name: string, body: unknown) {
  const res = await fetch(`${URL}/functions/v1/${name}`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(String(json?.error ?? `HTTP ${res.status}`));
  return json;
}

function validRecipient(channel: string, email: string | null, phone: string | null): boolean {
  if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "");
  return (phone ?? "").replace(/\D/g, "").length >= 8;
}

function contentIsSafe(body: string): boolean {
  const urls = body.match(/https?:\/\/\S+/g) ?? [];
  return urls.every((url) => url.startsWith(APP));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${KEY}`) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!inBusinessHours()) return Response.json({ ok: true, processed: 0, reason: "outside_business_hours" });

  const db = createClient(URL, KEY);
  const { data: cfg } = await db.from("platform_settings").select("value").eq("key", "lead_nurture_config").maybeSingle();
  if ((cfg?.value as { enabled?: boolean } | null)?.enabled !== true) return Response.json({ ok: true, processed: 0, reason: "disabled" });

  const providerInfo = await invoke("send-whatsapp", { action: "get_provider" }).catch(() => ({ provider: "meta" }));
  const waProvider = String(providerInfo?.provider ?? "meta");
  const { data: due, error } = await db.rpc("claim_due_lead_nurture", { p_limit: 20 });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];
  for (const lead of due ?? []) {
    const step = STEPS[lead.step_index];
    if (!step) {
      await db.from("lead_nurture_enrollments").update({ status: "completed", stopped_at: new Date().toISOString(), stop_reason: "sequence_completed" }).eq("lead_id", lead.lead_id);
      continue;
    }
    let channel = step.channel;
    if (channel === "whatsapp" && (waProvider !== "openwa" || !lead.telefono)) channel = "email";
    if (channel === "email" && !lead.email && waProvider === "openwa" && lead.telefono) channel = "whatsapp";

    // Triplice preflight obbligatorio prima di ogni invio:
    // 1) destinatario e consenso ancora validi; 2) nessun invio riuscito dello
    // stesso passo; 3) testo/link appartenenti al catalogo controllato.
    const { data: current } = await db.from("leads")
      .select("marketing_consent,archived_at,stage_id,email,telefono")
      .eq("id", lead.lead_id).maybeSingle();
    const recipientOk = Boolean(current?.marketing_consent && !current.archived_at
      && ["lead", "contatto", "demo", "onboarding"].includes(current.stage_id)
      && validRecipient(channel, current.email, current.telefono));
    const { data: alreadySent = [] } = await db.from("lead_nurture_deliveries")
      .select("id").eq("lead_id", lead.lead_id).eq("step_index", lead.step_index)
      .eq("status", "sent").limit(1);
    const contentOk = contentIsSafe(step.body);
    if (!recipientOk || !contentOk) {
      await db.from("lead_nurture_enrollments").update({
        status: "stopped",
        stop_reason: !recipientOk ? "preflight_recipient_failed" : "preflight_content_failed",
        stopped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("lead_id", lead.lead_id);
      results.push({ lead_id: lead.lead_id, step: lead.step_index, ok: false, reason: "preflight_failed" });
      continue;
    }
    if (alreadySent.length > 0) {
      const next = Number(lead.step_index) + 1;
      if (next >= STEPS.length) {
        await db.from("lead_nurture_enrollments").update({ status: "completed", next_step: next, stopped_at: new Date().toISOString(), stop_reason: "sequence_completed" }).eq("lead_id", lead.lead_id);
      } else {
        const { data: enrollment } = await db.from("lead_nurture_enrollments").select("started_at").eq("lead_id", lead.lead_id).single();
        await db.from("lead_nurture_enrollments").update({ status: "active", next_step: next, next_run_at: new Date(new Date(enrollment!.started_at).getTime() + OFFSETS[next] * 86400_000).toISOString(), updated_at: new Date().toISOString() }).eq("lead_id", lead.lead_id);
      }
      results.push({ lead_id: lead.lead_id, step: lead.step_index, ok: true, reason: "duplicate_prevented" });
      continue;
    }
    if ((channel === "email" && !lead.email) || (channel === "whatsapp" && !lead.telefono)) {
      await db.from("lead_nurture_deliveries").upsert({ lead_id: lead.lead_id, step_index: lead.step_index, channel, status: "skipped", error_message: "recipient_channel_unavailable" }, { onConflict: "lead_id,step_index,channel" });
    } else {
      const rendered = step.body.replaceAll("{{nome}}", lead.nome || "");
      try {
        const sent = channel === "email"
          ? await invoke("send-email", {
              to: lead.email,
              template: "chat_messaggio_diretto",
              idempotency_key: `lead-${lead.lead_id}-${lead.step_index}`,
              data: {
                nome: "",
                subject: step.subject,
                messaggio: `${rendered}\n\nPratica Rapida · 039 868 2691 · modulistica@praticarapida.it\n<a href="${URL}/functions/v1/lead-nurture-optout?token=${lead.opt_out_token}">Non desidero ricevere altri messaggi</a>`,
              },
            })
          : await invoke("send-whatsapp", { to: lead.telefono, text_body: `${rendered}\n\nPer non ricevere altri messaggi scrivi STOP.` });
        await db.from("lead_nurture_deliveries").upsert({ lead_id: lead.lead_id, step_index: lead.step_index, channel, status: "sent", sent_at: new Date().toISOString(), provider_id: sent?.id ?? sent?.wa_message_id ?? null }, { onConflict: "lead_id,step_index,channel" });
      } catch (sendError) {
        const { data: previous } = await db.from("lead_nurture_deliveries").select("attempts").eq("lead_id", lead.lead_id).eq("step_index", lead.step_index).eq("channel", channel).maybeSingle();
        await db.from("lead_nurture_deliveries").upsert({ lead_id: lead.lead_id, step_index: lead.step_index, channel, status: "failed", attempts: Number(previous?.attempts ?? 0) + 1, attempted_at: new Date().toISOString(), error_message: sendError instanceof Error ? sendError.message : String(sendError) }, { onConflict: "lead_id,step_index,channel" });
        await db.from("lead_nurture_enrollments").update({ status: "active", next_run_at: new Date(Date.now() + 24 * 3600_000).toISOString() }).eq("lead_id", lead.lead_id);
        results.push({ lead_id: lead.lead_id, step: lead.step_index, ok: false });
        continue;
      }
    }
    const next = Number(lead.step_index) + 1;
    if (next >= STEPS.length) {
      await db.from("lead_nurture_enrollments").update({ status: "completed", next_step: next, stopped_at: new Date().toISOString(), stop_reason: "sequence_completed" }).eq("lead_id", lead.lead_id);
    } else {
      const { data: enrollment } = await db.from("lead_nurture_enrollments").select("started_at").eq("lead_id", lead.lead_id).single();
      const nextAt = new Date(new Date(enrollment!.started_at).getTime() + OFFSETS[next] * 86400_000).toISOString();
      await db.from("lead_nurture_enrollments").update({ status: "active", next_step: next, next_run_at: nextAt, updated_at: new Date().toISOString() }).eq("lead_id", lead.lead_id);
    }
    results.push({ lead_id: lead.lead_id, step: lead.step_index, channel, ok: true });
  }
  return Response.json({ ok: true, processed: results.length, results });
});
