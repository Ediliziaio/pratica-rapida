import { createHash, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "ops/apr-workable76-r111-2026-09-11/manifest.json");
const outputPath = path.join(root, "ops/apr-workable76-r111-2026-09-11/manifest-resume-26-plus-fioravanti.json");
const validationPath = path.join(root, "ops/apr-workable76-r111-2026-09-11/manifest-resume-26-plus-fioravanti-validation.json");
const expectedSourceSha256 = "4be8287c7ec661404fc5d2b13b5e8bd1f492d876c6f6793ed3b374e8d2a54210";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function atomicWrite(target, contents) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

const sourceBytes = readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
if (sourceSha256 !== expectedSourceSha256) throw new Error(`source_manifest_hash_mismatch:${sourceSha256}`);
const source = JSON.parse(sourceBytes.toString("utf8"));
if (!Array.isArray(source.cases) || source.cases.length !== 76) throw new Error("source_manifest_count_invalid");

// Autorizzazione utente 2026-09-12: le nove pratiche 42-50 interrotte dalla
// scadenza CRM, Olteanu e le successive sedici (51-67), più Fioravanti da
// ritentare dopo il 504. Le prime 41 restano integralmente preservate.
const interruptedAndRemaining = source.cases.slice(41, 67);
const fioravanti = source.cases[34];
const cases = [...interruptedAndRemaining, fioravanti].map((item, index) => ({
  ...item,
  sourceOrdinal: item.cohort,
  cohort: index + 1,
  resumeGroup: item.customerKey === "monica-ambra-fioravanti"
    ? "fioravanti_504_retry"
    : item.cohort >= 42 && item.cohort <= 50
      ? "crm_session_expiry_replay"
      : "authorized_remaining_olteanu_plus_16",
}));
if (cases.length !== 27) throw new Error(`resume_manifest_count_invalid:${cases.length}`);
if (new Set(cases.map((item) => item.practiceId)).size !== 27) throw new Error("resume_manifest_practice_identity_invalid");
if (new Set(cases.map((item) => item.customerKey)).size !== 27) throw new Error("resume_manifest_customer_identity_invalid");
const expectedOrder = [
  ...source.cases.slice(41, 67).map((item) => item.customerKey),
  "monica-ambra-fioravanti",
];
if (cases.some((item, index) => item.customerKey !== expectedOrder[index])) throw new Error("resume_manifest_order_invalid");

const manifest = {
  ...source,
  version: "apr-workable76-r117-resume-26-plus-fioravanti-manifest-v1",
  authorizationId: "user-2026-09-12-resume-26-plus-fioravanti-after-crm-login",
  generatedAt: new Date().toISOString(),
  selection: {
    ...source.selection,
    total: 27,
    baselineComparableCount: 26,
    reactivatedCount: 1,
    ordering: "Original ordinals 42-67 in unchanged order, then Fioravanti 504 retry; ordinals 1-41 are not retried.",
    groups: [
      { id: "crm_session_expiry_replay", count: 9, sourceOrdinals: [42, 43, 44, 45, 46, 47, 48, 49, 50] },
      { id: "authorized_remaining_olteanu_plus_16", count: 17, sourceOrdinals: [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67] },
      { id: "fioravanti_504_retry", count: 1, sourceOrdinals: [35] },
    ],
    sourceManifest: { path: sourcePath, sha256: sourceSha256, cases: 76 },
  },
  cases,
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
atomicWrite(outputPath, output);
const outputSha256 = sha256(output);
atomicWrite(validationPath, `${JSON.stringify({
  version: "apr-resume-manifest-validation-v1",
  generatedAt: new Date().toISOString(),
  status: "PASS",
  source: { path: sourcePath, sha256: sourceSha256, count: source.cases.length },
  output: { path: outputPath, sha256: outputSha256, count: cases.length },
  preservedCompletedSourceOrdinals: { first: 1, last: 41, retried: false },
  groups: manifest.selection.groups,
  safety: manifest.safety,
}, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, outputSha256, count: cases.length, customerKeys: cases.map((item) => item.customerKey) }, null, 2)}\n`);
