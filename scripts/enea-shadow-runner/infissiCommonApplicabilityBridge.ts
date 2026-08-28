import type { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { infissiExecutionGateReady } from "./infissiExecutionGate";

export const INFISSI_COMMON_APPLICABILITY_REVISION = "infissi-authoritative-product-applicability-v66" as const;

export function reconcileInfissiCommonApplicability(
  commonPreflight: Pick<PersistentAprCrmLocalPreflight, "reconcileAuthoritativeInfissiApplicability">,
  snapshot: Parameters<PersistentAprCrmLocalPreflight["reconcileAuthoritativeInfissiApplicability"]>[0] & {
    sourceFingerprint: string | null;
    validationRevisionsApplied?: readonly string[];
  },
  now = new Date(),
) {
  if (!infissiExecutionGateReady(snapshot)) throw new Error("infissi_common_applicability_reconciliation_gate_not_ready");
  return commonPreflight.reconcileAuthoritativeInfissiApplicability(snapshot, INFISSI_COMMON_APPLICABILITY_REVISION, now);
}
