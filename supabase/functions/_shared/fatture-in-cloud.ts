import type { PaymentPricing } from "./fic-pricing.ts";

const API_BASE = "https://api-v2.fattureincloud.it";

export type JsonObject = Record<string, unknown>;

export interface FicConfig {
  token: string;
  companyId: number;
}

export interface BillingIdentity {
  name: string;
  email: string;
  taxCode: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
}

export function getFicConfig(): FicConfig {
  const token = Deno.env.get("FIC_ACCESS_TOKEN")?.trim() ?? "";
  const companyId = Number(Deno.env.get("FIC_COMPANY_ID") ?? "");
  if (!token || !Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("Fatture in Cloud non configurato: servono FIC_ACCESS_TOKEN e FIC_COMPANY_ID");
  }
  return { token, companyId };
}

export async function ficRequest<T>(
  config: FicConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(`FIC ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

function stringAt(value: unknown, ...path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = (current as JsonObject)[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function firstString(value: unknown, candidates: string[][]): string {
  for (const path of candidates) {
    const result = stringAt(value, ...path);
    if (result) return result;
  }
  return "";
}

/** Estrae i dati fiscali sia dal form storico sia dai moduli dinamici. */
export function extractBillingIdentity(practice: JsonObject): BillingIdentity {
  const form = (practice.dati_form && typeof practice.dati_form === "object")
    ? practice.dati_form as JsonObject
    : {};
  const firstName = firstString(form, [["richiedente", "nome"], ["anagrafica", "nome"]]) || String(practice.cliente_nome ?? "").trim();
  const lastName = firstString(form, [["richiedente", "cognome"], ["anagrafica", "cognome"]]) || String(practice.cliente_cognome ?? "").trim();
  const email = firstString(form, [["richiedente", "email"], ["anagrafica", "email"]]) || String(practice.cliente_email ?? "").trim();
  const taxCode = (firstString(form, [["richiedente", "cf"], ["anagrafica", "cf"], ["anagrafica", "codice_fiscale"]]) || String(practice.cliente_cf ?? "")).trim().toUpperCase();
  const streetName = firstString(form, [["residenza", "indirizzo"], ["indirizzo", "indirizzo"], ["anagrafica", "indirizzo"]]);
  const streetNumber = firstString(form, [["residenza", "civico"], ["indirizzo", "civico"], ["anagrafica", "civico"]]);
  const street = [streetName, streetNumber].filter(Boolean).join(" ").trim() || String(practice.cliente_indirizzo ?? "").trim();
  const postalCode = firstString(form, [["residenza", "cap"], ["indirizzo", "cap"], ["anagrafica", "cap"]]);
  const city = firstString(form, [["residenza", "comune"], ["indirizzo", "comune"], ["anagrafica", "comune"], ["anagrafica", "citta"]]);
  const province = firstString(form, [["residenza", "provincia"], ["indirizzo", "provincia"], ["anagrafica", "provincia"]]).toUpperCase();

  const missing = [
    ["nome e cognome", [firstName, lastName].filter(Boolean).join(" ")],
    ["email", email],
    ["codice fiscale", taxCode],
    ["indirizzo", street],
    ["CAP", postalCode],
    ["comune", city],
    ["provincia", province],
  ].filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) throw new Error(`Dati fiscali incompleti: ${missing.join(", ")}`);
  if (!/^[A-Z0-9]{11,16}$/.test(taxCode)) throw new Error("Codice fiscale non valido per la fatturazione");
  if (!/^\d{5}$/.test(postalCode)) throw new Error("CAP non valido per la fatturazione");
  if (!/^[A-Z]{2}$/.test(province)) throw new Error("Provincia non valida per la fatturazione");

  return {
    name: `${firstName} ${lastName}`.trim(),
    email,
    taxCode,
    street,
    postalCode,
    city,
    province,
    country: "Italia",
  };
}

export function proformaPayload(
  practiceId: string,
  product: string,
  customer: BillingIdentity,
  price: PaymentPricing,
): JsonObject {
  const today = new Date().toISOString().slice(0, 10);
  return {
    data: {
      type: "proforma",
      entity: {
        name: customer.name,
        email: customer.email,
        tax_code: customer.taxCode,
        address_street: customer.street,
        address_postal_code: customer.postalCode,
        address_city: customer.city,
        address_province: customer.province,
        country: customer.country,
        // Codice destinatario previsto per i consumatori finali italiani.
        ei_code: "0000000",
      },
      date: today,
      subject: `PraticaRapida:${practiceId}`,
      visible_subject: `Servizio pratica ${product || "ENEA"}`,
      currency: { id: "EUR" },
      language: { code: "it" },
      items_list: price.lines.map((line) => ({
        code: line.code,
        name: line.name,
        net_price: line.netCents / 100,
        qty: 1,
        vat: { id: Number(Deno.env.get("FIC_VAT_TYPE_ID") ?? "0") },
      })),
      payments_list: [{
        amount: price.grossCents / 100,
        due_date: today,
        status: "not_paid",
      }],
      show_tspay_button: true,
      show_payments: true,
      show_payment_method: true,
      notes: `Riferimento pratica Pratica Rapida: ${practiceId}`,
    },
  };
}

export async function createProforma(config: FicConfig, payload: JsonObject) {
  return await ficRequest<{ data: JsonObject }>(config, `/c/${config.companyId}/issued_documents`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getIssuedDocument(config: FicConfig, documentId: number) {
  return await ficRequest<{ data: JsonObject }>(
    config,
    `/c/${config.companyId}/issued_documents/${documentId}?fieldset=detailed`,
  );
}

export async function deleteIssuedDocument(config: FicConfig, documentId: number) {
  return await ficRequest<unknown>(config, `/c/${config.companyId}/issued_documents/${documentId}`, {
    method: "DELETE",
  });
}

export async function scheduleDocumentEmail(
  config: FicConfig,
  documentId: number,
  email: string,
  customerName: string,
  kind: "proforma" | "invoice",
) {
  const isInvoice = kind === "invoice";
  const subject = isInvoice ? "La tua fattura Pratica Rapida" : "Completa il pagamento della pratica";
  const body = isInvoice
    ? `Gentile ${customerName},<br><br>la fattura relativa alla tua pratica è disponibile qui sotto.<br><br>{{allegati}}<br><br>Cordiali saluti,<br><b>Pratica Rapida</b>`
    : `Gentile ${customerName},<br><br>puoi pagare la tua pratica con carta tramite il pulsante presente nel documento.<br><br>{{allegati}}<br><br>Cordiali saluti,<br><b>Pratica Rapida</b>`;
  return await ficRequest(config, `/c/${config.companyId}/issued_documents/${documentId}/email`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        sender_id: 0,
        recipient_email: email,
        subject,
        body,
        include: { document: true, delivery_note: false, attachment: false, accompanying_invoice: false },
        attach_pdf: isInvoice,
        send_copy: false,
      },
    }),
  });
}

export async function transformProformaToInvoice(
  config: FicConfig,
  proformaId: number,
  paidAt?: string,
) {
  const prepared = await ficRequest<{ data: JsonObject; options: JsonObject }>(
    config,
    // La proforma è un documento tecnico temporaneo: dopo la trasformazione
    // non va conservata, altrimenti rimane un credito fittizio da riscuotere.
    `/c/${config.companyId}/issued_documents/transform?original_document_id=${proformaId}&new_type=invoice&e_invoice=1&transform_keep_copy=0`,
  );
  prepared.data.e_invoice = true;
  prepared.data.show_tspay_button = false;
  // Se il pagamento arriva da Stripe, la fattura nasce già saldata. In questo
  // modo Fatture in Cloud rimane la sola fonte fiscale, ma non attende un
  // secondo incasso TS Pay che non arriverà mai.
  if (paidAt) {
    const paidDate = paidAt.slice(0, 10);
    const paymentAccountId = Number(Deno.env.get("FIC_STRIPE_PAYMENT_ACCOUNT_ID") ?? "");
    if (!Number.isInteger(paymentAccountId) || paymentAccountId <= 0) {
      throw new Error("Conto di accredito Stripe/Qonto non configurato in Fatture in Cloud");
    }
    const payments = Array.isArray(prepared.data.payments_list)
      ? prepared.data.payments_list as JsonObject[]
      : [];
    const paymentRows = payments.length > 0
      ? payments
      : [{ amount: Number(prepared.data.amount_gross ?? 0), due_date: paidDate }];
    if (paymentRows.some((payment) => Number(payment.amount ?? 0) <= 0)) {
      throw new Error("Importo pagamento non disponibile nella fattura Fatture in Cloud");
    }
    prepared.data.payments_list = paymentRows.map((payment) => ({
      ...payment,
      status: "paid",
      paid_date: paidDate,
      payment_account: { id: paymentAccountId },
    }));
  }
  const eiData = (prepared.data.ei_data && typeof prepared.data.ei_data === "object")
    ? prepared.data.ei_data as JsonObject
    : {};
  prepared.data.ei_data = {
    ...eiData,
    vat_kind: "I",
    // Non sovrascrive l'eventuale metodo già valorizzato da FIC/TS Pay.
    payment_method: String(eiData.payment_method ?? "").trim() || "MP08",
  };
  return await ficRequest<{ data: JsonObject }>(config, `/c/${config.companyId}/issued_documents`, {
    method: "POST",
    body: JSON.stringify(prepared),
  });
}

export async function sendEInvoice(config: FicConfig, invoiceId: number, dryRun: boolean) {
  return await ficRequest(config, `/c/${config.companyId}/issued_documents/${invoiceId}/e_invoice/send`, {
    method: "POST",
    body: JSON.stringify({ data: {}, options: { dry_run: dryRun } }),
  });
}

export function isDocumentPaid(document: JsonObject, expectedGrossCents: number): boolean {
  const rows = Array.isArray(document.payments_list) ? document.payments_list as JsonObject[] : [];
  const paidCents = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Math.round(Number(row.amount ?? 0) * 100), 0);
  return paidCents >= expectedGrossCents;
}
