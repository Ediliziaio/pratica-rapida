import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const authRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const historyRoots = [
  "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts",
  "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/runs",
];

const auth = new PersistentAprCrmAuth(authRoot);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,updated_at,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)",
  brand: "eq.enea",
  archived_at: "is.null",
  "pipeline_stages.stage_type": "in.(pronte_da_fare,gestionale,recensione)",
  order: "updated_at.desc",
  limit: "1000",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
const raw = await response.text();
if (!response.ok) throw new Error(`crm_http_${response.status}`);
const rows = JSON.parse(raw) as Array<Record<string, unknown>>;

const historyRaw = execFileSync("rg", [
  "-o", "--no-filename", "\"practiceId\"\\s*:\\s*\"[0-9a-fA-F-]{36}\"", ...historyRoots,
], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const tested = new Set([...historyRaw.matchAll(/[0-9a-fA-F-]{36}/g)].map((match) => match[0].toLowerCase()));
const norm = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stageTypes = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [])
  .map((entry) => norm((entry as { stage_type?: unknown }).stage_type).replace(/ /g, "_"));
const companyNames = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [])
  .map((entry) => norm((entry as { ragione_sociale?: unknown }).ragione_sociale)).filter(Boolean);
const classify = (value: unknown) => {
  const normalized = norm(value);
  if (/(^| )(infiss|serrament|finestr)/.test(normalized)) return "infissi";
  if (/(^| )(schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/.test(normalized)) return "screening";
  return null;
};
const isFake = (name: string) => /(^| )(test|prova|claude|hhhhh)( |$)/.test(norm(name));
const vendorNames = (row: Record<string, unknown>) => [norm(row.fornitore), ...companyNames(row.companies)];
const isExcludedVendor = (row: Record<string, unknown>) => vendorNames(row).some((value) => /(erre emme|rm legno)/.test(value));
const isLineaSole = (row: Record<string, unknown>) => vendorNames(row).some((value) => /linea sole potito/.test(value));

const eligible = rows.map((row) => ({
  row,
  id: String(row.id ?? "").toLowerCase(),
  name: `${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`.trim(),
  stage: stageTypes(row.pipeline_stages)[0],
  module: classify(row.prodotto_installato),
})).filter((item) => /^[0-9a-f-]{36}$/.test(item.id)
  && ["pronte_da_fare", "gestionale", "recensione"].includes(item.stage)
  && item.module
  && !isFake(item.name)
  && !isExcludedVendor(item.row));
const untested = eligible.filter((item) => !tested.has(item.id));
const countStages = (items: typeof eligible) => Object.fromEntries(
  ["pronte_da_fare", "gestionale", "recensione"].map((stage) => [stage, items.filter((item) => item.stage === stage).length]),
);
const lineaEligible = eligible.filter((item) => isLineaSole(item.row));
const lineaUntested = untested.filter((item) => isLineaSole(item.row));

process.stdout.write(`${JSON.stringify({
  observedRows: rows.length,
  responseSha256: createHash("sha256").update(raw).digest("hex"),
  testedPracticeIds: tested.size,
  eligibleByStage: countStages(eligible),
  eligibleTotal: eligible.length,
  untestedByStage: countStages(untested),
  untestedTotal: untested.length,
  lineaSoleEligible: lineaEligible.length,
  lineaSoleUntested: lineaUntested.length,
  lineaSoleCappedAt10: Math.min(10, lineaUntested.length),
  untestedIds: untested.map((item) => item.id).sort(),
  lineaUntestedIds: lineaUntested.map((item) => item.id).sort(),
}, null, 2)}\n`);
