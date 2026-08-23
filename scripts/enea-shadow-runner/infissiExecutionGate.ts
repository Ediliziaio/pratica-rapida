export const APR_REQUIRED_INFISSI_VALIDATION_REVISIONS = [
  "infissi-transmittance-131-to-13-v1",
  "infissi-old-window-invoice-over-form-v2",
  "infissi-invoice-certificate-cardinality-v3",
  "infissi-grk-financial-and-assembly-pages-v4",
  "infissi-grk-number-date-v5",
  "infissi-performance-diagram-cardinality-v6",
  "infissi-horizontal-window-vertical-dimensions-v7",
  "infissi-nonfiscal-technical-worksheet-v8",
  "infissi-nonfiscal-technical-financial-split-v9",
  "deep-review-infissi-v1",
  "deep-review-infissi-v2",
  "infissi-documented-dimension-pair-fallback-v10",
  "infissi-portal-transmittance-over-max-to-13-v11",
  "infissi-bank-transfer-invoice-authority-v12",
  "infissi-enea-2026-june25-deadline-window-v13",
  "infissi-composite-invoice-transfer-segmentation-v14",
  "infissi-ideal-sistem-vertical-invoice-headings-v15",
  "infissi-ideal-sistem-columnar-financial-v16",
  "infissi-missing-explicit-advance-invoice-v17",
  "infissi-documented-product-module-over-label-v18",
] as const;

export function infissiExecutionGateReady(snapshot: {
  status: string;
  sourceFingerprint: string | null;
  validationRevisionsApplied?: readonly string[];
}) {
  const applied = new Set(snapshot.validationRevisionsApplied ?? []);
  return snapshot.status === "completed"
    && Boolean(snapshot.sourceFingerprint)
    && APR_REQUIRED_INFISSI_VALIDATION_REVISIONS.every((revision) => applied.has(revision));
}

export function dateGateReleaseReadyCustomerKeys(
  commonItems: ReadonlyArray<{ customerKey: string; state: string; report?: { blockers?: ReadonlyArray<{ code: string }> } | null }>,
  infissiItems: ReadonlyArray<{ customerKey: string; state: string }>,
) {
  const infissiKeys = new Set(infissiItems.map((item) => item.customerKey));
  const commonByKey = new Map(commonItems.map((item) => [item.customerKey, item]));
  const dateCodes = new Set(["completion_over_90_days_operator_required", "completion_date_portal_year_mismatch"]);
  return [...new Set([
    ...commonItems.filter((item) => !infissiKeys.has(item.customerKey) && item.state === "ready_local_plan").map((item) => item.customerKey),
    ...infissiItems.filter((item) => item.state === "ready_local_plan"
      && !(commonByKey.get(item.customerKey)?.report?.blockers ?? []).some((blocker) => dateCodes.has(blocker.code)))
      .map((item) => item.customerKey),
  ])];
}
