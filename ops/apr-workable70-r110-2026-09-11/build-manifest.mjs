import { createHash } from 'node:crypto';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'ops/apr-workable70-r110-2026-09-11');
const targetedPath = path.join(root, 'ops/apr-contractual-reliability-2026-09-09/manifest-targeted-r100.json');
const longPath = path.join(root, 'ops/apr-contractual-reliability-2026-09-09/manifest-long-r101.json');
const exclusionPath = path.join(root, 'ops/apr-saved-field-comparison-and-exclusions-2026-09-10/exclusion-denominator-audit.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const parse = async (file) => JSON.parse(await readFile(file, 'utf8'));
const atomicJson = async (file, value) => {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, file);
};

const [targeted, long, exclusionAudit] = await Promise.all([
  parse(targetedPath),
  parse(longPath),
  parse(exclusionPath),
]);

const sourceCases = [...targeted.cases, ...long.cases];
const sourceIds = sourceCases.map((entry) => entry.practiceId);
const sourceKeys = sourceCases.map((entry) => entry.customerKey);
if (sourceCases.length !== 80 || new Set(sourceIds).size !== 80 || new Set(sourceKeys).size !== 80) {
  throw new Error('The contractual 17+63 source set is not exactly 80 unique practices.');
}

const supplierExclusions = exclusionAudit.currentKnownExcludedPractices?.practices ?? [];
if (supplierExclusions.some((entry) => entry.tripleVerification?.concordant !== true)) {
  throw new Error('A permanent supplier exclusion is not triple-verified.');
}
const excludedById = new Map(supplierExclusions.map((entry) => [entry.practiceId, entry]));
const removed = sourceCases.filter((entry) => excludedById.has(entry.practiceId));
const cases = sourceCases
  .filter((entry) => !excludedById.has(entry.practiceId))
  .map((entry, index) => ({ ...entry, cohort: index + 1 }));

if (removed.length !== 10 || cases.length !== 70) {
  throw new Error(`Expected 10 current supplier exclusions and 70 workable cases; got ${removed.length} and ${cases.length}.`);
}

const familyCounts = removed.reduce((counts, entry) => {
  const family = excludedById.get(entry.practiceId).family;
  counts[family] = (counts[family] ?? 0) + 1;
  return counts;
}, {});
const expectedFamilyCounts = {
  'linea-sole-potito': 4,
  'erre-emme-rm-legno': 2,
  'ideal-sistem': 4,
};
if (Object.entries(expectedFamilyCounts).some(([family, count]) => familyCounts[family] !== count)
  || Object.keys(familyCounts).length !== Object.keys(expectedFamilyCounts).length) {
  throw new Error(`Unexpected exclusion distribution: ${JSON.stringify(familyCounts)}`);
}

const sourceManifestBytes = await Promise.all([readFile(targetedPath), readFile(longPath)]);
const excludedCustomerKeys = [...new Set([
  ...(targeted.selection?.excludedCustomerKeys ?? []),
  ...(long.selection?.excludedCustomerKeys ?? []),
  ...removed.map((entry) => entry.customerKey),
])];
const allowedStages = [...new Set([
  ...(targeted.selection?.allowedStages ?? []),
  ...(long.selection?.allowedStages ?? []),
])];

const manifest = {
  version: 'apr-workable70-r110-manifest-v1',
  generatedAt: new Date().toISOString(),
  authorizationId: 'user-2026-09-11-full-workable-round-r110',
  selection: {
    total: cases.length,
    sourceTotal: sourceCases.length,
    allowedStages,
    excludedCustomerKeys,
    ordering: '17 targeted cases, then 63 long-run cases, preserving source order; remove permanent supplier exclusions',
    sourceManifests: [
      { path: path.relative(root, targetedPath), sha256: sha256(sourceManifestBytes[0]), cases: targeted.cases.length },
      { path: path.relative(root, longPath), sha256: sha256(sourceManifestBytes[1]), cases: long.cases.length },
    ],
    permanentSupplierExclusions: Object.entries(expectedFamilyCounts).map(([family, count]) => ({ family, count })),
  },
  safety: {
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: 'preserve_and_ignore_for_new_test_draft',
  },
  cases,
};

await mkdir(outDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
await atomicJson(manifestPath, manifest);
const manifestBytes = await readFile(manifestPath);
const validation = {
  generatedAt: new Date().toISOString(),
  status: 'PASS',
  manifestPath,
  manifestSha256: sha256(manifestBytes),
  sourceCount: sourceCases.length,
  selectedCount: cases.length,
  removedCount: removed.length,
  uniquePracticeIds: new Set(cases.map((entry) => entry.practiceId)).size,
  uniqueCustomerKeys: new Set(cases.map((entry) => entry.customerKey)).size,
  supplierExclusionDistribution: familyCounts,
  removed: removed.map((entry) => ({
    practiceId: entry.practiceId,
    customerKey: entry.customerKey,
    displayName: entry.displayName,
    supplier: excludedById.get(entry.practiceId).supplier,
    family: excludedById.get(entry.practiceId).family,
  })),
  safety: manifest.safety,
};
await atomicJson(path.join(outDir, 'manifest-validation.json'), validation);
console.log(JSON.stringify(validation, null, 2));
