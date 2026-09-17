#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const sourceRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const runtimeRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const seed = "apr-wide150-r126-20260915-selection-v1";
const target = 148;
const allowedStages = ["pronte_da_fare", "recensione", "archiviate"] as const;
const stageNames: Record<string, string> = {
  pronte_da_fare: "Pronte da fare",
  recensione: "Recensione",
  archiviate: "Archiviate",
};

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value: string) => normalize(value).replace(/ /g, "-");
const values = (value: unknown) => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
const companyNames = (value: unknown) => values(value).map((entry) => normalize((entry as { ragione_sociale?: unknown }).ragione_sociale)).filter(Boolean);
const stages = (value: unknown) => [...new Set(values(value)
  .map((entry) => normalize((entry as { stage_type?: unknown }).stage_type).replace(/ /g, "_"))
  .filter((stage) => allowedStages.includes(stage as typeof allowedStages[number])))];
const moduleOf = (value: unknown) => {
  const product = normalize(value);
  if (/(^| )(infiss|serrament|finestr)/.test(product)) return "infissi";
  if (/(^| )(schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil|bioclim)/.test(product)) return "screening";
  return null;
};
const manuscriptSupplier = (names: string[]) => {
  const joined = names.join(" | ");
  if (/linea sole.*potito|potito.*linea sole/.test(joined)) return "Linea Sole Potito";
  if (/ideal syste?m|ideal sistem/.test(joined)) return "Ideal System";
  if (/(^|\b)(rm legno|erre emme|r m legno|rm)(\b|$)/.test(joined)) return "RM / Erre Emme";
  return null;
};
const permanentExclusion = (displayName: string, suppliers: string[]) => {
  const customer = normalize(displayName);
  const joined = suppliers.join(" | ");
  if (customer === "beatrice ciotta") return "permanent_customer_exclusion_beatrice_ciotta";
  if (customer === "samuele beretta" || /overthemol/.test(joined)) return "permanent_internal_exclusion_overthemol";
  if (/\bvans\b/.test(joined)) return "permanent_supplier_exclusion_vans";
  return null;
};

function collectPracticeIds(value: unknown, output: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectPracticeIds(item, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "practiceId" && typeof child === "string" && /^[a-f0-9-]{36}$/i.test(child)) output.add(child.toLowerCase());
    else collectPracticeIds(child, output);
  }
}
function readHistory() {
  const ids = new Set<string>();
  const evidence: Array<{ path: string; sha256: string }> = [];
  const runsRoot = path.join(runtimeRoot, "runs");
  for (const entry of existsSync(runsRoot) ? readdirSync(runsRoot, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    for (const name of ["checkpoint.json", "report.json"]) {
      const file = path.join(runsRoot, entry.name, name);
      if (!existsSync(file)) continue;
      try {
        const bytes = readFileSync(file);
        collectPracticeIds(JSON.parse(bytes.toString("utf8")), ids);
        evidence.push({ path: file, sha256: sha256(bytes) });
      } catch { /* artefatti storici incompleti non diventano prova */ }
    }
  }
  const cohortsRoot = path.join(runtimeRoot, "cohorts");
  for (const entry of existsSync(cohortsRoot) ? readdirSync(cohortsRoot, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    for (const relative of ["cohort-seed/checkpoint.json", "crm-acquisition/checkpoint.json", "crm-local-preflight/checkpoint.json"]) {
      const file = path.join(cohortsRoot, entry.name, relative);
      if (!existsSync(file)) continue;
      try { collectPracticeIds(JSON.parse(readFileSync(file, "utf8")), ids); } catch { /* fail closed through run evidence */ }
    }
  }
  return { ids, evidenceFileCount: evidence.length, evidenceFingerprint: sha256(evidence.map((item) => `${item.path}:${item.sha256}`).sort().join("\n")) };
}

interface CrmRow {
  id?: unknown;
  cliente_nome?: unknown;
  cliente_cognome?: unknown;
  prodotto_installato?: unknown;
  fornitore?: unknown;
  updated_at?: unknown;
  pipeline_stages?: unknown;
  companies?: unknown;
}

const auth = new PersistentAprCrmAuth(path.join(runtimeRoot, "state"));
await auth.maintainSession();
const getRows = async (stageFilter: string | null, order: string) => {
  const params = new URLSearchParams({
    select: "id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,updated_at,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)",
    brand: "eq.enea",
    order,
    limit: "1000",
  });
  if (stageFilter) params.set("pipeline_stages.stage_type", stageFilter);
  const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
  const body = await response.text();
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`crm_readonly_selection_http_${response.status}:${sha256(body)}`);
  const parsed = JSON.parse(body) as CrmRow[];
  if (!Array.isArray(parsed)) throw new Error("crm_readonly_selection_invalid");
  return { rows: parsed, sha256: sha256(body) };
};

const combined = await getRows("in.(pronte_da_fare,recensione,archiviate)", "updated_at.asc");
const separate = Object.fromEntries(await Promise.all(allowedStages.map(async (stage) => [stage, await getRows(`eq.${stage}`, "id.asc")] as const)));
const unfiltered = await getRows(null, "id.asc");

const uniqueRows = (rows: CrmRow[]) => {
  const map = new Map<string, CrmRow>();
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id.toLowerCase() : "";
    if (/^[a-f0-9-]{36}$/.test(id)) map.set(id, row);
  }
  return [...map.values()];
};
const countStages = (rows: CrmRow[]) => Object.fromEntries(allowedStages.map((stage) => [stage, uniqueRows(rows).filter((row) => stages(row.pipeline_stages).includes(stage)).length]));
const combinedCounts = countStages(combined.rows);
const separateCounts = Object.fromEntries(allowedStages.map((stage) => [stage, uniqueRows(separate[stage].rows).length]));
const unfilteredCounts = countStages(unfiltered.rows);
if (JSON.stringify(combinedCounts) !== JSON.stringify(separateCounts) || JSON.stringify(combinedCounts) !== JSON.stringify(unfilteredCounts)) {
  throw new Error(`crm_stage_count_inconsistent:${JSON.stringify({ combinedCounts, separateCounts, unfilteredCounts })}`);
}

const history = readHistory();
const excluded: Array<{ practiceId: string; displayName: string; reason: string }> = [];
const candidates = uniqueRows(combined.rows).flatMap((row) => {
  const practiceId = String(row.id ?? "").toLowerCase();
  const displayName = `${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`.trim().replace(/\s+/g, " ");
  const rowStages = stages(row.pipeline_stages);
  const module = moduleOf(row.prodotto_installato);
  const supplierNames = [normalize(row.fornitore), ...companyNames(row.companies)].filter(Boolean);
  const manualSupplier = manuscriptSupplier(supplierNames);
  const exclusion = permanentExclusion(displayName, supplierNames);
  const reason = !displayName ? "missing_customer_name"
    : rowStages.length !== 1 ? `stage_cardinality_${rowStages.length}`
      : !module ? "unsupported_or_unclassified_product"
        : exclusion;
  if (reason) {
    excluded.push({ practiceId, displayName, reason });
    return [];
  }
  return [{
    practiceId,
    customerKey: slug(displayName),
    displayName,
    stage: rowStages[0],
    stageName: stageNames[rowStages[0]],
    module,
    productEvidence: String(row.prodotto_installato ?? "").trim(),
    reseller: supplierNames.join(" | "),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    manuscriptSupplier: manualSupplier,
    neverWorked: !history.ids.has(practiceId),
  }];
});

const rank = (scope: string, practiceId: string) => sha256(`${seed}:${scope}:${practiceId}`);
const neverWorked = candidates.filter((item) => item.neverWorked).sort((a, b) => rank("new", a.practiceId).localeCompare(rank("new", b.practiceId)));
const baseline = JSON.parse(readFileSync(path.join(sourceRoot, "ops/apr-workable83-operator-responses-payload-form-r125-2026-09-14/manifest.json"), "utf8")) as { cases: Array<{ practiceId: string; customerKey?: string; displayName?: string }> };
const baselineIds = new Set(baseline.cases.map((item) => item.practiceId.toLowerCase()));
const alreadyWorkedPool = candidates.filter((item) => !item.neverWorked && baselineIds.has(item.practiceId)).sort((a, b) => rank("worked", a.practiceId).localeCompare(rank("worked", b.practiceId)));
const eligibleIds = new Set(candidates.map((item) => item.practiceId));
const baselineUnavailable = baseline.cases.filter((item) => !eligibleIds.has(item.practiceId.toLowerCase())).map((item) => {
  const excludedItem = excluded.find((candidate) => candidate.practiceId === item.practiceId.toLowerCase());
  const current = uniqueRows(combined.rows).find((row) => String(row.id ?? "").toLowerCase() === item.practiceId.toLowerCase());
  return {
    practiceId: item.practiceId,
    customerKey: item.customerKey ?? null,
    displayName: item.displayName ?? excludedItem?.displayName ?? null,
    currentStages: current ? stages(current.pipeline_stages) : [],
    reason: excludedItem?.reason ?? "not_present_in_selected_stages",
  };
});
const selectedNew = neverWorked.slice(0, target);
const selectedWorked = alreadyWorkedPool.slice(0, Math.max(0, target - selectedNew.length));
const selected = [...selectedNew, ...selectedWorked];
if (selected.length !== target) {
  const selectedNewStandard = selectedNew.filter((item) => !item.manuscriptSupplier).length;
  const selectedNewManuscript = selectedNew.filter((item) => Boolean(item.manuscriptSupplier)).length;
  process.stdout.write(`${JSON.stringify({
    status: "insufficient_candidates",
    target,
    maximumSelectable: selected.length,
    missing: target - selected.length,
    stageCounts: { combined: combinedCounts, separate: separateCounts, unfiltered: unfilteredCounts },
    availableStageTotal: Object.values(combinedCounts).reduce((sum, count) => sum + count, 0),
    eligible: candidates.length,
    neverWorked: neverWorked.length,
    neverWorkedGroups: { nuova_standard: selectedNewStandard, nuova_manoscritto: selectedNewManuscript },
    alreadyWorkedFromR125R126: alreadyWorkedPool.length,
    baselineUnavailable,
    excludedCount: excluded.length,
    excludedByReason: Object.fromEntries([...new Set(excluded.map((item) => item.reason))].sort().map((reason) => [reason, excluded.filter((item) => item.reason === reason).length])),
    seed,
    seedSha256: sha256(seed),
    crmEvidence: {
      combinedResponseSha256: combined.sha256,
      separateResponseSha256: Object.fromEntries(allowedStages.map((stage) => [stage, separate[stage].sha256])),
      unfilteredResponseSha256: unfiltered.sha256,
      threeWayCountsConcordant: true,
    },
    historyDistinctPracticeIds: history.ids.size,
    historyEvidenceFileCount: history.evidenceFileCount,
    historyEvidenceFingerprint: history.evidenceFingerprint,
  }, null, 2)}\n`);
  process.exitCode = 2;
  await new Promise<void>((resolve) => process.stdout.write("", resolve));
  process.exit();
}
if (new Set(selected.map((item) => item.practiceId)).size !== target) throw new Error("apr_wide150_duplicate_practice_id");
if (new Set(selected.map((item) => item.customerKey)).size !== target) throw new Error("apr_wide150_duplicate_customer_key");

const cases = selected.map((item) => ({
  practiceId: item.practiceId,
  customerKey: item.customerKey,
  displayName: item.displayName,
  stage: item.stage,
  stageName: item.stageName,
  module: item.module,
  productEvidence: item.productEvidence,
  reseller: item.reseller,
  historicalRetest: !item.neverWorked,
  reacquireBeforeReplay: true,
  expectedRouting: item.manuscriptSupplier ? "operator_required_manual_supplier" : "standard",
  group: item.neverWorked ? (item.manuscriptSupplier ? "nuova_manoscritto" : "nuova_standard") : "gia_lavorata",
}));
const groupCounts = Object.fromEntries(["nuova_standard", "nuova_manoscritto", "gia_lavorata"].map((group) => [group, cases.filter((item) => item.group === group).length]));
const stageTotal = Object.values(combinedCounts).reduce((sum, count) => sum + count, 0);
const manifest = {
  version: "apr-wide148-r126-manifest-v1",
  authorizationId: "user-2026-09-15-wide148-r126-fresh-draft-v1",
  authorizedAt: new Date().toISOString(),
  mode: "real_enea_draft_only",
  selection: {
    total: target,
    allowedStages: [...allowedStages],
    excludedCustomerKeys: [],
    randomSeed: seed,
    randomSeedSha256: sha256(seed),
    ordering: "Prima tutte le mai lavorate in ordine pseudo-casuale deterministico; eventuale completamento pseudo-casuale fra le 83 di r125/r126.",
    stageCounts: combinedCounts,
    availableStageTotal: stageTotal,
    neverWorkedEligible: neverWorked.length,
    alreadyWorkedBaselineEligible: alreadyWorkedPool.length,
    groups: Object.entries(groupCounts).map(([id, count]) => ({ id, count })),
    excludedFromSelection: excluded,
    history: { distinctPracticeIds: history.ids.size, evidenceFileCount: history.evidenceFileCount, evidenceFingerprint: history.evidenceFingerprint },
    crmEvidence: {
      combinedResponseSha256: combined.sha256,
      separateResponseSha256: Object.fromEntries(allowedStages.map((stage) => [stage, separate[stage].sha256])),
      unfilteredResponseSha256: unfiltered.sha256,
      threeWayCountsConcordant: true,
    },
  },
  safety: {
    draftOnly: true,
    previewAllowed: false,
    submitAllowed: false,
    communicationsAllowed: false,
    priorDraftPolicy: "fresh_generation_only",
  },
  cases,
};
const evidence = {
  version: "apr-wide148-r126-selection-evidence-v1",
  observedAt: new Date().toISOString(),
  status: "selected",
  crmReadOnly: true,
  mutationAllowed: false,
  stageCounts: { combined: combinedCounts, separate: separateCounts, unfiltered: unfilteredCounts, total: stageTotal },
  candidateCounts: { eligible: candidates.length, neverWorked: neverWorked.length, alreadyWorkedFromR125R126: alreadyWorkedPool.length, excluded: excluded.length },
  selectedCounts: { total: cases.length, ...groupCounts },
  seed,
  seedSha256: sha256(seed),
  historyDistinctPracticeIds: history.ids.size,
  historyEvidenceFileCount: history.evidenceFileCount,
  historyEvidenceFingerprint: history.evidenceFingerprint,
  crmEvidence: manifest.selection.crmEvidence,
  selectedPracticeIdsSha256: sha256(cases.map((item) => item.practiceId).join("\n")),
};
process.stdout.write(`${JSON.stringify({ manifest, evidence }, null, 2)}\n`);
