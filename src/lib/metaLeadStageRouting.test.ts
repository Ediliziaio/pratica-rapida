import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/meta-leads-webhook/index.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261102103000_route_meta_50_leads.sql"),
  "utf8",
);

describe("instradamento lead Meta Clienti €50", () => {
  it("usa il modulo e la data autorizzati senza cambiare gli altri lead", () => {
    expect(source).toContain('CLIENTI_50_FORM_ID = "2546968312490707"');
    expect(source).toContain('Date.parse("2026-10-31T00:00:00+01:00")');
    expect(source).toContain('return "lead_50_incoming"');
    expect(source).toContain("newLeadCommercialPrice");
    expect(source).toContain("commercial_price_eur: newLeadCommercialPrice");
  });

  it("calcola la destinazione sia nel recupero sia nel webhook in tempo reale", () => {
    expect(source).toContain("newLeadStageId(formId, lead.created_time)");
    expect(source).toContain("newLeadStageId(resolvedFormId, lead.created_time ?? eventCreatedAt)");
  });

  it("documenta il riallineamento storico già applicato soltanto ai lead autorizzati", () => {
    expect(migration).toContain("meta_form_id = '2546968312490707'");
    expect(migration).toContain("2026-10-31 00:00:00+01");
    expect(migration).toContain("stage_id = 'lead'");
  });
});
