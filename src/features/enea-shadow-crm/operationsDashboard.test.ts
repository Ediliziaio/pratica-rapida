import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";
import { EMPTY_SHADOW_CRM_STATE } from "./workflow";
import { dashboardHealth, dashboardItem } from "./operationsDashboard";

const practice = ENEA_LAB_MOCK_PRACTICES[0];

describe("cruscotto operativo CRM ombra", () => {
  it("non dichiara attiva una pratica in processing senza azione automatica reale", () => {
    const item = dashboardItem(practice, { ...EMPTY_SHADOW_CRM_STATE, stage: "processing", audit: [{ id: "1", type: "start", at: "2026-08-13T10:00:00Z" }] }, new Date("2026-08-13T10:05:00Z"));
    expect(item).toMatchObject({ status: "waiting_operator", lastResponsible: "operatore", lastEventRelative: "5 min fa" });
  });

  it("mostra automazione attiva solo con evento audit esplicito", () => {
    const item = dashboardItem(practice, { ...EMPTY_SHADOW_CRM_STATE, stage: "processing", audit: [{ id: "1", type: "automation-work-started", at: "2026-08-13T10:00:00Z" }] });
    expect(item).toMatchObject({ status: "automatic_active", lastResponsible: "automazione" });
  });

  it("espone blocco, regole applicate e test storico con priorità corretta", () => {
    const item = dashboardItem(practice, { ...EMPTY_SHADOW_CRM_STATE, operatorStatus: "requested_operator", exceptions: [
      { id: "exception-1", field: "campo.risolto", sources: ["fixture"], reason: "Risolto", options: ["regola"], status: "rule_defined", resolutionReason: "ok", createdAt: "2026-08-13T09:00:00Z", resolvedAt: "2026-08-13T09:01:00Z" },
      { id: "exception-2", field: "campo.attivo", sources: ["fixture"], reason: "Dato mancante", options: ["operatore"], status: "requested_operator", resolutionReason: null, createdAt: "2026-08-13T10:00:00Z", resolvedAt: null },
    ], audit: [{ id: "1", type: "historical-deadline-override", at: "2026-08-13T09:01:00Z" }] });
    expect(item).toMatchObject({ status: "operator_required", activeBlock: "Dato mancante", appliedRules: ["campo.risolto"], historicalTest: true });
  });

  it("calcola una salute veritiera senza confondere attesa e avanzamento", () => {
    const base = dashboardItem(practice, EMPTY_SHADOW_CRM_STATE);
    const health = dashboardHealth([
      { ...base, status: "automatic_active" }, { ...base, status: "operator_required" },
      { ...base, status: "waiting_customer" }, { ...base, status: "waiting_operator" }, { ...base, status: "completed" },
    ]);
    expect(health).toEqual({ advancing: 1, blocked: 2, waitingOperator: 1, completed: 1, reasons: { "dubbio operativo": 1, "attesa cliente": 1 } });
  });
});
