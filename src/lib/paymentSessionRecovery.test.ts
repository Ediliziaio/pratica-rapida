import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/fic-create-payment/index.ts"),
  "utf8",
);

describe("recupero delle sessioni Stripe scadute", () => {
  it("migra gli ordini TS Pay pendenti senza restituire il PDF della proforma", () => {
    const migration = source.indexOf("const migrateExistingTsPayOrder");
    const migrationKey = source.indexOf("-migrate-tspay");
    const staleUrlFallback = source.indexOf("if (existingUrl && !resetExistingStripeOrder)");

    expect(migration).toBeGreaterThan(0);
    expect(migrationKey).toBeGreaterThan(migration);
    expect(staleUrlFallback).toBeGreaterThan(migrationKey);
    expect(source).toContain('provider: "stripe_fatture_in_cloud"');
    expect(source).toContain("fic_document_url: null");
    expect(source).toContain("Number(existing.totale_cents) !== price.grossCents");
  });

  it("controlla la sessione prima di restituire l'URL memorizzato", () => {
    const retrieve = source.indexOf("stripe.checkout.sessions.retrieve(previousSessionId)");
    const openSession = source.indexOf('previousSession.status === "open"');
    const staleUrlFallback = source.indexOf("if (existingUrl && !resetExistingStripeOrder)");

    expect(retrieve).toBeGreaterThan(0);
    expect(openSession).toBeGreaterThan(retrieve);
    expect(staleUrlFallback).toBeGreaterThan(openSession);
  });

  it("blocca un secondo pagamento e rinnova solo le sessioni non pagate", () => {
    expect(source).toContain('previousSession.payment_status === "paid"');
    expect(source).toContain("const renewedSession = await stripe.checkout.sessions.create");
    expect(source).toContain("-renew-${previousSessionId}");
    expect(source).toContain("refreshed: true");
  });
});
