import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://app.praticarapida.it";
const SITE = "https://www.praticarapida.it";
const MEDIA = `${SITE}/lead-nurture`;
const WHATSAPP = "https://wa.me/390398682691";
const OFFSETS = [0, 2, 5, 9, 14, 21, 25, 29, 45, 60] as const;

type EmailCreative = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  hero_url?: string;
  hero_alt?: string;
  cta_label: string;
  cta_url: string;
  secondary_label?: string;
  secondary_url?: string;
  proof_heading: string;
  proof_text: string;
};

type NurtureStep = {
  channel: "email" | "whatsapp";
  whatsapp?: string;
  email: EmailCreative;
  attachment?: { filename: string; path: string; content_type: string };
};

const STEPS: readonly NurtureStep[] = [
  {
    channel: "email",
    email: {
      subject: "Grazie per l'interesse: partiamo da una pratica reale",
      preheader: "Tu ci affidi il cliente. Al resto pensiamo noi.",
      eyebrow: "PraticaRapida",
      title: "La pratica ENEA non deve pesare sul tuo ufficio.",
      body: "<p style=\"margin:0;\">Tu inserisci pochi dati del cliente e la fattura. Un nostro operatore raccoglie ciò che manca, controlla i documenti e lavora la pratica per te.</p>",
      cta_label: "Dimmi se hai già un lavoro concluso",
      cta_url: `${WHATSAPP}?text=Ho%20un%20lavoro%20concluso%20da%20usare%20come%20prima%20pratica`,
      proof_heading: "La prima pratica è in omaggio per 30 giorni.",
      proof_text: "Nessun abbonamento, anticipo o volume minimo.",
    },
  },
  {
    channel: "email",
    email: {
      subject: "Guarda quanto tempo serve per affidarci una pratica",
      preheader: "Una demo breve e concreta del portale.",
      eyebrow: "Video breve",
      title: "Il portale è semplice. Dietro ci sono persone vere.",
      body: "<p style=\"margin:0;\">In meno di venti secondi vedi quanto è facile inserire una pratica. Da quel momento lavoriamo noi e puoi sempre raggiungerci anche al telefono.</p>",
      hero_url: `${MEDIA}/portale-demo-breve.gif?v=2`, hero_alt: "Portale PraticaRapida",
      cta_label: "Guarda il video (19 secondi) ▶", cta_url: `${MEDIA}/portale-demo-breve.mp4?v=2`,
      proof_heading: "Tu non devi imparare un software.", proof_text: "Inserisci pochi dati; il lavoro lo fanno i nostri operatori.",
    },
  },
  {
    channel: "whatsapp",
    whatsapp: "Ciao {{nome}}, hai un lavoro concluso di recente? Puoi usarlo per provare PraticaRapida: la prima pratica ENEA è in omaggio. Rispondi qui e ti aiutiamo noi a partire.",
    email: {
      subject: "La prima pratica te la offriamo noi",
      preheader: "Scegli anche un lavoro concluso di recente e mettici alla prova.",
      eyebrow: "Una prova concreta",
      title: "Non aspettare il prossimo preventivo.",
      body: "<p style=\"margin:0;\">Scegli un lavoro concluso di recente. Regala al cliente la pratica ENEA e guarda come lavoriamo: <strong>la prima pratica la offriamo noi</strong>.</p>",
      cta_label: "Voglio provare la prima pratica", cta_url: `${WHATSAPP}?text=Voglio%20provare%20la%20prima%20pratica%20in%20omaggio`,
      proof_heading: "Zero vincoli.", proof_text: "Nessun canone, nessun pacchetto prepagato, nessun volume minimo.",
    },
  },
  {
    channel: "email",
    email: {
      subject: "Listino PraticaRapida 2026",
      preheader: "Costi chiari, nessun canone e pagamento solo a lavoro concluso.",
      eyebrow: "Listino allegato", title: "Sai subito quanto costa ogni servizio.",
      body: "<p style=\"margin:0;\">Ti allego il listino completo. Per le pratiche ENEA il prezzo riservato ai rivenditori è <strong>50 € + IVA</strong>: niente anticipo, abbonamento o pacchetto prepagato.</p>",
      cta_label: "Apri il listino PDF", cta_url: `${MEDIA}/Pratica_Rapida_Servizi_e_prezzi_2026.pdf`,
      proof_heading: "Paghi soltanto le pratiche concluse.", proof_text: "La fatturazione avviene a fine mese.",
    },
    attachment: {
      filename: "Pratica_Rapida_Servizi_e_prezzi_2026.pdf",
      path: `${MEDIA}/Pratica_Rapida_Servizi_e_prezzi_2026.pdf`,
      content_type: "application/pdf",
    },
  },
  {
    channel: "email",
    email: {
      subject: "Non ti vendiamo un altro software",
      preheader: "Il portale è semplice. Il valore sono le persone che lavorano per te.",
      eyebrow: "Persone vere, non ticket",
      title: "Il portale è solo il mezzo.",
      body: "<p style=\"margin:0;\">Un operatore prende in carico la pratica, parla con il cliente in nome tuo, controlla i documenti e gestisce le eccezioni. Se hai una domanda, <strong>rispondiamo anche al telefono</strong>.</p>",
      cta_label: "Parla con una persona", cta_url: "tel:+390398682691",
      secondary_label: "Oppure scrivici su WhatsApp", secondary_url: `${WHATSAPP}?text=Vorrei%20parlare%20con%20un%20operatore`,
      proof_heading: "Entro 48 ore lavorative.", proof_text: "Con dati e documentazione completi, la pratica viene lavorata entro 48 ore.",
    },
  },
  {
    channel: "whatsapp",
    whatsapp: "Ciao {{nome}}, con PraticaRapida non compri un software: affidi il lavoro a persone vere. 50 € + IVA riservati ai rivenditori, niente anticipo o abbonamento; a fine mese paghi solo le pratiche concluse. Hai un lavoro recente su cui provarci?",
    email: {
      subject: "50 € + IVA riservati ai rivenditori. Solo a lavoro concluso.",
      preheader: "Nessun software da imparare, nessun canone.",
      eyebrow: "Un costo chiaro", title: "Paghi il lavoro. Non il portale.",
      body: "<p style=\"margin:0;\">La pratica ENEA costa <strong>50 € + IVA, prezzo riservato ai rivenditori</strong>. Niente abbonamenti, anticipi o pacchetti: a fine mese fatturiamo soltanto le pratiche concluse.</p>",
      cta_label: "Mettiamoci alla prova", cta_url: `${WHATSAPP}?text=Vorrei%20provare%20PraticaRapida`,
      proof_heading: "Tu non devi imparare nulla.", proof_text: "Inserisci pochi dati. Al resto pensiamo noi.",
    },
  },
  {
    channel: "email",
    email: {
      subject: "La tua prima pratica gratuita scade tra 5 giorni",
      preheader: "Basta anche un lavoro già concluso: usalo per vedere come lavoriamo.",
      eyebrow: "Promozione in scadenza", title: "Hai ancora 5 giorni per provarci gratuitamente.",
      body: "<p style=\"margin:0;\">Non serve aspettare un nuovo preventivo: puoi scegliere un lavoro concluso di recente e offrire la pratica al cliente. Noi ti seguiamo dall'inizio alla consegna.</p>",
      cta_label: "Attiva la pratica gratuita", cta_url: `${WHATSAPP}?text=Voglio%20attivare%20la%20prima%20pratica%20gratuita`,
      proof_heading: "La scadenza è personale.", proof_text: "È calcolata a 30 giorni dal tuo ingresso nel percorso.",
    },
  },
  {
    channel: "whatsapp",
    whatsapp: "Ciao {{nome}}, la possibilità di provare gratuitamente la prima pratica scade domani. Se hai un lavoro già concluso, rispondi qui: ti aiutiamo noi ad attivarla.",
    email: {
      subject: "La pratica gratuita scade domani",
      preheader: "Rispondi a questa email e ti aiutiamo ad attivarla.",
      eyebrow: "Ultimo giorno", title: "Se vuoi provarci, questo è il momento.",
      body: "<p style=\"margin:0;\">Puoi partire anche da un lavoro già concluso. Rispondi a questa email: verifichiamo insieme il caso e ti aiutiamo ad avviare la pratica.</p>",
      cta_label: "Attiva la pratica gratuita", cta_url: `${WHATSAPP}?text=Voglio%20attivare%20la%20prima%20pratica%20gratuita`,
      proof_heading: "Nessun vincolo dopo la prova.", proof_text: "Deciderai tu se continuare.",
    },
  },
  {
    channel: "email",
    email: {
      subject: "Circa 250 recensioni raccontano come lavoriamo",
      preheader: "Google e Trustpilot: la fiducia si costruisce pratica dopo pratica.",
      eyebrow: "Prova sociale", title: "I clienti soddisfatti si ricordano del servizio.",
      body: "<p style=\"margin:0;\">Tra Google e Trustpilot abbiamo raccolto <strong>circa 250 recensioni</strong>. Una pratica ben gestita non è solo burocrazia: è reputazione anche per chi l'ha proposta al cliente.</p>",
      cta_label: "Leggi le recensioni Google", cta_url: "https://www.google.com/search?q=PraticaRapida+recensioni",
      secondary_label: "Guarda anche Trustpilot", secondary_url: "https://it.trustpilot.com/review/praticarapida.it",
      proof_heading: "Il cliente vede il tuo nome.", proof_text: "Noi lavoriamo la pratica in nome e per conto della tua azienda.",
    },
  },
  {
    channel: "email",
    email: {
      subject: "Chiudiamo qui: quando ti servirà, sai dove trovarci",
      preheader: "Quando arriverà il lavoro giusto, sai dove trovarci.",
      eyebrow: "Ultimo messaggio", title: "Quando sarai pronto, noi ci siamo.",
      body: "<p style=\"margin:0;\">Non riceverai altri promemoria automatici. Quando terminerai un lavoro su infissi, schermature solari, pompe di calore, climatizzazione o insufflaggio, scrivici: saremo felici di occuparci della pratica.</p>",
      cta_label: "Salva il contatto WhatsApp", cta_url: `${WHATSAPP}?text=Salvo%20il%20contatto%20PraticaRapida`,
      proof_heading: "039 868 2691", proof_text: "modulistica@praticarapida.it · Puoi rispondere direttamente a questa email.",
    },
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

function contentIsSafe(step: NurtureStep): boolean {
  const allowed = [APP, SITE, WHATSAPP, "tel:+390398682691", "https://www.google.com/", "https://it.trustpilot.com/"];
  const urls = [step.email.hero_url, step.email.cta_url, step.email.secondary_url, step.attachment?.path].filter(Boolean) as string[];
  return urls.every((url) => allowed.some((prefix) => url.startsWith(prefix)));
}

function promotionMessageIsTimely(stepIndex: number, expiresAt: string): boolean {
  if (stepIndex !== 6 && stepIndex !== 7) return true;
  const remainingDays = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (stepIndex === 6) return remainingDays > 4 && remainingDays <= 6;
  return remainingDays > 0 && remainingDays <= 2;
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
    // 1) destinatario ancora nella pipeline Clienti €50; 2) nessun invio riuscito dello
    // stesso passo; 3) testo/link appartenenti al catalogo controllato.
    const { data: current } = await db.from("leads")
      .select("archived_at,stage_id,email,telefono")
      .eq("id", lead.lead_id).maybeSingle();
    const recipientOk = Boolean(!current?.archived_at
      && current?.stage_id === "clienti_50"
      && validRecipient(channel, current.email, current.telefono));
    const { data: alreadySent = [] } = await db.from("lead_nurture_deliveries")
      .select("id").eq("lead_id", lead.lead_id).eq("step_index", lead.step_index)
      .eq("status", "sent").limit(1);
    const contentOk = contentIsSafe(step);
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
    if (!promotionMessageIsTimely(Number(lead.step_index), lead.promotion_expires_at)) {
      await db.from("lead_nurture_deliveries").upsert({ lead_id: lead.lead_id, step_index: lead.step_index, channel, status: "skipped", error_message: "promotion_window_missed" }, { onConflict: "lead_id,step_index,channel" });
    } else if ((channel === "email" && !lead.email) || (channel === "whatsapp" && !lead.telefono)) {
      await db.from("lead_nurture_deliveries").upsert({ lead_id: lead.lead_id, step_index: lead.step_index, channel, status: "skipped", error_message: "recipient_channel_unavailable" }, { onConflict: "lead_id,step_index,channel" });
    } else {
      const rendered = (step.whatsapp ?? "")
        .replaceAll("{{nome}}", lead.nome || "")
        .replaceAll("{{video}}", `${MEDIA}/il-nostro-portale.mp4`);
      try {
        const sent = channel === "email"
          ? await invoke("send-email", {
              to: lead.email,
              template: "lead_nurture",
              idempotency_key: `lead-${lead.lead_id}-${lead.step_index}`,
              ...(step.attachment ? { attachments: [step.attachment] } : {}),
              data: {
                ...step.email,
                nome: lead.nome || "",
                unsubscribe_url: `${URL}/functions/v1/lead-nurture-optout?token=${lead.opt_out_token}`,
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
