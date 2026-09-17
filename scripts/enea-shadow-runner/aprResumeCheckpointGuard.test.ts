import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { LocalDashboardSupervisor } from "./localDashboardServer";
import { PersistentEneaRunner } from "./runner";

const roots: string[] = [];
const supervisors: LocalDashboardSupervisor[] = [];
const VOLATILE_RESUME_CHECKPOINTS = new Set(["supervisor/checkpoint.json"]);

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apr-resume-checkpoint-guard-"));
  roots.push(root);
  return root;
}

function writeJson(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function seedAnalyzedHistoricalInfissiCheckpoint(root: string) {
  const cases = [
    { key: "resume-ready", technical: "Infissi PVC. Finestra dimensioni 1000 x 1200, pezzi 1, trasmittanza 1,2 W/m2K" },
    { key: "resume-blocked", technical: "Infissi PVC. Documento privo di misure tecniche." },
  ];
  const acquisitionItems = cases.map((item) => {
    const dossierPath = path.join(root, "crm-acquisition", "dossiers", `${item.key}.json`);
    writeJson(dossierPath, { row: { dati_form: { prodotto: { materiale_nuovi: "pvc", vetro_nuovi: "doppio" } } } });
    return {
      customerKey: item.key,
      displayName: item.key,
      practiceId: `practice-${item.key}`,
      dossierPath,
      state: "acquired",
      productModule: "infissi",
      responseSha256: `sha-${item.key}`,
    };
  });
  const analysisItems = cases.map((item) => {
    const textPath = path.join(root, "crm-document-analysis", "text", item.key, "invoice.txt");
    mkdirSync(path.dirname(textPath), { recursive: true });
    writeFileSync(textPath, item.technical);
    return { customerKey: item.key, documentKey: `${item.key}-invoice`, kind: "invoice", textPath, state: "analyzed" };
  });
  writeJson(path.join(root, "crm-acquisition", "checkpoint.json"), { status: "completed", progress: { acquired: 2 }, items: acquisitionItems });
  writeJson(path.join(root, "crm-original-documents", "checkpoint.json"), {
    status: "completed",
    items: cases.map((item) => ({
      customerKey: item.key,
      documentKey: `${item.key}-invoice`,
      kind: "invoice",
      state: "downloaded",
    })),
  });
  writeJson(path.join(root, "crm-document-analysis", "checkpoint.json"), { status: "completed", items: analysisItems });
  writeJson(path.join(root, "crm-local-preflight", "checkpoint.json"), {
    status: "completed",
    items: cases.map((item) => ({
      customerKey: item.key,
      report: { financial: { invoiceTotal: 1_000, tripleReconciliationVerified: true, evidence: [{ sourceId: `${item.key}-invoice` }] } },
    })),
  });

  const batch = new PersistentAprInfissiBatchPreflight(root);
  batch.tick(new Date("2026-08-24T10:00:00.000Z"));
  batch.tick(new Date("2026-08-24T10:01:00.000Z"));
  batch.tick(new Date("2026-08-24T10:02:00.000Z"));
  const historical = batch.snapshot();
  writeJson(batch.checkpointPath, {
    ...historical,
    items: historical.items.map(({ productModule: _productModule, ...item }) => item),
  });
}

function checkpointBytes(root: string) {
  const result = new Map<string, string>();
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const target = path.join(directory, name);
      if (statSync(target).isDirectory()) visit(target);
      else if (name === "checkpoint.json") result.set(path.relative(root, target).split(path.sep).join("/"), readFileSync(target, "utf8"));
    }
  };
  visit(root);
  return result;
}

function changedCheckpointPaths(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((name) => !VOLATILE_RESUME_CHECKPOINTS.has(name) && before.get(name) !== after.get(name))
    .sort();
}

afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) {
    if (supervisor.url) await supervisor.stop("Pulizia controllo resume.");
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("APR resume checkpoint guard generale", () => {
  it("un resume quiescente non modifica byte di alcun checkpoint business", async () => {
    const root = temporaryRoot();
    new PersistentEneaRunner(root).initialize(DEFAULT_AUDITED_OPERATOR_QUEUE);
    const baseline = new LocalDashboardSupervisor(root, { port: 0, heartbeatIntervalMs: 60_000, checkpointMode: "resume" });
    supervisors.push(baseline);
    await baseline.startInProcessForTest();
    await baseline.stop("Baseline quiescente pronta.");
    supervisors.splice(supervisors.indexOf(baseline), 1);

    seedAnalyzedHistoricalInfissiCheckpoint(root);
    expect(JSON.parse(readFileSync(path.join(root, "crm-acquisition", "checkpoint.json"), "utf8"))).toMatchObject({
      status: "completed",
      progress: { acquired: 2 },
      items: [{ state: "acquired" }, { state: "acquired" }],
    });
    const historicalInfissi = JSON.parse(readFileSync(path.join(root, "infissi-batch-preflight", "checkpoint.json"), "utf8"));
    expect(historicalInfissi).toMatchObject({ status: "completed" });
    expect(historicalInfissi.items).toHaveLength(2);
    expect(historicalInfissi.items.every((item: Record<string, unknown>) => !("productModule" in item))).toBe(true);
    const before = checkpointBytes(root);
    const resumed = new LocalDashboardSupervisor(root, { port: 0, heartbeatIntervalMs: 60_000, checkpointMode: "resume" });
    supervisors.push(resumed);
    await resumed.startInProcessForTest();
    await resumed.stop("Resume quiescente verificato.");
    supervisors.splice(supervisors.indexOf(resumed), 1);
    const after = checkpointBytes(root);

    expect(changedCheckpointPaths(before, after)).toEqual([]);
  });

  it("fallisce per qualunque nuovo checkpoint o mutazione byte non allowlistata", () => {
    const root = temporaryRoot();
    const target = path.join(root, "future-component", "checkpoint.json");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "{\"revision\":1}\n");
    const before = checkpointBytes(root);
    writeFileSync(target, "{\"revision\":2}\n");
    const after = checkpointBytes(root);

    expect(changedCheckpointPaths(before, after)).toEqual(["future-component/checkpoint.json"]);
  });
});
