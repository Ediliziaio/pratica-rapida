import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20261013160000_fotovoltaico_isolated_intake.sql");
const unifilareMigrationPath = resolve(process.cwd(), "supabase/migrations/20261014120000_fotovoltaico_unifilare_service.sql");
const deploymentPath = resolve(process.cwd(), ".github/workflows/deploy.yml");
const migrationSql = readFileSync(migrationPath, "utf8");
const executableSql = migrationSql.replace(/^\s*--.*$/gm, "");
const unifilareSql = readFileSync(unifilareMigrationPath, "utf8").replace(/^\s*--.*$/gm, "");
const deployment = readFileSync(deploymentPath, "utf8");

describe("isolamento del flusso fotovoltaico", () => {
  it("non modifica tabelle o pipeline ENEA", () => {
    expect(executableSql).not.toMatch(/enea_practices/i);
    expect(executableSql).not.toMatch(/pipeline_stages/i);
    expect(executableSql).not.toMatch(/automation_rules/i);
    expect(unifilareSql).not.toMatch(/enea_practices/i);
    expect(unifilareSql).not.toMatch(/pipeline_stages/i);
    expect(unifilareSql).not.toMatch(/automation_rules/i);
    expect(unifilareSql).toMatch(/alter table public\.fotovoltaico_practices/i);
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
    expect(deployment).toContain("20261014120000_fotovoltaico_unifilare_service.sql");
    expect(deployment).toContain("photovoltaic_unifilar_service");
  });

  it("apre al rivenditore soltanto la riconsegna dello schema firmato", () => {
    expect(unifilareSql).toContain('category = \'schema_unifilare_firmato\'');
    expect(unifilareSql).toContain("fp.unifilare_status = 'inviato_da_firmare'");
    expect(unifilareSql).toContain("submit_fotovoltaico_unifilare_signed");
    expect(unifilareSql).toContain("fa.uploaded_by = auth.uid()");
    expect(unifilareSql).not.toMatch(/alter table public\.enea_practices/i);
  });
});
