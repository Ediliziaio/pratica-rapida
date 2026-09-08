export function validateSequencerManifest(manifest, cases) {
  if (!manifest || typeof manifest !== "object" || !manifest.selection || typeof manifest.selection !== "object") {
    throw new Error("manifest_selection_required");
  }
  if (!Array.isArray(manifest.cases) || !Array.isArray(cases)) throw new Error("manifest_cases_required");
  const excluded = manifest.selection.excludedCustomerKeys;
  const allowedStages = manifest.selection.allowedStages;
  if (!Array.isArray(excluded)) throw new Error("manifest_excluded_customer_keys_required");
  if (!Array.isArray(allowedStages) || allowedStages.length === 0 || allowedStages.some((stage) => typeof stage !== "string" || !stage.trim())) {
    throw new Error("manifest_allowed_stages_required");
  }
  const expectedCount = Number(manifest.selection.total ?? cases.length);
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || cases.length !== expectedCount || new Set(cases.map((item) => item.customerKey)).size !== expectedCount) {
    throw new Error("manifest_identity_or_count_invalid");
  }
  const excludedSet = new Set(excluded);
  if (cases.some((item) => excludedSet.has(item.customerKey))) throw new Error("manifest_contains_excluded_identity");
  if (cases.some((item) => !allowedStages.includes(item.stage))) throw new Error("manifest_contains_disallowed_pipeline_stage");
  return { expectedCount, excludedCustomerKeys: [...excludedSet], allowedStages: [...allowedStages] };
}
