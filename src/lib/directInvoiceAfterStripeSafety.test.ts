import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paidInvoicePayload } from "../../supabase/functions/_shared/fatture-in-cloud";

const createPaymentSource = readFileSync(
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

describe("fattura diretta dopo pagamento Stripe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("congela cliente, prezzi e prodotto prima di aprire il checkout", () => {
    expect(createPaymentSource).toContain("billing_snapshot: customer");
    expect(createPaymentSource).toContain("pricing_snapshot: price");
    expect(createPaymentSource).toContain('product_snapshot: practice.prodotto_installato ?? "ENEA"');
  });

  it("crea la proforma soltanto nel percorso legacy TS Pay", () => {
    const legacyBranch = createPaymentSource.indexOf('} else {\n      // Compatibilita\' con l\'eventuale percorso TS Pay');
    const createProforma = createPaymentSource.indexOf("const created = await createProforma", legacyBranch);
    expect(legacyBranch).toBeGreaterThan(0);
    expect(createProforma).toBeGreaterThan(legacyBranch);
    expect(createPaymentSource.slice(0, legacyBranch)).not.toContain("const created = await createProforma");
  });

  it("crea direttamente la fattura dopo Stripe e mantiene compatibili i vecchi ordini", () => {
    expect(finalizerSource).toContain("? await transformProformaToInvoice(config, proformaId, paidAt)");
    expect(finalizerSource).toContain(": await createPaidInvoice(");
    expect(finalizerSource).toContain("billingSnapshot(order.billing_snapshot)");
    expect(finalizerSource).toContain("pricingSnapshot(order.pricing_snapshot, Number(order.totale_cents))");
  });

  it("marca la fattura diretta come elettronica, saldata e senza TS Pay", () => {
    expect(ficSource).toContain('type: "invoice"');
    expect(ficSource).toContain("e_invoice: true");
    expect(ficSource).toContain('status: "paid"');
    expect(ficSource).toContain("payment_account: { id: paymentAccountId }");
    expect(ficSource).toContain("show_tspay_button: false");
  });

  it("costruisce una fattura intestata allo snapshot e con il totale pagato", () => {
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => name === "FIC_STRIPE_PAYMENT_ACCOUNT_ID" ? "321" : "22" },
    });
    const payload = paidInvoicePayload(
      "practice-enrico",
      "Infissi / Serramenti",
      {
        name: "Enrico Russo",
        email: "enrico@example.test",
        taxCode: "RSSNRC86D13I234W",
        street: "Via Prova 1",
        postalCode: "20100",
        city: "Milano",
        province: "MI",
        country: "Italia",
      },
      {
        pricingKey: "prezzo_servizio_catastale",
        cadastralService: true,
        lines: [{
          code: "PR-CATASTO",
          name: "Servizio ricerca dati catastali",
          netCents: 1000,
          vatPercent: 22,
        }],
        netCents: 1000,
        vatCents: 220,
        grossCents: 1220,
      },
      "2026-10-14T16:02:46.187Z",
    ) as { data: Record<string, unknown> };

    expect(payload.data.type).toBe("invoice");
    expect(payload.data.entity).toMatchObject({ name: "Enrico Russo", tax_code: "RSSNRC86D13I234W" });
    expect(payload.data.payments_list).toEqual([expect.objectContaining({
      amount: 12.2,
      status: "paid",
      payment_account: { id: 321 },
    })]);
  });
});
