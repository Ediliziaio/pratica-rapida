import type { AprArchivedMixedDiscoveryCheckpoint } from "./aprCrmArchivedMixedDiscovery";
import { APR_COHORT_SEED_VERSION, type AprCohortSeedManifest } from "./aprCohortSeed";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

export function mixedDiscoveryToSeedManifest(discovery: AprArchivedMixedDiscoveryCheckpoint): AprCohortSeedManifest {
  if (discovery.status !== "selected"
    || discovery.counts.screening !== 20
    || discovery.counts.infissi !== 20
    || discovery.counts.total !== 40
    || discovery.selected.length !== 40) throw new Error("apr_mixed_cohort_discovery_not_ready");
  if (new Set(discovery.selected.map((candidate) => candidate.practiceId)).size !== 40
    || new Set(discovery.selected.map((candidate) => candidate.customerKey)).size !== 40) throw new Error("apr_mixed_cohort_discovery_duplicate");
  return {
    version: APR_COHORT_SEED_VERSION,
    sourceEvidenceId: discovery.sourceEvidenceId,
    candidates: discovery.selected.map(({ customerKey, displayName, practiceId, expectedStageType, productModule }) => ({ customerKey, displayName, practiceId, expectedStageType, productModule })),
    authorizedBatch: {
      authorizationId: USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest,
      exactCount: 40,
    },
    historicalRetest: {
      authorizationId: USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest,
      preservePriorDrafts: true,
    },
  };
}
