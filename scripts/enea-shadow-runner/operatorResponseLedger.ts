import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_OPERATOR_RESPONSE_LEDGER_VERSION = "apr-operator-response-ledger-v1" as const;
export const OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID = USER_AUTHORIZED_RULE_IDS.operatorResponseRuntimeConsumption;
export const OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID = "system-operator-response-ledger-concurrency-v1" as const;

export interface AprOperatorResponseLedgerOptions {
  lockWaitTimeoutMs?: number;
  lockPollIntervalMs?: number;
}

const LOCK_WAIT_WORD = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const waitForLockRelease = (milliseconds: number) => Atomics.wait(LOCK_WAIT_WORD, 0, 0, milliseconds);

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export type AprOperatorResponsePayload =
  | { kind: "screening_products"; products: Array<{ description: string; quantity: number; widthMm: number; heightMm: number }> }
  | { kind: "cadastral_identifiers"; sheet: string; parcel: string }
  | { kind: "old_window_characteristics"; material: "wood" | "metal" | "pvc"; glazing: "single" | "double"; appliesToCount: number }
  | { kind: "physical_product_count"; count: number }
  | { kind: "document_refresh"; documentTypes: string[] }
  | { kind: "case_disposition"; disposition: "closed_externally" | "not_workable" | "removed_from_crm"; reason: string }
  | { kind: "operator_required"; operatorQuestion: string; missingDocumentType: string | null; field?: string; originatingQuestionId?: string }
  | {
    kind: "case_decision";
    field: "shading_closures" | "completionDate" | "economic.invoiceTotal" | "infissi.dimensioni_e_numero" | "operator.pendingData";
    value: string;
    originatingQuestionId: string;
  }
  | { kind: "general_rule_confirmation"; ruleIds: string[] };

export interface AprOperatorResponseEntry {
  responseId: string;
  customerKey: string;
  displayName: string;
  practiceId: string | null;
  receivedAt: string;
  source: "giuliano_chat_decision" | "giuliano_crm_ombra" | "dashboard_operator_answer" | "imported_audit";
  question: string;
  answer: string;
  payload: AprOperatorResponsePayload;
  status: "active" | "superseded";
  supersedesResponseId: string | null;
  appliedRuleIds: string[];
}

export interface AprOperatorResponseApplication {
  applicationId: string;
  responseId: string;
  customerKey: string;
  practiceId: string | null;
  runRoot: string;
  sourceFingerprint: string;
  outcome: "applied" | "not_applied" | "pending_source_refresh" | "verified_general_rule" | "disposition_applied";
  evidence: string;
  appliedAt: string;
  appliedRuleIds: string[];
}

export type AprOperatorCaseDecisionField = Extract<AprOperatorResponsePayload, { kind: "case_decision" }>["field"];

export interface AprOperatorInfissiSurfaceRow {
  pieceNumber: number;
  surfaceM2: number;
  sourceResponseId: string;
}

export interface AprOperatorResponseOverrideApplication {
  responseId: string;
  field: AprOperatorCaseDecisionField | "cadastral_identifiers" | "old_window_characteristics" | null;
  outcome: "applied" | "not_applied";
  evidence: string;
}

export interface AprOperatorResponseLedgerState {
  version: typeof APR_OPERATOR_RESPONSE_LEDGER_VERSION;
  revision: number;
  responses: AprOperatorResponseEntry[];
  applications: AprOperatorResponseApplication[];
  contentSha256: string;
  updatedAt: string;
}

export interface AprOperatorResponseProjection {
  customerKey: string;
  entries: AprOperatorResponseEntry[];
  screeningProducts: Extract<AprOperatorResponsePayload, { kind: "screening_products" }> | null;
  cadastralIdentifiers: Extract<AprOperatorResponsePayload, { kind: "cadastral_identifiers" }> | null;
  oldWindowCharacteristics: Extract<AprOperatorResponsePayload, { kind: "old_window_characteristics" }> | null;
  physicalProductCount: Extract<AprOperatorResponsePayload, { kind: "physical_product_count" }> | null;
  documentRefresh: Extract<AprOperatorResponsePayload, { kind: "document_refresh" }> | null;
  caseDisposition: Extract<AprOperatorResponsePayload, { kind: "case_disposition" }> | null;
  operatorRequired: Extract<AprOperatorResponsePayload, { kind: "operator_required" }> | null;
  caseDecisions: Array<Extract<AprOperatorResponsePayload, { kind: "case_decision" }>>;
  generalRuleIds: string[];
}

function stateHash(state: Omit<AprOperatorResponseLedgerState, "contentSha256">) {
  return sha256(state);
}

function initialState(now: Date): AprOperatorResponseLedgerState {
  const withoutHash: Omit<AprOperatorResponseLedgerState, "contentSha256"> = { version: APR_OPERATOR_RESPONSE_LEDGER_VERSION, revision: 0, responses: [], applications: [], updatedAt: now.toISOString() };
  return { ...withoutHash, contentSha256: stateHash(withoutHash) };
}

function validPayload(payload: AprOperatorResponsePayload) {
  if (payload.kind === "screening_products") return payload.products.length > 0 && payload.products.every((item) => item.description.trim() && Number.isInteger(item.quantity) && item.quantity > 0 && item.widthMm > 0 && item.heightMm > 0);
  if (payload.kind === "cadastral_identifiers") return Boolean(payload.sheet.trim() && payload.parcel.trim());
  if (payload.kind === "old_window_characteristics") return payload.appliesToCount > 0 && Number.isInteger(payload.appliesToCount);
  if (payload.kind === "physical_product_count") return payload.count > 0 && Number.isInteger(payload.count);
  if (payload.kind === "document_refresh") return payload.documentTypes.length > 0 && payload.documentTypes.every((item) => item.trim());
  if (payload.kind === "case_disposition") return Boolean(payload.reason.trim());
  if (payload.kind === "operator_required") return Boolean(payload.operatorQuestion.trim())
    && (!payload.field || Boolean(payload.field.trim()))
    && (!payload.originatingQuestionId || Boolean(payload.originatingQuestionId.trim()));
  if (payload.kind === "case_decision") return Boolean(payload.field && payload.value.trim() && payload.originatingQuestionId.trim());
  return payload.ruleIds.length > 0 && payload.ruleIds.every((id) => Boolean(registryRule(id)));
}

function validEntry(entry: AprOperatorResponseEntry) {
  return /^[a-z0-9][a-z0-9._:-]{7,200}$/.test(entry.responseId)
    && Boolean(entry.customerKey && entry.displayName && entry.question && entry.answer)
    && Number.isFinite(Date.parse(entry.receivedAt))
    && validPayload(entry.payload)
    && entry.appliedRuleIds.includes(OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID)
    && entry.appliedRuleIds.every((id) => Boolean(registryRule(id)));
}

function validApplication(value: AprOperatorResponseApplication) {
  return Boolean(value.applicationId && value.responseId && value.customerKey && value.runRoot && value.sourceFingerprint && value.evidence)
    && Number.isFinite(Date.parse(value.appliedAt))
    && value.appliedRuleIds.includes(OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID)
    && value.appliedRuleIds.every((id) => Boolean(registryRule(id)));
}

function validState(value: AprOperatorResponseLedgerState) {
  const withoutHash = { version: value.version, revision: value.revision, responses: value.responses, applications: value.applications, updatedAt: value.updatedAt };
  return value.version === APR_OPERATOR_RESPONSE_LEDGER_VERSION
    && Number.isInteger(value.revision) && value.revision >= 0
    && Array.isArray(value.responses) && value.responses.every(validEntry)
    && Array.isArray(value.applications) && value.applications.every(validApplication)
    && value.contentSha256 === stateHash(withoutHash);
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); }
  finally { closeSync(directory); }
}

export function resolveOperatorResponseLedgerPath(rootDirectory: string) {
  const resolved = path.resolve(rootDirectory);
  const parts = resolved.split(path.sep);
  const cohortsIndex = parts.lastIndexOf("cohorts");
  if (cohortsIndex > 0 && cohortsIndex === parts.length - 2) {
    const base = parts.slice(0, cohortsIndex).join(path.sep) || path.sep;
    return path.join(base, "state", "operator-responses", "checkpoint.json");
  }
  return path.join(resolved, "operator-responses", "checkpoint.json");
}

export class PersistentAprOperatorResponseLedger {
  readonly checkpointPath: string;
  readonly lockPath: string;

  constructor(readonly rootDirectory: string, private readonly options: AprOperatorResponseLedgerOptions = {}) {
    this.checkpointPath = resolveOperatorResponseLedgerPath(rootDirectory);
    this.lockPath = `${this.checkpointPath}.lock`;
  }

  load(now = new Date()) {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprOperatorResponseLedgerState;
    if (!validState(value)) throw new Error("apr_operator_response_ledger_invalid");
    return value;
  }

  private acquireMutationLock() {
    const timeoutMs = Math.max(0, this.options.lockWaitTimeoutMs ?? 5_000);
    const pollMs = Math.max(1, this.options.lockPollIntervalMs ?? 20);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      try {
        mkdirSync(this.lockPath, { mode: 0o700 });
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "unknown";
        if (code !== "EEXIST") throw new Error(`apr_operator_response_ledger_lock_failed:${code}`);
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error("apr_operator_response_ledger_busy");
        waitForLockRelease(Math.min(pollMs, remainingMs));
      }
    }
  }

  private mutate(mutator: (state: AprOperatorResponseLedgerState) => AprOperatorResponseLedgerState, now: Date) {
    mkdirSync(path.dirname(this.checkpointPath), { recursive: true, mode: 0o700 });
    this.acquireMutationLock();
    try {
      const current = this.load(now);
      const candidate = mutator(structuredClone(current));
      const withoutHash = { version: candidate.version, revision: candidate.revision, responses: candidate.responses, applications: candidate.applications, updatedAt: candidate.updatedAt };
      const next = { ...candidate, contentSha256: stateHash(withoutHash) };
      if (!validState(next)) throw new Error("apr_operator_response_ledger_write_invalid");
      atomicWrite(this.checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    } finally { rmdirSync(this.lockPath); }
  }

  importResponses(entries: AprOperatorResponseEntry[], now = new Date()) {
    if (!entries.length || entries.some((entry) => !validEntry(entry))) throw new Error("apr_operator_response_import_invalid");
    const duplicateIds = entries.map((entry) => entry.responseId).filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length) throw new Error("apr_operator_response_import_duplicate");
    return this.mutate((state) => {
      for (const entry of entries) {
        const existing = state.responses.find((item) => item.responseId === entry.responseId);
        if (existing) {
          if (sha256(existing) !== sha256(entry)) throw new Error(`apr_operator_response_id_collision:${entry.responseId}`);
          continue;
        }
        if (entry.supersedesResponseId) {
          const superseded = state.responses.find((item) => item.responseId === entry.supersedesResponseId && item.customerKey === entry.customerKey);
          if (!superseded) throw new Error(`apr_operator_response_superseded_missing:${entry.responseId}`);
          superseded.status = "superseded";
        }
        state.responses.push(structuredClone(entry));
      }
      state.revision += 1;
      state.updatedAt = now.toISOString();
      return state;
    }, now);
  }

  projection(customerKey: string, practiceId?: string | null, now = new Date()): AprOperatorResponseProjection {
    const entries = this.load(now).responses
      .filter((entry) => entry.customerKey === customerKey
        && entry.status === "active"
        // Una risposta caso-specifica non puo' mai degradare a risposta per
        // solo nome quando il chiamante omette l'identificativo pratica.
        // Le sole risposte senza practiceId sono deliberatamente riusabili
        // sul cliente; tutte le altre richiedono una corrispondenza esatta.
        && (!entry.practiceId || (Boolean(practiceId) && entry.practiceId === practiceId)))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const latest = <K extends AprOperatorResponsePayload["kind"]>(kind: K) => [...entries].reverse().find((entry) => entry.payload.kind === kind)?.payload as Extract<AprOperatorResponsePayload, { kind: K }> | undefined;
    return {
      customerKey,
      entries,
      screeningProducts: latest("screening_products") ?? null,
      cadastralIdentifiers: latest("cadastral_identifiers") ?? null,
      oldWindowCharacteristics: latest("old_window_characteristics") ?? null,
      physicalProductCount: latest("physical_product_count") ?? null,
      documentRefresh: latest("document_refresh") ?? null,
      caseDisposition: latest("case_disposition") ?? null,
      // Decisione del titolare (13/09/2026): vince la risposta piu' recente,
      // per qualsiasi tipo. Una richiesta "in attesa di dato" resta valida
      // solo se e' l'ultima cosa che l'operatore ha detto su questa pratica:
      // se dopo e' arrivata una risposta con il dato (misure, decisione,
      // documento), la richiesta e' superata anche se nessuno l'ha marcata
      // tale. Rossella Munafo: richiesta dell'11/09 e misure del 12/09
      // entrambe attive, le misure applicate e la richiesta che continuava
      // a bloccare la pratica — per tre giri.
      operatorRequired: entries.at(-1)?.payload.kind === "operator_required"
        ? entries.at(-1)!.payload as Extract<AprOperatorResponsePayload, { kind: "operator_required" }>
        : null,
      caseDecisions: entries.filter((entry) => entry.payload.kind === "case_decision").map((entry) => entry.payload as Extract<AprOperatorResponsePayload, { kind: "case_decision" }>),
      generalRuleIds: [...new Set(entries.flatMap((entry) => entry.payload.kind === "general_rule_confirmation" ? entry.payload.ruleIds : []))],
    };
  }

  hasEffectiveApplication(responseId: string, customerKey: string, practiceId?: string | null, now = new Date()) {
    return [...this.load(now).applications].reverse().some((application) => application.responseId === responseId
      && application.customerKey === customerKey
      && (!application.practiceId || (Boolean(practiceId) && application.practiceId === practiceId))
      && application.outcome === "applied"
      // Le vecchie ricevute scritte dal ramo difettoso dichiaravano
      // letteralmente applicato il blocker, senza cambiare alcun dato.
      && application.evidence !== "blocker=operator_response_pending_external_data");
  }

  recordApplications(applications: Omit<AprOperatorResponseApplication, "applicationId" | "appliedRuleIds">[], now = new Date()) {
    if (!applications.length) return this.load(now);
    return this.mutate((state) => {
      for (const input of applications) {
        const applicationId = `operator-response-application:${sha256({ responseId: input.responseId, customerKey: input.customerKey, practiceId: input.practiceId, runRoot: input.runRoot, sourceFingerprint: input.sourceFingerprint, outcome: input.outcome, evidence: input.evidence })}`;
        if (state.applications.some((item) => item.applicationId === applicationId)) continue;
        if (!state.responses.some((entry) => entry.responseId === input.responseId && entry.customerKey === input.customerKey)) throw new Error(`apr_operator_response_application_unknown:${input.responseId}`);
        state.applications.push({ ...input, applicationId, appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID, OPERATOR_RESPONSE_LEDGER_CONCURRENCY_RULE_ID, "system-atomic-checkpoint-resume"] });
      }
      state.revision += 1;
      state.updatedAt = now.toISOString();
      return state;
    }, now);
  }
}

export function applyOperatorResponseDossierOverrides(dossierValue: unknown, projection: AprOperatorResponseProjection) {
  const dossier = structuredClone(object(dossierValue) ?? {});
  const row = object(dossier.row) ?? {};
  dossier.row = row;
  const dataForm = object(row.dati_form) ?? {};
  row.dati_form = dataForm;
  const appliedResponseIds: string[] = [];
  const applications: AprOperatorResponseOverrideApplication[] = [];
  const mark = (responseId: string, field: AprOperatorResponseOverrideApplication["field"], changed: boolean, evidence: string) => {
    applications.push({ responseId, field, outcome: changed ? "applied" : "not_applied", evidence });
    if (changed) appliedResponseIds.push(responseId);
  };
  const setIfChanged = (target: JsonObject, key: string, value: unknown) => {
    if (JSON.stringify(target[key]) === JSON.stringify(value)) return false;
    target[key] = value;
    return true;
  };
  if (projection.cadastralIdentifiers) {
    const cadastral = object(dataForm.catastali) ?? {};
    dataForm.catastali = cadastral;
    const sheetChanged = setIfChanged(cadastral, "foglio", projection.cadastralIdentifiers.sheet);
    const parcelChanged = setIfChanged(cadastral, "mappale", projection.cadastralIdentifiers.parcel);
    const changed = sheetChanged || parcelChanged;
    for (const entry of projection.entries.filter((candidate) => candidate.payload.kind === "cadastral_identifiers")) {
      mark(entry.responseId, "cadastral_identifiers", changed, changed
        ? `dossier.catastali.foglio=${projection.cadastralIdentifiers.sheet};mappale=${projection.cadastralIdentifiers.parcel}`
        : "Il dossier conteneva gia gli stessi identificativi catastali.");
    }
  }
  if (projection.oldWindowCharacteristics) {
    const product = object(dataForm.prodotto) ?? {};
    dataForm.prodotto = product;
    const material = projection.oldWindowCharacteristics.material === "metal" ? "metallo" : projection.oldWindowCharacteristics.material === "wood" ? "legno" : "pvc";
    const glazing = projection.oldWindowCharacteristics.glazing === "double" ? "vetro_doppio" : "vetro_singolo";
    const materialChanged = setIfChanged(product, "materiale_vecchi", material);
    const glazingChanged = setIfChanged(product, "vetro_vecchi", glazing);
    const changed = materialChanged || glazingChanged;
    for (const entry of projection.entries.filter((candidate) => candidate.payload.kind === "old_window_characteristics")) {
      mark(entry.responseId, "old_window_characteristics", changed, changed
        ? `dossier.prodotto.materiale_vecchi=${material};vetro_vecchi=${glazing}`
        : "Il dossier conteneva gia le stesse caratteristiche del vecchio infisso.");
    }
  }

  for (const entry of projection.entries.filter((candidate) => candidate.payload.kind === "case_decision" || candidate.payload.kind === "operator_required")) {
    const decision = operatorCaseDecision(entry);
    if (!decision) {
      mark(entry.responseId, null, false, "Risposta legacy non collegabile in modo univoco a uno dei cinque campi autorizzati.");
      continue;
    }
    const product = object(dataForm.prodotto) ?? {};
    dataForm.prodotto = product;
    if (decision.field === "completionDate") {
      const completionDate = parseOperatorDate(decision.value);
      const changed = completionDate ? setIfChanged(row, "data_fine_lavori", completionDate) : false;
      mark(entry.responseId, decision.field, changed, completionDate
        ? changed ? `dossier.row.data_fine_lavori=${completionDate}` : `La data ${completionDate} era gia presente nel dossier.`
        : "La risposta non contiene una data di calendario valida.");
      continue;
    }
    if (decision.field === "infissi.dimensioni_e_numero") {
      const rows = parseInfissiSurfaceRows(decision.value, entry.responseId);
      const changed = rows.length > 0 ? setIfChanged(product, "apr_operator_infissi_surface_rows", rows) : false;
      mark(entry.responseId, decision.field, changed, rows.length > 0
        ? changed ? `dossier.prodotto.apr_operator_infissi_surface_rows=${rows.map((item) => item.surfaceM2).join(",")}` : "Le stesse superfici per pezzo erano gia presenti nel dossier."
        : "Numero di pezzi e superfici in m2 non sono entrambi ricostruibili dalla risposta.");
      continue;
    }
    if (decision.field === "economic.invoiceTotal") {
      const invoiceTotal = parseOperatorMoney(decision.value);
      const economic = object(dataForm.economico) ?? {};
      dataForm.economico = economic;
      const changed = invoiceTotal !== null ? setIfChanged(economic, "invoice_total", invoiceTotal) : false;
      mark(entry.responseId, decision.field, changed, invoiceTotal !== null
        ? changed ? `dossier.economico.invoice_total=${invoiceTotal}` : `Il totale ${invoiceTotal} era gia presente nel dossier.`
        : "La risposta non contiene un importo finale univoco.");
      continue;
    }
    if (decision.field === "shading_closures") {
      const answer = parseOperatorBoolean(decision.value);
      const changed = answer !== null ? setIfChanged(product, "zanzariere_tapparelle_persiane", answer) : false;
      mark(entry.responseId, decision.field, changed, answer !== null
        ? changed ? `dossier.prodotto.zanzariere_tapparelle_persiane=${answer}` : `La risposta ${answer ? "si" : "no"} era gia presente nel dossier.`
        : "La risposta non e un si/no univoco.");
      continue;
    }
    const products = parsePendingScreeningProducts(decision.value, entry.question, entry.responseId);
    const changed = products.length > 0 ? setIfChanged(product, "apr_operator_screening_products", products) : false;
    mark(entry.responseId, decision.field, changed, products.length > 0
      ? changed ? `dossier.prodotto.apr_operator_screening_products=${products.map((item) => `${item.widthMm}x${item.heightMm}`).join(",")}` : "Le stesse misure prodotto erano gia presenti nel dossier."
      : "Il dato libero non contiene misure con unita sufficienti per una conversione deterministica.");
  }
  const storedProduct = object(dataForm.prodotto);
  return {
    dossier,
    appliedResponseIds: [...new Set(appliedResponseIds)],
    applications,
    infissiSurfaceRows: (Array.isArray(storedProduct?.apr_operator_infissi_surface_rows)
      ? storedProduct.apr_operator_infissi_surface_rows : []) as AprOperatorInfissiSurfaceRow[],
  };
}

export function operatorScreeningProducts(projection: AprOperatorResponseProjection) {
  const structured = projection.screeningProducts?.products.flatMap((product) => Array.from({ length: product.quantity }, () => ({
    description: product.description,
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    sourceId: `operator-response:${projection.customerKey}`,
  }))) ?? [];
  if (structured.length > 0) return structured;
  const legacy = [...projection.entries].reverse().find((entry) => operatorCaseDecision(entry)?.field === "operator.pendingData");
  return legacy ? parsePendingScreeningProducts(operatorCaseDecision(legacy)!.value, legacy.question, legacy.responseId) : [];
}

function normalizeDecisionText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’`]/g, "'").toLowerCase();
}

function operatorCaseDecision(entry: AprOperatorResponseEntry): { field: AprOperatorCaseDecisionField; value: string } | null {
  if (entry.payload.kind === "case_decision") return { field: entry.payload.field, value: entry.payload.value };
  if (entry.payload.kind !== "operator_required") return null;
  const explicit = entry.payload.field;
  if (explicit === "shading_closures" || explicit === "completionDate" || explicit === "economic.invoiceTotal" || explicit === "infissi.dimensioni_e_numero" || explicit === "operator.pendingData") {
    return { field: explicit, value: entry.answer };
  }
  const identity = normalizeDecisionText(`${entry.responseId} ${entry.question}`);
  if (/completion[-_. ]?date|fine lavori|portale annuale/.test(identity)) return { field: "completionDate", value: entry.answer };
  if (/infissi[-_. ]?dimensioni|dimensioni[-_. ]?e[-_. ]?numero|quanti serramenti|misura di ciascun/.test(identity)) return { field: "infissi.dimensioni_e_numero", value: entry.answer };
  if (/invoice[-_. ]?total|totale finale|totale (?:fattura|ordine)/.test(identity)) return { field: "economic.invoiceTotal", value: entry.answer };
  if (/shading[-_. ]?closures|chiusure oscuranti/.test(identity)) return { field: "shading_closures", value: entry.answer };
  if (/pending[-_. ]?data|dato mancante indicato|misure (?:della|del) (?:bioclimatica|pergotenda|tenda|schermatura)/.test(identity)) return { field: "operator.pendingData", value: entry.answer };
  return null;
}

function parseOperatorDate(value: string) {
  const match = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function parseItalianNumber(value: string) {
  const normalized = value.replace(/\s/g, "");
  const withDecimal = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const parsed = Number(withDecimal);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOperatorMoney(value: string) {
  const candidates = [...value.matchAll(/(?:€\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)(?:\s*€)?/g)]
    .map((match) => parseItalianNumber(match[1]))
    .filter((item): item is number => item !== null && item >= 0);
  return candidates.length === 1 ? candidates[0] : null;
}

function parseInfissiSurfaceRows(value: string, responseId: string): AprOperatorInfissiSurfaceRow[] {
  const declaredCount = Number(value.match(/\b(\d+)\s+(?:serrament|infiss|pezz)/i)?.[1] ?? "0");
  const surfaces = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:m\s*[²2]|mq)(?![a-z0-9])/gi)]
    .map((match) => parseItalianNumber(match[1]))
    .filter((item): item is number => item !== null && item > 0 && item < 100);
  if (!Number.isInteger(declaredCount) || declaredCount <= 0 || surfaces.length !== declaredCount) return [];
  return surfaces.map((surfaceM2, index) => ({ pieceNumber: index + 1, surfaceM2, sourceResponseId: responseId }));
}

function parseOperatorBoolean(value: string) {
  const normalized = normalizeDecisionText(value).trim();
  if (/^(?:si|sì|yes)\b/.test(normalized)) return true;
  if (/^(?:no)\b/.test(normalized)) return false;
  return null;
}

function parsePendingScreeningProducts(value: string, question: string, responseId: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  if (!match) return [];
  const rawWidth = parseItalianNumber(match[1]); const rawHeight = parseItalianNumber(match[2]);
  if (rawWidth === null || rawHeight === null || rawWidth <= 0 || rawHeight <= 0) return [];
  const multiplier = match[3].toLowerCase() === "m" ? 1_000 : match[3].toLowerCase() === "cm" ? 10 : 1;
  const widthMm = Math.round(rawWidth * multiplier); const heightMm = Math.round(rawHeight * multiplier);
  if (widthMm < 100 || heightMm < 100 || widthMm > 20_000 || heightMm > 20_000) return [];
  const descriptionMatch = `${value} ${question}`.match(/\b(bioclimatica|pergotenda|pergola|tenda da sole|schermatura|zanzariera)\b/i);
  return [{ description: descriptionMatch?.[1] ?? "Schermatura", widthMm, heightMm, sourceId: `operator-response:${responseId}` }];
}
