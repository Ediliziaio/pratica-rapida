import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("richieste private non pagate nel CRM", () => {
  const migration = source("supabase/migrations/20261024090000_hide_unpaid_public_private_practices.sql");
  const intake = source("supabase/functions/richiesta-pubblica/index.ts");

  it("nasconde dalla tabella e dalla view invoker soltanto il checkout privato non pagato", () => {
    expect(migration).toContain("public_private_checkout_required boolean NOT NULL DEFAULT false");
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("FOR SELECT");
    expect(migration).toContain("NOT public_private_checkout_required");
    expect(migration).toContain("pagamento_stato = 'pagata'");
    expect(source("supabase/migrations/20261021143000_practice_cycle_duration.sql"))
      .toContain("WITH (security_invoker = true)");
  });

  it("include le richieste private preesistenti e non le pratiche caricate dai rivenditori", () => {
    expect(migration).toContain("note LIKE '📥 RICHIESTA DAL SITO — CLIENTE PRIVATO%'");
    expect(intake).toContain("public_private_checkout_required: isPrivato");
    expect(intake).toContain('const cfFinale = isPrivato || p.tipo_fatturazione === "cliente_finale"');
  });

  it("non mostra una notifica prematura e rende visibile la pratica dopo il pagamento", () => {
    expect(intake).toContain("if (!isPrivato && !resellerOnlineDraft) {");
    expect(migration).toContain("n.tipo = 'richiesta_pubblica'");
    expect(source("supabase/functions/stripe-webhook/index.ts"))
      .toContain('pagamento_stato: "pagata"');
    expect(source("supabase/functions/_shared/finalize-cf-payment.ts"))
      .toContain('pagamento_stato: "pagata"');
  });

  it("mantiene il modulo tokenizzato accessibile e pubblica la migrazione col sito", () => {
    expect(source("supabase/migrations/20260917170000_stripe_fic_payment_orchestration.sql"))
      .toContain("SECURITY DEFINER");
    expect(source(".github/workflows/deploy.yml"))
      .toContain("hide_unpaid_public_private_practices");
  });
});
