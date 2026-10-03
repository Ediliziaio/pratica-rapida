import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const checkoutSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-create-payment/index.ts"),
  "utf8",
);
const finalizerSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/_shared/finalize-cf-payment.ts"),
  "utf8",
);
const ficSource = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/_shared/fatture-in-cloud.ts"),
  "utf8",
);

describe("fattura definitiva soltanto dopo il pagamento", () => {
  it("il checkout non crea né invia documenti Fatture in Cloud", () => {
    expect(checkoutSource).not.toContain("createProforma(");
    expect(checkoutSource).not.toContain("createPaidInvoice(");
    expect(checkoutSource).not.toContain("scheduleDocumentEmail(");
    expect(checkoutSource).toContain("Prima del pagamento non viene creato alcun documento");
    expect(checkoutSource).toContain('CF_PAYMENT_PROVIDER") !== "stripe"');
  });

  it("il finalizzatore crea direttamente la fattura dopo l'incasso verificato", () => {
    const liveGate = finalizerSource.indexOf('FIC_LIVE_INVOICING_ENABLED") !== "true"');
    const invoiceCreation = finalizerSource.indexOf("createPaidInvoice(");

    expect(liveGate).toBeGreaterThan(0);
    expect(invoiceCreation).toBeGreaterThan(liveGate);
    expect(finalizerSource).not.toContain("transformProformaToInvoice(");
    expect(finalizerSource).not.toContain("createProforma(");
  });

  it("la fattura nasce elettronica, saldata e senza pulsante TS Pay", () => {
    const paidInvoice = ficSource.slice(ficSource.indexOf("export function paidInvoicePayload"));

    expect(paidInvoice).toContain('type: "invoice"');
    expect(paidInvoice).toContain("e_invoice: true");
    expect(paidInvoice).toContain('status: "paid"');
    expect(paidInvoice).toContain("payment_account: { id: paymentAccountId }");
    expect(paidInvoice).toContain("show_tspay_button: false");
  });
});
