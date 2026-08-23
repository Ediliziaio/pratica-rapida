import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import crypto from "node:crypto";
import { buildSavedDraftComparison } from "./aprSavedDraftComparison.mjs";

function write(root, relative, value) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
}

test("confronta una bozza salvata senza usare il benchmark storico", () => {
  const root = path.join(tmpdir(), `apr-comparison-${crypto.randomUUID()}`);
  write(root, "crm-acquisition/checkpoint.json", { status: "completed", candidateFingerprint: "candidate", items: [{ customerKey: "mario", practiceId: "crm-1", responseSha256: "a".repeat(64) }] });
  write(root, "crm-local-preflight/checkpoint.json", { status: "completed", sourceFingerprint: "source", items: [{ customerKey: "mario", displayName: "Mario Rossi", practiceId: "crm-1", state: "ready_local_plan", report: { sourceIds: ["invoice-1"], eneaPayloadAudit: { status: "payload_complete", mappingFingerprint: "map-1", requiredPortalFieldCount: 42 } } }] });
  write(root, "enea-draft-execution/checkpoint.json", { status: "completed", revision: 9, items: [{ customerKey: "mario", displayName: "Mario Rossi", practiceId: "crm-1", state: "saved", draftId: "400001", savedAt: "2026-08-17T10:00:00Z", mappingFingerprint: "map-1", expectedPageIds: ["page:a"], completedPageIds: ["page:a"], pageCheckpoints: [{ pageId: "page:a", state: "saved", savedEvidenceId: "server-1" }] }] });
  const report = buildSavedDraftComparison(root, new Date("2026-08-17T10:01:00Z"));
  assert.equal(report.summary.savedDraftsCompared, 1);
  assert.equal(report.summary.sourceConsistencyDiscrepancies, 0);
  assert.equal(report.cases[0].sourceConsistencyStatus, "coherent");
  assert.equal(report.manualOperatorBenchmark.status, "available_via_post_draft_readonly_gate");
  assert.match(report.manualOperatorBenchmark.nextAction, /historical-benchmark/i);
  assert.deepEqual(report.scope.forbiddenSourcesConsulted, []);
});

test("non nasconde una differenza di identita o fingerprint", () => {
  const root = path.join(tmpdir(), `apr-comparison-${crypto.randomUUID()}`);
  write(root, "crm-acquisition/checkpoint.json", { status: "completed", candidateFingerprint: "candidate", items: [{ customerKey: "mario", practiceId: "crm-2", responseSha256: null }] });
  write(root, "crm-local-preflight/checkpoint.json", { status: "completed", sourceFingerprint: "source", items: [{ customerKey: "mario", displayName: "Mario Rossi", practiceId: "crm-1", state: "ready_local_plan", report: { sourceIds: [], eneaPayloadAudit: { status: "payload_complete", mappingFingerprint: "map-1", requiredPortalFieldCount: 42 } } }] });
  write(root, "enea-draft-execution/checkpoint.json", { status: "completed", revision: 9, items: [{ customerKey: "mario", displayName: "Mario Rossi", practiceId: "crm-3", state: "saved", draftId: "400001", savedAt: "2026-08-17T10:00:00Z", mappingFingerprint: "map-2", expectedPageIds: ["page:a"], completedPageIds: [], pageCheckpoints: [] }] });
  const report = buildSavedDraftComparison(root);
  assert.equal(report.cases[0].sourceConsistencyStatus, "differences_found");
  assert.ok(report.summary.sourceConsistencyDiscrepancies >= 5);
});
