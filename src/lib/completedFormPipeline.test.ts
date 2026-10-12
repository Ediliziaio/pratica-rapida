import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCompletedFormWaitingForPayment } from "./completedFormPipeline";

const state = {
  formCompleted: true,
  stageType: "attesa_compilazione",
  paymentState: "non_pagata",
  billingType: "cliente_finale",
  hasCadastralService: false,
};

describe("completed form pipeline safety", () => {
  it("recognizes a completed CF form that is legitimately waiting for payment", () => {
    expect(isCompletedFormWaitingForPayment(state)).toBe(true);
  });

  it("does not mark a paid completed form as waiting for payment", () => {
    expect(isCompletedFormWaitingForPayment({ ...state, paymentState: "pagata" })).toBe(false);
  });

  it("does not mark an incomplete form as a completed payment wait", () => {
    expect(isCompletedFormWaitingForPayment({ ...state, formCompleted: false })).toBe(false);
  });

  it("does not mark a completed form already in Pronte da fare", () => {
    expect(isCompletedFormWaitingForPayment({ ...state, stageType: "pronte_da_fare" })).toBe(false);
  });

  it("keeps the database invariant and live refresh wired", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261012193000_completed_form_cannot_remain_in_reminder_stage.sql"),
      "utf8",
    );
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useEneaPractices.ts"), "utf8");
    const deployWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy.yml"), "utf8");

    expect(migration).toContain("stage.stage_type IN ('inviata', 'attesa_compilazione')");
    expect(migration).toContain("NEW.current_stage_id := v_ready_stage_id");
    expect(migration).toContain("NEW.pagamento_stato IS DISTINCT FROM 'pagata'");
    expect(hook).toContain('table: "enea_practices"');
    expect(hook).toContain('refetchOnWindowFocus: "always"');
    expect(hook).toContain("refetchInterval: 60_000");
    expect(deployWorkflow).toContain("completed_form_cannot_remain_in_reminder_stage");
  });
});
