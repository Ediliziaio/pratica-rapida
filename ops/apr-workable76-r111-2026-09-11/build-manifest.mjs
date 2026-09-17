import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const outputRoot = path.join(repositoryRoot, "ops/apr-workable76-r111-2026-09-11");
const baselinePath = path.join(repositoryRoot, "ops/apr-workable70-r110-2026-09-11/manifest.json");
const originalPath = path.join(repositoryRoot, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const currentPipelinePath = path.join(repositoryRoot, "ops/apr-pronte-da-fare-r104-2026-09-10/manifest.json");
const reactivatedCustomerKeys = [
  "filippo-bigalli",
  "alessandro-zaniboni",
  "rocco-giacotto",
  "paolino-bellini",
  "gabriele-girelli",
  "silvia-lomartire",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const parse = async (file) => JSON.parse(await readFile(file, "utf8"));
const atomicJson = async (file, value) => {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
};

const [baselineBytes, originalBytes, currentPipelineBytes] = await Promise.all([
  readFile(baselinePath),
  readFile(originalPath),
  readFile(currentPipelinePath),
]);
const baseline = JSON.parse(baselineBytes);
const original = JSON.parse(originalBytes);
const currentPipeline = JSON.parse(currentPipelineBytes);
if (baseline.cases?.length !== 70 || new Set(baseline.cases.map((item) => item.practiceId)).size !== 70) {
  throw new Error("r110_baseline_not_exactly_70_unique_cases");
}

const sources = [...original.cases, ...currentPipeline.cases];
const reactivated = reactivatedCustomerKeys.map((customerKey) => {
  const matches = sources.filter((item) => item.customerKey === customerKey);
  const uniquePracticeIds = [...new Set(matches.map((item) => item.practiceId))];
  if (uniquePracticeIds.length !== 1) throw new Error(`reactivated_case_identity_not_unique:${customerKey}:${uniquePracticeIds.length}`);
  const item = matches.find((candidate) => candidate.practiceId === uniquePracticeIds[0]);
  return {
    ...item,
    sourceGroup: "reactivated_after_invoice_upload",
    reacquireBeforeReplay: true,
    historicalRetest: true,
  };
});
const cases = [...baseline.cases, ...reactivated].map((item, index) => ({ ...item, cohort: index + 1 }));
if (cases.length !== 76
  || new Set(cases.map((item) => item.practiceId)).size !== 76
  || new Set(cases.map((item) => item.customerKey)).size !== 76) {
  throw new Error("r111_manifest_not_exactly_76_unique_cases");
}
if (reactivated.some((item) => baseline.cases.some((baselineItem) => baselineItem.practiceId === item.practiceId))) {
  throw new Error("reactivated_case_already_in_r110_baseline");
}

const manifest = {
  version: "apr-workable76-r111-manifest-v1",
  generatedAt: new Date().toISOString(),
  authorizationId: "user-2026-09-11-full-r111-round-with-six-reactivated",
  selection: {
    total: cases.length,
    baselineComparableCount: baseline.cases.length,
    reactivatedCount: reactivated.length,
    allowedStages: [...new Set([
      ...(baseline.selection?.allowedStages ?? []),
      ...reactivated.map((item) => item.stage),
    ])],
    excludedCustomerKeys: (baseline.selection?.excludedCustomerKeys ?? [])
      .filter((customerKey) => !reactivatedCustomerKeys.includes(customerKey)),
    ordering: "Identical r110 baseline of 70 first, then the six newly workable cases after invoice upload; no arbitrary substitution.",
    groups: [
      { id: "r110_baseline", count: 70 },
      { id: "reactivated_after_invoice_upload", count: 6, customerKeys: reactivatedCustomerKeys },
    ],
    sourceManifests: [
      { path: path.relative(repositoryRoot, baselinePath), sha256: sha256(baselineBytes), cases: baseline.cases.length },
      { path: path.relative(repositoryRoot, originalPath), sha256: sha256(originalBytes), selectedCases: 5 },
      { path: path.relative(repositoryRoot, currentPipelinePath), sha256: sha256(currentPipelineBytes), selectedCases: 1 },
    ],
  },
  safety: {
    ...baseline.safety,
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: "preserve_and_ignore_for_new_test_draft",
  },
  cases,
};

await mkdir(outputRoot, { recursive: true, mode: 0o700 });
const manifestPath = path.join(outputRoot, "manifest.json");
await atomicJson(manifestPath, manifest);
const manifestBytes = await readFile(manifestPath);
const validation = {
  version: "apr-workable76-r111-manifest-validation-v1",
  generatedAt: new Date().toISOString(),
  status: "PASS",
  manifestPath,
  manifestSha256: sha256(manifestBytes),
  selectedCount: cases.length,
  baselineComparableCount: baseline.cases.length,
  reactivatedCount: reactivated.length,
  uniquePracticeIds: new Set(cases.map((item) => item.practiceId)).size,
  uniqueCustomerKeys: new Set(cases.map((item) => item.customerKey)).size,
  reactivated: reactivated.map(({ practiceId, customerKey, displayName, stage, sourceGroup, reacquireBeforeReplay }) => ({
    practiceId, customerKey, displayName, stage, sourceGroup, reacquireBeforeReplay,
  })),
  safety: manifest.safety,
};
await atomicJson(path.join(outputRoot, "manifest-validation.json"), validation);
console.log(JSON.stringify(validation, null, 2));
