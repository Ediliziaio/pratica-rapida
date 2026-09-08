import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(directory, "../apr-wide100-province-lineage-2026-09-02/manifest.json");
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString("utf8"));
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

if (sourceSha256 !== "51842252f71cabb6714f78923fe59ec9789ad06739393f61a553bb4bdb9154e0") {
  throw new Error(`source_manifest_sha256_mismatch:${sourceSha256}`);
}

const groups = [
  {
    id: "reviewed-eight",
    keys: [
      "giovanna-atzeni",
      "elena-marcella-berti",
      "francesca-pisanu",
      "claudia-sellati",
      "giovanni-amadu",
      "massimo-cappello",
      "maurizia-coreggioli",
      "gabriele-girelli",
    ],
  },
  {
    id: "remaining-nine",
    keys: [
      "guido-calvacchi",
      "marco-de-marinis",
      "nicla-biagioni",
      "giuseppe-d-adduzio",
      "santo-giuga",
      "loretta-riviera",
      "prova-rivenditore-1-30-04",
      "ivana-mastrangelo",
      "antonio-scaparrotta",
    ],
  },
];

const sourceByKey = new Map(source.cases.map((item) => [item.customerKey, item]));
const allKeys = groups.flatMap((group) => group.keys);
if (new Set(allKeys).size !== 17) throw new Error("retest_identity_not_unique");

for (const group of groups) {
  const cases = group.keys.map((customerKey, index) => {
    const item = sourceByKey.get(customerKey);
    if (!item) throw new Error(`retest_identity_missing:${customerKey}`);
    return {
      ...item,
      sourceCohort: item.cohort,
      cohort: index + 1,
      historicalRetest: true,
    };
  });
  const manifest = {
    version: "apr-financial-parser-r29-targeted-retest-manifest-v1",
    authorizationId: "user-2026-09-02-financial-parser-r29-retest",
    authorizedAt: "2026-09-02T15:25:11.982Z",
    mode: "real_enea_draft_only",
    safety: source.safety,
    sourceManifest: {
      path: sourcePath,
      sha256: sourceSha256,
      authorizationId: source.authorizationId,
    },
    selection: {
      version: "apr-financial-parser-r29-targeted-retest-selection-v1",
      purpose: group.id,
      total: cases.length,
      selectedCount: cases.length,
      allowedStages: source.selection.allowedStages,
      excludedCustomerKeys: source.selection.excludedCustomerKeys,
      identityPolicy: "exact_subset_of_frozen_authorized_manifest",
    },
    cases,
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const outputPath = join(directory, `manifest-${group.id}.json`);
  writeFileSync(outputPath, bytes, { mode: 0o600 });
  process.stdout.write(`${group.id}\t${cases.length}\t${createHash("sha256").update(bytes).digest("hex")}\t${outputPath}\n`);
}
