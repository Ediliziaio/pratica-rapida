import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const sourceManifestPath = resolve(
  repositoryRoot,
  "ops/apr-wide100-province-lineage-2026-09-02/manifest.json",
);
const familyMapPath = resolve(
  repositoryRoot,
  "ops/apr-residual-family-map-2026-09-10/family-map.json",
);
const outputPath = resolve(here, "manifest.json");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceManifestBytes = readFileSync(sourceManifestPath);
const familyMapBytes = readFileSync(familyMapPath);
const sourceManifest = JSON.parse(sourceManifestBytes);
const familyMap = JSON.parse(familyMapBytes);

const familyIds = ["PAR01", "PRE01", "DAT05"];
const families = new Map(
  familyMap.membershipFamilies
    .filter((family) => familyIds.includes(family.id))
    .map((family) => [family.id, family]),
);
for (const familyId of familyIds) {
  if (!families.has(familyId)) throw new Error(`missing_family:${familyId}`);
}

const excludedFalseBlockId = "9f44491c-30f7-44ef-84db-14877259d716";
const selectedIds = new Set([
  ...families.get("PAR01").cases.map((entry) => entry.practiceId),
  ...families.get("PRE01").cases.map((entry) => entry.practiceId),
]);
if (selectedIds.size !== 24) throw new Error(`selected_unique_count:${selectedIds.size}`);

const sourceCases = new Map(sourceManifest.cases.map((entry) => [entry.practiceId, entry]));
const cases = [...selectedIds].map((practiceId, index) => {
  const sourceCase = sourceCases.get(practiceId);
  if (!sourceCase) throw new Error(`practice_not_in_authorized_wide100:${practiceId}`);
  const membership = familyIds.filter((familyId) =>
    families.get(familyId).cases.some((entry) => entry.practiceId === practiceId),
  );
  return {
    ...sourceCase,
    cohort: undefined,
    families: membership,
    remeasurementOrder: index + 1,
  };
});

const manifest = {
  version: "apr-r104-r105-remeasurement-24-manifest-v1",
  authorizationId: sourceManifest.authorizationId,
  authorizedAt: sourceManifest.authorizedAt,
  preparedAt: "2026-09-10T09:30:00.000+02:00",
  mode: "real_enea_draft_only",
  source: {
    authorizedManifestPath:
      "ops/apr-wide100-province-lineage-2026-09-02/manifest.json",
    authorizedManifestSha256: sha256(sourceManifestBytes),
    familyMapPath: "ops/apr-residual-family-map-2026-09-10/family-map.json",
    familyMapSha256: sha256(familyMapBytes),
  },
  selection: {
    totalUnique: cases.length,
    familyMembershipCounts: {
      products_measurements_cardinality_PAR01: families.get("PAR01").uniquePracticeCount,
      preflight_stall_PRE01: families.get("PRE01").uniquePracticeCount,
      confirmed_false_blocks_DAT05: families.get("DAT05").uniquePracticeCount,
    },
    actionableFalseBlockOverlapCount: 2,
    allowedStages: ["archiviate", "recensione"],
    selectionPolicy:
      "Exact deduplicated union of PAR01 and PRE01 from the frozen residual-family map. DAT05 is retained as cross-membership evidence; Mondini and Maeschi are already in PAR01. Garbato is recorded but excluded because the completion-over-90-days rule makes the case non-procedibile for this remeasurement.",
    excludedFalseBlockCases: [
      {
        practiceId: excludedFalseBlockId,
        displayName: "caterina Claudia garbato",
        family: "DAT05",
        reason: "completion_over_90_days_operator_required",
      },
    ],
  },
  safety: {
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: "fresh_generation_only",
    launchState: "PREPARED_NOT_LAUNCHED",
  },
  cases,
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
process.stdout.write(`${outputPath}\n`);
