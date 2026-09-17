import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("ops/apr-workable76-r111-2026-09-11/manifest-resume-26-plus-fioravanti.json");
const outputPath = path.resolve("ops/apr-crm-refresh-serialization-r118-2026-09-12/manifest-resume-remaining26.json");
const validationPath = path.resolve("ops/apr-crm-refresh-serialization-r118-2026-09-12/manifest-resume-remaining26-validation.json");
const expectedSourceSha256 = "f55dcffc73c8ece46f03bd2751e463a207fd43f93e292a926d656dc928252405";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const atomicWrite = (target, contents) => {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
};

const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
if (sourceSha256 !== expectedSourceSha256) throw new Error(`source_manifest_hash_mismatch:${sourceSha256}`);
const source = JSON.parse(sourceBytes.toString("utf8"));
if (!Array.isArray(source.cases) || source.cases.length !== 27) throw new Error("source_manifest_count_invalid");
if (source.cases[0]?.customerKey !== "claudia-sellati") throw new Error("expected_terminal_sellati_not_first");

// Sellati (coorte operativa 6452) ha gia un esito terminale persistito e non viene
// ritentata. Restano esattamente le altre 26 pratiche gia autorizzate.
const cases = source.cases.slice(1).map((item, index) => ({
  ...item,
  cohort: index + 1,
  resumeGroup: item.customerKey === "monica-ambra-fioravanti"
    ? "fioravanti_504_retry"
    : Number(item.sourceOrdinal) <= 50
      ? "crm_session_expiry_replay"
      : "authorized_remaining_olteanu_plus_16",
}));
if (cases.length !== 26) throw new Error(`remaining_manifest_count_invalid:${cases.length}`);
if (new Set(cases.map((item) => item.practiceId)).size !== 26) throw new Error("remaining_manifest_practice_identity_invalid");
if (new Set(cases.map((item) => item.customerKey)).size !== 26) throw new Error("remaining_manifest_customer_identity_invalid");
if (cases.some((item) => item.customerKey === "claudia-sellati")) throw new Error("terminal_sellati_reintroduced");

const groups = [
  { id: "crm_session_expiry_replay", count: 8, sourceOrdinals: [43, 44, 45, 46, 47, 48, 49, 50] },
  { id: "authorized_remaining_olteanu_plus_16", count: 17, sourceOrdinals: [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67] },
  { id: "fioravanti_504_retry", count: 1, sourceOrdinals: [35] },
];
for (const group of groups) {
  const actual = cases.filter((item) => item.resumeGroup === group.id).length;
  if (actual !== group.count) throw new Error(`group_count_invalid:${group.id}:${actual}`);
}

const manifest = {
  ...source,
  version: "apr-workable76-r118-resume-remaining26-manifest-v1",
  authorizationId: "user-2026-09-12-resume-existing-authorized-set-after-crm-serialization-fix",
  generatedAt: new Date().toISOString(),
  selection: {
    ...source.selection,
    total: 26,
    baselineComparableCount: 25,
    reactivatedCount: 1,
    ordering: "Original ordinals 43-67 in unchanged order, then Fioravanti 504 retry; Sellati and ordinals 1-41 are not retried.",
    groups,
    sourceManifest: { path: sourcePath, sha256: sourceSha256, cases: 27 },
  },
  cases,
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
atomicWrite(outputPath, output);
const outputSha256 = sha256(output);
const validation = {
  version: "apr-resume-manifest-validation-v1",
  generatedAt: new Date().toISOString(),
  status: "PASS",
  source: { path: sourcePath, sha256: sourceSha256, count: source.cases.length },
  output: { path: outputPath, sha256: outputSha256, count: cases.length },
  preservedTerminal: [{ sourceOrdinal: 42, customerKey: "claudia-sellati", retried: false }],
  preservedCompletedSourceOrdinals: { first: 1, last: 41, retried: false },
  groups,
  safety: manifest.safety,
};
atomicWrite(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
