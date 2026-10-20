import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020120000_business_lead_nurture.sql"),
  "utf8",
);
const processor = readFileSync(
  resolve(process.cwd(), "supabase/functions/process-lead-nurture/index.ts"),
  "utf8",
);

describe("lead nurture safety gates", () => {
  it("is installed disabled until the owner approves the final messages", () => {
    expect(migration).toContain("'{\"enabled\":false,\"duration_days\":60}'");
    expect(processor).toContain('reason: "disabled"');
  });

  it("stops on consent withdrawal, archive, or conversion to active customer", () => {
    expect(migration).toContain("NEW.marketing_consent = false");
    expect(migration).toContain("NEW.archived_at IS NOT NULL");
    expect(migration).toContain("NEW.stage_id = 'attivo'");
  });

  it("enforces the permanent WhatsApp time windows", () => {
    expect(processor).toContain('if (day === "Sun") return false');
    expect(processor).toContain('if (day === "Sat") return mins >= 510 && mins < 840');
    expect(processor).toContain("return mins >= 510 && mins < 1320");
  });

  it("checks recipient, duplicate delivery, and controlled content before sending", () => {
    expect(processor).toContain("const recipientOk");
    expect(processor).toContain("const { data: alreadySent = [] }");
    expect(processor).toContain("const contentOk");
  });
});
