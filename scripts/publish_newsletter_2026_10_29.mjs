import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const PROJECT_REF = "xmkjrhwmmuzaqjqlvzxm";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SLUG = "legge-bilancio-2027-ecobonus-65-cosa-sappiamo";
const SUBJECT = "Manovra 2027: Ecobonus al 65%? Cosa sappiamo davvero";
const COVER_LOCAL = "/Users/giulianolavoro/Projects/pratica-rapida/output/social/bilancio-2027-ecobonus-65-2026-10-29/cover-home-newsletter.png";
const COVER_OBJECT = "2026/10/legge-bilancio-2027-ecobonus-65.png";
const COVER_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/news-images/${COVER_OBJECT}`;
const ARTICLE_URL = `https://www.praticarapida.it/blog/${SLUG}`;
const CAMPAIGN_URL = `${ARTICLE_URL}?utm_source=newsletter&utm_medium=email&utm_campaign=bilancio_2027_ecobonus_65`;

const ARTICLE_HTML = `
<p>Il Consiglio dei ministri ha approvato il 28 ottobre 2026 il disegno di legge di bilancio per il 2027. È un passaggio importante, ma non è ancora la legge definitiva: il testo dovrà essere esaminato dal Parlamento e potrà essere modificato.</p>

<h2>Il punto di partenza: cosa prevede oggi la normativa</h2>
<p>In assenza di nuove modifiche, per il 2027 la disciplina oggi vigente prevede una detrazione del 36% per gli interventi sull’abitazione principale e del 30% per gli altri immobili. Le prime indicazioni politiche sulla manovra parlano della possibilità di mantenere l’impianto applicato nel 2026, ma il testo ufficiale e l’iter parlamentare devono ancora confermarlo.</p>

<h2>Ecobonus al 65%: al momento è un’ipotesi</h2>
<p>In queste ore si parla anche di un possibile ritorno dell’aliquota al 65% per alcuni interventi di efficienza energetica. Al momento, però, non risultano definiti in modo ufficiale e definitivo né gli interventi interessati, né i beneficiari, né i requisiti e i limiti di spesa.</p>
<p>Per questo è prematuro indicare il 65% come misura già approvata. Finché non saranno disponibili il testo ufficiale e gli eventuali emendamenti approvati dal Parlamento, rivenditori e installatori dovrebbero evitare di promettere questa aliquota ai clienti.</p>

<h2>Come comportarsi nei preventivi</h2>
<p>La formula più prudente è spiegare che le agevolazioni per il 2027 sono ancora in fase di definizione e che aliquote e requisiti dovranno essere verificati sulla normativa definitiva. È importante separare le ipotesi circolate sulla stampa dalle disposizioni già in vigore.</p>

<h2>PraticaRapida vi terrà aggiornati</h2>
<p>PraticaRapida seguirà l’iter della legge di bilancio e comunicherà gli aggiornamenti utili non appena saranno disponibili testi ufficiali e indicazioni operative affidabili.</p>
<p>Gestiamo le pratiche ENEA per rivenditori e installatori di infissi, schermature solari, pompe di calore, insufflaggio e altri interventi di efficienza energetica. Con la documentazione completa, la pratica viene controllata e lavorata entro 48 ore lavorative e può essere seguita in tempo reale dall’area riservata.</p>

<h2>Fonti e approfondimenti</h2>
<ul>
  <li><a href="https://www.ansa.it/amp/sito/notizie/politica/2026/10/28/via-libera-del-consiglio-dei-ministri-alla-manovra.-meloni-vale_a800dc0a-5e17-4252-b135-567ad9587d2b.html" rel="noopener noreferrer" target="_blank">ANSA: via libera del Consiglio dei ministri alla manovra</a></li>
  <li><a href="https://openbdap.rgs.mef.gov.it/it/Home/ViaggioNelBilancio" rel="noopener noreferrer" target="_blank">Ragioneria Generale dello Stato: l’iter della legge di bilancio</a></li>
  <li><a href="https://temi.camera.it/temi/19_tl18_tassazione_immobili.html" rel="noopener noreferrer" target="_blank">Camera dei deputati: quadro vigente delle detrazioni sugli immobili</a></li>
</ul>

<div style="margin:28px 0;padding:24px;border-radius:16px;background:#eefbf3;border:1px solid #b9ebcc">
  <h2 style="margin-top:0">Vuoi saperne di più? Chiamaci.</h2>
  <p><strong>Telefono e WhatsApp:</strong> <a href="tel:+390398682691">039 868 2691</a><br>
  <strong>Email:</strong> <a href="mailto:modulistica@praticarapida.it">modulistica@praticarapida.it</a><br>
  <strong>Sito:</strong> <a href="https://www.praticarapida.it">www.praticarapida.it</a></p>
</div>`;

const NEWSLETTER_HTML = `
<div style="margin:0 auto;max-width:640px;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.55">
  <img src="${COVER_PUBLIC}" alt="Legge di Bilancio 2027 - Ecobonus 65 per cento?" width="640" style="display:block;width:100%;height:auto;border-radius:18px;margin:0 0 24px">
  <p style="margin:0 0 8px;color:#008f4c;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Aggiornamento normativo</p>
  <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15">Ecobonus al 65% nel 2027?<br>Cosa sappiamo davvero</h1>
  <p>Il Consiglio dei ministri ha approvato il disegno di legge di bilancio 2027. Ma attenzione: il <strong>65% non è ancora confermato</strong>.</p>
  <p>Le prime indicazioni parlano di un possibile confronto sull’aliquota per alcuni interventi di efficienza energetica. Mancano però ancora il testo definitivo, i beneficiari, i requisiti e i limiti di spesa.</p>
  <p><strong>Per ora, quindi, non conviene promettere il 65% ai clienti.</strong> PraticaRapida seguirà l’iter parlamentare e vi terrà aggiornati sugli sviluppi.</p>
  <p style="margin:28px 0;text-align:center"><a href="${CAMPAIGN_URL}" style="display:inline-block;background:#009c55;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:999px">Leggi l’articolo completo</a></p>
  <div style="margin-top:28px;padding:22px;border-radius:16px;background:#eefbf3;border:1px solid #b9ebcc">
    <p style="margin:0 0 10px;font-size:18px;font-weight:800">Vuoi saperne di più? Chiamaci.</p>
    <p style="margin:0"><strong>Telefono e WhatsApp:</strong> <a href="tel:+390398682691" style="color:#007c43">039 868 2691</a><br>
    <strong>Email:</strong> <a href="mailto:modulistica@praticarapida.it" style="color:#007c43">modulistica@praticarapida.it</a><br>
    <strong>Sito:</strong> <a href="https://www.praticarapida.it" style="color:#007c43">www.praticarapida.it</a></p>
  </div>
</div>`;

function loadServiceKey() {
  const raw = execFileSync("node_modules/.bin/supabase", ["projects", "api-keys", "--project-ref", PROJECT_REF, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const keys = JSON.parse(raw);
  const key = keys.find((item) => item.name === "service_role" || item.type === "service_role" || item.name === "secret")?.api_key;
  if (!key) throw new Error("service_role_key_not_found");
  return key;
}

function invalidCompany(company) {
  const name = String(company.ragione_sociale ?? "").trim();
  return company.is_active !== true || company.blocked_at
    || /(?:^|\b)(prova|test|pratica\s*rapida|intern[oa]|demo)(?:\b|$)|da abbinare|rivenditore eliminato|clienti privati/i.test(name);
}

function invalidLead(lead) {
  const name = `${lead.nome ?? ""} ${lead.cognome ?? ""}`.trim();
  return Boolean(lead.archived_at)
    || /\b(?:sono\s+(?:un|una)\s+privat[oa]|cliente\s+privat[oa]|lead\s+privat[oa])\b/i.test(String(lead.note ?? ""))
    || /\bprivat[oa]\b/i.test(String(lead.source ?? ""))
    || /(?:^|\b)(prova|test|pratica\s*rapida|intern[oa]|demo)(?:\b|$)|da abbinare|rivenditore eliminato|clienti privati/i.test(name);
}

function deliverableEmail(value) {
  const email = String(value ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  return !/(?:gmail\.con|gimail\.it|gmail\.it)$/i.test(email.split("@")[1] ?? "");
}

async function request(key, path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${response.status}:${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function uploadCover(key) {
  const bytes = readFileSync(COVER_LOCAL);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/news-images/${COVER_OBJECT}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: bytes,
  });
  if (!response.ok) throw new Error(`cover_upload_${response.status}:${await response.text()}`);
}

async function publishArticle(key) {
  const now = new Date().toISOString();
  const payload = {
    slug: SLUG,
    title: "Legge di Bilancio 2027 ed Ecobonus al 65%: cosa sappiamo davvero",
    excerpt: "Il disegno di legge di bilancio è stato approvato dal Governo, ma il ritorno dell’Ecobonus al 65% non è ancora confermato. Ecco cosa possono dire oggi rivenditori e installatori.",
    body_html: ARTICLE_HTML,
    cover_image_url: COVER_PUBLIC,
    category: "Normativa",
    tags: ["Legge di Bilancio 2027", "Ecobonus", "pratiche ENEA", "rivenditori", "installatori"],
    author_name: "PraticaRapida",
    meta_title: "Legge di Bilancio 2027: Ecobonus 65%? Cosa sappiamo",
    meta_description: "Ecobonus al 65% nel 2027: cosa è stato approvato, cosa resta un’ipotesi e come devono comportarsi rivenditori e installatori.",
    meta_keywords: ["Ecobonus 65 2027", "Legge di Bilancio 2027", "pratiche ENEA"],
    canonical_url: ARTICLE_URL,
    og_title: "Legge di Bilancio 2027: Ecobonus al 65%?",
    og_description: "Il 65% non è ancora confermato. Facciamo il punto sulle indicazioni disponibili e sull’iter della manovra.",
    og_image_url: COVER_PUBLIC,
    twitter_card: "summary_large_image",
    json_ld_type: "Article",
    no_index: false,
    no_follow: false,
    status: "published",
    published_at: now,
    pinned: true,
    read_time_minutes: 4,
    updated_at: now,
  };
  await request(key, `/rest/v1/news_articles?on_conflict=slug`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  await request(key, `/rest/v1/news_articles?slug=neq.${SLUG}&pinned=eq.true`, {
    method: "PATCH",
    body: JSON.stringify({ pinned: false }),
  });
}

async function audience(key) {
  const [companies, leads, settingsRows] = await Promise.all([
    request(key, "/rest/v1/companies?select=id,ragione_sociale,email,is_active,blocked_at"),
    request(key, "/rest/v1/leads?archived_at=is.null&select=id,nome,cognome,email,stage_id,archived_at,note,source"),
    request(key, "/rest/v1/platform_settings?key=in.(crm_pipeline_stages,crm_company_stages,crm_newsletters)&select=key,value"),
  ]);
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  const stages = Array.isArray(settings.crm_pipeline_stages) ? settings.crm_pipeline_stages : [];
  const stageIds = new Set(stages.map((stage) => stage.id));
  const firstStageId = stages[0]?.id;
  const assignments = settings.crm_company_stages && typeof settings.crm_company_stages === "object" ? settings.crm_company_stages : {};
  const byEmail = new Map();
  let noEmail = 0;
  for (const company of companies) {
    if (invalidCompany(company)) continue;
    const stage = assignments[company.id] ?? firstStageId;
    if (!stage || !stageIds.has(stage)) continue;
    const email = String(company.email ?? "").trim().toLowerCase();
    if (!deliverableEmail(email)) { noEmail++; continue; }
    byEmail.set(email, { id: company.id, name: company.ragione_sociale, email });
  }
  for (const lead of leads) {
    const stage = lead.stage_id ?? firstStageId;
    if (invalidLead(lead) || !stage || !stageIds.has(stage)) continue;
    const email = String(lead.email ?? "").trim().toLowerCase();
    if (!deliverableEmail(email)) { noEmail++; continue; }
    if (!byEmail.has(email)) byEmail.set(email, { id: lead.id, name: `${lead.nome ?? ""} ${lead.cognome ?? ""}`.trim(), email });
  }
  return { recipients: [...byEmail.values()], noEmail, history: Array.isArray(settings.crm_newsletters) ? settings.crm_newsletters : [] };
}

async function main() {
  const key = loadServiceKey();
  await uploadCover(key);
  await publishArticle(key);
  const { recipients, noEmail, history } = await audience(key);
  const duplicate = history.some((record) => record.subject === SUBJECT);
  const articleRows = await request(key, `/rest/v1/news_articles?slug=eq.${SLUG}&select=id,slug,status,title,published_at,cover_image_url`);
  if (articleRows.length !== 1 || articleRows[0].status !== "published") throw new Error("article_not_published");

  if (process.env.SEND !== "1") {
    console.log(JSON.stringify({ prepared: true, article: articleRows[0], recipients: recipients.length, noEmail, duplicate }));
    return;
  }
  const expected = Number(process.env.EXPECTED_COUNT);
  if (!Number.isInteger(expected) || recipients.length !== expected) throw new Error(`recipient_count_mismatch_expected_${expected}_actual_${recipients.length}`);
  if (duplicate) {
    console.log(JSON.stringify({ prepared: true, skipped: "already_sent", recipients: recipients.length }));
    return;
  }

  const campaignHash = createHash("sha256").update(`${SUBJECT}\n${NEWSLETTER_HTML}`).digest("hex").slice(0, 24);
  let ok = 0;
  const failed = [];
  for (const recipient of recipients) {
    try {
      const result = await request(key, "/functions/v1/send-email", {
        method: "POST",
        body: JSON.stringify({
          to: recipient.email,
          template: "newsletter_custom",
          data: { subject: SUBJECT, body_html: NEWSLETTER_HTML },
          idempotency_key: `newsletter.${campaignHash}.${recipient.id}`,
        }),
      });
      if (result?.success === true) ok++;
      else failed.push({ id: recipient.id, error: result?.error ?? "unknown" });
    } catch (error) {
      failed.push({ id: recipient.id, error: String(error.message ?? error).slice(0, 180) });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const record = {
    id: randomUUID(), subject: SUBJECT, body: NEWSLETTER_HTML, target: "all",
    targetLabel: "Tutti i rivenditori attivi", total: recipients.length,
    ok, fail: failed.length, sentAt: new Date().toISOString(), sentBy: "modulistica@praticarapida.it",
  };
  await request(key, "/rest/v1/platform_settings?key=eq.crm_newsletters", {
    method: "PATCH",
    body: JSON.stringify({ value: [record, ...history] }),
  });
  console.log(JSON.stringify({ prepared: true, recipients: recipients.length, noEmail, ok, failed: failed.length, failedSample: failed.slice(0, 5) }));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: String(error.message ?? error) }));
  process.exit(1);
});
