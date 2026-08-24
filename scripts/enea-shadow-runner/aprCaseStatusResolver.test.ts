import { describe, expect, it } from "vitest";
import type { AprCaseObservationSource, AprCaseStatusObservation, AprNormalizedObservationStatus } from "./aprMonotonicArtifacts";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { resolveAprCaseStatusTruth } from "./aprCaseStatusResolver";

const runId = "run-fixed-40-v1";
const stages = { preflight_common: "COMMON_PREFLIGHT", product_gate: "PRODUCT_GATE", deep_review: "DEEP_REVIEW", execution: "EXECUTION", checkpoint: "SERVER_VERIFICATION", report_blockers: "EVIDENCE" } as const;
const obs = (source: AprCaseObservationSource, status: AprNormalizedObservationStatus, options: Partial<AprCaseStatusObservation> = {}): AprCaseStatusObservation => {
  const base = { source, stage: stages[source], customerKey: "fixture-a", runId, status, blockerCodes: [], classification: "NONE", observedAt: "2026-08-23T20:00:00.000Z", ...options } as Omit<AprCaseStatusObservation, "sourceFingerprint">;
  return { ...base, sourceFingerprint: canonicalSha256(base) };
};
const blockers = (...codes: string[]) => obs("report_blockers", codes.length ? "BLOCKED" : "PASS", { blockerCodes: codes });

describe("APR unique pure case status resolver", () => {
  it("risolve READY prima dell'esecuzione", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS"), obs("product_gate", "PASS")])).toMatchObject({ status: "READY", matchedTransitionId: "ready_before_execution", disagreement: null });
  });

  it("risolve COMPLETED soltanto con gate a monte verdi", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS"), obs("product_gate", "PASS"), obs("execution", "COMPLETED")])).toMatchObject({ status: "COMPLETED", matchedTransitionId: "draft_completed" });
  });

  it.each([
    ["OPERATOR", "OPERATOR_REQUIRED"],
    ["TECHNICAL", "TECHNICAL_BLOCK"],
  ] as const)("classifica deep review %s dopo blocker prodotto", (classification, expected) => {
    const code = `product_${classification.toLowerCase()}`;
    const result = resolveAprCaseStatusTruth([
      obs("preflight_common", "PASS"),
      obs("product_gate", "BLOCKED", { blockerCodes: [code], classification: "UNCLASSIFIED" }),
      obs("deep_review", "BLOCKED", { blockerCodes: [code], classification }),
      blockers(code),
    ]);
    expect(result.status).toBe(expected);
  });

  it("classifica il blocker common con product gate non applicabile", () => {
    const result = resolveAprCaseStatusTruth([
      obs("preflight_common", "BLOCKED", { blockerCodes: ["common_block"], classification: "UNCLASSIFIED" }),
      obs("deep_review", "BLOCKED", { blockerCodes: ["common_block"], classification: "OPERATOR" }),
      blockers("common_block"),
    ]);
    expect(result.status).toBe("OPERATOR_REQUIRED");
  });

  it("rifiuta common BLOCKED con product PASS", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "BLOCKED", { blockerCodes: ["x"], classification: "UNCLASSIFIED" }), obs("product_gate", "PASS"), blockers("x")])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non applicabile") });
  });

  it.each([
    "sebastian-costel-volf",
    "donata-zangrossi",
    "eleonora-meggiarin",
    "flavia-cipriani",
  ])("risolve COMPLETED per %s quando il routing Infissi rende irrilevanti i soli blocker Schermature", (customerKey) => {
    const common = obs("preflight_common", "BLOCKED", {
      customerKey,
      blockerCodes: ["screenings_missing", "invoice_screening"],
      blockerApplicability: [
        { code: "screenings_missing", productModules: ["screening"] },
        { code: "invoice_screening", productModules: ["screening"] },
      ],
      classification: "UNCLASSIFIED",
    });
    const product = obs("product_gate", "PASS", { customerKey, productModule: "infissi" });
    const done = obs("execution", "COMPLETED", { customerKey });
    const evidence = obs("report_blockers", "BLOCKED", { customerKey, blockerCodes: ["screenings_missing", "invoice_screening"] });
    expect(resolveAprCaseStatusTruth([common, product, done, evidence])).toMatchObject({ status: "COMPLETED", matchedTransitionId: "draft_completed" });
  });

  it("non ignora un blocker common trasversale nel percorso Infissi", () => {
    expect(resolveAprCaseStatusTruth([
      obs("preflight_common", "BLOCKED", {
        blockerCodes: ["identity_conflict"],
        blockerApplicability: [{ code: "identity_conflict", productModules: ["screening", "infissi"] }],
        classification: "UNCLASSIFIED",
      }),
      obs("product_gate", "PASS", { productModule: "infissi" }),
      blockers("identity_conflict"),
    ])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non applicabile") });
  });

  it("rifiuta execution COMPLETED con blocker a monte", () => {
    expect(resolveAprCaseStatusTruth([
      obs("preflight_common", "BLOCKED", { blockerCodes: ["x"], classification: "UNCLASSIFIED" }),
      obs("deep_review", "BLOCKED", { blockerCodes: ["x"], classification: "OPERATOR" }),
      obs("execution", "COMPLETED"), blockers("x"),
    ])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non applicabile") });
  });

  it("rifiuta una fonte obbligatoria mancante", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS")])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("product_gate") });
  });

  it("rifiuta una fonte duplicata", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS"), obs("product_gate", "PASS"), obs("product_gate", "PASS")])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("duplicata") });
  });

  it("rifiuta runId differenti", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS"), obs("product_gate", "PASS", { runId: "other-run" })])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("runId differenti") });
  });

  it("rifiuta blocker non presenti nella fonte strutturata", () => {
    expect(resolveAprCaseStatusTruth([
      obs("preflight_common", "PASS"), obs("product_gate", "BLOCKED", { blockerCodes: ["missing"], classification: "UNCLASSIFIED" }),
      obs("deep_review", "BLOCKED", { blockerCodes: ["missing"], classification: "OPERATOR" }), blockers("different"),
    ])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non tracciati") });
  });

  it("rifiuta una deep review sostanziale quando non richiesta", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "PASS"), obs("product_gate", "PASS"), obs("deep_review", "BLOCKED", { classification: "TECHNICAL" })])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non applicabile") });
  });

  it("rifiuta una combinazione non registrata nella matrice", () => {
    expect(resolveAprCaseStatusTruth([obs("preflight_common", "DEFERRED")])).toMatchObject({ status: "INCONSISTENT", reason: expect.stringContaining("non prevista") });
  });
});
