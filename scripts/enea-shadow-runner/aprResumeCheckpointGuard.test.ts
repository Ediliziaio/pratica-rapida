import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUDITED_OPERATOR_QUEUE } from "../../src/features/enea-shadow-crm/auditedOperatorQueue";
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
    await baseline.start();
    await baseline.stop("Baseline quiescente pronta.");
    supervisors.splice(supervisors.indexOf(baseline), 1);

    const before = checkpointBytes(root);
    const resumed = new LocalDashboardSupervisor(root, { port: 0, heartbeatIntervalMs: 60_000, checkpointMode: "resume" });
    supervisors.push(resumed);
    await resumed.start();
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
