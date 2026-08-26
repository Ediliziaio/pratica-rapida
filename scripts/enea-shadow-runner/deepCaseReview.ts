import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { registryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";

// Incrementare la versione quando cambia la classificazione dei blocker: il
// checkpoint precedente deve essere rigiocato, non riusato con una semantica
// ormai superata.
export const APR_DEEP_CASE_REVIEW_VERSION = "apr-deep-case-review-v4" as const;
export const APR_DEEP_REVIEW_RULE_IDS = Object.freeze([
  "system-apr-deep-review-before-operator",
  "system-apr-technical-repair-queue",
  "system-apr-learning-closure-gate",
  "system-atomic-checkpoint-resume",
] as const);

export type DeepReviewClassification = "AUTO_RESOLVED" | "TECHNICAL_REPAIR" | "OPERATOR_REQUIRED" | "BUSINESS_RULE_REQUIRED";
export type DeepReviewItemState = "queued" | "reviewing" | "auto_resolved" | "technical_repair" | "operator_required" | "business_rule_required";

type Json = Record<string, any>;
const object = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

// Questi codici descrivono limiti del software quando le fonti locali esistono.
// Non sono regole business e non autorizzano valori o inferenze nuove.
export const TECHNICAL_REPAIR_BLOCKER_CODES = new Set([
  "bank_transfer_invoice_cross_check_failed",
  "completion_date_missing",
  "draft_payload_mapping_incomplete",
  "gross_triple_reconciliation_failed",
  "infissi_dimensions_and_cardinality_missing",
  "infissi_financial_triple_reconciliation_required",
  "screenings_missing",
  "tax_code_missing_or_invalid",
]);

// Questi codici richiedono una nuova prova primaria o una decisione umana gia
// prevista dalle policy. APR puo comunque riparare gli altri codici dello stesso
// caso, ma non puo dichiarare il caso autonomamente verde.
export const OPERATOR_EVIDENCE_BLOCKER_CODES = new Set([
  "bank_transfer_principal_exceeds_invoices",
  "bundled_professional_expense_unitemized",
  "completion_date_portal_year_mismatch",
  "completion_over_90_days_operator_required",
  "customer_form_missing",
  "infissi_automatic_source_conflict",
  "infissi_invoice_certificate_cardinality_mismatch",
  "infissi_performance_page_cardinality_mismatch",
  "infissi_shading_closures_form_answer_missing_or_ambiguous",
  "original_invoice_missing_or_unavailable",
  "screening_primary_measurements_missing",
  "product_cardinality_form_invoice_mismatch",
]);

function normalizedCode(code: string) {
  return /^invoice_[a-f0-9]{8}$/i.test(code) ? "invoice_parser_unclassified" : code;
}

function codeKind(code: string): "technical" | "operator" | "business" {
  const normalized = normalizedCode(code);
  if (/^screening_fallback_material_category_conflict_\d+$/.test(normalized)) return "technical";
  if (normalized === "invoice_parser_unclassified" || TECHNICAL_REPAIR_BLOCKER_CODES.has(normalized)) return "technical";
  if (OPERATOR_EVIDENCE_BLOCKER_CODES.has(normalized)) return "operator";
  return "business";
}

export interface DeepReviewEvidencePass {
  id: "source_inventory" | "document_extraction" | "rule_replay";
  ok: boolean;
  detail: string;
  sourceIds: string[];
}

export interface DeepReviewItem {
  customerKey: string;
  displayName: string;
  practiceId: string;
  productModule: "screening" | "infissi" | "mixed";
  dossierPath: string;
  state: DeepReviewItemState;
  classification: DeepReviewClassification | null;
  attemptCount: number;
  startedAt: string | null;
  endedAt: string | null;
  blockerCodes: string[];
  technicalRepairCodes: string[];
  operatorCodes: string[];
  businessRuleCodes: string[];
  matchedRuleIds: string[];
  evidencePasses: DeepReviewEvidencePass[];
  sourceFingerprint: string;
  reason: string;
  nextAction: string;
}

export interface DeepReviewState {
  version: typeof APR_DEEP_CASE_REVIEW_VERSION;
  revision: number;
  status: "unprepared" | "working" | "completed";
  sourceFingerprint: string | null;
  currentCustomerKey: string | null;
  externalActionAllowed: false;
  items: DeepReviewItem[];
  progress: { total: number; processed: number; autoResolved: number; technicalRepair: number; operatorRequired: number; businessRuleRequired: number };
  reason: string;
  nextAction: string;
  audit: Array<{ revision: number; at: string; type: "initialized" | "prepared" | "claimed" | "classified" | "completed"; customerKey: string | null; reason: string; appliedRuleIds: string[] }>;
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

function progress(items: DeepReviewItem[]): DeepReviewState["progress"] {
  return {
    total: items.length,
    processed: items.filter((item) => !["queued", "reviewing"].includes(item.state)).length,
    autoResolved: items.filter((item) => item.state === "auto_resolved").length,
    technicalRepair: items.filter((item) => item.state === "technical_repair").length,
    operatorRequired: items.filter((item) => item.state === "operator_required").length,
    businessRuleRequired: items.filter((item) => item.state === "business_rule_required").length,
  };
}

function initialState(now: Date): DeepReviewState {
  const reason = "Revisione profonda non ancora preparata; nessuna azione esterna consentita.";
  return { version: APR_DEEP_CASE_REVIEW_VERSION, revision: 0, status: "unprepared", sourceFingerprint: null, currentCustomerKey: null, externalActionAllowed: false, items: [], progress: progress([]), reason, nextAction: "Attendere preflight locale terminale.", audit: [{ revision: 0, at: now.toISOString(), type: "initialized", customerKey: null, reason, appliedRuleIds: [...APR_DEEP_REVIEW_RULE_IDS] }] };
}

function readJson(file: string): Json | null {
  if (!existsSync(file)) return null;
  try { return object(JSON.parse(readFileSync(file, "utf8"))); }
  catch { return null; }
}

function blockerRows(report: Json | null) {
  return array(report?.blockers).map((value) => object(value)).filter(Boolean) as Json[];
}

function commonReportDocumentsScreening(report: Json | null) {
  return blockerRows(report).some((blocker) => text(blocker.code).startsWith("screening_") || /^screenings(?:\.|$)/.test(text(blocker.field)));
}

function mergedReports(reports: Array<Json | null>): Json | null {
  const present = reports.filter((report): report is Json => Boolean(report));
  if (!present.length) return null;
  return {
    blockers: present.flatMap((report) => blockerRows(report)),
    sourceIds: [...new Set(present.flatMap((report) => array(report.sourceIds).map(text)).filter(Boolean))],
    appliedRuleIds: [...new Set(present.flatMap((report) => array(report.appliedRuleIds).map(text)).filter(Boolean))],
    financial: { appliedRuleIds: [...new Set(present.flatMap((report) => array(report.financial?.appliedRuleIds).map(text)).filter(Boolean))] },
    technical: { audit: { appliedRuleIds: [...new Set(present.flatMap((report) => array(report.technical?.audit?.appliedRuleIds).map(text)).filter(Boolean))] } },
    productRules: { audit: { appliedRuleIds: [...new Set(present.flatMap((report) => array(report.productRules?.audit?.appliedRuleIds).map(text)).filter(Boolean))] } },
  };
}

function sourceIdsForReport(report: Json | null) {
  return [...new Set([
    ...array(report?.sourceIds).map(text),
    ...blockerRows(report).flatMap((blocker) => array(blocker.sourceIds).map(text)),
  ].filter(Boolean))];
}

function matchedRules(report: Json | null) {
  const ids = [
    ...array(report?.appliedRuleIds).map(text),
    ...blockerRows(report).flatMap((blocker) => array(blocker.appliedRuleIds).map(text)),
    ...array(report?.financial?.appliedRuleIds).map(text),
    ...array(report?.technical?.audit?.appliedRuleIds).map(text),
    ...array(report?.productRules?.audit?.appliedRuleIds).map(text),
  ];
  return [...new Set(ids.filter((id) => Boolean(registryRule(id))))];
}

function questionFor(code: string) {
  switch (code) {
    case "original_invoice_missing_or_unavailable": return "Acquisire la fattura originaria mancante e rimettere la pratica in Pronte da fare.";
    case "screening_primary_measurements_missing": return "Inserire o allegare le misure fisiche del prodotto (larghezza e altezza/sporgenza), quindi rimettere la pratica in Pronte da fare.";
    case "customer_form_missing": return "Acquisire il form cliente mancante e rimettere la pratica in Pronte da fare.";
    case "infissi_invoice_certificate_cardinality_mismatch":
    case "infissi_performance_page_cardinality_mismatch": return "Confermare la cardinalita corretta o fornire il certificato tecnico mancante/corretto.";
    case "product_cardinality_form_invoice_mismatch": return "Confermare quale quantita fisica e documentata quando form e fattura restano esplicitamente discordanti.";
    case "infissi_shading_closures_form_answer_missing_or_ambiguous": return "Confermare se sono state installate chiusure oscuranti insieme agli infissi.";
    case "bank_transfer_principal_exceeds_invoices": return "Verificare perche il capitale bonificato supera il totale delle fatture originarie.";
    case "bundled_professional_expense_unitemized": return "Indicare la sola spesa tecnica ammissibile separando il servizio professionale non quantificato.";
    case "completion_date_portal_year_mismatch": return "Selezionare il portale ENEA dell'anno corretto senza modificare la data della fonte; poi rimettere la pratica in Pronte da fare.";
    case "completion_over_90_days_operator_required": return "Verificare la procedibilita rispetto al termine applicabile; non modificare la data della fonte.";
    default: return `Risolvere il conflitto documentale ${code} con una prova primaria esplicita.`;
  }
}

function buildEvidencePasses(item: DeepReviewItem, documentState: Json | null, report: Json | null): DeepReviewEvidencePass[] {
  const sourceIds = sourceIdsForReport(report);
  const documents = array(documentState?.items).map((value) => object(value)).filter((value): value is Json => Boolean(value && text(value.customerKey) === item.customerKey));
  const analyzed = documents.filter((document) => document.state === "analyzed");
  const extractionModes = [...new Set(analyzed.map((document) => text(document.extractionMode)).filter(Boolean))];
  const multipage = analyzed.filter((document) => Number(document.pageCount) > 1).length;
  const rules = matchedRules(report);
  return [
    { id: "source_inventory", ok: existsSync(item.dossierPath) && sourceIds.length > 0, detail: `${sourceIds.length} fonti referenziate; dossier ${existsSync(item.dossierPath) ? "presente" : "assente"}.`, sourceIds },
    { id: "document_extraction", ok: analyzed.length > 0, detail: `${analyzed.length}/${documents.length} documenti analizzati; metodi=${extractionModes.join(",") || "nessuno"}; multipagina=${multipage}.`, sourceIds: analyzed.map((document) => text(document.documentKey)).filter(Boolean) },
    { id: "rule_replay", ok: rules.length > 0, detail: `${rules.length} regole registrate abbinate al report; nessuna nuova regola business inventata.`, sourceIds: rules },
  ];
}

function validState(value: DeepReviewState) {
  return value.version === APR_DEEP_CASE_REVIEW_VERSION && value.externalActionAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.length > 0 && event.appliedRuleIds.every((id) => Boolean(registryRule(id))));
}

export class PersistentAprDeepCaseReview {
  readonly directory: string;
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "deep-case-review");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }
  load(now = new Date()): DeepReviewState {
    if (!existsSync(this.checkpointPath)) return initialState(now);
    try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as DeepReviewState; return validState(value) ? value : initialState(now); }
    catch { return initialState(now); }
  }
  private write(state: DeepReviewState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); if (!existsSync(this.checkpointPath)) this.write(state); return state; }

  prepareFromCurrentCheckpoints(now = new Date()) {
    const current = this.initialize(now);
    const seed = readJson(path.join(this.rootDirectory, "cohort-seed", "checkpoint.json"));
    const common = readJson(path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json"));
    const infissi = readJson(path.join(this.rootDirectory, "infissi-batch-preflight", "checkpoint.json"));
    if (!seed || common?.status !== "completed" || (infissi && infissi.status !== "completed") || !array(seed.candidates).length) return current;
    const commonByKey = new Map(array(common.items).map((value) => object(value)).filter(Boolean).map((item) => [text(item!.customerKey), item!]));
    const infissiByKey = new Map(array(infissi?.items).map((value) => object(value)).filter(Boolean).map((item) => [text(item!.customerKey), item!]));
    const replay = readJson(path.join(this.rootDirectory, "learning-replay", "checkpoint.json"));
    const routedModuleByKey = new Map(array(replay?.cases).map((value) => object(value)).filter(Boolean).map((item) => [text(item!.customerKey), text(item!.productModule)]));
    const candidates = array(seed.candidates).map((value) => object(value)).filter(Boolean) as Json[];
    const blocked = candidates.flatMap((candidate) => {
      const customerKey = text(candidate.customerKey);
      const routedModule = routedModuleByKey.get(customerKey);
      const commonSource = commonByKey.get(customerKey); const infissiSource = infissiByKey.get(customerKey);
      const commonReport = object(commonSource?.report);
      const module: DeepReviewItem["productModule"] = routedModule === "mixed" || routedModule === "screening" || routedModule === "infissi"
        ? routedModule
        : infissiSource?.productModule === "mixed" ? "mixed"
          : infissiSource ? "infissi"
            : commonReportDocumentsScreening(commonReport) ? "screening"
              : candidate.productModule === "infissi" ? "infissi" : "screening";
      const sources = module === "mixed" ? [commonSource, infissiSource] : module === "infissi" ? [infissiSource] : [commonSource];
      const blockedSources = sources.filter((source): source is Json => Boolean(source && source.state === "blocked_case" && object(source.report)));
      if (!blockedSources.length) return [];
      const source = blockedSources[0]; const report = mergedReports(blockedSources.map((item) => object(item.report)))!;
      const blockers = blockerRows(report); const blockerCodes = blockers.map((blocker) => text(blocker.code)).filter(Boolean);
      const sourceFingerprint = sha256({ customerKey, module, dossierPath: source.dossierPath, blockerCodes, reports: blockedSources.map((item) => item.report) });
      return [{ customerKey, displayName: text(source.displayName) || text(candidate.displayName), practiceId: text(source.practiceId) || text(candidate.practiceId), productModule: module, dossierPath: text(source.dossierPath), state: "queued" as const, classification: null, attemptCount: 0, startedAt: null, endedAt: null, blockerCodes, technicalRepairCodes: [], operatorCodes: [], businessRuleCodes: [], matchedRuleIds: [], evidencePasses: [], sourceFingerprint, reason: "In coda per revisione profonda locale prima dell'intervento operatore.", nextAction: "Verificare inventario fonti, estrazione documenti e regole gia autorizzate." } satisfies DeepReviewItem];
    });
    const sourceFingerprint = sha256({ seed: seed.candidateFingerprint, common: common.sourceFingerprint, commonRevision: common.revision, infissi: infissi?.sourceFingerprint ?? null, infissiRevision: infissi?.revision ?? null, blocked: blocked.map((item) => [item.customerKey, item.sourceFingerprint]) });
    if (current.sourceFingerprint === sourceFingerprint) return current;
    if (current.sourceFingerprint && current.status !== "completed") return current;
    const previousByKey = new Map(current.items.map((item) => [item.customerKey, item]));
    const items = blocked.map((item) => previousByKey.get(item.customerKey)?.sourceFingerprint === item.sourceFingerprint ? previousByKey.get(item.customerKey)! : item);
    const revision = current.revision + 1; const reason = `${items.length} casi preflight preparati per revisione profonda; nessuna azione CRM o ENEA.`;
    return this.write({ ...current, revision, status: items.every((item) => !["queued", "reviewing"].includes(item.state)) ? "completed" : "working", sourceFingerprint, currentCustomerKey: null, items, progress: progress(items), reason, nextAction: "Analizzare una pratica alla volta e distinguere riparazione tecnica da intervento umano reale.", audit: [...current.audit, { revision, at: now.toISOString(), type: "prepared", customerKey: null, reason, appliedRuleIds: [...APR_DEEP_REVIEW_RULE_IDS] }] });
  }

  tick(now = new Date()) {
    let current = this.load(now);
    if (current.status !== "working") return current;
    const reviewing = current.items.find((item) => item.state === "reviewing");
    if (!reviewing) {
      const index = current.items.findIndex((item) => item.state === "queued");
      if (index < 0) return this.complete(now);
      const next = structuredClone(current); const item = next.items[index]; next.revision += 1; next.currentCustomerKey = item.customerKey; item.state = "reviewing"; item.attemptCount += 1; item.startedAt ??= now.toISOString(); item.reason = "Revisione profonda reclamata dal checkpoint persistente.";
      next.reason = `${item.displayName}: revisione profonda in corso.`; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "claimed", customerKey: item.customerKey, reason: item.reason, appliedRuleIds: [...APR_DEEP_REVIEW_RULE_IDS] }); return this.write(next);
    }
    const common = readJson(path.join(this.rootDirectory, "crm-local-preflight", "checkpoint.json"));
    const infissi = readJson(path.join(this.rootDirectory, "infissi-batch-preflight", "checkpoint.json"));
    const documents = readJson(path.join(this.rootDirectory, "crm-document-analysis", "checkpoint.json"));
    const commonSource = array(common?.items).map((value) => object(value)).find((value) => text(value?.customerKey) === reviewing.customerKey) ?? null;
    const infissiSource = array(infissi?.items).map((value) => object(value)).find((value) => text(value?.customerKey) === reviewing.customerKey) ?? null;
    const sources = reviewing.productModule === "mixed" ? [commonSource, infissiSource] : reviewing.productModule === "infissi" ? [infissiSource] : [commonSource];
    const report = mergedReports(sources.filter((source) => source?.state === "blocked_case").map((source) => object(source?.report)));
    const technical = reviewing.blockerCodes.filter((code) => codeKind(code) === "technical");
    const operator = reviewing.blockerCodes.filter((code) => codeKind(code) === "operator");
    const business = reviewing.blockerCodes.filter((code) => codeKind(code) === "business");
    const classification: DeepReviewClassification = operator.length ? "OPERATOR_REQUIRED" : business.length ? "BUSINESS_RULE_REQUIRED" : technical.length ? "TECHNICAL_REPAIR" : "AUTO_RESOLVED";
    const next = structuredClone(current); const item = next.items.find((candidate) => candidate.customerKey === reviewing.customerKey)!; next.revision += 1; next.currentCustomerKey = null; item.classification = classification; item.state = classification.toLowerCase() as DeepReviewItemState; item.technicalRepairCodes = technical; item.operatorCodes = operator; item.businessRuleCodes = business; item.matchedRuleIds = matchedRules(report); item.evidencePasses = buildEvidencePasses(item, documents, report); item.endedAt = now.toISOString();
    item.reason = classification === "TECHNICAL_REPAIR" ? `Le fonti sono presenti ma ${technical.join(", ")} richiede una correzione generale di estrazione/riconciliazione.` : classification === "OPERATOR_REQUIRED" ? `Resta necessaria una prova primaria o decisione operatore: ${operator.join(", ")}.` : classification === "BUSINESS_RULE_REQUIRED" ? `Manca una regola business autorizzata per: ${business.join(", ")}.` : "Le regole esistenti risolvono tutti i blocker senza nuovo valore.";
    item.nextAction = classification === "TECHNICAL_REPAIR" ? "Accodare la riparazione tecnica generale; testare, installare e rieseguire lo stesso dossier." : classification === "OPERATOR_REQUIRED" ? questionFor(operator[0]) : classification === "BUSINESS_RULE_REQUIRED" ? `Richiedere una policy esplicita per ${business[0]}.` : "Riaccodare il preflight con la medesima fonte e una nuova revisione validata.";
    next.progress = progress(next.items); next.reason = `${item.displayName}: ${classification}.`; next.nextAction = next.items.some((candidate) => candidate.state === "queued" || candidate.state === "reviewing") ? "Proseguire con il caso successivo." : "Finalizzare il report di revisione profonda."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "classified", customerKey: item.customerKey, reason: `${classification}: ${item.reason}`, appliedRuleIds: [...new Set([...APR_DEEP_REVIEW_RULE_IDS, ...item.matchedRuleIds])] }); this.write(next);
    return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "reviewing") ? next : this.complete(now);
  }

  runToCompletion(now = new Date()) {
    let state = this.prepareFromCurrentCheckpoints(now); let guard = 0;
    while (state.status === "working" && guard < Math.max(4, state.items.length * 3)) { state = this.tick(new Date(now.getTime() + (++guard * 1000))); }
    return state;
  }
  private complete(now: Date) {
    const current = this.load(now); if (current.status === "completed") return current;
    const next = structuredClone(current); next.revision += 1; next.status = "completed"; next.currentCustomerKey = null; next.progress = progress(next.items); next.reason = `Revisione profonda conclusa: ${next.progress.technicalRepair} riparazioni tecniche, ${next.progress.operatorRequired} interventi operatore, ${next.progress.businessRuleRequired} regole business mancanti, ${next.progress.autoResolved} risolti automaticamente.`; next.nextAction = next.progress.technicalRepair ? "Correggere in ordine la coda tecnica e rieseguire i dossier dal checkpoint." : "Rieseguire i casi risolti e mostrare le sole richieste operatore residue."; next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed", customerKey: null, reason: next.reason, appliedRuleIds: [...APR_DEEP_REVIEW_RULE_IDS] }); return this.write(next);
  }
  snapshot(now = new Date()) { const state = this.load(now); return { ...state, progress: progress(state.items), repairQueue: state.items.filter((item) => item.state === "technical_repair").map((item) => ({ customerKey: item.customerKey, displayName: item.displayName, productModule: item.productModule, blockerCodes: item.technicalRepairCodes, sourceFingerprint: item.sourceFingerprint, nextAction: item.nextAction })), lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() }; }
}
