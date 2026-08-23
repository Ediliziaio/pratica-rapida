import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PersistentLocalDossierBatch, type LocalDossierBatchInput } from "./localDossierBatch";
import type { LocalCrmDossier } from "./localDossierPipeline";
import { PersistentEneaRunner } from "./runner";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { renderDashboardHtml } from "./dashboard";
import { APR_RULE_TEST_MATRIX } from "../../src/features/enea-shadow-crm/ruleTestMatrix";

const sourceFixture = path.resolve("scripts/enea-shadow-runner/fixtures/localCrmDossier.json");

describe("batch locale APR ENEA", () => {
  it("riprende automaticamente un elemento reclamato dopo stop senza Codex, senza duplicati o perdite", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-batch-autonomous-"));
    try {
      const template = JSON.parse(readFileSync(sourceFixture, "utf8")) as LocalCrmDossier;
      const inputs: LocalDossierBatchInput[] = [1, 2].map((ordinal) => {
        const dossier = structuredClone(template); dossier.dossierId = `restart-${ordinal}`; dossier.displayName = `Ripresa ${ordinal}`;
        const dossierPath = path.join(directory, `restart-${ordinal}.json`); writeFileSync(dossierPath, JSON.stringify(dossier));
        return { displayName: dossier.displayName, customerKey: `restart-${ordinal}`, dossierPath };
      });
      const batch = new PersistentLocalDossierBatch(directory);
      batch.prepare(inputs, "apr-autonomous-restart", new Date("2026-08-15T08:00:00Z"));
      batch.arm(new Date("2026-08-15T08:00:01Z"));
      batch.planStore.heartbeat("executor-before-stop", new Date("2026-08-15T08:00:02Z"));
      batch.planStore.claimNext("executor-before-stop", new Date("2026-08-15T08:00:03Z"));
      expect(batch.planStore.load()!.items.map((item) => item.state)).toEqual(["claimed", "queued"]);

      const errors: unknown[] = [];
      const restarted = new PersistentLocalDossierBatch(directory);
      const loop = restarted.createAutonomousLoop("launch-agent-after-restart", 100, (error) => errors.push(error));
      loop.start();
      const deadline = Date.now() + 5_000;
      while (restarted.planStore.load()?.status !== "completed" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      loop.stop();

      const finalPlan = restarted.planStore.load()!;
      expect(errors).toEqual([]);
      expect(finalPlan).toMatchObject({ status: "completed", bridgeRequired: false, stopAt: "saved_draft" });
      expect(finalPlan.items.map((item) => item.state)).toEqual(["completed", "completed"]);
      expect(finalPlan.items.every((item) => item.note?.includes("Piano bozza locale pronto"))).toBe(true);
      const persistedReport = JSON.parse(readFileSync(restarted.reportFile, "utf8")) as { status: string; progress: { completed: number; queued: number; claimed: number } };
      expect(persistedReport).toMatchObject({ status: "completed", progress: { completed: 2, queued: 0, claimed: 0 } });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("gestisce 15 input con duplicato, blocchi per-pratica e riavvio senza perdite", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "apr-batch-"));
    try {
      const template = JSON.parse(readFileSync(sourceFixture, "utf8")) as LocalCrmDossier;
      const inputs: LocalDossierBatchInput[] = [];
      for (let index = 1; index <= 14; index += 1) {
        const dossier = structuredClone(template); dossier.dossierId = `dossier-${index}`; dossier.displayName = `Cliente ${index}`;
        if (index === 4 || index === 11) dossier.invoices[1].lines[0].classification = "ambiguous";
        const dossierPath = path.join(directory, `input-${index}.json`); writeFileSync(dossierPath, JSON.stringify(dossier));
        inputs.push({ displayName: dossier.displayName, customerKey: `cliente-${index}`, dossierPath });
      }
      inputs.splice(7, 0, { ...inputs[2], displayName: "Cliente 3 duplicato" });
      const first = new PersistentLocalDossierBatch(directory);
      const prepared = first.prepare(inputs, "apr-batch-15", new Date("2026-08-14T18:00:00Z"));
      expect(prepared!.items).toHaveLength(15);
      expect(prepared!.items.filter((item) => item.state === "duplicate_input")).toHaveLength(1);
      first.arm(new Date("2026-08-14T18:00:01Z"));

      for (let tick = 0; tick < 14; tick += 1) {
        const restarted = new PersistentLocalDossierBatch(directory);
        await restarted.tick("apr-local-executor", new Date(Date.parse("2026-08-14T18:01:00Z") + tick * 1_000));
      }
      const finalStore = new PersistentLocalDossierBatch(directory);
      const report = finalStore.report()!;
      expect(report).toMatchObject({ status: "completed", externalActionAllowed: false, externalGate: "blocked_adapters_unverified",
        progress: { totalInputs: 15, uniqueCustomers: 14, queued: 0, claimed: 0, completed: 12, blocked: 2, duplicates: 1 } });
      expect(report.cases.filter((item) => item.state === "blocked").every((item) => item.reason?.includes("ambiguous-product"))).toBe(true);
      expect(report.cases.filter((item) => item.state === "completed").every((item) => item.result?.draftPlan?.externalActionAllowed === false)).toBe(true);
      expect(report.cases.filter((item) => item.state !== "duplicate_input").every((item) => item.result?.review?.sources.length === 3)).toBe(true);
      const state = new PersistentEneaRunner(directory).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
      const matrix = new PersistentRuleMatrixEvidence(directory);
      const html = renderDashboardHtml(state, new Date("2026-08-14T18:30:00Z"), null, null, null, null,
        finalStore.planStore.load(), null, report, matrix.snapshot());
      expect(html).toContain("Automazione PraticaRapida");
      expect(html).toContain("Avanzamento 15/15");
      expect(html).toContain("2</strong><span>bloccati per pratica");
      expect(html).toContain(`Matrice regole → test → runtime · 0/${APR_RULE_TEST_MATRIX.length} attive/testate/installate`);
      expect(html).toContain("fonti form-fixture-001, invoice-rinaldi-100, invoice-schermi-200");
      const beforeReplay = finalStore.planStore.load()!;
      await new PersistentLocalDossierBatch(directory).tick("apr-local-executor", new Date("2026-08-14T19:00:00Z"));
      const afterReplay = new PersistentLocalDossierBatch(directory).planStore.load()!;
      expect(afterReplay.revision).toBe(beforeReplay.revision);
      expect(afterReplay.items.map((item) => item.state)).toEqual(beforeReplay.items.map((item) => item.state));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 15_000);
});
