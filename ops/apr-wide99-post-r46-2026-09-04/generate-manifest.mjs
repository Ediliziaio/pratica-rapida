import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const sourcePath = resolve(repository, "ops/apr-wide100-province-lineage-2026-09-02/manifest.json");
const replayPath = resolve(repository, "ops/apr-reliability-gap-audit-2026-09-03/fresh-original-replay-r40c-products.json");
const destinationPath = resolve(here, "manifest.json");

const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes);
const replay = JSON.parse(readFileSync(replayPath));
const excludedPracticeId = "ae88aed9-0b83-42c7-87fb-a03c76a46113";
const cases = source.cases
  .filter((entry) => entry.practiceId !== excludedPracticeId)
  .map((entry, index) => ({ ...entry, cohort: index + 1 }));

const replayByPractice = new Map(replay.cases.map((entry) => [entry.practiceId, entry]));
const ready = cases.filter((entry) => replayByPractice.get(entry.practiceId)?.freshOutcome === "READY_LOCAL");
const operator = cases.filter((entry) => replayByPractice.get(entry.practiceId)?.freshOutcome === "OPERATOR_REQUIRED_LOCAL");
if (cases.length !== 99 || ready.length !== 28 || operator.length !== 71) {
  throw new Error(`wide99_selection_invalid:${cases.length}:${ready.length}:${operator.length}`);
}
if (replay.sourceIntegrity?.hashMismatches !== 0 || replay.summary?.casesWithAnalysisFailure !== 0) {
  throw new Error("wide99_replay_source_integrity_invalid");
}

const complexity = Object.fromEntries(["simple", "medium", "complex"].map((key) => [key, cases.filter((entry) => entry.complexity === key).length]));
const module = Object.fromEntries(["infissi", "screening"].map((key) => [key, cases.filter((entry) => entry.module === key).length]));
const stage = Object.fromEntries(["archiviate", "recensione"].map((key) => [key, cases.filter((entry) => entry.stage === key).length]));
const practiceIdsSha256 = createHash("sha256").update(cases.map((entry) => entry.practiceId).join("\n")).digest("hex");

const manifest = {
  ...source,
  version: "apr-wide99-post-r46-manifest-v1",
  authorizationId: "user-2026-09-04-wide100-minus-angelina-post-corrections",
  authorizedAt: "2026-09-04T00:00:00.000Z",
  selection: {
    ...source.selection,
    version: "apr-wide99-post-r46-selection-evidence-v1",
    targetCount: 99,
    selectedCount: 99,
    total: 99,
    selectionMethod: "intero manifest wide100 congelato, senza ricampionamento; esclusa soltanto Angelina Stricelli per disposizione esplicita non propagabile dell'utente",
    selectedDistribution: { stage, module, complexity },
    selectedPracticeIdsSha256: practiceIdsSha256,
    preflightReference: {
      path: "ops/apr-reliability-gap-audit-2026-09-03/fresh-original-replay-r40c-products.json",
      sourceIntegrity: replay.sourceIntegrity,
      readyLocalBeforeDisposition: replay.summary.freshReady,
      expectedOperationalCandidates: ready.length,
      expectedFailClosedCases: operator.length,
      excludedComplexOperatorCase: "angelina-stricelli"
    }
  },
  cases
};

writeFileSync(destinationPath, `${JSON.stringify(manifest, null, 2)}\n`);
const manifestSha256 = createHash("sha256").update(readFileSync(destinationPath)).digest("hex");
writeFileSync(resolve(here, "manifest.sha256"), `${manifestSha256}  manifest.json\n`);
process.stdout.write(`${JSON.stringify({ cases: cases.length, ready: ready.length, operator: operator.length, manifestSha256, practiceIdsSha256, stage, module, complexity })}\n`);
