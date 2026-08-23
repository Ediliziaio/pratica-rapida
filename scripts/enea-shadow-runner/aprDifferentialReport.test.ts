import { describe, expect, it } from "vitest";
import type { AprPublicCaseStatus } from "./aprMonotonicArtifacts";
import { computeAprInputCorpusFingerprint } from "./aprCorpusFingerprint";
import { buildAprDifferentialReport, type AprDifferentialCaseSnapshot, type AprDifferentialSnapshot } from "./aprDifferentialReport";

const sha = (character: string) => character.repeat(64);
const keys = Array.from({ length: 40 }, (_, index) => `fixture-${String(index + 1).padStart(2, "0")}`);
const corpus = (changed = false) => computeAprInputCorpusFingerprint({ corpusVersion: "fixed-40-v1", cases: keys.map((customerKey, index) => ({ customerKey, dossierSha256: changed && index === 0 ? sha("e") : sha("a"), originalDocumentSetSha256: sha("b") })) });
const caseRow = (customerKey: string, status: AprPublicCaseStatus = "READY"): AprDifferentialCaseSnapshot => ({ customerKey, status, blockerCodes: status === "OPERATOR_REQUIRED" ? ["operator"] : [], payloadFingerprint: sha("c"), appliedRuleIds: ["system-fixture"] });
const snapshot = (runId: string, overrides: Record<string, Partial<AprDifferentialCaseSnapshot>> = {}, changedCorpus = false): AprDifferentialSnapshot => ({ runId, inputCorpusFingerprint: corpus(changedCorpus), cases: keys.map((key) => ({ ...caseRow(key), ...overrides[key] })) });

describe("APR 40-case differential report", () => {
  it("produce 40 righe UNCHANGED e PASS per snapshot identici", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate: snapshot("candidate"), now: new Date("2026-08-23T20:00:00.000Z") });
    expect(report.payload).toMatchObject({ status: "PASS", hasCriticalRegression: false, summary: { unchanged: 40 } });
    expect(report.payload.rows).toHaveLength(40);
  });

  it("classifica un caso bloccato diventato READY come IMPROVED", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline", { "fixture-01": { status: "OPERATOR_REQUIRED", blockerCodes: ["operator"] } }), candidate: snapshot("candidate") });
    expect(report.payload.rows[0]).toMatchObject({ classification: "IMPROVED", critical: false });
    expect(report.payload.status).toBe("PASS");
  });

  it("classifica READY diventato OPERATOR_REQUIRED come regressione critica", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate: snapshot("candidate", { "fixture-02": { status: "OPERATOR_REQUIRED", blockerCodes: ["operator"] } }) });
    expect(report.payload.rows[1]).toMatchObject({ classification: "REGRESSED", critical: true, blockersAdded: ["operator"] });
    expect(report.payload).toMatchObject({ status: "FAIL", hasCriticalRegression: true });
    expect(report.payload.rows).toHaveLength(40);
  });

  it("considera COMPLETED che torna READY una regressione critica", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline", { "fixture-03": { status: "COMPLETED" } }), candidate: snapshot("candidate") });
    expect(report.payload.rows[2]).toMatchObject({ previousStatus: "COMPLETED", currentStatus: "READY", classification: "REGRESSED", critical: true });
  });

  it("rifiuta la modifica del payload di una pratica verificata", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate: snapshot("candidate", { "fixture-04": { payloadFingerprint: sha("d") } }) });
    expect(report.payload.rows[3]).toMatchObject({ classification: "REGRESSED", critical: true });
    expect(report.payload.rows[3].explanation).toMatch(/Payload verificato modificato/);
  });

  it("classifica una variazione non critica come CHANGED", () => {
    const baseline = snapshot("baseline", { "fixture-05": { status: "OPERATOR_REQUIRED", blockerCodes: ["old"] } });
    const candidate = snapshot("candidate", { "fixture-05": { status: "TECHNICAL_BLOCK", blockerCodes: ["new"] } });
    expect(buildAprDifferentialReport({ baseline, candidate }).payload.rows[4]).toMatchObject({ classification: "CHANGED", critical: false, blockersAdded: ["new"], blockersRemoved: ["old"] });
  });

  it("produce comunque 40 righe e FAIL quando una pratica manca", () => {
    const candidate = snapshot("candidate"); candidate.cases = candidate.cases.slice(0, 39);
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate });
    expect(report.payload.rows).toHaveLength(40);
    expect(report.payload.rows[39]).toMatchObject({ classification: "REGRESSED", critical: true, currentStatus: "INCONSISTENT" });
    expect(report.payload.status).toBe("FAIL");
  });

  it("rifiuta un candidato con un caso aggiuntivo senza alterare le 40 righe canoniche", () => {
    const candidate = snapshot("candidate"); candidate.cases = [...candidate.cases, caseRow("fixture-extra")];
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate });
    expect(report.payload.rows).toHaveLength(40);
    expect(report.payload.status).toBe("FAIL");
    expect(report.payload.rejectionReasons.join(" ")).toMatch(/estranea al corpus/);
  });

  it("rifiuta corpus baseline e candidato differenti", () => {
    const candidate = snapshot("candidate"); candidate.inputCorpusFingerprint = corpus(true);
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate });
    expect(report.payload.status).toBe("FAIL");
    expect(report.payload.rejectionReasons.join(" ")).toMatch(/Corpus candidato differente/);
  });

  it("mantiene il report completo con una sola regressione critica su 40", () => {
    const report = buildAprDifferentialReport({ baseline: snapshot("baseline"), candidate: snapshot("candidate", { "fixture-20": { status: "INCONSISTENT" } }) });
    expect(report.payload.rows).toHaveLength(40);
    expect(report.payload.summary).toEqual({ improved: 0, regressed: 1, unchanged: 39, changed: 0 });
    expect(report.payload.status).toBe("FAIL");
  });
});
