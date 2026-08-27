import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runEconomicVertical } from "./aprEconomicVertical";
import { mapBusinessDecisionArtifactToEnea } from "./aprEneaPureMapper";
import type { AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { bridgeVerifiedMappingToLegacyDraftPackage, PersistentAprEneaOperationalBridge } from "./aprEneaOperationalBridge";
import { canonicalSha256, envelopeImmutableArtifact } from "./aprMonotonicArtifacts";

const legacyPackage = (): AprEneaDraftPackage => ({
  module: "screening",
  customerKey: "case-alpha",
  displayName: "Fixture Alpha",
  practiceId: "practice-alpha",
  packageFingerprint: canonicalSha256("legacy-package-alpha"),
  workflowFingerprint: canonicalSha256("legacy-workflow-alpha"),
  workflow: {
    supportedPages: ["Schermature solari", "Calcolo costi e detrazioni"],
    screeningItemCount: 1,
    steps: [
      { id: "summary", pageName: "Schermature solari", markerIds: ["id-costo"], successMessage: "ok", fields: [{ portalId: "id-costo", control: "input", value: "999,99" }] },
      { id: "calculation", pageName: "Calcolo costi e detrazioni", markerIds: ["id-risp"], successMessage: "ok", fields: [] },
    ],
    screeningSteps: [{ id: "row-1", pageName: "Schermatura 1", markerIds: ["id-tipo"], successMessage: "ok", fields: [{ portalId: "id-tipo", control: "select", value: "Tenda" }] }],
  },
  safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
});

function mapping(amount = 2100, practiceId = "practice-alpha") {
  return mapBusinessDecisionArtifactToEnea(runEconomicVertical({
    customerKey: "case-alpha",
    practiceId,
    sourceFingerprint: canonicalSha256({ amount, practiceId }),
    invoices: [{
      sourceId: "invoice-alpha", supplierId: "supplier", supplierName: "Supplier", documentNumber: "1", documentDate: "2026-08-01",
      kind: "invoice", taxableAmount: amount / 1.1, vatAmount: amount - amount / 1.1, grossTotal: amount,
      referencedAdvanceIds: [], interventionGrossAmount: amount, extractionConfidence: "certain", extractionIssues: [],
      internalAdjustmentNote: null, explicitDeductibleLines: [], lineItems: [],
      locator: { sourceId: "invoice-alpha", pageNumber: 1, contentSha256: canonicalSha256("invoice"), excerptSha256: canonicalSha256("excerpt") },
    }],
    bankTransfers: [],
    replacements: [],
  }).decisionsArtifact);
}

describe("APR ENEA operational bridge", () => {
  it("inietta nel solo id-costo il valore economico verificato e conserva i divieti", () => {
    const source = legacyPackage();
    const result = bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: source, mappingArtifact: mapping(), authorizationId: "user-real-draft-only-2026-08-27" });
    expect(result.workflow.steps[0].fields).toEqual([{ portalId: "id-costo", control: "input", value: "2100,00" }]);
    expect(result.workflow.screeningSteps).toEqual(source.workflow.screeningSteps);
    expect(result.safety).toEqual({ createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false });
    expect(result.packageFingerprint).not.toBe(source.packageFingerprint);
    expect(source.workflow.steps[0].fields[0].value).toBe("999,99");
  });

  it("e deterministico sullo stesso pacchetto e artefatto", () => {
    const first = bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: legacyPackage(), mappingArtifact: mapping(1160.01), authorizationId: "auth-alpha" });
    const second = bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: legacyPackage(), mappingArtifact: mapping(1160.01), authorizationId: "auth-alpha" });
    expect(first).toEqual(second);
  });

  it("blocca identita diverse, campi L4 non supportati e target costo non univoco", () => {
    const wrongIdentity = mapping(2100, "other");
    expect(() => bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: legacyPackage(), mappingArtifact: wrongIdentity, authorizationId: "auth" })).toThrow("apr_enea_bridge_case_identity_mismatch");

    const economicMapping = mapping();
    const productMapping = envelopeImmutableArtifact({
      ...economicMapping.payload,
      portalFields: [{ ...economicMapping.payload.portalFields[0], fieldId: "schermature.0.superficie", value: 2 }],
    });
    expect(() => bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: legacyPackage(), mappingArtifact: productMapping, authorizationId: "auth" })).toThrow("apr_enea_bridge_mapping_field_unsupported");

    const missingCostTarget = legacyPackage();
    missingCostTarget.workflow.steps[0].fields = [];
    expect(() => bridgeVerifiedMappingToLegacyDraftPackage({ legacyPackage: missingCostTarget, mappingArtifact: mapping(), authorizationId: "auth" })).toThrow("apr_enea_bridge_cost_target_cardinality_invalid:0");
  });

  it("persiste un solo armamento e ne verifica il replay prima dell'uso", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-enea-bridge-"));
    const store = new PersistentAprEneaOperationalBridge(root);
    const armed = store.arm({ legacyPackage: legacyPackage(), mappingArtifact: mapping(), authorizationId: "user-real-draft-only", now: new Date("2026-08-27T18:00:00Z") });
    const applied = new PersistentAprEneaOperationalBridge(root).apply(legacyPackage());
    expect(applied.packageFingerprint).toBe(armed.bridgedPackageFingerprint);
    expect(JSON.parse(readFileSync(store.checkpointPath, "utf8"))).toMatchObject({ status: "armed", authorizationScope: "real_portal_draft_only" });
    expect(() => store.arm({ legacyPackage: legacyPackage(), mappingArtifact: mapping(), authorizationId: "again" })).toThrow("apr_enea_bridge_already_armed");

    const changed = legacyPackage(); changed.packageFingerprint = canonicalSha256("changed");
    expect(() => store.apply(changed)).toThrow("apr_enea_bridge_legacy_package_changed");
  });

  it("ignora metadata osservativi variabili quando il fingerprint legacy resta identico", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-enea-bridge-observation-"));
    const store = new PersistentAprEneaOperationalBridge(root);
    const armedLegacy = Object.assign(legacyPackage(), { observedAt: "2026-08-27T18:00:00Z" });
    const armed = store.arm({ legacyPackage: armedLegacy, mappingArtifact: mapping(), authorizationId: "user-real-draft-only" });
    const rebuiltLegacy = Object.assign(legacyPackage(), { observedAt: "2026-08-27T18:05:00Z" });

    const applied = store.apply(rebuiltLegacy);

    expect(applied.packageFingerprint).toBe(armed.bridgedPackageFingerprint);
    expect((applied as AprEneaDraftPackage & { observedAt: string }).observedAt).toBe("2026-08-27T18:05:00Z");
  });
});
