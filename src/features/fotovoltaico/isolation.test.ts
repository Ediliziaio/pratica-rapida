import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20261013160000_fotovoltaico_isolated_intake.sql");
const deploymentPath = resolve(process.cwd(), ".github/workflows/deploy.yml");
const migrationSql = readFileSync(migrationPath, "utf8");
const executableSql = migrationSql.replace(/^\s*--.*$/gm, "");
const deployment = readFileSync(deploymentPath, "utf8");

describe("isolamento del flusso fotovoltaico", () => {
  it("non modifica tabelle o pipeline ENEA", () => {
    expect(executableSql).not.toMatch(/enea_practices/i);
    expect(executableSql).not.toMatch(/pipeline_stages/i);
    expect(executableSql).not.toMatch(/automation_rules/i);
  });

  it("crea soltanto il trigger tecnico updated_at e nessun invio automatico", () => {
    const triggers = executableSql.match(/create\s+trigger/gi) ?? [];
    expect(triggers).toHaveLength(1);
    expect(executableSql).toContain("update_fotovoltaico_practices_updated_at");
    expect(executableSql).toContain("public.update_updated_at_column()");
    expect(executableSql).not.toMatch(/send[-_]whatsapp|send[-_]email|net\.http|http_request/i);
  });

  it("blocca il rilascio se la migrazione Fotovoltaico non viene applicata", () => {
    expect(deployment).toContain("20261013160000_fotovoltaico_isolated_intake.sql");
    expect(deployment).toContain("photovoltaic_isolated_intake");
  });
});
