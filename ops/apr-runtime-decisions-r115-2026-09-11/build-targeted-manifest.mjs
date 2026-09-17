import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "ops/apr-workable76-r111-2026-09-11/manifest.json");
const outputPath = path.join(root, "ops/apr-runtime-decisions-r115-2026-09-11/manifest-targeted-21.json");
const groups = [
  { id: "shading_closure_runtime_activation", customerKeys: ["matteo-capitanelli", "andrea-trabucco", "luca-cigognetti", "claudia-sellati", "flavia-cipriani", "marco-de-marinis", "ivana-mastrangelo", "antonio-scaparrotta", "eugenio-codognato"] },
  { id: "infissi_form_reconciliation_before_question", customerKeys: ["elena-depalma", "maurizia-coreggioli"] },
  { id: "technical_source_binding", customerKeys: ["marcella-capatti"] },
  { id: "printed_final_total_authority", customerKeys: ["vincenzo-falconi", "lucia-droghetti", "francesco-laurelli", "loretta-riviera"] },
  { id: "crm_id_lookup_without_stage", customerKeys: ["rossella-munafo", "patrizia-muzzi", "stefania-venturi", "angela-tuttolani", "fausta-de-filippo"] },
];

const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const source = JSON.parse(sourceBytes);
const byKey = new Map(source.cases.map((entry) => [entry.customerKey, entry]));
const selected = [];
for (const group of groups) {
  for (const customerKey of group.customerKeys) {
    const entry = byKey.get(customerKey);
    if (!entry) throw new Error(`target_customer_missing:${customerKey}`);
    selected.push({ ...entry, cohort: selected.length + 1, group: group.id, historicalRetest: true });
  }
}
if (selected.length !== 21) throw new Error(`target_count_invalid:${selected.length}`);
if (new Set(selected.map((entry) => entry.practiceId)).size !== 21) throw new Error("target_practice_id_not_unique");
if (new Set(selected.map((entry) => entry.customerKey)).size !== 21) throw new Error("target_customer_key_not_unique");

const manifest = {
  version: "apr-runtime-decisions-r115-targeted-21-manifest-v1",
  generatedAt: new Date().toISOString(),
  authorizationId: "user-2026-09-11-runtime-decisions-targeted-21",
  authorizedAt: "2026-09-11T00:00:00.000+02:00",
  mode: "fresh_generation_draft_only_sequential",
  selection: {
    total: 21,
    allowedStages: source.selection.allowedStages,
    excludedCustomerKeys: source.selection.excludedCustomerKeys,
    ordering: "Five authorized runtime-decision families, exact names and no substitutions.",
    groups: groups.map((group) => ({ id: group.id, count: group.customerKeys.length, customerKeys: group.customerKeys })),
    sourceManifest: { path: path.relative(root, sourcePath), sha256: sourceSha256, cases: source.cases.length },
  },
  safety: {
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: "preserve_and_ignore_for_new_test_draft",
  },
  cases: selected,
};

mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
const temporary = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
const descriptor = openSync(temporary, "wx", 0o600);
try { writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`); } finally { closeSync(descriptor); }
renameSync(temporary, outputPath);
process.stdout.write(`${JSON.stringify({ outputPath, sourceSha256, count: selected.length, customerKeys: selected.map((entry) => entry.customerKey) }, null, 2)}\n`);
