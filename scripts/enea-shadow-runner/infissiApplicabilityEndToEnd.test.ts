import { describe, expect, it } from "vitest";
import { reconcileCommonReportWithAuthoritativeInfissiGate } from "./crmLocalPreflight";
import { observeAprCommonPreflight, observeAprInfissiBatchProductGate } from "./caseStatusObservationAdapters";
import { resolveAprCaseSourcePolicy } from "./aprCaseSourcePolicy";
import { deriveAprInfissiBatchCaseStatusTruth } from "./caseStatusTruth";

const at = { runId: "infissi-applicability-e2e", observedAt: "2026-08-28T12:00:00.000Z" };

function screeningNoiseReport() {
  return {
    outcome: "blocked_case",
    blockers: [
      { code: "screenings_missing", field: "screenings", reason: "Nessun prodotto Schermature riconciliato." },
      { code: "invoice_332a5af9", field: "economic_sources", reason: "Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture." },
    ],
    warnings: [],
    eneaPayloadAudit: {
      status: "payload_incomplete",
      blockerCount: 2,
      blockers: [
        { code: "screening-list-empty", fieldId: "schermature", message: "Elenco Schermature vuoto." },
        { code: "missing-schermature.numero", fieldId: "schermature.numero", message: "Numero Schermature mancante." },
      ],
      draftReady: false,
      portalGate: { status: "blocked", reason: "screening-list-empty" },
    },
    draftPlan: { status: "blocked", nextAction: "blocked" },
  };
}

describe("riconciliazione Infissi/Schermature end-to-end", () => {
  it("allinea preflight comune, gate prodotto, policy unificata e verita dashboard su READY", () => {
    const report = reconcileCommonReportWithAuthoritativeInfissiGate(screeningNoiseReport() as never);
    expect(report).toMatchObject({ outcome: "ready_local_plan", blockers: [], eneaPayloadAudit: { blockers: [], draftReady: true, portalGate: { status: "ready" } } });

    const common = observeAprCommonPreflight({ customerKey: "roberto-marcello", displayName: "Roberto Marcello", state: "ready_local_plan", report } as never, at);
    const productItem = { customerKey: "roberto-marcello", displayName: "Roberto Marcello", state: "ready_local_plan", productModule: "infissi", report: { outcome: "ready_local_plan", blockers: [] } } as never;
    const product = observeAprInfissiBatchProductGate(productItem, at);
    const policy = resolveAprCaseSourcePolicy({ commonStatus: common.status, commonBlockerCodes: common.blockerCodes, commonBlockerApplicability: common.blockerApplicability, routedProductModule: product.productModule, productStatus: product.status, executionPresent: false, serverVerificationPresent: false });

    expect(common.status).toBe("PASS");
    expect(product).toMatchObject({ status: "PASS", productModule: "infissi" });
    expect(policy).toMatchObject({ effectiveCommonStatus: "PASS", ignoredCommonBlockerCodes: [] });
    expect(deriveAprInfissiBatchCaseStatusTruth(productItem)).toMatchObject({ status: "READY", hasProblem: false, blockerCount: 0 });
  });

  it("non elimina un blocker comune reale e lo mantiene applicabile agli Infissi", () => {
    const base = screeningNoiseReport();
    const report = reconcileCommonReportWithAuthoritativeInfissiGate({
      ...screeningNoiseReport(),
      blockers: [...base.blockers, { code: "customer_form_missing", field: "form", reason: "Form cliente mancante." }],
    } as never);
    expect(report).toMatchObject({ outcome: "blocked_case", blockers: [{ code: "customer_form_missing" }] });
    const common = observeAprCommonPreflight({ customerKey: "sabrina-eustomi", displayName: "Sabrina Eustomi", state: "blocked_case", report } as never, at);
    expect(common.blockerApplicability?.find((item) => item.code === "customer_form_missing")?.productModules).toEqual(["screening", "infissi"]);
  });
});
