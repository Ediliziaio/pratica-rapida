import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-monthly-invoices/index.ts"),
  "utf8",
);
const adminPage = readFileSync(
  path.resolve(process.cwd(), "src/pages/admin/Integrazioni.tsx"),
  "utf8",
);

describe("fatturazione mensile FIC settembre 2026", () => {
  it("usa settembre ed esclude i due fornitori, i CF e le pratiche interne", () => {
    expect(source).toContain('const DESCRIPTION = "Gestione pratiche ENEA Settembre 2026"');
    expect(source).toContain('providerKey.includes("brianza serramenti")');
    expect(source).toContain('providerKey.includes("vans")');
    expect(source).toContain('=== "cliente_finale"');
    expect(source).toContain('emailKey.endsWith("@praticarapida.it")');
  });

  it("non invia e rappresenta gli omaggi con sconto totale", () => {
    expect(source).not.toContain("/email");
    expect(source).not.toContain("/e_invoice/send");
    expect(source).toContain('"Prima pratica omaggio"].filter(Boolean).join("\\n")');
    expect(source).toContain("discount: 100");
  });

  it("riporta in fattura i nomi dei clienti del cruscotto senza duplicarli", () => {
    expect(source).toContain(".map(clientName)");
    expect(source).toContain('.join("\\n")');
    expect(source).toContain("paidPractices: group.practices.slice(giftCount)");
    expect(source).toContain("giftPractices: group.practices.slice(0, giftCount)");
    expect(source).toContain("description: itemDescription(paidPractices)");
    expect(source).toContain('[itemDescription(giftPractices), "Prima pratica omaggio"]');
    expect(source).toContain("clients: row.practices.map(clientName)");
  });

  it("blocca la creazione se intestatari, prezzi o duplicati non superano il controllo", () => {
    expect(source).toContain('action === "preview"');
    expect(source).toContain('action === "create" && blockers.length');
    expect(source).toContain("existing_invoice_id");
    expect(source).toContain("row.unitPrice <= 0");
    expect(source).toContain('action === "create_ready"');
  });

  it("modifica soltanto le 16 fatture registrate, non inviate e con totali gia verificati", () => {
    expect(source).toContain('action === "update_existing_draft_names"');
    expect(source).toContain("KNOWN_CREATED_INVOICE_BY_EMAIL.get(row.email)");
    expect(source).toContain('registeredInvoiceId !== invoiceId');
    expect(source).toContain('if (Boolean(document.locked))');
    expect(source).toContain('normalize(document.ei_status) !== "not_sent"');
    expect(source).toContain('includes("documento creato ma non inviato")');
    expect(source).toContain('throw new Error("totali diversi dal controllo preventivo")');
    expect(source).toContain("number: document.number");
    expect(source).toContain('method: "PUT"');
    expect(source).toContain('emailed: false, e_invoice_sent: false');
  });

  it("consente la correzione dal CRM soltanto al super-admin autenticato", () => {
    expect(source).toContain('action === "update_existing_draft_names"');
    expect(source).toContain('.eq("role", "super_admin")');
    expect(source).toContain("superAdminAuthorized = Boolean(roles?.length)");
    expect(adminPage).toContain('body: { action: "update_existing_draft_names" }');
    expect(adminPage).toContain("Non crea, non numera, non emette e non invia fatture.");
    expect(adminPage).toContain("Modifica solo le fatture esistenti");
    expect(adminPage).toContain("draftUpdateResult.failed.map");
  });

  it("la chiave di ispezione autorizza soltanto operazioni di lettura", () => {
    expect(source).toContain('action === "preview" || action === "inspect_provider"');
    expect(source).toContain("!runAuthorized && !inspectAuthorized");
  });

  it("ricorda l'abbinamento FV Tende con l'intestatario Fabio Voltan", () => {
    expect(source).toContain('["fv.tende@yahoo.com", "Fabio Voltan"]');
    expect(source).toContain("FIC_ENTITY_NAME_BY_EMAIL.get(group.email) ?? group.provider");
  });

  it("ricorda i dati fiscali confermati di G.A. Servizi", () => {
    expect(source).toContain('["gaidroclima@gmail.com", "G.A. SERVIZI DI ADUSHAJ XHULIO"]');
    expect(source).toContain('vat_number: "03914560127"');
    expect(source).toContain('tax_code: "DSHXHL87L24Z100E"');
    expect(source).toContain('ei_code: "KRRH6B9"');
  });

  it("ricorda l'abbinamento e i dati fiscali di Ghitti Attilio", () => {
    expect(source).toContain('["attilio.ghitti@libero.it", "Ghitti Attilio"]');
    expect(source).toContain('vat_number: "09590360153"');
    expect(source).toContain('tax_code: "GHTTTL58C06D332J"');
    expect(source).toContain('certified_email: "ghitti.attilio@pec.it"');
  });

  it("ricorda l'anagrafica completa di Innova Serramenti", () => {
    expect(source).toContain('["innovaserramenti4@gmail.com", "Innova Serramenti SRLS"]');
    expect(source).toContain('vat_number: "12087331000"');
    expect(source).toContain('ei_code: "N92GLON"');
    expect(source).toContain('address_street: "Via del Mandrione 103"');
    expect(source).toContain('address_postal_code: "00181"');
  });

  it("risolve gli abbinamenti storici certi e corregge l'email operativa", () => {
    expect(source).toContain('["antonio@diioriogroupsrl.com", 112634649]');
    expect(source).toContain('["info@zanzasol.com", 112634762]');
    expect(source).toContain('["info@lmtende.it", 112634560]');
    expect(source).toContain("email: group.email");
  });
});
