import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const APR_LEARNING_BASELINE_VERSION = "apr-learning-baseline-v1" as const;

type Candidate = { customerKey: string; displayName: string; productModule?: "screening" | "infissi" };
type Blocker = { code: string; field?: string; reason?: string; sourceIds?: string[] };
type PreflightItem = { customerKey: string; state: string; report?: { blockers?: Blocker[] } };
type ExecutionItem = { customerKey: string; state: string; draftId?: string | null; reason?: string };

const category = (code: string) => {
  if (/ocr|image|text|paper/.test(code)) return "ocr_reading";
  if (/invoice.*missing|original_invoice|invoice_/.test(code)) return "invoice_recognition";
  if (/gross|financial|bank_transfer|expense|total/.test(code)) return "economic_reconciliation";
  if (/dimension|measure|cardinality|screening.*missing/.test(code)) return "measurements_cardinality";
  if (/tax_code|beneficiary|identity/.test(code)) return "identity_tax_code";
  if (/form/.test(code)) return "form_missing_ambiguous";
  if (/payload|mapping/.test(code)) return "enea_mapping";
  if (/completion|portal_year/.test(code)) return "date_portal_gate";
  if (/vepa|unsupported|avvolgibile_material/.test(code)) return "unsupported_or_conflicting_product";
  return "other_operator_gate";
};

function json<T>(target: string): T { return JSON.parse(readFileSync(target, "utf8")) as T; }
function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

export function buildAprLearningBaseline(rootDirectory: string) {
  const root = path.resolve(rootDirectory);
  const seed = json<{ candidates: Candidate[]; candidateFingerprint: string; createdAt: string }>(path.join(root, "cohort-seed/checkpoint.json"));
  const common = json<{ items: PreflightItem[] }>(path.join(root, "crm-local-preflight/checkpoint.json"));
  const infissi = json<{ items: PreflightItem[] }>(path.join(root, "infissi-batch-preflight/checkpoint.json"));
  const execution = json<{ items: ExecutionItem[]; status: string }>(path.join(root, "enea-draft-execution/checkpoint.json"));
  const commonByKey = new Map(common.items.map((item) => [item.customerKey, item]));
  const infissiByKey = new Map(infissi.items.map((item) => [item.customerKey, item]));
  const executionByKey = new Map(execution.items.map((item) => [item.customerKey, item]));
  const cases = seed.candidates.map((candidate) => {
    const authoritative = candidate.productModule === "infissi" ? infissiByKey.get(candidate.customerKey) : commonByKey.get(candidate.customerKey);
    const run = executionByKey.get(candidate.customerKey);
    const outcome = run?.state === "saved" ? "SAVED"
      : run?.state === "operator_intervention" ? "TECHNICAL_BLOCK"
      : authoritative?.state === "blocked_case" ? "OPERATOR_REQUIRED"
      : authoritative?.state === "ready_local_plan" ? "READY_NOT_EXECUTED"
      : "INCONSISTENT";
    const blockers = authoritative?.report?.blockers ?? [];
    return { customerKey: candidate.customerKey, displayName: candidate.displayName, productModule: candidate.productModule ?? "screening", outcome,
      draftId: run?.draftId ?? null, technicalReason: run?.state === "operator_intervention" ? run.reason ?? null : null,
      blockers: blockers.map((blocker) => ({ ...blocker, category: category(blocker.code) })) };
  });
  const categories = new Map<string, Set<string>>();
  for (const item of cases) for (const blocker of item.blockers) {
    const keys = categories.get(blocker.category) ?? new Set<string>(); keys.add(item.customerKey); categories.set(blocker.category, keys);
  }
  const outcomeCounts = Object.fromEntries(["SAVED", "TECHNICAL_BLOCK", "OPERATOR_REQUIRED", "READY_NOT_EXECUTED", "INCONSISTENT"].map((outcome) => [outcome, cases.filter((item) => item.outcome === outcome).length]));
  const substantive = { sourceCandidateFingerprint: seed.candidateFingerprint, sourceCreatedAt: seed.createdAt, outcomeCounts, cases,
    rootCauseGroups: [...categories].map(([name, keys]) => ({ name, affectedCases: keys.size, customerKeys: [...keys].sort() })).sort((a, b) => b.affectedCases - a.affectedCases || a.name.localeCompare(b.name)) };
  return { version: APR_LEARNING_BASELINE_VERSION, fingerprint: createHash("sha256").update(JSON.stringify(substantive)).digest("hex"), ...substantive };
}

export class PersistentAprLearningBaseline {
  readonly file: string;
  constructor(readonly rootDirectory: string) { this.file = path.join(path.resolve(rootDirectory), "learning-baseline", "checkpoint.json"); }
  freeze() {
    const baseline = buildAprLearningBaseline(this.rootDirectory);
    if (existsSync(this.file)) {
      const current = json<typeof baseline>(this.file);
      if (current.fingerprint !== baseline.fingerprint) throw new Error("apr_learning_baseline_immutable_mismatch");
      return current;
    }
    atomicWrite(this.file, `${JSON.stringify({ ...baseline, frozenAt: new Date().toISOString() }, null, 2)}\n`);
    return json<typeof baseline>(this.file);
  }
}
