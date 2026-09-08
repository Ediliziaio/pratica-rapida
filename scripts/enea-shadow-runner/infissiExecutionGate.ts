import { AUTO_CURRENT_VALIDATION_REVISION } from "../../src/features/enea-shadow-crm/operationalRegistry";

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

export function applyRequiredInfissiValidationRevisions(
  applyAndSettle: (revision: string) => void,
) {
  for (const revision of APR_REQUIRED_INFISSI_VALIDATION_REVISIONS) {
    applyAndSettle(revision);
  }
  // Difetto strutturale (2026-09-08): l'elenco sopra e' scritto a mano ed e'
  // gia' rimasto indietro rispetto a elenchi paralleli in altri file (stessa
  // stringa duplicata su piu' file, mai tenuta sincronizzata). Un
  // identificatore derivato dal contenuto del registro chiude il ricalcolo
  // senza richiedere una nuova riga per ogni correzione futura.
  applyAndSettle(AUTO_CURRENT_VALIDATION_REVISION);
}

export function missingRequiredInfissiValidationRevisions(snapshot: {
  validationRevisionsApplied?: readonly string[];
}) {
  const applied = new Set(snapshot.validationRevisionsApplied ?? []);
  // AUTO_CURRENT_VALIDATION_REVISION e' incluso qui (non solo applicato da chi
  // scrive) cosi' che questa funzione stessa - usata per decidere se un
  // checkpoint e' davvero aggiornato - non possa mai dichiararlo pronto sulla
  // base di un elenco scritto a mano rimasto indietro rispetto al registro
  // corrente (difetto strutturale 2026-09-08).
  return [...APR_REQUIRED_INFISSI_VALIDATION_REVISIONS, AUTO_CURRENT_VALIDATION_REVISION].filter((revision) => !applied.has(revision));
}

/**
 * A second checkpoint writer can finish a validation from a stale snapshot and
 * overwrite one marker while the CLI is settling the next revision. Re-read
 * the durable checkpoint after every pass and re-apply only missing markers.
 * The execution gate remains unchanged and fail-closed.
 */
export function convergeRequiredInfissiValidationRevisions(
  readSnapshot: () => { validationRevisionsApplied?: readonly string[] },
  applyAndSettle: (revision: string) => void,
  maxPasses = 3,
) {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const missing = missingRequiredInfissiValidationRevisions(readSnapshot());
    if (missing.length === 0) return readSnapshot();
    for (const revision of missing) applyAndSettle(revision);
  }
  const finalSnapshot = readSnapshot();
  const missing = missingRequiredInfissiValidationRevisions(finalSnapshot);
  if (missing.length > 0) throw new Error(`infissi_required_validation_revisions_not_durable:${missing.join(",")}`);
  return finalSnapshot;
}

export function infissiExecutionGateReady(snapshot: {
  status: string;
  sourceFingerprint: string | null;
  validationRevisionsApplied?: readonly string[];
}) {
  const applied = new Set(snapshot.validationRevisionsApplied ?? []);
  return snapshot.status === "completed"
    && Boolean(snapshot.sourceFingerprint)
    && APR_REQUIRED_INFISSI_VALIDATION_REVISIONS.every((revision) => applied.has(revision))
    && applied.has(AUTO_CURRENT_VALIDATION_REVISION);
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
