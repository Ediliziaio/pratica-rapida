import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261021143000_practice_cycle_duration.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("practice cycle migration", () => {
  it("congela il contatore soltanto entrando in da_inviare", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS ciclo_chiuso_at timestamptz");
    expect(sql).toContain("v_stage_type = 'da_inviare'");
    expect(sql).toContain("OLD.ciclo_chiuso_at IS NOT NULL");
    expect(sql).toContain("NEW.ciclo_chiuso_at := OLD.ciclo_chiuso_at");
  });

  it("esegue il recupero storico prima di attivare la protezione", () => {
    expect(sql.indexOf("UPDATE public.enea_practices ep")).toBeGreaterThan(-1);
    expect(sql.indexOf("CREATE TRIGGER trg_enea_practices_freeze_cycle"))
      .toBeGreaterThan(sql.indexOf("UPDATE public.enea_practices ep"));
  });
});
