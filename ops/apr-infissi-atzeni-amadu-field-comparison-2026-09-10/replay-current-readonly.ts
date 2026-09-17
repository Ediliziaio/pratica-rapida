import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";

const OUTPUT_ROOT = path.resolve("ops/apr-infissi-atzeni-amadu-field-comparison-2026-09-10");
const REPLAY_ROOT = path.join(OUTPUT_ROOT, "local-replay-v158b");
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

const cases = [
  {
    customerKey: "giovanna-atzeni",
    sourceRoot: "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5342-global-controller-giovanna-atzeni",
  },
  {
    customerKey: "giovanni-amadu",
    sourceRoot: "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts/apr-pilot-5354-global-controller-giovanni-amadu",
  },
] as const;

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

const result = [];
for (const entry of cases) {
  const targetRoot = path.join(REPLAY_ROOT, entry.customerKey);
  if (existsSync(targetRoot)) throw new Error(`readonly_replay_target_already_exists:${targetRoot}`);
  mkdirSync(path.join(targetRoot, "crm-acquisition"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(targetRoot, "crm-document-analysis"), { recursive: true, mode: 0o700 });
  copyFileSync(path.join(entry.sourceRoot, "crm-acquisition", "checkpoint.json"), path.join(targetRoot, "crm-acquisition", "checkpoint.json"));
  copyFileSync(path.join(entry.sourceRoot, "crm-document-analysis", "checkpoint.json"), path.join(targetRoot, "crm-document-analysis", "checkpoint.json"));

  const acquisition = JSON.parse(readFileSync(path.join(targetRoot, "crm-acquisition", "checkpoint.json"), "utf8")) as {
    items: Array<{ state: string; customerKey: string }>;
  };
  const analysis = new PersistentAprCrmDocumentAnalysis(targetRoot);
  const analysisState = analysis.snapshot(new Date("2026-09-10T10:00:00+02:00"));
  if (analysisState.status !== "completed" || !analysisState.sourceFingerprint) throw new Error(`analysis_not_terminal:${entry.customerKey}`);
  const acquired = acquisition.items.filter((item) => item.state === "acquired");
  if (acquired.length !== 1 || acquired[0]?.customerKey !== entry.customerKey) throw new Error(`acquisition_case_set_invalid:${entry.customerKey}`);

  const commonStore = new PersistentAprCrmLocalPreflight(targetRoot, analysis);
  commonStore.prepare(acquired as never, analysisState.sourceFingerprint, new Date("2026-09-10T10:00:01+02:00"));
  const common = commonStore.runToCompletion(new Date("2026-09-10T10:00:02+02:00"));
  const infissiStore = new PersistentAprInfissiBatchPreflight(targetRoot);
  let infissi = infissiStore.initialize(new Date("2026-09-10T10:01:00+02:00"));
  for (let index = 0; index < 20 && infissi.status !== "completed"; index += 1) {
    infissi = infissiStore.tick(new Date(Date.parse("2026-09-10T08:01:00.000Z") + index * 1_000));
  }
  if (infissi.status !== "completed") throw new Error(`infissi_not_terminal:${entry.customerKey}`);
  const commonItem = common.items.find((item) => item.customerKey === entry.customerKey);
  const infissiItem = infissi.items.find((item) => item.customerKey === entry.customerKey);
  if (!commonItem?.report || !infissiItem?.report) throw new Error(`replay_report_missing:${entry.customerKey}`);

  const commonPath = path.join(targetRoot, "crm-local-preflight", "checkpoint.json");
  const infissiPath = path.join(targetRoot, "infissi-batch-preflight", "checkpoint.json");
  result.push({
    customerKey: entry.customerKey,
    sourceRoot: entry.sourceRoot,
    replayRoot: targetRoot,
    commonCheckpoint: { path: commonPath, sha256: sha256(readFileSync(commonPath)) },
    infissiCheckpoint: { path: infissiPath, sha256: sha256(readFileSync(infissiPath)) },
    common: { state: commonItem.state, report: commonItem.report },
    infissi: { state: infissiItem.state, report: infissiItem.report },
  });
}

const output = {
  version: "apr-atzeni-amadu-current-readonly-replay-v1",
  generatedAt: new Date().toISOString(),
  safety: {
    crmWrites: false,
    eneaOpened: false,
    eneaWrites: false,
    preview: false,
    submit: false,
    communications: false,
  },
  cases: result,
};
atomicWrite(path.join(OUTPUT_ROOT, "current-readonly-replay.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: path.join(OUTPUT_ROOT, "current-readonly-replay.json"), cases: result.map((item) => ({ customerKey: item.customerKey, common: item.common.state, infissi: item.infissi.state, closureMode: item.infissi.report.shadingClosureAllocation?.mode, commonBlockers: item.common.report.blockers.map((blocker) => blocker.code), infissiBlockers: item.infissi.report.blockers.map((blocker) => blocker.code) })) }, null, 2)}\n`);
