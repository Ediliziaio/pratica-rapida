import crypto from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { aprAutomationExclusion } from "../../scripts/enea-shadow-runner/aprFutureTestExclusions";

type JsonObject = Record<string, unknown>;
type PracticeEvidence = {
  practiceId: string;
  customerKey: string;
  displayName: string;
  supplier: string;
  family: string;
  localDossierPaths: string[];
  cohortRefs: Array<{ cohort: string; checkpointPath: string; state: string | null }>;
  runRefs: Array<{ run: string; reportPath: string; state: string | null }>;
};

const ROOT = path.resolve("ops/apr-saved-field-comparison-and-exclusions-2026-09-10");
const RUNTIME = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const COHORTS = path.join(RUNTIME, "cohorts");
const RUNS = path.join(RUNTIME, "runs");
const AUTH_STATE = path.join(RUNTIME, "state");
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: Uint8Array | string) => crypto.createHash("sha256").update(value).digest("hex");

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function walk(root: string, predicate: (file: string) => boolean, output: string[] = []): string[] {
  if (!existsSync(root)) return output;
  for (const name of readdirSync(root)) {
    const file = path.join(root, name);
    const stat = statSync(file);
    if (stat.isDirectory()) walk(file, predicate, output);
    else if (predicate(file)) output.push(file);
  }
  return output;
}

function readJson(file: string): unknown {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function customerKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const dossiers = walk(COHORTS, (file) => /\/dossiers\/[^/]+\.json$/u.test(file));
const byPracticeId = new Map<string, PracticeEvidence>();
const byCustomerKey = new Map<string, PracticeEvidence>();
for (const dossierPath of dossiers) {
  const dossier = object(readJson(dossierPath));
  const row = object(dossier?.row);
  if (!row) continue;
  const id = text(row.id);
  if (!/^[a-f0-9-]{36}$/iu.test(id)) continue;
  const displayName = `${text(row.cliente_nome)} ${text(row.cliente_cognome)}`.trim();
  const exclusion = aprAutomationExclusion({
    customerKey: customerKey(displayName),
    displayName,
    fornitore: row.fornitore,
    companies: row.companies,
  });
  if (!exclusion || !["erre-emme-rm-legno", "linea-sole-potito", "ideal-sistem"].includes(exclusion.canonicalKey)) continue;
  const existing = byPracticeId.get(id) ?? {
    practiceId: id,
    customerKey: customerKey(displayName),
    displayName,
    supplier: exclusion.sourceValue,
    family: exclusion.canonicalKey,
    localDossierPaths: [],
    cohortRefs: [],
    runRefs: [],
  };
  if (!existing.localDossierPaths.includes(dossierPath)) existing.localDossierPaths.push(dossierPath);
  byPracticeId.set(id, existing);
  byCustomerKey.set(existing.customerKey, existing);
}

const uniqueCohortPractices = new Map<string, { practiceId: string; customerKey: string; displayName: string }>();
const cohortCheckpoints = readdirSync(COHORTS)
  .map((cohort) => path.join(COHORTS, cohort, "crm-local-preflight", "checkpoint.json"))
  .filter((file) => existsSync(file));
for (const checkpointPath of cohortCheckpoints) {
  const checkpoint = object(readJson(checkpointPath));
  const items = Array.isArray(checkpoint?.items) ? checkpoint.items.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
  const cohort = path.basename(path.dirname(path.dirname(checkpointPath)));
  for (const item of items) {
    const id = text(item.practiceId);
    const key = text(item.customerKey) || customerKey(text(item.displayName));
    const identity = id || `key:${key}`;
    if (!identity || identity === "key:") continue;
    uniqueCohortPractices.set(identity, { practiceId: id, customerKey: key, displayName: text(item.displayName) });
    const evidence = (id && byPracticeId.get(id)) || byCustomerKey.get(key);
    if (evidence && !evidence.cohortRefs.some((entry) => entry.cohort === cohort)) evidence.cohortRefs.push({ cohort, checkpointPath, state: text(item.state) || null });
  }
}

const reports = readdirSync(RUNS).flatMap((run) => {
  const reportPath = path.join(RUNS, run, "report.json");
  return existsSync(reportPath) ? [{ run, reportPath }] : [];
});
const runRows: Array<{ run: string; reportPath: string; before: number; excluded: number; after: number; excludedByFamily: Record<string, number>; excludedPractices: string[] }> = [];
const uniqueReported = new Map<string, { practiceId: string; customerKey: string; displayName: string }>();
for (const { run, reportPath } of reports) {
  const report = object(readJson(reportPath));
  const cases = Array.isArray(report?.cases) ? report.cases.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
  const unique = new Map<string, JsonObject>();
  for (const item of cases) {
    const id = text(item.practiceId);
    const key = text(item.customerKey) || customerKey(text(item.displayName));
    const identity = id || key;
    if (!identity || unique.has(identity)) continue;
    unique.set(identity, item);
    uniqueReported.set(id || `key:${key}`, { practiceId: id, customerKey: key, displayName: text(item.displayName) });
    const evidence = (id && byPracticeId.get(id)) || byCustomerKey.get(key);
    if (evidence) evidence.runRefs.push({ run, reportPath, state: text(item.state) || null });
  }
  const excludedPractices = [...unique.values()].flatMap((item) => {
    const evidence = (text(item.practiceId) && byPracticeId.get(text(item.practiceId))) || byCustomerKey.get(text(item.customerKey));
    return evidence ? [evidence] : [];
  });
  const excludedByFamily = Object.fromEntries(["linea-sole-potito", "erre-emme-rm-legno", "ideal-sistem"].map((family) => [family, excludedPractices.filter((item) => item.family === family).length]));
  runRows.push({ run, reportPath, before: unique.size, excluded: excludedPractices.length, after: unique.size - excludedPractices.length, excludedByFamily, excludedPractices: excludedPractices.map((item) => item.displayName).sort((a, b) => a.localeCompare(b, "it")) });
}

const candidates = [...byPracticeId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName, "it"));
const auth = new PersistentAprCrmAuth(AUTH_STATE);
await auth.maintainSession();
const liveRows: JsonObject[] = [];
for (let index = 0; index < candidates.length; index += 20) {
  const ids = candidates.slice(index, index + 20).map((item) => item.practiceId);
  const params = new URLSearchParams({
    select: "id,cliente_nome,cliente_cognome,fornitore,companies:reseller_id(ragione_sociale)",
    or: `(${ids.map((id) => `id.eq.${id}`).join(",")})`,
    limit: String(ids.length),
  });
  const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
  if (!response.ok) throw new Error(`crm_live_exclusion_audit_http_${response.status}`);
  const rows = await response.json() as unknown;
  if (!Array.isArray(rows)) throw new Error("crm_live_exclusion_audit_shape_invalid");
  liveRows.push(...rows.map(object).filter((item): item is JsonObject => Boolean(item)));
}

const practices = candidates.map((candidate) => {
  const live = liveRows.find((row) => row.id === candidate.practiceId);
  const liveDisplayName = live ? `${text(live.cliente_nome)} ${text(live.cliente_cognome)}`.trim() : "";
  const liveExclusion = live ? aprAutomationExclusion({ customerKey: customerKey(liveDisplayName), displayName: liveDisplayName, fornitore: live.fornitore, companies: live.companies }) : null;
  const localSupplierVerified = candidate.localDossierPaths.length > 0;
  const batchMembershipVerified = candidate.runRefs.length > 0 || candidate.cohortRefs.length > 0;
  const liveCrmVerified = Boolean(liveExclusion && liveExclusion.canonicalKey === candidate.family);
  return {
    ...candidate,
    localDossierPaths: candidate.localDossierPaths.sort(),
    cohortRefs: candidate.cohortRefs.sort((left, right) => left.cohort.localeCompare(right.cohort)),
    runRefs: candidate.runRefs.sort((left, right) => left.run.localeCompare(right.run)),
    liveCrm: live ? {
      displayName: liveDisplayName,
      supplier: text(live.fornitore) || text(object(live.companies)?.ragione_sociale),
      family: liveExclusion?.canonicalKey ?? null,
      ruleId: liveExclusion?.ruleId ?? null,
      method: "GET",
    } : null,
    tripleVerification: {
      localDossierVerified: localSupplierVerified,
      reportedBatchMembershipVerified: batchMembershipVerified,
      liveCrmGetVerified: liveCrmVerified,
      concordant: localSupplierVerified && batchMembershipVerified && liveCrmVerified,
    },
  };
});
const nonConcordant = practices.filter((item) => !item.tripleVerification.concordant);
const reportedExcluded = practices.filter((item) => item.tripleVerification.concordant);
const excludedWithRunReport = reportedExcluded.filter((item) => item.runRefs.length > 0);
const reportedUniqueExcluded = uniqueReported.size
  ? [...uniqueReported.values()].filter((item) => (item.practiceId && byPracticeId.has(item.practiceId)) || byCustomerKey.has(item.customerKey)).length
  : 0;
const affectedRuns = runRows.filter((item) => item.excluded > 0).sort((left, right) => left.run.localeCompare(right.run));
const output = {
  version: "apr-three-supplier-exclusion-denominator-audit-v1",
  generatedAt: new Date().toISOString(),
  scope: "All persisted APR run reports, deduplicated by practice within each run. Families: Linea Sole Potito, Erre Emme/RM Legno, Ideal Sistem.",
  safety: { crmMethod: "GET", crmWrites: false, eneaOpened: false, eneaWrites: false },
  permanentRuleIds: ["user-2026-08-18-future-test-exclusions", "user-2026-09-10-ideal-sistem-manual-exclusion-v1"],
  overallReportedBatches: {
    runReportCount: reports.length,
    uniquePracticesBeforeExclusions: uniqueReported.size,
    excludedUniquePractices: reportedUniqueExcluded,
    workableDenominatorAfterExclusions: uniqueReported.size - reportedUniqueExcluded,
    excludedByFamily: Object.fromEntries(["linea-sole-potito", "erre-emme-rm-legno", "ideal-sistem"].map((family) => [family, excludedWithRunReport.filter((item) => item.family === family).length])),
  },
  overallPersistedCohortBatches: {
    cohortCheckpointCount: cohortCheckpoints.length,
    uniquePracticesBeforeExclusions: uniqueCohortPractices.size,
    excludedUniquePractices: reportedExcluded.length,
    workableDenominatorAfterExclusions: uniqueCohortPractices.size - reportedExcluded.length,
    excludedByFamily: Object.fromEntries(["linea-sole-potito", "erre-emme-rm-legno", "ideal-sistem"].map((family) => [family, reportedExcluded.filter((item) => item.family === family).length])),
  },
  currentKnownExcludedPractices: { total: reportedExcluded.length, nonConcordant: nonConcordant.length, practices },
  affectedRuns,
};
const outputPath = path.join(ROOT, "exclusion-denominator-audit.json");
atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
atomicWrite(path.join(ROOT, "exclusion-denominator-audit.sha256"), `${sha256(readFileSync(outputPath))}  exclusion-denominator-audit.json\n`);
if (nonConcordant.length) throw new Error(`exclusion_denominator_triple_verification_inconsistent:${nonConcordant.map((item) => item.displayName).join(",")}`);
process.stdout.write(`${JSON.stringify({ outputPath, overall: output.overallReportedBatches, affectedRunCount: affectedRuns.length, excludedNames: reportedExcluded.map((item) => ({ displayName: item.displayName, family: item.family })) }, null, 2)}\n`);
