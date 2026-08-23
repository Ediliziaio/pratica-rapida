import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentAprShadowComparison } from "./shadowComparisonStore";

const aprResult = {
  actor: "APR" as const,
  state: "completed" as const,
  completedAt: "2026-08-18T17:00:00.000Z",
  sealedAt: "2026-08-18T17:01:00.000Z",
  resultFingerprint: "apr-result-sha",
  fields: [{ field: "spesa.totale", value: 1250, sourceId: "apr-plan" }],
};
const humanResult = {
  actor: "MATTEO" as const,
  state: "completed" as const,
  completedAt: "2026-08-18T16:30:00.000Z",
  sealedAt: "2026-08-18T16:31:00.000Z",
  resultFingerprint: "human-result-sha",
  fields: [{ field: "spesa.totale", value: 1250, sourceId: "crm-manual" }],
};

describe("checkpoint persistente confronto shadow", () => {
  it("sigilla APR prima del rilascio umano e riprende senza duplicare dopo riavvio", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-store-"));
    try {
      const store = new PersistentAprShadowComparison(directory);
      const apr = store.recordAprResult({ caseId: "crm-1", displayName: "Cliente Uno", product: "schermature_solari", receivedAt: "2026-08-18T09:00:00.000Z", originalSources: [{ field: "spesa.totale", value: 1250, sourceId: "fattura-p2" }], result: aprResult, commandId: "apr:crm-1:v1" }, new Date("2026-08-18T17:01:00.000Z"));
      expect(apr).toMatchObject({ revision: 1, items: [{ caseId: "crm-1", human: null, aprHumanResultAccessedAt: null }] });

      const restarted = new PersistentAprShadowComparison(directory);
      const compared = restarted.recordHumanResult({ caseId: "crm-1", result: humanResult, commandId: "human:crm-1:v1" }, new Date("2026-08-18T18:00:00.000Z"));
      expect(compared).toMatchObject({ revision: 2, items: [{ human: { resultFingerprint: "human-result-sha", sealedAt: "2026-08-18T18:00:00.000Z" } }] });
      const replay = restarted.recordHumanResult({ caseId: "crm-1", result: humanResult, commandId: "human:crm-1:v1" }, new Date("2026-08-18T18:01:00.000Z"));
      expect(replay.revision).toBe(2);
      expect(replay.items).toHaveLength(1);
      const snapshot = restarted.snapshot(new Date("2026-08-18T20:00:00.000Z"));
      expect(snapshot).toMatchObject({ status: "collecting_shadow_evidence", currentPhase: "SHADOW", cumulative: { totalPractices: 1, matchRate: 1 }, promotionGate: { sampleSufficient: false, productionAuthorized: false } });
      expect(snapshot.dailyReport.cases).toHaveLength(1);
      expect(snapshot.dailyReport.cases[0].comparisonUnlockedAfterAprSeal).toBe(true);
      expect(JSON.parse(readFileSync(restarted.checkpointFile, "utf8"))).toMatchObject({ externalMutationAllowed: false, eneaSubmitAllowed: false, productionAuthorized: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rifiuta il risultato umano se APR non e' ancora sigillato", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-order-"));
    try {
      expect(() => new PersistentAprShadowComparison(directory).recordHumanResult({ caseId: "crm-1", result: humanResult, commandId: "human-first" }))
        .toThrow("shadow_apr_result_must_be_sealed_first");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rifiuta la sostituzione di un risultato APR gia sigillato", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-immutable-"));
    try {
      const store = new PersistentAprShadowComparison(directory);
      const base = { caseId: "crm-1", displayName: "Cliente Uno", product: "schermature_solari" as const, receivedAt: "2026-08-18T09:00:00.000Z", originalSources: [{ field: "spesa.totale", value: 1250, sourceId: "fattura" }], result: aprResult };
      store.recordAprResult({ ...base, commandId: "apr:v1" });
      expect(() => store.recordAprResult({ ...base, result: { ...aprResult, resultFingerprint: "different" }, commandId: "apr:v2" }))
        .toThrow("shadow_apr_result_immutable");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("genera una sola volta il report di fine giornata e lo conserva dopo riavvio", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-shadow-daily-"));
    try {
      const store = new PersistentAprShadowComparison(directory);
      expect(store.runScheduledDailyReport(new Date("2026-08-18T15:00:00.000Z"))).toMatchObject({ status: "waiting_schedule", reportPath: null });
      const generated = store.runScheduledDailyReport(new Date("2026-08-18T18:00:00.000Z"));
      expect(generated).toMatchObject({ status: "generated", reportDate: "2026-08-18" });
      const replay = new PersistentAprShadowComparison(directory).runScheduledDailyReport(new Date("2026-08-18T19:00:00.000Z"));
      expect(replay).toMatchObject({ status: "already_generated", reportPath: generated.reportPath });
      const snapshot = new PersistentAprShadowComparison(directory).snapshot(new Date("2026-08-18T19:01:00.000Z"));
      expect(snapshot).toMatchObject({ dailySchedule: "19:00 Europe/Rome", persistedDailyReportCount: 1, latestPersistedDailyReport: "2026-08-18.json" });
      expect(snapshot.audit.filter((event) => event.type === "daily_report_generated")).toHaveLength(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
