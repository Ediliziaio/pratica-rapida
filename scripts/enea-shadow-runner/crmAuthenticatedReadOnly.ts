import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import type { PersistentAprCrmAuth } from "./crmAuth";
import type { AprPilotCandidate } from "./pilotSample";
import { APR_FUTURE_TEST_EXCLUSION_RULE_ID, aprAutomationExclusion, type AprAutomationExclusion } from "./aprFutureTestExclusions";

export const APR_CRM_ACQUISITION_VERSION = "apr-crm-readonly-acquisition-v1" as const;
const RULE_IDS = [
  "system-apr-crm-dedicated-auth",
  "system-apr-crm-readonly-adapter-contract",
  "system-apr-crm-integration-boundary",
  "system-apr-operator-intervention-routing",
  "system-readonly-adapter-contract",
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

const DOSSIER_SELECT = [
  "id", "cliente_nome", "cliente_cognome", "cliente_email", "cliente_telefono", "cliente_cf",
  "prodotto_installato", "fatture_urls", "documenti_aggiuntivi_urls",
  "dati_form", "form_compilato_at", "created_at", "updated_at", "fornitore", "current_stage_id",
  "pipeline_stages!inner(stage_type)", "companies:reseller_id(ragione_sociale)",
].join(",");

export interface AprCrmReadOnlyTransport {
  readOnlyGet(pathname: string, searchParams: URLSearchParams, now?: Date): Promise<Response>;
  snapshot(now?: Date): { status: string };
}

export interface AprCrmAcquisitionItem {
  customerKey: string;
  displayName: string;
  sourceEventId?: string;
  expectedPracticeId?: string;
  expectedStageType?: "archiviate" | "recensione" | "pronte_da_fare" | "gestionale";
  productModule?: "screening" | "infissi";
  state: "queued" | "acquiring" | "acquired" | "blocked_not_found" | "blocked_ambiguous" | "blocked_invalid_response";
  requestId: string;
  attemptCount: number;
  practiceId: string | null;
  dossierPath: string | null;
  responseSha256: string | null;
  sourceDocumentCount: number;
  reason: string;
  startedAt: string | null;
  endedAt: string | null;
  operatorResolution?: {
    resolutionId: string;
    kind: "retry_after_duplicate_removed" | "pipeline_stage_type";
    stageType: "archiviate" | null;
    recordedAt: string;
  };
  identityCorrection?: {
    resolutionId: string;
    originalDisplayName: string;
    correctedDisplayName: string;
    recordedAt: string;
  };
  automationExclusion?: AprAutomationExclusion | null;
}

export interface AprCrmAcquisitionState {
  version: typeof APR_CRM_ACQUISITION_VERSION;
  revision: number;
  status: "unprepared" | "queued" | "running" | "completed" | "waiting_auth";
  candidateFingerprint: string | null;
  currentCustomerKey: string | null;
  items: AprCrmAcquisitionItem[];
  externalActionAllowed: false;
  operationalGate: "crm_readonly_acquisition_only";
  reason: string;
  nextAction: string;
  repairsApplied: string[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "prepared" | "transport_repaired" | "operator_resolution" | "item_claimed" | "item_acquired" | "item_blocked" | "completed" | "waiting_auth"; customerKey: string | null; reason: string; appliedRuleIds: string[] }>;
}

/** The only admission point from read-only CRM acquisition to attachment IO. */
export function aprDocumentProcessingDossiers(items: readonly AprCrmAcquisitionItem[]) {
  return items
    .filter((item) => item.state === "acquired" && !item.automationExclusion && item.practiceId && item.dossierPath)
    .map((item) => ({ customerKey: item.customerKey, practiceId: item.practiceId!, dossierPath: item.dossierPath! }));
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); }
  finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmAcquisitionState {
  const reason = "Acquisizione CRM APR non preparata; nessun dato reale letto.";
  return {
    version: APR_CRM_ACQUISITION_VERSION, revision: 0, status: "unprepared", candidateFingerprint: null,
    currentCustomerKey: null, items: [], externalActionAllowed: false, operationalGate: "crm_readonly_acquisition_only",
    reason, nextAction: "Attendere campione pilot persistente e sessione APR autenticata.", repairsApplied: [],
    audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: RULE_IDS }],
  };
}

function validState(value: AprCrmAcquisitionState) {
  return value.version === APR_CRM_ACQUISITION_VERSION && value.externalActionAllowed === false
    && value.operationalGate === "crm_readonly_acquisition_only"
    && value.audit.every((event) => event.appliedRuleIds.every((id) => registryRule(id)));
}

function splitName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) throw new Error(`pilot_name_invalid:${displayName}`);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function identityPartitions(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) throw new Error(`pilot_name_invalid:${displayName}`);
  return Array.from({ length: parts.length - 1 }, (_, index) => ({
    firstName: parts.slice(0, index + 1).join(" "),
    lastName: parts.slice(index + 1).join(" "),
  }));
}

export class PersistentAprCrmAuthenticatedReadOnly {
  readonly directory: string;
  readonly checkpointPath: string;
  readonly dossierDirectory: string;

  constructor(readonly rootDirectory: string, readonly transport: AprCrmReadOnlyTransport) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-acquisition");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
    this.dossierDirectory = path.join(this.directory, "dossiers");
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try {
      const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmAcquisitionState;
      return validState(value) ? value : initialState(now);
    } catch { return initialState(now); }
  }

  private write(state: AprCrmAcquisitionState) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }

  initialize(now = new Date()) {
    const state = this.load(now);
    state.repairsApplied ??= [];
    if (!existsSync(this.checkpointPath)) this.write(state);
    return state;
  }

  applyTransportRepair(repairId: string, responseSha256: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.repairsApplied.includes(repairId)) return current;
    const repairable = current.items.filter((item) => item.state === "blocked_invalid_response" && item.practiceId === null && item.responseSha256 === responseSha256);
    if (!repairable.length) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.currentCustomerKey = null; next.repairsApplied.push(repairId);
    for (const item of next.items) if (repairable.some((candidate) => candidate.customerKey === item.customerKey)) {
      item.state = "queued"; item.reason = `Riarmato dopo riparazione trasporto ${repairId}; il precedente HTTP 400 era conclusivo e privo di dati.`;
      item.responseSha256 = null; item.endedAt = null;
    }
    next.reason = `Riparato contratto GET CRM per ${repairable.length} casi con identico HTTP 400; nessun dossier riuscito ripetuto.`;
    next.nextAction = "Riprendere in sequenza i soli GET falliti per contratto non valido.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "transport_repaired", customerKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  resolveAmbiguity(customerKey: string, resolution: { resolutionId: string; kind: "retry_after_duplicate_removed" | "pipeline_stage_type"; stageType?: "archiviate" }, now = new Date()) {
    const current = this.initialize(now);
    const currentItem = current.items.find((item) => item.customerKey === customerKey);
    if (!currentItem) throw new Error(`crm_acquisition_customer_unknown:${customerKey}`);
    if (currentItem.operatorResolution?.resolutionId === resolution.resolutionId) return current;
    if (currentItem.state !== "blocked_ambiguous") throw new Error(`crm_acquisition_resolution_state_invalid:${customerKey}:${currentItem.state}`);
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(resolution.resolutionId)) throw new Error("crm_acquisition_resolution_id_invalid");
    if (resolution.kind === "pipeline_stage_type" && resolution.stageType !== "archiviate") throw new Error("crm_acquisition_stage_resolution_invalid");
    const next = structuredClone(current);
    const item = next.items.find((candidate) => candidate.customerKey === customerKey)!;
    next.revision += 1; next.status = "queued"; next.currentCustomerKey = null;
    item.state = "queued"; item.responseSha256 = null; item.endedAt = null;
    item.operatorResolution = { resolutionId: resolution.resolutionId, kind: resolution.kind, stageType: resolution.kind === "pipeline_stage_type" ? "archiviate" : null, recordedAt: now.toISOString() };
    item.reason = resolution.kind === "pipeline_stage_type"
      ? "Risoluzione operatore registrata: selezionare esclusivamente la pratica nella pipeline Archiviate."
      : "Risoluzione operatore registrata: duplicato eliminato, ripetere una sola lettura esatta.";
    next.reason = `${item.displayName}: ${item.reason}`;
    next.nextAction = "Riprendere esclusivamente il caso risolto con GET read-only; nessun dossier gia acquisito viene ripetuto.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "operator_resolution", customerKey, reason: item.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  correctNotFoundIdentity(customerKey: string, correction: { resolutionId: string; displayName: string }, now = new Date()) {
    const current = this.initialize(now);
    const currentItem = current.items.find((item) => item.customerKey === customerKey);
    if (!currentItem) throw new Error(`crm_acquisition_customer_unknown:${customerKey}`);
    if (currentItem.identityCorrection?.resolutionId === correction.resolutionId) return current;
    if (currentItem.state !== "blocked_not_found") throw new Error(`crm_acquisition_identity_correction_state_invalid:${customerKey}:${currentItem.state}`);
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(correction.resolutionId)) throw new Error("crm_acquisition_resolution_id_invalid");
    const displayName = correction.displayName.trim().replace(/\s+/g, " ");
    if (displayName.split(" ").length < 2 || displayName.length > 160) throw new Error("crm_acquisition_corrected_name_invalid");
    if (current.items.some((item) => item.customerKey !== customerKey && normalize(item.displayName) === normalize(displayName))) {
      throw new Error("crm_acquisition_corrected_name_duplicate");
    }
    const next = structuredClone(current);
    const item = next.items.find((candidate) => candidate.customerKey === customerKey)!;
    const originalDisplayName = item.displayName;
    next.revision += 1;
    next.status = "queued";
    next.currentCustomerKey = null;
    item.displayName = displayName;
    item.state = "queued";
    item.responseSha256 = null;
    item.endedAt = null;
    item.identityCorrection = { resolutionId: correction.resolutionId, originalDisplayName, correctedDisplayName: displayName, recordedAt: now.toISOString() };
    item.reason = `Correzione identita operatore registrata: ${originalDisplayName} -> ${displayName}; ripetere una sola lettura esatta.`;
    next.reason = `${displayName}: ${item.reason}`;
    next.nextAction = "Riprendere esclusivamente il caso corretto con GET read-only; nessun dossier gia acquisito viene ripetuto.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "operator_resolution", customerKey, reason: item.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  applyRecordedOperatorResolutions(now = new Date()) {
    let current = this.snapshot(now);
    if (current.items.some((item) => item.customerKey === "beatrice-ciotta" && item.state === "blocked_ambiguous")) {
      this.resolveAmbiguity("beatrice-ciotta", { resolutionId: "user-2026-08-15-ciotta-duplicate-removed", kind: "retry_after_duplicate_removed" }, now);
      current = this.snapshot(now);
    }
    if (current.items.some((item) => item.customerKey === "milena-fiorini" && item.state === "blocked_ambiguous")) {
      this.resolveAmbiguity("milena-fiorini", { resolutionId: "user-2026-08-15-fiorini-pipeline-archiviate", kind: "pipeline_stage_type", stageType: "archiviate" }, now);
    }
    return this.snapshot(now);
  }

  prepare(candidates: AprPilotCandidate[], candidateFingerprint: string, now = new Date(), minimumCandidates: 1 | 2 = 2) {
    const current = this.initialize(now);
    if (current.candidateFingerprint === candidateFingerprint && current.items.length === candidates.length) return current;
    if (current.candidateFingerprint && current.candidateFingerprint !== candidateFingerprint) throw new Error("crm_acquisition_candidate_set_immutable");
    if (![1, 2].includes(minimumCandidates) || candidates.length < minimumCandidates || candidates.length > 40 || !/^[a-f0-9]{64}$/.test(candidateFingerprint)) throw new Error("crm_acquisition_pilot_invalid");
    const next = structuredClone(current);
    next.revision += 1;
    next.status = "queued";
    next.candidateFingerprint = candidateFingerprint;
    next.items = candidates.map((candidate) => ({ customerKey: candidate.customerKey, displayName: candidate.displayName, ...(candidate.practiceId ? { expectedPracticeId: candidate.practiceId } : {}), ...(candidate.expectedStageType ? { expectedStageType: candidate.expectedStageType } : {}), ...(candidate.productModule ? { productModule: candidate.productModule } : {}), state: "queued", requestId: `crm-readonly-${candidate.customerKey}`, attemptCount: 0, practiceId: null, dossierPath: null, responseSha256: null, sourceDocumentCount: 0, reason: "In coda per acquisizione CRM GET read-only.", startedAt: null, endedAt: null }));
    next.reason = `${candidates.length} dossier pilot preparati per acquisizione sequenziale CRM in sola lettura.`;
    next.nextAction = "Acquisire una pratica alla volta con GET autenticato; nessuna mutazione CRM o ENEA.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "prepared", customerKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  prepareIncoming(inputs: Array<{ eventId: string; practiceId: string; displayName: string }>, now = new Date()) {
    const normalized = [...inputs].map((input) => ({ eventId: input.eventId.trim(), practiceId: input.practiceId.trim(), displayName: input.displayName.trim().replace(/\s+/g, " ") }))
      .sort((left, right) => left.practiceId.localeCompare(right.practiceId));
    if (normalized.length < 1 || normalized.length > 100
      || normalized.some((input) => !input.eventId || !/^[a-f0-9-]{36}$/i.test(input.practiceId) || input.displayName.split(" ").length < 2 || normalize(input.displayName) === "beatrice ciotta")
      || new Set(normalized.map((input) => input.eventId)).size !== normalized.length
      || new Set(normalized.map((input) => input.practiceId)).size !== normalized.length) throw new Error("crm_acquisition_incoming_invalid");
    const candidateFingerprint = sha256(JSON.stringify(normalized));
    const current = this.initialize(now);
    if (current.candidateFingerprint === candidateFingerprint && current.items.length === normalized.length) return current;
    if (current.candidateFingerprint) throw new Error("crm_acquisition_candidate_set_immutable");
    const next = structuredClone(current);
    next.revision += 1;
    next.status = "queued";
    next.candidateFingerprint = candidateFingerprint;
    next.items = normalized.map((input) => ({
      customerKey: `crm-${input.practiceId}`, displayName: input.displayName, sourceEventId: input.eventId, expectedPracticeId: input.practiceId,
      state: "queued", requestId: `crm-readonly-event-${sha256(input.eventId).slice(0, 24)}`, attemptCount: 0,
      practiceId: null, dossierPath: null, responseSha256: null, sourceDocumentCount: 0,
      reason: "Evento CRM persistito in coda per acquisizione dossier con GET esatto per ID.", startedAt: null, endedAt: null,
    }));
    next.reason = `${normalized.length} eventi CRM reali preparati per acquisizione dossier sequenziale per ID.`;
    next.nextAction = "Acquisire una pratica alla volta con GET esatto e autenticato; nessuna mutazione CRM o ENEA.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "prepared", customerKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  private claim(now: Date) {
    const current = this.load(now);
    const existing = current.items.find((item) => item.state === "acquiring");
    if (existing) return { state: current, item: existing };
    const index = current.items.findIndex((item) => item.state === "queued");
    if (index < 0) return { state: current, item: null };
    const next = structuredClone(current);
    const item = next.items[index];
    next.revision += 1;
    next.status = "running";
    next.currentCustomerKey = item.customerKey;
    item.state = "acquiring";
    item.attemptCount += 1;
    item.startedAt ??= now.toISOString();
    item.reason = "GET CRM read-only reclamato; replay sicuro dopo crash.";
    next.reason = `Acquisizione read-only in corso: ${item.displayName}.`;
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_claimed", customerKey: item.customerKey, reason: item.reason, appliedRuleIds: RULE_IDS });
    this.write(next);
    return { state: next, item };
  }

  async tick(now = new Date()) {
    const current = this.load(now);
    if (current.status === "unprepared" || current.status === "completed") return current;
    if (this.transport.snapshot(now).status !== "authenticated") {
      if (current.status === "waiting_auth") return current;
      const next = structuredClone(current); next.revision += 1; next.status = "waiting_auth";
      next.reason = "Sessione CRM APR non autenticata; acquisizione sospesa senza perdere la coda.";
      next.nextAction = "Ripristinare la sessione APR globale; nessun ticket pratica.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "waiting_auth", customerKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
      return this.write(next);
    }
    const claimed = this.claim(now);
    if (!claimed.item) return this.complete(now);
    const item = claimed.item;
    const partitions = item.expectedPracticeId ? [{ firstName: "practice_id", lastName: item.expectedPracticeId }] : identityPartitions(item.displayName);
    const matchesByPracticeId = new Map<string, { row: Record<string, unknown>; bodyHash: string; partition: { firstName: string; lastName: string } }>();
    let lastBodyHash = sha256("");
    for (const partition of partitions) {
      const expectedStageType = item.expectedStageType ?? "pronte_da_fare";
      const params = item.expectedPracticeId
        ? new URLSearchParams({ select: DOSSIER_SELECT, brand: "eq.enea", id: `eq.${item.expectedPracticeId}`, "pipeline_stages.stage_type": `eq.${expectedStageType}`, limit: "2" })
        : new URLSearchParams({ select: DOSSIER_SELECT, brand: "eq.enea", cliente_nome: `ilike.${partition.firstName}`, cliente_cognome: `ilike.${partition.lastName}`, limit: "3" });
      if (item.operatorResolution?.kind === "pipeline_stage_type") params.set("pipeline_stages.stage_type", `eq.${item.operatorResolution.stageType}`);
      let response: Response;
      try { response = await this.transport.readOnlyGet("/rest/v1/enea_practices_public", params, now); }
      catch { return this.blockItem(item.customerKey, "blocked_invalid_response", "Trasporto CRM GET non disponibile; nessun valore inventato.", now); }
      const body = await response.text();
      const bodyHash = sha256(body); lastBodyHash = bodyHash;
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) {
        let serverDiagnostic = "";
        try {
          const error = JSON.parse(body) as { code?: unknown; message?: unknown };
          serverDiagnostic = [error.code, error.message].filter((value): value is string => typeof value === "string").join(" · ").replace(/[^a-zA-Z0-9_. ,:!()'\-]/g, "").slice(0, 240);
        } catch { /* fingerprint sufficiente per risposte non JSON */ }
        return this.blockItem(item.customerKey, "blocked_invalid_response", `Risposta CRM non valida: HTTP ${response.status}${serverDiagnostic ? ` · ${serverDiagnostic}` : ""}, sha256 ${bodyHash}.`, now, bodyHash);
      }
      let rows: Array<Record<string, unknown>>;
      try { rows = JSON.parse(body) as Array<Record<string, unknown>>; }
      catch { return this.blockItem(item.customerKey, "blocked_invalid_response", `JSON CRM non valido, sha256 ${bodyHash}.`, now, bodyHash); }
      let matches = item.expectedPracticeId
        ? rows.filter((row) => row.id === item.expectedPracticeId && normalize(`${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`) === normalize(item.displayName)
          && typeof row.pipeline_stages === "object" && row.pipeline_stages !== null && (row.pipeline_stages as { stage_type?: unknown }).stage_type === expectedStageType)
        : rows.filter((row) => normalize(`${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}`) === normalize(item.displayName));
      if (item.operatorResolution?.kind === "pipeline_stage_type") matches = matches.filter((row) => {
        const stage = row.pipeline_stages;
        return typeof stage === "object" && stage !== null && "stage_type" in stage && (stage as { stage_type?: unknown }).stage_type === item.operatorResolution?.stageType;
      });
      for (const row of matches) {
        const practiceId = typeof row.id === "string" ? row.id : "";
        matchesByPracticeId.set(practiceId || sha256(JSON.stringify(row)), { row, bodyHash, partition });
      }
      // La partizione canonica ha trovato un solo record: non emettere GET
      // alternative. Le partizioni successive servono soltanto per nomi
      // composti e non possono trasformare un risultato univoco in un altro.
      if (matchesByPracticeId.size === 1) break;
    }
    const matches = [...matchesByPracticeId.values()];
    if (matches.length === 0) return this.blockItem(item.customerKey, "blocked_not_found", `Nessuna pratica ENEA corrispondente trovata con identità esatta dopo ${partitions.length} partizioni controllate.`, now, lastBodyHash);
    if (matches.length !== 1) return this.blockItem(item.customerKey, "blocked_ambiguous", `Trovate ${matches.length} pratiche con la stessa identità; selezione automatica vietata.`, now, lastBodyHash);
    const { row, bodyHash, partition } = matches[0];
    const practiceId = typeof row.id === "string" ? row.id : "";
    if (!/^[a-f0-9-]{36}$/i.test(practiceId)) return this.blockItem(item.customerKey, "blocked_invalid_response", "Identificativo pratica CRM assente o non valido.", now, bodyHash);
    const automationExclusion = aprAutomationExclusion({
      customerKey: item.customerKey,
      displayName: item.displayName,
      fornitore: row.fornitore,
      companies: row.companies,
    });
    const dossier = { version: "apr-crm-dossier-v1", acquiredAt: now.toISOString(), requestId: item.requestId, appliedRuleIds: [...RULE_IDS, ...(automationExclusion ? [APR_FUTURE_TEST_EXCLUSION_RULE_ID] : [])], source: { origin: "https://xmkjrhwmmuzaqjqlvzxm.supabase.co", relation: "enea_practices_public", method: "GET", responseSha256: bodyHash, identityPartition: partition, partitionCount: partitions.length }, row, automationExclusion };
    const dossierPath = path.join(this.dossierDirectory, `${item.customerKey}.json`);
    atomicWrite(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`);
    const next = structuredClone(this.load(now));
    const target = next.items.find((candidate) => candidate.customerKey === item.customerKey)!;
    next.revision += 1; target.state = "acquired"; target.practiceId = practiceId; target.dossierPath = dossierPath; target.responseSha256 = bodyHash; target.automationExclusion = automationExclusion;
    target.sourceDocumentCount = [...(Array.isArray(row.fatture_urls) ? row.fatture_urls : []), ...(Array.isArray(row.documenti_aggiuntivi_urls) ? row.documenti_aggiuntivi_urls : [])].length;
    target.reason = automationExclusion
      ? `Dossier CRM acquisito via GET: esclusione automatica ${automationExclusion.displayName} rilevata in ${automationExclusion.sourceField}; gli allegati non saranno scaricati o analizzati.`
      : `Dossier CRM acquisito via GET e salvato con fingerprint; ${target.sourceDocumentCount} fonti originarie referenziate.${target.operatorResolution ? ` Risoluzione operatore ${target.operatorResolution.resolutionId} applicata.` : ""}`;
    target.endedAt = now.toISOString();
    next.currentCustomerKey = null; next.reason = target.reason; next.nextAction = "Proseguire con il prossimo dossier; non scaricare documenti o aprire ENEA in questa fase.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_acquired", customerKey: target.customerKey, reason: target.reason, appliedRuleIds: RULE_IDS });
    this.write(next);
    return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "acquiring") ? next : this.complete(now);
  }

  private blockItem(customerKey: string, state: AprCrmAcquisitionItem["state"], reason: string, now: Date, responseSha256: string | null = null) {
    const current = this.load(now); const next = structuredClone(current); const item = next.items.find((candidate) => candidate.customerKey === customerKey)!;
    next.revision += 1; item.state = state; item.reason = reason; item.responseSha256 = responseSha256; item.endedAt = now.toISOString(); next.currentCustomerKey = null;
    next.reason = `${item.displayName}: ${reason}`; next.nextAction = "Registrare blocco per-pratica e proseguire automaticamente con il caso successivo.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "item_blocked", customerKey, reason, appliedRuleIds: RULE_IDS });
    this.write(next); return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "acquiring") ? next : this.complete(now);
  }

  private complete(now: Date) {
    const current = this.load(now); if (current.status === "completed") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "completed"; next.currentCustomerKey = null;
    const acquired = next.items.filter((item) => item.state === "acquired").length; const blocked = next.items.length - acquired;
    next.reason = `Acquisizione CRM read-only conclusa: ${acquired} dossier acquisiti, ${blocked} bloccati per-pratica.`;
    next.nextAction = "Validare e scaricare le sole fonti originarie dei dossier acquisiti; ENEA resta fuori ambito.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed", customerKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }

  snapshot(now = new Date()) {
    const state = this.load(now); return { ...state, progress: { total: state.items.length, queued: state.items.filter((item) => item.state === "queued" || item.state === "acquiring").length, acquired: state.items.filter((item) => item.state === "acquired").length, blocked: state.items.filter((item) => item.state.startsWith("blocked_")).length }, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}

export type AprCrmAuthTransport = Pick<PersistentAprCrmAuth, "readOnlyGet" | "snapshot">;
