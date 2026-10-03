import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ficRequest, getFicConfig, type JsonObject } from "../_shared/fatture-in-cloud.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUN_KEY = Deno.env.get("FIC_MONTHLY_INVOICE_RUN_KEY")!;
const INSPECT_KEY = Deno.env.get("FIC_MONTHLY_INVOICE_INSPECT_KEY")!;
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

// Alias confermati dal Titolare per collegare il nome commerciale nel CRM
// all'intestatario gia presente nelle fatture FIC. Non modifica il CRM e non
// crea anagrafiche: serve soltanto a recuperare i dati fiscali corretti.
const FIC_ENTITY_NAME_BY_EMAIL = new Map<string, string>([
  ["fv.tende@yahoo.com", "Fabio Voltan"],
  ["gaidroclima@gmail.com", "G.A. SERVIZI DI ADUSHAJ XHULIO"],
  ["attilio.ghitti@libero.it", "Ghitti Attilio"],
  ["innovaserramenti4@gmail.com", "Innova Serramenti SRLS"],
  ["antonio@diioriogroupsrl.com", "Di Iorio Group SRL"],
  ["info@zanzasol.com", "ZANZASOL SNC DI TOUKAMI OMAR & C."],
]);

// Quando FIC contiene duplicati identici, usa l'anagrafica confermata dalla
// fattura storica piu recente invece di scegliere in modo arbitrario.
const FIC_ENTITY_ID_BY_EMAIL = new Map<string, number>([
  ["antonio@diioriogroupsrl.com", 112634649],
  ["info@zanzasol.com", 112634762],
  ["info@lmtende.it", 112634560],
]);

// Dati identificativi confermati dal Titolare. Restano separati dagli indirizzi:
// il documento usa comunque l'anagrafica completa gia presente in FIC.
const CONFIRMED_FISCAL_DATA_BY_EMAIL = new Map<string, JsonObject>([
  ["gaidroclima@gmail.com", {
    vat_number: "03914560127",
    tax_code: "DSHXHL87L24Z100E",
    ei_code: "KRRH6B9",
  }],
  ["attilio.ghitti@libero.it", {
    vat_number: "09590360153",
    tax_code: "GHTTTL58C06D332J",
    certified_email: "ghitti.attilio@pec.it",
  }],
  ["innovaserramenti4@gmail.com", {
    vat_number: "12087331000",
    tax_code: "12087331000",
    ei_code: "N92GLON",
    address_street: "Via del Mandrione 103",
    address_city: "Roma",
    address_postal_code: "00181",
    address_province: "RM",
    country: "Italia",
  }],
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

const clientName = (practice: BridgeRow) =>
  `${practice.cliente_nome ?? ""} ${practice.cliente_cognome ?? ""}`.trim().replace(/\s+/g, " ");

const splitPractices = (group: InvoiceGroup) => {
  const giftCount = Math.min(Math.max(0, group.gifts), group.practices.length);
  return {
    giftPractices: group.practices.slice(0, giftCount),
    paidPractices: group.practices.slice(giftCount),
  };
};

const itemName = (practices: BridgeRow[]) => [
  DESCRIPTION,
  ...practices.map(clientName),
].filter(Boolean).join("\n");

const buildItems = (group: InvoiceGroup, vatId: number): JsonObject[] => {
  const { paidPractices, giftPractices } = splitPractices(group);
  const items: JsonObject[] = [];
  if (paidPractices.length > 0) {
    items.push({
      code: "ENEA-SET-2026",
      name: itemName(paidPractices),
      net_price: group.unitPrice,
      qty: paidPractices.length,
      vat: { id: vatId },
    });
  }
  if (giftPractices.length > 0) {
    items.push({
      code: "ENEA-SET-2026-OMAGGIO",
      name: itemName(giftPractices),
      description: "Prima pratica omaggio",
      net_price: group.unitPrice,
      discount: 100,
      qty: giftPractices.length,
      vat: { id: vatId },
    });
  }
  return items;
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let action = "preview";
  let providerQuery = "";
  try {
    const body = await req.json();
    action = String(body?.action ?? "preview");
    providerQuery = normalize(body?.provider ?? "");
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (!new Set(["preview", "create", "create_ready", "inspect_provider", "update_existing_draft_names"]).has(action)) {
    return json({ error: "Azione non valida" }, 400);
  }

  const suppliedRunKey = req.headers.get("x-monthly-invoice-key");
  const suppliedInspectKey = req.headers.get("x-monthly-inspect-key");
  const runAuthorized = Boolean(RUN_KEY && suppliedRunKey && suppliedRunKey === RUN_KEY);
  const inspectAuthorized = Boolean(
    INSPECT_KEY && suppliedInspectKey && suppliedInspectKey === INSPECT_KEY &&
    (action === "preview" || action === "inspect_provider")
  );
  if (!runAuthorized && !inspectAuthorized) return json({ error: "Unauthorized" }, 401);

  try {

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

  if (action === "inspect_provider") {
    if (!providerQuery) return json({ error: "Fornitore mancante" }, 400);
    const inspected: Array<{ type: string; count: number; error?: string }> = [];
    const allDocuments: Array<{ type: string; document: JsonObject }> = [];
    for (const type of ["invoice", "proforma", "quote", "receipt", "delivery_note"]) {
      try {
        const documents = type === "invoice" ? issuedDocuments : await listAll<JsonObject>(
          `/c/${config.companyId}/issued_documents?type=${type}&fieldset=detailed`,
        );
        inspected.push({ type, count: documents.length });
        allDocuments.push(...documents.map((document) => ({ type, document })));
      } catch (error) {
        inspected.push({ type, count: 0, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const matches = allDocuments.flatMap(({ type, document }) => {
      const entity = document.entity && typeof document.entity === "object" ? document.entity as JsonObject : null;
      if (!entity) return [];
      const haystack = `${normalize(entity.name)} ${normalize(entity.email)}`;
      if (!haystack.includes(providerQuery)) return [];
      return [{
        document_type: type,
        document_id: document.id ?? null,
        document_date: document.date ?? null,
        document_number: document.number ?? null,
        subject: document.subject ?? document.visible_subject ?? null,
        entity,
      }];
    });
    return json({ provider: providerQuery, inspected, matches });
  }

  const previews = groups.map((group) => {
    const resellerMatches = resellerByEmail.get(group.email) ?? [];
    const preferredEntityId = FIC_ENTITY_ID_BY_EMAIL.get(group.email);
    const byPreferredId = preferredEntityId
      ? entities.filter((client) => Number(client.id ?? 0) === preferredEntityId)
      : [];
    const byEmail = entities.filter((client) => normalize(client.email) === group.email);
    const ficEntityName = FIC_ENTITY_NAME_BY_EMAIL.get(group.email) ?? group.provider;
    const byName = entities.filter((client) => normalize(client.name) === normalize(ficEntityName));
    const matches = byPreferredId.length ? byPreferredId : (byEmail.length ? byEmail : byName);
    const crmCompany = companyByEmail.get(group.email);
    const confirmedFiscalData = CONFIRMED_FISCAL_DATA_BY_EMAIL.get(group.email);
    const taxCode = String(confirmedFiscalData?.tax_code ?? crmCompany?.codice_fiscale ?? "")
      .replace(/\s+/g, "").toUpperCase();
    const vatNumber = String(confirmedFiscalData?.vat_number ?? crmCompany?.piva ?? "")
      .replace(/\s+/g, "").replace(/^IT/i, "");
    const postalCode = String(confirmedFiscalData?.address_postal_code ?? crmCompany?.cap ?? "").replace(/\s+/g, "");
    const province = String(confirmedFiscalData?.address_province ?? crmCompany?.provincia ?? "").trim().toUpperCase();
    const crmEntityComplete = Boolean(
      (crmCompany || confirmedFiscalData) && (taxCode || vatNumber) &&
      String(confirmedFiscalData?.address_street ?? crmCompany?.indirizzo ?? "").trim() &&
      String(confirmedFiscalData?.address_city ?? crmCompany?.citta ?? "").trim() &&
      /^\d{5}$/.test(postalCode) && /^[A-Z]{2}$/.test(province)
    );
    const crmEntity: JsonObject | null = crmEntityComplete ? {
      name: String(ficEntityName).trim(),
      email: group.email,
      vat_number: vatNumber,
      tax_code: taxCode,
      address_street: String(confirmedFiscalData?.address_street ?? crmCompany?.indirizzo ?? "").trim(),
      address_postal_code: postalCode,
      address_city: String(confirmedFiscalData?.address_city ?? crmCompany?.citta ?? "").trim(),
      address_province: province,
      country: String(confirmedFiscalData?.country ?? "Italia"),
      ei_code: String(confirmedFiscalData?.ei_code ?? "0000000"),
      certified_email: String(confirmedFiscalData?.certified_email ?? ""),
    } : null;
    const historicalClient = matches.length === 1 ? {
      ...matches[0],
      // L'email operativa del CRM prevale su eventuali recapiti obsoleti o
      // errati presenti nelle fatture storiche.
      email: group.email,
      ...(confirmedFiscalData ?? {}),
    } : null;
    const client = historicalClient ?? (matches.length === 0 ? crmEntity : null);
    const entityId = Number(client?.id ?? 0);
    const duplicate = issuedDocuments.find((invoice) => {
      const entity = invoice.entity && typeof invoice.entity === "object" ? invoice.entity as JsonObject : {};
      const sameEntity = (Number(entity.id ?? 0) === entityId && entityId > 0) ||
        (normalize(entity.email) !== "" && normalize(entity.email) === group.email) ||
        normalize(entity.name) === normalize(ficEntityName);
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
    clients: row.practices.map(clientName),
    paid_clients: splitPractices(row).paidPractices.map(clientName),
    gift_clients: splitPractices(row).giftPractices.map(clientName),
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

  if (action === "update_existing_draft_names") {
    const updated: Array<{ provider: string; invoice_id: number }> = [];
    const failed: Array<{ provider: string; invoice_id: number | null; error: string }> = [];
    for (const row of previews.filter((item) => Boolean(item.existing_invoice_id))) {
      const invoiceId = Number(row.existing_invoice_id ?? 0);
      const document = issuedDocuments.find((item) => Number(item.id ?? 0) === invoiceId);
      try {
        if (!document) throw new Error("bozza non trovata");
        if (String(document.type ?? "") !== "invoice") throw new Error("il documento non e una fattura");
        if (Boolean(document.locked)) throw new Error("documento bloccato: nessuna modifica eseguita");
        if (Number(document.number ?? 0) > 0) throw new Error("fattura gia numerata: nessuna modifica eseguita");
        const subject = String(document.subject ?? document.visible_subject ?? "");
        if (normalize(subject) !== normalize(DESCRIPTION)) throw new Error("oggetto inatteso");
        if (cents(Number(document.amount_net ?? 0)) !== row.net || cents(Number(document.amount_gross ?? 0)) !== row.gross) {
          throw new Error("totali diversi dal controllo preventivo");
        }

        const desiredItems = buildItems(row, Number(vat22.id));
        const currentItems = Array.isArray(document.items_list) ? document.items_list as JsonObject[] : [];
        if (currentItems.length !== desiredItems.length) throw new Error("numero righe inatteso");
        const updatedItems = currentItems.map((item, index) => {
          const desired = desiredItems[index];
          if (Number(item.qty ?? 0) !== Number(desired.qty ?? 0)) throw new Error("quantita riga inattesa");
          if (cents(Number(item.net_price ?? 0)) !== cents(Number(desired.net_price ?? 0))) {
            throw new Error("prezzo unitario inatteso");
          }
          if (cents(Number(item.discount ?? 0)) !== cents(Number(desired.discount ?? 0))) {
            throw new Error("sconto riga inatteso");
          }
          return {
            ...item,
            name: desired.name,
            description: desired.description ?? item.description ?? "",
          };
        });

        const data: JsonObject = {
          type: document.type,
          entity: document.entity,
          date: document.date,
          subject: DESCRIPTION,
          visible_subject: DESCRIPTION,
          currency: document.currency,
          language: document.language,
          e_invoice: document.e_invoice,
          ei_data: document.ei_data,
          items_list: updatedItems,
          payments_list: document.payments_list,
          notes: document.notes,
          payment_method: document.payment_method,
          show_payments: document.show_payments,
          show_payment_method: document.show_payment_method,
          show_totals: document.show_totals,
          show_notification_button: document.show_notification_button,
          show_tspay_button: document.show_tspay_button,
          use_gross_prices: document.use_gross_prices,
        };
        if (document.numeration !== undefined) data.numeration = document.numeration;
        if (document.next_due_date !== undefined) data.next_due_date = document.next_due_date;

        await ficRequest(config, `/c/${config.companyId}/issued_documents/${invoiceId}`, {
          method: "PUT",
          body: JSON.stringify({ data }),
        });
        updated.push({ provider: row.provider, invoice_id: invoiceId });
      } catch (error) {
        failed.push({
          provider: row.provider,
          invoice_id: invoiceId || null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return json({ updated, failed, emailed: false, e_invoice_sent: false });
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
    const items = buildItems(row, Number(vat22.id));
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
