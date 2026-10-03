import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ficRequest, getFicConfig, type JsonObject } from "../_shared/fatture-in-cloud.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUN_KEY = Deno.env.get("FIC_MONTHLY_INVOICE_RUN_KEY")!;
const PERIOD_START = "2026-08-31T22:00:00.000Z"; // 1 settembre, Europe/Rome
const PERIOD_END = "2026-09-30T22:00:00.000Z"; // 1 ottobre, Europe/Rome
const DESCRIPTION = "Gestione pratiche ENEA Settembre 2026";

// Verificati il 3 ottobre 2026 confrontando ponte CRM, archivi giugno-agosto
// e anagrafica del cruscotto. Sono i soli fornitori la cui prima pratica cade
// in settembre; la riga omaggio deve apparire nel documento a sconto 100%.
const FIRST_GIFT_EMAILS = new Set([
  "amministrazione.azdesign@gmail.com",
  "caterina.serofilli@gmail.com",
  "passioneserramenti@gmail.com",
  "amministrazione@rtig.it",
]);

// Registro delle bozze create il 3 ottobre 2026. Mantiene l'idempotenza anche
// quando FIC non restituisce email/nome completi nell'entity del documento.
const KNOWN_CREATED_INVOICE_BY_EMAIL = new Map<string, number>([
  ["aea.investmentsolutionssrl@gmail.com", 557230029],
  ["amministrazione.azdesign@gmail.com", 557230031],
  ["amministrazione@chiappinogroup.it", 557230032],
  ["info@cisaminfissi.it", 557230034],
  ["info@cortende.it", 557230038],
  ["europrofilpisa@yahoo.it", 557230042],
  ["guidolin@grkserramenti.it", 557230043],
  ["andra@homnium.it", 557230044],
  ["claudia@ikonalab.it", 557230047],
  ["ordini@vetratex.it", 557230048],
  ["giada@rinaldilab.com", 557230049],
  ["rmlegno@rmlegno.it", 557230057],
  ["samontaggi@hotmail.com", 557230061],
  ["amministrazione@stellinodesign.it", 557230063],
  ["tec.estense@gmail.com", 557230068],
  ["info@zanellatotende.it", 557230071],
]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

const cents = (value: number) => Math.round(value * 100) / 100;

async function listAll<T extends JsonObject>(path: string): Promise<T[]> {
  const config = getFicConfig();
  const result: T[] = [];
  for (let page = 1; page <= 30; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await ficRequest<{ data?: T[]; last_page?: number }>(
      config,
      `${path}${separator}page=${page}&per_page=100`,
    );
    result.push(...(response.data ?? []));
    const lastPage = Number(response.last_page ?? page);
    if (page >= lastPage || (response.data ?? []).length === 0) break;
  }
  return result;
}

async function ficStep<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type BridgeRow = {
  crm_pratica_id: string;
  rivenditore_nome: string;
  rivenditore_email: string;
  cliente_nome: string;
  cliente_cognome: string;
  entrato_in_stage_at: string;
};

type InvoiceGroup = {
  provider: string;
  email: string;
  unitPrice: number;
  practices: BridgeRow[];
  gifts: number;
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const suppliedKey = req.headers.get("x-monthly-invoice-key");
  if (!RUN_KEY || !suppliedKey || suppliedKey !== RUN_KEY) return json({ error: "Unauthorized" }, 401);

  try {
  let action = "preview";
  try {
    action = String((await req.json())?.action ?? "preview");
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (!new Set(["preview", "create", "create_ready"]).has(action)) return json({ error: "Azione non valida" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: bridgeRows, error: bridgeError } = await admin
    .from("cruscotto_pratiche_da_crm")
    .select("crm_pratica_id,rivenditore_nome,rivenditore_email,cliente_nome,cliente_cognome,entrato_in_stage_at")
    .gte("entrato_in_stage_at", PERIOD_START)
    .lt("entrato_in_stage_at", PERIOD_END)
    .order("entrato_in_stage_at", { ascending: true });
  if (bridgeError) return json({ error: bridgeError.message }, 500);

  const rows = (bridgeRows ?? []) as BridgeRow[];
  const practiceIds = rows.map((row) => row.crm_pratica_id);
  const { data: practices, error: practicesError } = await admin
    .from("enea_practices")
    .select("id,tipo_fatturazione")
    .in("id", practiceIds);
  if (practicesError) return json({ error: practicesError.message }, 500);
  const billingType = new Map((practices ?? []).map((row) => [row.id, String(row.tipo_fatturazione ?? "")]));

  const { data: resellers, error: resellersError } = await admin
    .from("cruscotto_rivenditori")
    .select("id,nome,email,prezzo");
  if (resellersError) return json({ error: resellersError.message }, 500);
  const resellerByEmail = new Map<string, JsonObject[]>();
  for (const reseller of resellers ?? []) {
    const key = normalize(reseller.email);
    if (!key) continue;
    resellerByEmail.set(key, [...(resellerByEmail.get(key) ?? []), reseller as JsonObject]);
  }
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("ragione_sociale,email,piva,codice_fiscale,indirizzo,citta,cap,provincia");
  if (companiesError) return json({ error: companiesError.message }, 500);
  const companyByEmail = new Map((companies ?? []).map((company) => [normalize(company.email), company as JsonObject]));

  const excluded: Array<{ provider: string; client: string; reason: string }> = [];
  const eligible: BridgeRow[] = [];
  for (const row of rows) {
    const providerKey = normalize(row.rivenditore_nome);
    const emailKey = normalize(row.rivenditore_email);
    const client = `${row.cliente_nome} ${row.cliente_cognome}`.trim();
    let reason = "";
    if (providerKey.includes("brianza serramenti") || providerKey.includes("vans")) {
      reason = "escluso dal Titolare";
    } else if (billingType.get(row.crm_pratica_id) === "cliente_finale") {
      reason = "cliente finale: pagamento e fattura separati";
    } else if (!emailKey || providerKey.includes("da abbinare")) {
      reason = "gruppo tecnico senza intestatario fatturabile";
    } else if (emailKey.endsWith("@praticarapida.it") || providerKey === "praticarapida") {
      reason = "pratica interna: non fatturare a se stessi";
    }
    if (reason) excluded.push({ provider: row.rivenditore_nome, client, reason });
    else eligible.push(row);
  }

  const groupMap = new Map<string, InvoiceGroup>();
  for (const row of eligible) {
    const email = normalize(row.rivenditore_email);
    const resellerMatches = resellerByEmail.get(email) ?? [];
    const unitPrice = resellerMatches.length === 1 ? Number(resellerMatches[0].prezzo ?? 0) : 0;
    const current = groupMap.get(email) ?? {
      provider: String(resellerMatches[0]?.nome ?? row.rivenditore_nome).trim(),
      email,
      unitPrice,
      practices: [],
      gifts: 0,
    };
    current.practices.push(row);
    groupMap.set(email, current);
  }
  for (const group of groupMap.values()) group.gifts = FIRST_GIFT_EMAILS.has(group.email) ? 1 : 0;
  const groups = [...groupMap.values()].sort((a, b) => a.provider.localeCompare(b.provider, "it"));

  const config = getFicConfig();
  const company = await ficStep("company/info", () =>
    ficRequest<{ data?: JsonObject }>(config, `/c/${config.companyId}/company/info`));
  // Lo stesso ID IVA gia usato dal flusso pagamenti; il token corrente non ha
  // il permesso di leggere la tabella aliquote, ma puo creare documenti.
  const vat22 = { id: Number(Deno.env.get("FIC_VAT_TYPE_ID") ?? "0"), value: 22 };

  // Il token ha accesso ai documenti ma non alla rubrica clienti. Recuperiamo
  // l'intestatario dall'ultima fattura gia presente, preservando tutti i dati fiscali.
  const issuedDocuments = await ficStep("issued_documents", () =>
    listAll<JsonObject>(`/c/${config.companyId}/issued_documents?type=invoice&fieldset=detailed`));
  const entities = [...new Map(issuedDocuments.flatMap((document) => {
    const entity = document.entity && typeof document.entity === "object" ? document.entity as JsonObject : null;
    if (!entity) return [];
    const key = Number(entity.id ?? 0) > 0
      ? `id:${entity.id}`
      : `email:${normalize(entity.email)}|name:${normalize(entity.name)}`;
    return [[key, entity] as const];
  })).values()];

  const previews = groups.map((group) => {
    const resellerMatches = resellerByEmail.get(group.email) ?? [];
    const byEmail = entities.filter((client) => normalize(client.email) === group.email);
    const byName = entities.filter((client) => normalize(client.name) === normalize(group.provider));
    const matches = byEmail.length ? byEmail : byName;
    const crmCompany = companyByEmail.get(group.email);
    const taxCode = String(crmCompany?.codice_fiscale ?? "").replace(/\s+/g, "").toUpperCase();
    const vatNumber = String(crmCompany?.piva ?? "").replace(/\s+/g, "").replace(/^IT/i, "");
    const postalCode = String(crmCompany?.cap ?? "").replace(/\s+/g, "");
    const province = String(crmCompany?.provincia ?? "").trim().toUpperCase();
    const crmEntityComplete = Boolean(
      crmCompany && (taxCode || vatNumber) && String(crmCompany.indirizzo ?? "").trim() &&
      String(crmCompany.citta ?? "").trim() && /^\d{5}$/.test(postalCode) && /^[A-Z]{2}$/.test(province)
    );
    const crmEntity: JsonObject | null = crmEntityComplete ? {
      name: String(crmCompany?.ragione_sociale ?? group.provider).trim(),
      email: group.email,
      vat_number: vatNumber,
      tax_code: taxCode,
      address_street: String(crmCompany?.indirizzo ?? "").trim(),
      address_postal_code: postalCode,
      address_city: String(crmCompany?.citta ?? "").trim(),
      address_province: province,
      country: "Italia",
      ei_code: "0000000",
    } : null;
    const client = matches.length === 1 ? matches[0] : (matches.length === 0 ? crmEntity : null);
    const entityId = Number(client?.id ?? 0);
    const duplicate = issuedDocuments.find((invoice) => {
      const entity = invoice.entity && typeof invoice.entity === "object" ? invoice.entity as JsonObject : {};
      const sameEntity = (Number(entity.id ?? 0) === entityId && entityId > 0) ||
        (normalize(entity.email) !== "" && normalize(entity.email) === group.email) ||
        normalize(entity.name) === normalize(group.provider);
      const sameSubject = normalize(invoice.subject) === normalize(DESCRIPTION) ||
        normalize(invoice.visible_subject) === normalize(DESCRIPTION);
      return sameEntity && sameSubject;
    });
    const existingInvoiceId = duplicate?.id ?? KNOWN_CREATED_INVOICE_BY_EMAIL.get(group.email) ?? null;
    const paidCount = Math.max(0, group.practices.length - group.gifts);
    const net = cents(paidCount * group.unitPrice);
    const vat = cents(net * 0.22);
    return {
      ...group,
      reseller_match_count: resellerMatches.length,
      client_match_count: matches.length,
      client_source: matches.length === 1 ? "fattura_precedente" : (crmEntity ? "anagrafica_crm" : "mancante_o_ambigua"),
      candidate_entities: matches.map((entity) => ({ id: entity.id ?? null, name: entity.name ?? null, email: entity.email ?? null })),
      client,
      existing_invoice_id: existingInvoiceId,
      net,
      vat,
      gross: cents(net + vat),
    };
  });

  const isBlocked = (row: typeof previews[number]) =>
    row.reseller_match_count !== 1 || !row.client || Boolean(row.existing_invoice_id) || row.unitPrice <= 0;
  const blockers = previews.filter(isBlocked);
  const audit = previews.map((row) => ({
    provider: row.provider,
    email: row.email,
    practices: row.practices.length,
    gifts: row.gifts,
    unit_price: row.unitPrice,
    net: row.net,
    vat: row.vat,
    gross: row.gross,
    fic_client_id: row.client?.id ?? null,
    fic_client_name: row.client?.name ?? null,
    reseller_match_count: row.reseller_match_count,
    client_match_count: row.client_match_count,
    client_source: row.client_source,
    candidate_entities: row.candidate_entities,
    existing_invoice_id: row.existing_invoice_id,
  }));

  if (action === "preview") {
    return json({
      period: "2026-09",
      source_rows: rows.length,
      issuer: company.data,
      vat: vat22,
      description: DESCRIPTION,
      invoice_count: previews.length,
      practice_count: previews.reduce((sum, row) => sum + row.practices.length, 0),
      gift_count: previews.reduce((sum, row) => sum + row.gifts, 0),
      net_total: cents(previews.reduce((sum, row) => sum + row.net, 0)),
      vat_total: cents(previews.reduce((sum, row) => sum + row.vat, 0)),
      gross_total: cents(previews.reduce((sum, row) => sum + row.gross, 0)),
      excluded,
      blockers: blockers.map((row) => audit.find((item) => item.email === row.email)),
      invoices: audit,
    });
  }

  if (action === "create" && blockers.length) {
    return json({
      error: "Creazione bloccata: il controllo preventivo contiene eccezioni",
      blockers: blockers.map((row) => audit.find((item) => item.email === row.email)),
    }, 409);
  }

  const today = new Date().toISOString().slice(0, 10);
  const created: Array<{ provider: string; invoice_id: unknown; net: number; gross: number }> = [];
  const failed: Array<{ provider: string; error: string }> = [];
  const targets = action === "create_ready" ? previews.filter((row) => !isBlocked(row)) : previews;
  for (const row of targets) {
    const paidCount = row.practices.length - row.gifts;
    const items: JsonObject[] = [];
    if (paidCount > 0) {
      items.push({
        code: "ENEA-SET-2026",
        name: DESCRIPTION,
        net_price: row.unitPrice,
        qty: paidCount,
        vat: { id: Number(vat22.id) },
      });
    }
    if (row.gifts > 0) {
      items.push({
        code: "ENEA-SET-2026-OMAGGIO",
        name: DESCRIPTION,
        description: "Prima pratica omaggio",
        net_price: row.unitPrice,
        discount: 100,
        qty: row.gifts,
        vat: { id: Number(vat22.id) },
      });
    }
    const payload: JsonObject = {
      data: {
        type: "invoice",
        entity: row.client,
        date: today,
        subject: DESCRIPTION,
        visible_subject: DESCRIPTION,
        currency: { id: "EUR" },
        language: { code: "it" },
        e_invoice: true,
        ei_data: { vat_kind: "I", payment_method: "MP05" },
        items_list: items,
        payments_list: row.gross > 0 ? [{ amount: row.gross, due_date: today, status: "not_paid" }] : [],
        show_payments: true,
        show_payment_method: true,
        show_tspay_button: false,
        notes: `${row.practices.length} pratiche complessive; ${row.gifts} prima pratica omaggio. Documento creato ma non inviato.`,
      },
    };
    try {
      const invoice = await ficRequest<{ data?: JsonObject }>(config, `/c/${config.companyId}/issued_documents`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      created.push({ provider: row.provider, invoice_id: invoice.data?.id ?? null, net: row.net, gross: row.gross });
    } catch (error) {
      failed.push({ provider: row.provider, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return json({ created, failed, skipped_blockers: blockers.length, emailed: false, e_invoice_sent: false });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
