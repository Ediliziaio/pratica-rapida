import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprTerminalObservability, sequencerTerminalIsCurrent } from "./aprTerminalObservability";
import { publishSequencerTerminalTruth } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerTerminalTruth.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function payload(status: "WORKING" | "IDLE", terminal: boolean) {
  return {
    observedAt: "2026-08-30T20:00:00.000Z",
    terminal,
    lifecycleState: terminal ? "completed" as const : "active" as const,
    aprStatus: { publicStatus: status, source: "worker", executionStatus: terminal ? "completed" : "running", workerStatus: terminal ? "completed" : "running", currentCustomerKey: terminal ? null : "case-one", reason: status, nextAction: terminal ? "Nessuna." : "Proseguire.", consistency: "CONSISTENT" as const },
    sourceRevisions: { journal: 1, execution: terminal ? 10 : 2, worker: terminal ? 12 : 3 },
    sourceFingerprints: { execution: "source", workerIdentity: "worker" },
    safety: { previewAllowed: false as const, submitAllowed: false as const, communicationsAllowed: false as const },
  };
}

describe("snapshot terminale APR atomico e condiviso", () => {
  it("non ripubblica come corrente un terminale storico dopo una nuova generazione attiva", () => {
    const terminal = {
      ...payload("IDLE", true),
      version: "apr-terminal-observability-snapshot-v1" as const,
      revision: 1,
      snapshotId: "terminal-old",
      cohortId: "cohort-old",
      cohortRoot: "/tmp/cohort-old",
      aprStatus: { ...payload("IDLE", true).aprStatus, source: "sequencer_finalizer" },
    };
    expect(sequencerTerminalIsCurrent(terminal, {
      revision: 3,
      status: "ready",
      currentCustomerKey: "angelina-stricelli",
      sourceFingerprint: "source",
    }, { revision: 62, instanceId: "worker-new" })).toBe(false);
  });

  it("mantiene autorevole il terminale quando coincide esattamente con le fonti persistenti", () => {
    const terminal = {
      ...payload("IDLE", true),
      version: "apr-terminal-observability-snapshot-v1" as const,
      revision: 1,
      snapshotId: "terminal-current",
      cohortId: "cohort-current",
      cohortRoot: "/tmp/cohort-current",
      aprStatus: { ...payload("IDLE", true).aprStatus, source: "sequencer_finalizer" },
    };
    expect(sequencerTerminalIsCurrent(terminal, {
      revision: 10,
      status: "completed",
      currentCustomerKey: null,
      sourceFingerprint: "source",
    }, { revision: 12, instanceId: "worker" })).toBe(true);
  });

  it("non ripubblica un terminale storico neppure dopo una generazione successiva quiescente", () => {
    const terminal = {
      ...payload("IDLE", true),
      version: "apr-terminal-observability-snapshot-v1" as const,
      revision: 1,
      snapshotId: "terminal-old-quiescent",
      cohortId: "cohort-old-quiescent",
      cohortRoot: "/tmp/cohort-old-quiescent",
      aprStatus: { ...payload("IDLE", true).aprStatus, source: "sequencer_finalizer" },
    };
    expect(sequencerTerminalIsCurrent(terminal, {
      revision: 11,
      status: "completed",
      currentCustomerKey: null,
      sourceFingerprint: "source-new",
    }, { revision: 13, instanceId: "worker-new" })).toBe(false);
  });

  it("persiste revisioni atomiche e le rende leggibili da una root indipendente", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-terminal-observability-"));
    roots.push(base);
    const cohort = new PersistentAprTerminalObservability(path.join(base, "cohorts", "cohort-601"));
    expect(cohort.publish(payload("WORKING", false))).toMatchObject({ revision: 1, terminal: false });
    const final = cohort.publish(payload("IDLE", true));
    expect(final).toMatchObject({ revision: 2, terminal: true, aprStatus: { publicStatus: "IDLE" } });
    expect(JSON.parse(readFileSync(cohort.snapshotPath, "utf8"))).toEqual(final);

    const independent = new PersistentAprTerminalObservability(base);
    expect(independent.list()).toEqual([final]);
    expect(independent.find("cohort-601")).toEqual(final);
  });

  it("rifiuta identificativi non confinati allo store", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-terminal-observability-invalid-"));
    roots.push(base);
    const store = new PersistentAprTerminalObservability(base);
    expect(() => store.find("../escape")).toThrow(/cohort_id_invalid/);
  });

  it("persiste stopped_by_operator senza introdurre un quinto stato pubblico", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-terminal-observability-stop-"));
    roots.push(base);
    const cohort = new PersistentAprTerminalObservability(path.join(base, "cohorts", "cohort-stop"));
    const stopped = cohort.publish({
      ...payload("IDLE", true),
      lifecycleState: "stopped_by_operator",
      aprStatus: { ...payload("IDLE", true).aprStatus, reason: "Arresto esplicito persistito." },
    });
    expect(stopped).toMatchObject({ terminal: true, lifecycleState: "stopped_by_operator", aprStatus: { publicStatus: "IDLE" } });
  });

  it("preserva il verdetto terminale del sequencer contro una rilettura locale obsoleta", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-terminal-sequencer-"));
    roots.push(base);
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-900-fixture");
    mkdirSync(cohortRoot, { recursive: true });
    const sequencer = publishSequencerTerminalTruth({ cohortRoot, kind: "common_technical", reason: "sessione ENEA non disponibile", verified: false });
    const store = new PersistentAprTerminalObservability(cohortRoot);
    const attemptedOverwrite = store.publish(payload("WORKING", false));
    expect(attemptedOverwrite).toEqual(sequencer);
    expect(store.load()).toMatchObject({ terminal: true, lifecycleState: "technical_stop", aprStatus: { publicStatus: "TECHNICAL_BLOCK", source: "sequencer_finalizer", consistency: "CONSISTENT" } });
  });

  it("preserva caseTruth anche se la rilettura eredita la stessa fonte terminale", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-terminal-same-source-"));
    roots.push(base);
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-901-fixture");
    mkdirSync(cohortRoot, { recursive: true });
    const sequencer = publishSequencerTerminalTruth({
      cohortRoot,
      customerKey: "zeno-righetti",
      kind: "saved",
      entry: { state: "saved", completedPageIds: ["a"], expectedPageIds: ["a"] },
      verified: true,
    });
    const store = new PersistentAprTerminalObservability(cohortRoot);
    const attemptedOverwrite = store.publish({
      ...payload("IDLE", true),
      lifecycleState: "completed",
      aprStatus: { ...sequencer.aprStatus },
    });
    expect(attemptedOverwrite).toEqual(sequencer);
    expect(store.load()).toMatchObject({ caseTruth: { customerKey: "zeno-righetti", status: "READY", hasProblem: false } });
  });
});
