import { describe, expect, it } from "vitest";
import type { AprArchivedMixedDiscoveryCheckpoint } from "./aprCrmArchivedMixedDiscovery";
import { mixedDiscoveryToSeedManifest } from "./aprMixedCohortPrepare";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

function discovery(): AprArchivedMixedDiscoveryCheckpoint {
  const selected = Array.from({ length: 40 }, (_, index) => ({
    customerKey: `cliente-${index + 1}`,
    displayName: `Cliente ${index + 1}`,
    practiceId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    expectedStageType: index % 2 ? "recensione" as const : "archiviate" as const,
    productModule: index < 20 ? "screening" as const : "infissi" as const,
    productEvidence: index < 20 ? "Schermature Solari" : "Infissi / Serramenti",
    priorDraftIds: index === 0 ? ["424000"] : [],
  }));
  return { version: "apr-archived-mixed-discovery-v1", revision: 1, status: "selected", required: { screening: 20, infissi: 20, total: 40 }, selected, counts: { screening: 20, infissi: 20, total: 40 }, selectionSeedSha256: "a".repeat(64), responseSha256: "b".repeat(64), sourceEvidenceId: "crm-mixed-40-test-evidence", externalActionAllowed: false, mutationAllowed: false, reason: "selected", nextAction: "seed", observedAt: "2026-08-23T00:00:00.000Z", audit: [{ at: "2026-08-23T00:00:00.000Z", type: "mixed_discovery_completed", reason: "selected", appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest] }] };
}

describe("preparazione coorte mista APR", () => {
  it("trasforma esclusivamente una selezione 20+20 in una coda storica da 40 senza riusare le bozze", () => {
    const manifest = mixedDiscoveryToSeedManifest(discovery());
    expect(manifest.candidates).toHaveLength(40);
    expect(manifest.candidates.filter((candidate) => candidate.productModule === "screening")).toHaveLength(20);
    expect(manifest.candidates.filter((candidate) => candidate.productModule === "infissi")).toHaveLength(20);
    expect(manifest.authorizedBatch).toEqual({ authorizationId: USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest, exactCount: 40 });
    expect(manifest.historicalRetest).toEqual({ authorizationId: USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest, preservePriorDrafts: true });
  });

  it("rifiuta una selezione incompleta", () => {
    const value = discovery(); value.counts.infissi = 19;
    expect(() => mixedDiscoveryToSeedManifest(value)).toThrow("apr_mixed_cohort_discovery_not_ready");
  });
});
