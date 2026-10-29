import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("bozze form online del rivenditore", () => {
  const migration = source(
    "supabase/migrations/20261029110000_hide_incomplete_reseller_online_drafts.sql",
  );
  const publicIntake = source("supabase/functions/richiesta-pubblica/index.ts");
  const authenticatedIntake = source("src/pages/rivenditore/NuovaPraticaEnea.tsx");
  const stageChanged = source("supabase/functions/on-stage-changed/index.ts");

  it("nasconde al solo CRM interno le bozze incomplete, lasciandole riprendibili dal rivenditore", () => {
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("NOT public.is_internal(auth.uid())");
    expect(migration).toContain("{workflow,reseller_form_draft}");
    expect(migration).toContain("practice.form_compilato_at IS NULL");
    expect(migration).toContain("stage.stage_type = 'attesa_compilazione'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_form_draft_by_token");
    expect(migration).toContain("v_existing_data #>> '{workflow,reseller_form_draft}'");
  });

  it("marca come bozza entrambi i punti di ingresso senza modificare gli altri servizi", () => {
    expect(publicIntake).toContain("const resellerOnlineDraft =");
    expect(publicIntake).toContain("workflow: { reseller_form_draft: true }");
    expect(authenticatedIntake).toContain("const resellerOnlineDraft =");
    expect(authenticatedIntake).toContain("workflow: { reseller_form_draft: true }");
  });

  it("non conferma ne' notifica una bozza pubblica prima dell'invio finale", () => {
    expect(publicIntake).toContain("cfDalSito && !resellerOnlineDraft");
    expect(publicIntake).toContain('if (!resellerOnlineDraft && matchType === "creata" && aziendaEmail)');
    expect(publicIntake).toContain("if (!isPrivato && !resellerOnlineDraft)");
    expect(authenticatedIntake).not.toContain(
      'documentiMode === "form_online" && tipoFatturazione === "cliente_finale") {\n        supabase.functions.invoke("on-practice-created"',
    );
  });

  it("invia una sola conferma al rivenditore dopo il submit completo", () => {
    expect(stageChanged).toContain("isDocumentiForniti(practice) && practice.form_compilato_at");
    expect(stageChanged).toContain('"pratica_ricevuta"');
    expect(stageChanged).toContain('reseller_only: true');
    expect(stageChanged).toContain('steps.reseller_confirmation = "already_sent"');
  });

  it("pubblica la migrazione insieme al rilascio senza dipendere dalla password DB", () => {
    expect(source(".github/workflows/deploy.yml"))
      .toContain("hide_incomplete_reseller_online_drafts");
  });
});
