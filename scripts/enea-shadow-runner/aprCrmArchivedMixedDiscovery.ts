import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";
import { APR_FUTURE_TEST_EXCLUSION_RULE_ID, aprAutomationExclusion } from "./aprFutureTestExclusions";

export const APR_ARCHIVED_MIXED_DISCOVERY_VERSION = "apr-archived-mixed-discovery-v1" as const;
const PER_MODULE_COUNT = 20;
const RULE_IDS = [
  USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest,
  APR_FUTURE_TEST_EXCLUSION_RULE_ID,
  "system-apr-independent-runtime",
  "system-apr-crm-readonly-adapter-contract",
  "system-readonly-adapter-contract",
  "system-atomic-checkpoint-resume",
] as const;

type StageType = "archiviate" | "recensione";
type ProductModule = "screening" | "infissi";
interface CrmRow { id?: unknown; cliente_nome?: unknown; cliente_cognome?: unknown; prodotto_installato?: unknown; updated_at?: unknown; pipeline_stages?: unknown; fornitore?: unknown; companies?: unknown }
export interface MixedCandidate {
  customerKey: string;
  displayName: string;
  practiceId: string;
  expectedStageType: StageType;
  productModule: ProductModule;
  productEvidence: string;
  priorDraftIds: string[];
}
export interface AprArchivedMixedDiscoveryCheckpoint {
  version: typeof APR_ARCHIVED_MIXED_DISCOVERY_VERSION;
  revision: 1;
  status: "selected" | "insufficient_candidates";
  required: { screening: 20; infissi: 20; total: 40 };
  selected: MixedCandidate[];
  counts: { screening: number; infissi: number; total: number };
  selectionSeedSha256: string;
  responseSha256: string;
  sourceEvidenceId: string;
  externalActionAllowed: false;
  mutationAllowed: false;
  reason: string;
  nextAction: string;
  observedAt: string;
  audit: Array<{ at: string; type: "mixed_discovery_completed"; reason: string; appliedRuleIds: string[] }>;
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const customerKey = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function stageTypes(value: unknown): StageType[] {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return values.flatMap((entry) => {
    const stage = entry && typeof entry === "object" && typeof (entry as { stage_type?: unknown }).stage_type === "string" ? normalize((entry as { stage_type: string }).stage_type).replace(/\s+/g, "_") : "";
    return stage === "archiviate" || stage === "recensione" ? [stage] : [];
  });
}
function classifyProduct(value: unknown): { module: ProductModule; evidence: string } | null {
  if (typeof value !== "string") return null;
  const evidence = value.trim().replace(/\s+/g, " ").slice(0, 240);
  if (!evidence) return null;
  if (/(?:infiss|serrament|finestre?\b)/i.test(evidence)) return { module: "infissi", evidence };
  if (/(?:schermatur|tend|pergol|zanzar|cristal|persian|avvolgibil)/i.test(evidence)) return { module: "screening", evidence };
  return null;
}
function priorDraftsByCustomer(historyRoot: string) {
  const records = new Map<string, Set<string>>();
  if (!existsSync(historyRoot)) return records;
  for (const entry of readdirSync(historyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const checkpoint = path.join(historyRoot, entry.name, "enea-draft-execution", "checkpoint.json");
    if (!existsSync(checkpoint)) continue;
    const state = JSON.parse(readFileSync(checkpoint, "utf8")) as { items?: Array<{ customerKey?: unknown; draftId?: unknown }> };
    for (const item of state.items ?? []) if (typeof item.customerKey === "string" && typeof item.draftId === "string" && item.draftId) {
      const ids = records.get(item.customerKey) ?? new Set<string>(); ids.add(item.draftId); records.set(item.customerKey, ids);
    }
  }
  return records;
}

export class PersistentAprCrmArchivedMixedDiscovery {
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string, readonly transport: AprCrmReadOnlyTransport, readonly historyRoot: string, readonly randomSeed: string) {
    this.checkpointPath = path.join(path.resolve(rootDirectory), "archived-mixed-discovery", "checkpoint.json");
  }
  load() {
    if (!existsSync(this.checkpointPath)) return null;
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprArchivedMixedDiscoveryCheckpoint;
    if (value.version !== APR_ARCHIVED_MIXED_DISCOVERY_VERSION || value.externalActionAllowed !== false || value.mutationAllowed !== false) throw new Error("apr_archived_mixed_discovery_checkpoint_invalid");
    return value;
  }
  async discover(now = new Date()) {
    const existing = this.load(); if (existing) return existing;
    const seed = this.randomSeed.trim(); if (!seed) throw new Error("apr_archived_mixed_discovery_seed_missing");
    if (this.transport.snapshot(now).status !== "authenticated") throw new Error("apr_archived_mixed_discovery_login_required");
    const params = new URLSearchParams({ select: "id,cliente_nome,cliente_cognome,prodotto_installato,updated_at,fornitore,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)", brand: "eq.enea", "pipeline_stages.stage_type": "in.(archiviate,recensione)", order: "updated_at.desc", limit: "1000" });
    const response = await this.transport.readOnlyGet("/rest/v1/enea_practices_public", params, now);
    const body = await response.text(); const responseSha256 = sha256(body);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`apr_archived_mixed_discovery_http_${response.status}:${responseSha256}`);
    const rows = JSON.parse(body) as CrmRow[]; if (!Array.isArray(rows)) throw new Error(`apr_archived_mixed_discovery_response_invalid:${responseSha256}`);
    const history = priorDraftsByCustomer(path.resolve(this.historyRoot)); const seen = new Set<string>();
    const eligible: MixedCandidate[] = [];
    for (const row of rows) {
      const firstName = typeof row.cliente_nome === "string" ? row.cliente_nome.trim() : "";
      const lastName = typeof row.cliente_cognome === "string" ? row.cliente_cognome.trim() : "";
      const displayName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " "); const key = customerKey(displayName);
      const practiceId = typeof row.id === "string" ? row.id.toLowerCase() : ""; const stages = stageTypes(row.pipeline_stages); const product = classifyProduct(row.prodotto_installato);
      if (!displayName || !key || !/^[a-f0-9-]{36}$/.test(practiceId) || stages.length !== 1 || !product || aprAutomationExclusion({ customerKey: key, displayName, fornitore: row.fornitore, companies: row.companies }) || seen.has(key)) continue;
      seen.add(key);
      eligible.push({ customerKey: key, displayName, practiceId, expectedStageType: stages[0], productModule: product.module, productEvidence: product.evidence, priorDraftIds: [...(history.get(key) ?? [])].sort() });
    }
    const rank = (candidate: MixedCandidate) => sha256(`${seed}:${candidate.productModule}:${candidate.practiceId}`);
    const screenings = eligible.filter((item) => item.productModule === "screening").sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, PER_MODULE_COUNT);
    const infissi = eligible.filter((item) => item.productModule === "infissi").sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, PER_MODULE_COUNT);
    const selected = [...screenings, ...infissi].sort((a, b) => sha256(`${seed}:queue:${a.practiceId}`).localeCompare(sha256(`${seed}:queue:${b.practiceId}`)));
    const counts = { screening: screenings.length, infissi: infissi.length, total: selected.length };
    const status = counts.screening === PER_MODULE_COUNT && counts.infissi === PER_MODULE_COUNT ? "selected" : "insufficient_candidates";
    const reason = status === "selected" ? "APR ha congelato 40 pratiche univoche in sola lettura: 20 schermature e 20 Infissi da Archiviate/Recensione, incluse pratiche gia lavorate e rispettate tutte le esclusioni permanenti." : `Candidati insufficienti: schermature ${counts.screening}/20, Infissi ${counts.infissi}/20.`;
    const checkpoint: AprArchivedMixedDiscoveryCheckpoint = { version: APR_ARCHIVED_MIXED_DISCOVERY_VERSION, revision: 1, status, required: { screening: 20, infissi: 20, total: 40 }, selected, counts, selectionSeedSha256: sha256(seed), responseSha256, sourceEvidenceId: `crm-mixed-40-${now.toISOString().slice(0, 10)}-${sha256(`${responseSha256}:${seed}`).slice(0, 16)}`, externalActionAllowed: false, mutationAllowed: false, reason, nextAction: status === "selected" ? "Creare la coorte persistente e avviare APR una pratica alla volta." : "Non armare la coda; registrare il limite reale dei candidati.", observedAt: now.toISOString(), audit: [{ at: now.toISOString(), type: "mixed_discovery_completed", reason, appliedRuleIds: [...RULE_IDS] }] };
    atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`); return checkpoint;
  }
}
