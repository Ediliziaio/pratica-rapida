import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AprCrmReadOnlyTransport } from "./crmAuthenticatedReadOnly";
import type { AprPilotCandidate } from "./pilotSample";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_FUTURE_TEST_EXCLUSION_RULE_ID, aprAutomationExclusion } from "./aprFutureTestExclusions";

export const APR_ARCHIVED_SCREENING_DISCOVERY_VERSION = "apr-archived-screening-discovery-v2" as const;
const DEFAULT_REQUIRED_COUNT = 10;
const RULE_IDS = [
  "system-apr-independent-runtime",
  "system-apr-crm-readonly-adapter-contract",
  "system-readonly-adapter-contract",
  "system-atomic-checkpoint-resume",
] as const;

interface ArchivedPracticeRow {
  id?: unknown;
  cliente_nome?: unknown;
  cliente_cognome?: unknown;
  prodotto_installato?: unknown;
  updated_at?: unknown;
  pipeline_stages?: unknown;
  fornitore?: unknown;
  companies?: unknown;
}

export interface ArchivedScreeningDiscoveryCheckpoint {
  version: typeof APR_ARCHIVED_SCREENING_DISCOVERY_VERSION;
  revision: 1;
  status: "selected" | "insufficient_candidates";
  requiredCount: number;
  selected: Array<AprPilotCandidate & { practiceId: string; productEvidence: string; priorDraftIds: string[] }>;
  selectionMode?: "exclude_prior_drafts" | "random_include_prior_drafts";
  selectionSeedSha256?: string | null;
  responseSha256: string;
  sourceEvidenceId: string;
  excluded: { priorDraft: number; duplicateIdentity: number; notScreening: number; invalid: number; beatriceCiotta: number; futureTestPolicy: number; includedPriorDraft?: number };
  externalActionAllowed: false;
  mutationAllowed: false;
  reason: string;
  nextAction: string;
  observedAt: string;
  audit: Array<{ at: string; type: "archived_screening_discovery"; reason: string; appliedRuleIds: string[] }>;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function customerKey(displayName: string) {
  return normalize(displayName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function screeningEvidence(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact || !/(?:schermatur|tend|pergol|zanzar|cristal)/i.test(compact)) return null;
  return compact.slice(0, 240);
}

function archivedStage(row: ArchivedPracticeRow) {
  const stage = row.pipeline_stages;
  if (Array.isArray(stage)) return stage.some((entry) => entry && typeof entry === "object" && (entry as { stage_type?: unknown }).stage_type === "archiviate");
  return Boolean(stage && typeof stage === "object" && (stage as { stage_type?: unknown }).stage_type === "archiviate");
}

function priorDraftsByCustomer(historyRoot: string) {
  const records = new Map<string, Set<string>>();
  if (!existsSync(historyRoot)) return records;
  for (const entry of readdirSync(historyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const checkpoint = path.join(historyRoot, entry.name, "enea-draft-execution", "checkpoint.json");
    if (!existsSync(checkpoint)) continue;
    const value = JSON.parse(readFileSync(checkpoint, "utf8")) as { items?: Array<{ customerKey?: unknown; draftId?: unknown }> };
    for (const item of value.items ?? []) if (typeof item.customerKey === "string" && typeof item.draftId === "string" && item.draftId) {
      const ids = records.get(item.customerKey) ?? new Set<string>();
      ids.add(item.draftId); records.set(item.customerKey, ids);
    }
  }
  return records;
}

export class PersistentAprCrmArchivedScreeningDiscovery {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string, readonly transport: AprCrmReadOnlyTransport, readonly historyRoot: string, readonly options: { includePriorDrafts?: boolean; randomSeed?: string; requiredCount?: number } = {}) {
    this.directory = path.join(path.resolve(rootDirectory), "archived-screening-discovery");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load() {
    if (!existsSync(this.checkpointPath)) return null;
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as ArchivedScreeningDiscoveryCheckpoint;
    if (value.version !== APR_ARCHIVED_SCREENING_DISCOVERY_VERSION || value.externalActionAllowed !== false || value.mutationAllowed !== false) throw new Error("apr_archived_screening_discovery_checkpoint_invalid");
    return value;
  }

  async discover(now = new Date()) {
    const existing = this.load();
    if (existing) return existing;
    if (this.transport.snapshot(now).status !== "authenticated") throw new Error("apr_archived_screening_discovery_login_required");
    const requiredCount = this.options.requiredCount ?? DEFAULT_REQUIRED_COUNT;
    if (![10, 15].includes(requiredCount)) throw new Error(`apr_archived_screening_discovery_count_invalid:${requiredCount}`);
    const authorizationRuleId = requiredCount === 15 ? USER_AUTHORIZED_RULE_IDS.fifteenCaseIntermezzoRepeat : USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart;
    const params = new URLSearchParams({
      select: "id,cliente_nome,cliente_cognome,prodotto_installato,updated_at,fornitore,pipeline_stages!inner(stage_type),companies:reseller_id(ragione_sociale)",
      brand: "eq.enea",
      "pipeline_stages.stage_type": "eq.archiviate",
      order: "updated_at.desc",
      limit: "100",
    });
    const response = await this.transport.readOnlyGet("/rest/v1/enea_practices_public", params, now);
    const body = await response.text();
    const responseSha256 = sha256(body);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`apr_archived_screening_discovery_http_${response.status}:${responseSha256}`);
    const rows = JSON.parse(body) as ArchivedPracticeRow[];
    if (!Array.isArray(rows)) throw new Error(`apr_archived_screening_discovery_response_invalid:${responseSha256}`);
    const history = priorDraftsByCustomer(path.resolve(this.historyRoot));
    const seen = new Set<string>();
    const eligible: ArchivedScreeningDiscoveryCheckpoint["selected"] = [];
    const excluded = { priorDraft: 0, duplicateIdentity: 0, notScreening: 0, invalid: 0, beatriceCiotta: 0, futureTestPolicy: 0, includedPriorDraft: 0 };
    for (const row of rows) {
      if (!archivedStage(row)) { excluded.invalid += 1; continue; }
      const firstName = typeof row.cliente_nome === "string" ? row.cliente_nome.trim() : "";
      const lastName = typeof row.cliente_cognome === "string" ? row.cliente_cognome.trim() : "";
      const practiceId = typeof row.id === "string" ? row.id : "";
      const displayName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
      const key = customerKey(displayName);
      const productEvidence = screeningEvidence(row.prodotto_installato);
      if (!displayName || !/^[a-f0-9-]{36}$/i.test(practiceId) || !key) { excluded.invalid += 1; continue; }
      const futureTestExclusion = aprAutomationExclusion({ customerKey: key, displayName, fornitore: row.fornitore, companies: row.companies });
      if (futureTestExclusion) {
        if (key === "beatrice-ciotta") excluded.beatriceCiotta += 1;
        else excluded.futureTestPolicy += 1;
        continue;
      }
      if (!productEvidence) { excluded.notScreening += 1; continue; }
      const priorDraftIds = [...(history.get(key) ?? [])].sort();
      if (priorDraftIds.length && !this.options.includePriorDrafts) { excluded.priorDraft += 1; continue; }
      if (seen.has(key)) { excluded.duplicateIdentity += 1; continue; }
      seen.add(key);
      if (priorDraftIds.length) excluded.includedPriorDraft += 1;
      eligible.push({ customerKey: key, displayName, practiceId, productEvidence, priorDraftIds });
      if (!this.options.includePriorDrafts && eligible.length === requiredCount) break;
    }
    const selectionMode = this.options.includePriorDrafts ? "random_include_prior_drafts" : "exclude_prior_drafts";
    const randomSeed = this.options.includePriorDrafts ? this.options.randomSeed?.trim() : undefined;
    if (this.options.includePriorDrafts && !randomSeed) throw new Error("apr_archived_screening_discovery_random_seed_required");
    const ranked = randomSeed ? [...eligible].sort((left, right) => sha256(`${randomSeed}:${left.practiceId}`).localeCompare(sha256(`${randomSeed}:${right.practiceId}`))) : eligible;
    const selected = ranked.slice(0, requiredCount);
    const status = selected.length === requiredCount ? "selected" : "insufficient_candidates";
    const sourceEvidenceId = `crm-archived-screenings-${now.toISOString().slice(0, 10)}-${sha256(`${responseSha256}:${randomSeed ?? "ordered"}`).slice(0, 16)}`;
    const reason = status === "selected"
      ? selectionMode === "random_include_prior_drafts"
        ? `APR ha sorteggiato esattamente ${requiredCount} pratiche ENEA Archiviate con prodotto schermatura esplicito, includendo anche casi gia lavorati per verificare le regressioni; Beatrice e identita duplicate restano escluse.`
        : `APR ha selezionato esattamente ${requiredCount} pratiche ENEA Archiviate con prodotto schermatura esplicito, escludendo Beatrice, identita duplicate e clienti con bozze APR precedenti.`
      : `APR ha trovato soltanto ${selected.length}/${requiredCount} pratiche Archiviate inequivocabilmente qualificabili come schermature.`;
    const checkpoint: ArchivedScreeningDiscoveryCheckpoint = {
      version: APR_ARCHIVED_SCREENING_DISCOVERY_VERSION,
      revision: 1,
      status,
      requiredCount,
      selected,
      selectionMode,
      selectionSeedSha256: randomSeed ? sha256(randomSeed) : null,
      responseSha256,
      sourceEvidenceId,
      excluded,
      externalActionAllowed: false,
      mutationAllowed: false,
      reason,
      nextAction: status === "selected" ? "Congelare la coda APR senza avviarla; attendere il riavvio del test." : "Non armare la coda; ampliare la ricerca soltanto con un criterio documentale auditabile.",
      observedAt: now.toISOString(),
      audit: [{ at: now.toISOString(), type: "archived_screening_discovery", reason, appliedRuleIds: [authorizationRuleId, APR_FUTURE_TEST_EXCLUSION_RULE_ID, ...RULE_IDS] }],
    };
    atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }
}
