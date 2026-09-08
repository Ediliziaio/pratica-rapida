import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// Modulo operativo ESM usato direttamente dal sequencer LaunchAgent.
import { classifySequencerTerminalTruth, publishSequencerTerminalTruth, reportStateForSequencerTerminalTruth } from "../../ops/apr-global-controller-test10-2026-08-29/sequencerTerminalTruth.mjs";

describe("verita terminale del sequencer", () => {
  it("classifica l'errore tecnico APR ENEA senza inventare un blocker operatore", () => {
    const entry = {
      customerKey: "armando-ranzoni",
      state: "operator_intervention",
      reason: "Errore circoscritto alla pratica: apr_enea_nested_page_not_persisted_after_outer_save:page:Generatore",
      serverEvidenceIds: ["driver-error-b0c9280d9b99fcd3"],
      operatorGateBlockers: [],
    };
    expect(classifySequencerTerminalTruth({ kind: "case_block", entry, verified: false })).toMatchObject({ publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT" });
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-sequencer-terminal-"));
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-1-armando-ranzoni");
    mkdirSync(cohortRoot, { recursive: true });
    const snapshot = publishSequencerTerminalTruth({ cohortRoot, kind: "case_block", entry, verified: false });
    expect(snapshot.caseTruth).toMatchObject({ customerKey: "armando-ranzoni", status: "TECHNICAL_BLOCK", blockerCount: 0 });
    expect(reportStateForSequencerTerminalTruth({ kind: "case_block", entry, verified: false })).toBe("technical_block");
    expect(JSON.parse(readFileSync(path.join(base, "terminal-observability", "apr-pilot-1-armando-ranzoni.json"), "utf8"))).toEqual(snapshot);
  });

  it("classifica come tecnico l'esito ambiguo post-click con entrambe le prove persistite", () => {
    const entry = {
      customerKey: "lucia-lagrasta",
      state: "operator_intervention",
      reason: "Esito tecnico incerto dopo il Salva di screening:2; nessun retry automatico.",
      serverEvidenceIds: ["uncertain-page-938b2aaa15544368", "probe-error-a62e7a587104fc62"],
      operatorGateBlockers: [],
    };
    expect(classifySequencerTerminalTruth({ kind: "case_block", entry, verified: false })).toMatchObject({ publicStatus: "TECHNICAL_BLOCK", consistency: "CONSISTENT" });
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-sequencer-ambiguous-terminal-"));
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-2-lucia-lagrasta");
    mkdirSync(cohortRoot, { recursive: true });
    expect(publishSequencerTerminalTruth({ cohortRoot, kind: "case_block", entry, verified: false }).caseTruth).toMatchObject({ customerKey: "lucia-lagrasta", status: "TECHNICAL_BLOCK", blockerCount: 0 });
  });

  it("resta fail-closed se l'esito ambiguo post-click non ha la coppia completa di prove", () => {
    const entry = {
      customerKey: "lucia-lagrasta",
      state: "operator_intervention",
      reason: "Esito tecnico incerto dopo il Salva di screening:2; nessun retry automatico.",
      serverEvidenceIds: ["uncertain-page-938b2aaa15544368", "probe-error-a62e7a587104fc62"],
      operatorGateBlockers: [],
    };
    expect(classifySequencerTerminalTruth({ kind: "case_block", entry: { ...entry, serverEvidenceIds: [entry.serverEvidenceIds[0]] }, verified: false })).toMatchObject({ publicStatus: "INCONSISTENT", consistency: "INCONSISTENT" });
    expect(classifySequencerTerminalTruth({ kind: "case_block", entry: { ...entry, operatorGateBlockers: [{ code: "operator" }] }, verified: false })).toMatchObject({ publicStatus: "OPERATOR_REQUIRED", consistency: "CONSISTENT" });
  });

  it("pubblica READY usando l'identita esplicita anche se la finestra finale non la include nell'entry", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-sequencer-explicit-identity-"));
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-3-zeno-righetti");
    mkdirSync(cohortRoot, { recursive: true });
    const snapshot = publishSequencerTerminalTruth({
      cohortRoot,
      customerKey: "zeno-righetti",
      kind: "saved",
      entry: { state: "saved", completedPageIds: ["a"], expectedPageIds: ["a"] },
      verified: true,
    });
    expect(snapshot.caseTruth).toMatchObject({ customerKey: "zeno-righetti", status: "READY", hasProblem: false });
  });

  it("rifiuta fail-closed identita esplicita e checkpoint discordanti", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-sequencer-identity-mismatch-"));
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-4-zeno-righetti");
    mkdirSync(cohortRoot, { recursive: true });
    expect(() => publishSequencerTerminalTruth({
      cohortRoot,
      customerKey: "zeno-righetti",
      kind: "saved",
      entry: { customerKey: "altra-pratica", state: "saved", completedPageIds: ["a"], expectedPageIds: ["a"] },
      verified: true,
    })).toThrow("apr_terminal_case_truth_identity_mismatch");
  });

  it("pubblica blocked_case per un preflight terminale con report.blockers persistenti", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-sequencer-preflight-terminal-"));
    const cohortRoot = path.join(base, "cohorts", "apr-pilot-5-barbara-melis");
    mkdirSync(cohortRoot, { recursive: true });
    const snapshot = publishSequencerTerminalTruth({
      cohortRoot,
      customerKey: "barbara-melis",
      kind: "case_block",
      entry: {
        customerKey: "barbara-melis",
        state: "operator_intervention",
        reason: "2 blocker per-pratica registrati; coda prosegue.",
        operatorGateBlockers: [
          { code: "screenings_missing", message: "Nessun prodotto fisico riconciliato." },
          { code: "invoice_missing", message: "Nessuna fattura economica candidata valida." },
        ],
      },
      verified: false,
      workerIdentity: "not-started",
    });
    expect(snapshot.aprStatus).toMatchObject({ publicStatus: "OPERATOR_REQUIRED", consistency: "CONSISTENT" });
    expect(snapshot.caseTruth).toMatchObject({ customerKey: "barbara-melis", status: "blocked_case", blockerCount: 2 });
    expect(reportStateForSequencerTerminalTruth({ kind: "case_block", entry: {
      customerKey: "barbara-melis",
      state: "operator_intervention",
      operatorGateBlockers: [{ code: "screenings_missing" }],
    }, verified: false })).toBe("operator_required");
  });

  it("usa la stessa classificazione per snapshot, API e report del sequencer", () => {
    expect(reportStateForSequencerTerminalTruth({ kind: "saved", entry: { state: "saved", completedPageIds: ["a"], expectedPageIds: ["a"] }, verified: true })).toBe("saved");
    expect(reportStateForSequencerTerminalTruth({ kind: "case_block", entry: { state: "technical_block", reason: "errore tecnico" }, verified: false })).toBe("technical_block");
    expect(reportStateForSequencerTerminalTruth({ kind: "unresolved", entry: { reason: "fonti discordanti" }, verified: false })).toBe("inconsistent");
  });
});
