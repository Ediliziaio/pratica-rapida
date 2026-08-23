export type ProductCategory = "screening" | "windows" | "general";
export type LineSource = "catalog" | "free";

export interface ScreeningData {
  productType: "tende_da_sole" | "pergotenda" | "pergola" | "altro" | "";
  manufacturer: string;
  orientation: "sud" | "sud_est" | "sud_ovest" | "est" | "ovest" | "";
  widthCm: number | null;
  heightCm: number | null;
  motorized: boolean | null;
  color: string;
}

export interface Company {
  id: string;
  name: string;
  vatNumber: string;
  address: string;
}

export interface DemoUser {
  id: string;
  companyId: string;
  name: string;
  role: "owner" | "collaborator";
}

export interface Customer {
  name: string;
  taxId: string;
  address: string;
  email: string;
}

export interface CatalogItem {
  id: string;
  companyId: string;
  code: string;
  description: string;
  category: ProductCategory;
  unit: string;
  unitPrice: number;
  vatRate: number;
}

export interface DocumentLine {
  id: string;
  source: LineSource;
  catalogItemId?: string;
  description: string;
  category: ProductCategory;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  screening?: ScreeningData;
}

export interface Quote {
  id: string;
  companyId: string;
  number: string;
  createdAt: string;
  status: "draft" | "ready" | "converted";
  customer: Customer;
  lines: DocumentLine[];
  notes: string;
}

export interface InvoiceDraft {
  id: string;
  companyId: string;
  sourceQuoteId: string;
  number: string;
  createdAt: string;
  status: "draft" | "complete" | "pdf_generated" | "copied_to_accounting";
  customer: Customer;
  lines: DocumentLine[];
  paymentTerms: string;
}

export interface PracticeRapidaRequest {
  id: string;
  companyId: string;
  invoiceDraftId: string;
  createdAt: string;
  status: "local_simulation";
  customer: Customer;
  screeningLines: DocumentLine[];
  consent: true;
}

export interface Workspace {
  schemaVersion: 1;
  companyId: string;
  quotes: Quote[];
  invoices: InvoiceDraft[];
  requests: PracticeRapidaRequest[];
}

export const DEMO_COMPANIES: readonly Company[] = Object.freeze([
  { id: "demo-sole", name: "Bottega Sole Demo", vatNumber: "IT00000000001", address: "Via Esempio 10, Demo" },
  { id: "demo-casa", name: "Casa Chiara Demo", vatNumber: "IT00000000002", address: "Via Laboratorio 20, Demo" },
]);

export const DEMO_USERS: readonly DemoUser[] = Object.freeze([
  { id: "user-sole-owner", companyId: "demo-sole", name: "Anna Demo", role: "owner" },
  { id: "user-sole-collab", companyId: "demo-sole", name: "Luca Demo", role: "collaborator" },
  { id: "user-casa-owner", companyId: "demo-casa", name: "Marta Demo", role: "owner" },
]);

export const DEMO_CATALOG: readonly CatalogItem[] = Object.freeze([
  { id: "screening-awning", companyId: "demo-sole", code: "SCH-001", description: "Tenda da sole su misura", category: "screening", unit: "pz", unitPrice: 850, vatRate: 22 },
  { id: "screening-install", companyId: "demo-sole", code: "POS-001", description: "Posa schermatura", category: "general", unit: "servizio", unitPrice: 180, vatRate: 22 },
  { id: "screening-pergola", companyId: "demo-casa", code: "SCH-101", description: "Pergola demo", category: "screening", unit: "pz", unitPrice: 2100, vatRate: 22 },
]);

export function emptyCustomer(): Customer {
  return { name: "", taxId: "", address: "", email: "" };
}

export function emptyScreening(): ScreeningData {
  return { productType: "", manufacturer: "", orientation: "", widthCm: null, heightCm: null, motorized: null, color: "" };
}

export function createQuote(companyId: string, sequence: number): Quote {
  return {
    id: `quote-${companyId}-${sequence}`,
    companyId,
    number: `PREV-DEMO-${String(sequence).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    status: "draft",
    customer: emptyCustomer(),
    lines: [],
    notes: "",
  };
}

export function catalogLine(item: CatalogItem, sequence: number): DocumentLine {
  return {
    id: `line-catalog-${sequence}`,
    source: "catalog",
    catalogItemId: item.id,
    description: item.description,
    category: item.category,
    unit: item.unit,
    quantity: 1,
    unitPrice: item.unitPrice,
    vatRate: item.vatRate,
    ...(item.category === "screening" ? { screening: emptyScreening() } : {}),
  };
}

export function freeLine(sequence: number): DocumentLine {
  return { id: `line-free-${sequence}`, source: "free", description: "", category: "general", unit: "pz", quantity: 1, unitPrice: 0, vatRate: 22 };
}

export function lineTotals(line: DocumentLine) {
  const net = Math.max(0, line.quantity) * Math.max(0, line.unitPrice);
  const vat = net * Math.max(0, line.vatRate) / 100;
  return { net, vat, gross: net + vat };
}

export function documentTotals(lines: DocumentLine[]) {
  return lines.reduce((total, line) => {
    const current = lineTotals(line);
    return { net: total.net + current.net, vat: total.vat + current.vat, gross: total.gross + current.gross };
  }, { net: 0, vat: 0, gross: 0 });
}

export function missingInvoiceFields(quote: Quote, company?: Company): string[] {
  const missing: string[] = [];
  if (!company?.vatNumber.trim()) missing.push("Partita IVA azienda");
  if (!company?.address.trim()) missing.push("Indirizzo azienda");
  if (!quote.customer.name.trim()) missing.push("Nome cliente");
  if (!quote.customer.taxId.trim()) missing.push("Codice fiscale o Partita IVA cliente");
  if (!quote.customer.address.trim()) missing.push("Indirizzo cliente");
  if (!quote.lines.length) missing.push("Almeno una riga");
  if (quote.lines.some((line) => !line.description.trim())) missing.push("Descrizione di tutte le righe");
  return missing;
}

export function convertQuote(quote: Quote, company: Company, sequence: number): { invoice?: InvoiceDraft; missing: string[] } {
  const missing = missingInvoiceFields(quote, company);
  if (missing.length) return { missing };
  return {
    missing: [],
    invoice: {
      id: `invoice-${company.id}-${sequence}`,
      companyId: company.id,
      sourceQuoteId: quote.id,
      number: `BOZZA-DEMO-${String(sequence).padStart(3, "0")}`,
      createdAt: new Date().toISOString(),
      status: "draft",
      customer: structuredClone(quote.customer),
      lines: structuredClone(quote.lines),
      paymentTerms: "Da definire nel gestionale di fatturazione",
    },
  };
}

export function missingPracticeRequestFields(invoice: InvoiceDraft): string[] {
  const missing: string[] = [];
  const screenings = invoice.lines.filter((line) => line.category === "screening");
  if (!screenings.length) missing.push("Almeno una schermatura");
  screenings.forEach((line, index) => {
    const data = line.screening;
    if (!data?.productType) missing.push(`Schermatura ${index + 1}: tipo prodotto`);
    if (!data?.orientation) missing.push(`Schermatura ${index + 1}: direzione`);
    if (!data?.widthCm || !data?.heightCm) missing.push(`Schermatura ${index + 1}: misure`);
  });
  return missing;
}

export function simulatePracticeRequest(invoice: InvoiceDraft): { request?: PracticeRapidaRequest; missing: string[] } {
  const missing = missingPracticeRequestFields(invoice);
  if (missing.length) return { missing };
  return {
    missing: [],
    request: {
      id: `pr-request-${invoice.id}`,
      companyId: invoice.companyId,
      invoiceDraftId: invoice.id,
      createdAt: new Date().toISOString(),
      status: "local_simulation",
      customer: structuredClone(invoice.customer),
      screeningLines: structuredClone(invoice.lines.filter((line) => line.category === "screening")),
      consent: true,
    },
  };
}
