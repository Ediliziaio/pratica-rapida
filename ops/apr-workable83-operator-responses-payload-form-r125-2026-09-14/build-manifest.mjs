import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "ops/apr-workable83-operator-responses-payload-form-r125-2026-09-14");
const corePath = path.join(root, "ops/apr-workable76-r111-2026-09-11/manifest.json");
const newPath = path.join(root, "ops/apr-r124-short-rounds-2026-09-14/manifest-b.json");
const outputPath = path.join(outputRoot, "manifest.json");
const validationPath = path.join(outputRoot, "manifest-validation.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (file) => {
  const bytes = readFileSync(file);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
};
const atomicWrite = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); }
  finally { closeSync(descriptor); }
  renameSync(temporary, file);
};

const core = read(corePath);
const fresh = read(newPath);
if (core.value.cases?.length !== 76 || fresh.value.cases?.length !== 7) throw new Error("source_manifest_count_invalid");

const expectedFreshKeys = [
  "fabio-benvenuti",
  "gianfranco-zanetti",
  "daniele-formentini",
  "andrea-celi",
  "gabriele-malossi",
  "anthony-pool-juscamaita-fuertes",
  "mario-spano",
];
if (JSON.stringify(fresh.value.cases.map((item) => item.customerKey)) !== JSON.stringify(expectedFreshKeys)) {
  throw new Error("new_seven_identity_or_order_invalid");
}

const cases = [
  ...core.value.cases.map(({ cohort: _cohort, ...item }) => ({ ...item, group: "workable76" })),
  ...fresh.value.cases.map(({ cohort: _cohort, ...item }) => ({ ...item, group: "new7", reacquireBeforeReplay: true })),
];
const practiceIds = cases.map((item) => item.practiceId);
const customerKeys = cases.map((item) => item.customerKey);
if (new Set(practiceIds).size !== 83 || new Set(customerKeys).size !== 83) throw new Error("manifest_not_unique");

const manifest = {
  version: "apr-workable83-operator-responses-payload-form-r125-manifest-v1",
  generatedAt: new Date().toISOString(),
  authorizationId: "user-2026-09-14-workable76-plus-seven-fresh-draft-v1",
  selection: {
    total: 83,
    baselineComparableCount: 76,
    newSevenCount: 7,
    allowedStages: [...new Set([...core.value.selection.allowedStages, ...fresh.value.selection.allowedStages])],
    excludedCustomerKeys: [...new Set([...core.value.selection.excludedCustomerKeys, ...fresh.value.selection.excludedCustomerKeys])],
    ordering: "Le 76 storiche nello stesso ordine del manifest congelato, seguite dalle sette nominate da Giuliano nello stesso ordine del giro B.",
    groups: [
      { id: "workable76", count: 76 },
      { id: "new7", count: 7, customerKeys: expectedFreshKeys },
    ],
    sourceManifests: [
      { path: path.relative(root, corePath), sha256: core.sha256, selectedCases: 76 },
      { path: path.relative(root, newPath), sha256: fresh.sha256, selectedCases: 7 },
    ],
  },
  safety: {
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: "preserve_and_ignore_for_new_test_draft",
  },
  cases,
};
atomicWrite(outputPath, manifest);
const manifestBytes = readFileSync(outputPath);
atomicWrite(validationPath, {
  version: "apr-workable83-operator-responses-payload-form-r125-manifest-validation-v1",
  validatedAt: new Date().toISOString(),
  manifestPath: outputPath,
  manifestSha256: sha256(manifestBytes),
  total: cases.length,
  uniquePracticeIds: new Set(practiceIds).size,
  uniqueCustomerKeys: new Set(customerKeys).size,
  core76: cases.filter((item) => item.group === "workable76").length,
  new7: cases.filter((item) => item.group === "new7").length,
  exactNewSeven: expectedFreshKeys,
  safety: manifest.safety,
  status: "passed",
});
process.stdout.write(`${JSON.stringify(JSON.parse(readFileSync(validationPath, "utf8")), null, 2)}\n`);
