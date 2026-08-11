import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260811000200_whatsapp_ai_handoff.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("WhatsApp AI human handoff migration", () => {
  it("sospende le conversazioni gia assegnate quando la migration viene applicata", () => {
    expect(migration).toContain("WHERE assigned_to IS NOT NULL");
    expect(migration).toContain("AND ai_mode <> 'paused'");
    expect(migration).toContain("ai_mode = 'paused'");
  });

  it("sospende l'AI anche se una conversazione nasce gia assegnata", () => {
    expect(migration).toContain("TG_OP = 'INSERT'");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF assigned_to");
  });

  it("non contiene una riattivazione automatica quando l'assegnazione viene rimossa", () => {
    expect(migration).not.toMatch(/assigned_to\s+IS\s+NULL[\s\S]{0,250}ai_mode\s*:=?\s*'auto'/i);
    expect(migration).not.toMatch(/assigned_to\s+IS\s+NULL[\s\S]{0,250}ai_mode\s*:=?\s*'assist'/i);
  });
});
