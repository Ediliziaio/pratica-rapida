import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { combineDocumentResults, containsHistoricalEneaAppendix, parseScreeningInvoiceText } from "../../src/features/enea-lab/invoiceParser";
import { classifyAprInfissiTechnicalDocument, type AprInfissiTechnicalDocumentClassification, type AprInfissiVerifiedDocumentKind } from "../../src/features/enea-shadow-crm/infissiTechnicalDocumentClassifier";
import { registryRule, USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_CRM_DOCUMENT_ANALYSIS_VERSION = "apr-crm-document-analysis-v1" as const;
const execFileAsync = promisify(execFile);
const RULE_IDS = ["core-form-first", "core-economic-classification", "core-gross-triple-reconciliation", "system-single-active-practice", "system-atomic-checkpoint-resume"];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export interface LocalPdfAnalysisResult {
  text: string;
  extractionMode: "native_text" | "macos_vision_ocr";
  pageCount: number;
}

export type LocalPdfAnalyzer = (pdfPath: string) => Promise<LocalPdfAnalysisResult>;

export async function analyzePdfLocally(pdfPath: string, ocrExecutable: string): Promise<LocalPdfAnalysisResult> {
  if (!existsSync(ocrExecutable)) throw new Error("ocr_executable_unavailable");
  const { stdout } = await execFileAsync(ocrExecutable, [pdfPath], { encoding: "utf8", timeout: 180_000, maxBuffer: 20 * 1024 * 1024 });
  const newline = stdout.indexOf("\n");
  if (!stdout.startsWith("APR_META:") || newline < 0) throw new Error("pdf_extractor_metadata_invalid");
  const metadata = JSON.parse(stdout.slice("APR_META:".length, newline)) as { mode?: unknown; pageCount?: unknown };
  if (!(["native_text", "macos_vision_ocr"] as unknown[]).includes(metadata.mode) || !Number.isInteger(metadata.pageCount) || (metadata.pageCount as number) < 1) throw new Error("pdf_extractor_metadata_invalid");
  const text = stdout.slice(newline + 1);
  if (text.replace(/\s+/g, "").length < 40 && path.extname(pdfPath).toLowerCase() === ".pdf") throw new Error("pdf_text_insufficient");
  return { text, extractionMode: metadata.mode as LocalPdfAnalysisResult["extractionMode"], pageCount: metadata.pageCount as number };
}

export interface AprCrmDocumentAnalysisItem {
  documentKey: string; customerKey: string; kind: "invoice" | "additional"; localPdfPath: string; sourceSha256: string;
  semanticKind: AprInfissiVerifiedDocumentKind;
  documentClassification: AprInfissiTechnicalDocumentClassification | null;
  state: "queued" | "analyzing" | "analyzed" | "blocked_analysis"; attemptCount: number; extractionMode: LocalPdfAnalysisResult["extractionMode"] | null;
  pageCount: number; textCharacterCount: number; textSha256: string | null; textPath: string | null;
  invoiceResult: ReturnType<typeof parseScreeningInvoiceText>["result"] | null;
  screeningItems: ReturnType<typeof parseScreeningInvoiceText>["items"];
  historicalEneaAppendixExcluded: boolean;
  nonFiscalImageExcluded: boolean;
  reason: string; startedAt: string | null; endedAt: string | null;
}

export interface AprCrmDocumentAnalysisState {
  version: typeof APR_CRM_DOCUMENT_ANALYSIS_VERSION; revision: number; status: "unprepared" | "queued" | "running" | "completed";
  sourceFingerprint: string | null; currentDocumentKey: string | null; items: AprCrmDocumentAnalysisItem[]; externalActionAllowed: false;
  reason: string; nextAction: string;
  parserRevisionsApplied: string[];
  analyzerRepairsApplied: string[];
  classificationRevisionsApplied: string[];
  audit: Array<{ revision: number; at: string; type: "initialized" | "prepared" | "source_revision_applied" | "analysis_claimed" | "analyzed" | "analysis_blocked" | "analyzer_repaired" | "parser_reanalyzed" | "document_classified" | "completed"; documentKey: string | null; reason: string; appliedRuleIds: string[] }>;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600); try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target); const directory = openSync(path.dirname(target), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

function initialState(now: Date): AprCrmDocumentAnalysisState {
  const reason = "Analisi locale degli allegati non ancora preparata.";
  return { version: APR_CRM_DOCUMENT_ANALYSIS_VERSION, revision: 0, status: "unprepared", sourceFingerprint: null, currentDocumentKey: null, items: [], externalActionAllowed: false,
    reason, nextAction: "Attendere acquisizione e fingerprint dei documenti originari.", parserRevisionsApplied: [], analyzerRepairsApplied: [], classificationRevisionsApplied: [], audit: [{ revision: 0, at: now.toISOString(), type: "initialized", documentKey: null, reason, appliedRuleIds: RULE_IDS }] };
}

function validState(value: AprCrmDocumentAnalysisState) {
  return value.version === APR_CRM_DOCUMENT_ANALYSIS_VERSION && value.externalActionAllowed === false
    && value.audit.every((event) => event.appliedRuleIds.every((id) => registryRule(id)));
}

type DownloadedInput = { documentKey: string; customerKey: string; kind: "invoice" | "additional"; localPath: string; responseSha256: string };

export function resolveAprPdfOcrExecutable(rootDirectory: string) {
  let candidateDirectory = path.resolve(rootDirectory);
  // I runtime live sono annidati in
  // <application>/cohorts/<cohort>/crm-live-processing/runtime. Risaliamo
  // fino al root permanente, senza dipendere dalla working directory.
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(candidateDirectory, "apr-pdf-ocr");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(candidateDirectory);
    if (parent === candidateDirectory) break;
    candidateDirectory = parent;
  }
  return path.join(path.dirname(path.resolve(rootDirectory)), "apr-pdf-ocr");
}

export class PersistentAprCrmDocumentAnalysis {
  readonly directory: string; readonly checkpointPath: string; readonly textDirectory: string; readonly analyzer: LocalPdfAnalyzer;
  constructor(readonly rootDirectory: string, analyzer?: LocalPdfAnalyzer) {
    this.directory = path.join(path.resolve(rootDirectory), "crm-document-analysis"); this.checkpointPath = path.join(this.directory, "checkpoint.json"); this.textDirectory = path.join(this.directory, "text");
    const ocrExecutable = resolveAprPdfOcrExecutable(rootDirectory); this.analyzer = analyzer ?? ((pdfPath) => analyzePdfLocally(pdfPath, ocrExecutable));
  }
  load(now = new Date()) { if (!existsSync(this.checkpointPath)) return initialState(now); try { const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCrmDocumentAnalysisState; value.analyzerRepairsApplied ??= []; value.classificationRevisionsApplied ??= []; for (const item of value.items) { item.nonFiscalImageExcluded ??= false; item.semanticKind ??= item.kind; item.documentClassification ??= null; } return validState(value) ? value : initialState(now); } catch { return initialState(now); } }
  private write(state: AprCrmDocumentAnalysisState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }
  initialize(now = new Date()) { const state = this.load(now); state.parserRevisionsApplied ??= []; state.analyzerRepairsApplied ??= []; state.classificationRevisionsApplied ??= []; if (!existsSync(this.checkpointPath)) this.write(state); return state; }
  prepare(documents: DownloadedInput[], sourceFingerprint: string, now = new Date()) {
    const current = this.initialize(now); if (current.sourceFingerprint === sourceFingerprint) return current; if (current.sourceFingerprint) throw new Error("crm_document_analysis_source_immutable");
    if (!/^[a-f0-9]{64}$/.test(sourceFingerprint) || documents.some((item) => !existsSync(item.localPath) || !/^[a-f0-9]{64}$/.test(item.responseSha256))) throw new Error("crm_document_analysis_source_invalid");
    const next = structuredClone(current); next.revision += 1; next.status = documents.length ? "queued" : "completed"; next.sourceFingerprint = sourceFingerprint;
    next.items = documents.map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, semanticKind: item.kind, documentClassification: null, localPdfPath: item.localPath, sourceSha256: item.responseSha256,
      state: "queued", attemptCount: 0, extractionMode: null, pageCount: 0, textCharacterCount: 0, textSha256: null, textPath: null, invoiceResult: null, screeningItems: [], historicalEneaAppendixExcluded: false, nonFiscalImageExcluded: false,
      reason: "In coda per estrazione testo esclusivamente locale.", startedAt: null, endedAt: null }));
    next.reason = `Preparati ${documents.length} documenti per estrazione locale; nessun contenuto inviato a servizi esterni.`; next.nextAction = "Analizzare un documento alla volta con testo nativo o OCR macOS locale.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "prepared", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS }); return this.write(next);
  }
  extendAfterDocumentCorrection(documents: DownloadedInput[], sourceFingerprint: string, now = new Date()) {
    const current = this.initialize(now);
    if (!current.sourceFingerprint) return this.prepare(documents, sourceFingerprint, now);
    if (current.sourceFingerprint === sourceFingerprint) return current;
    if (current.status !== "completed" || !/^[a-f0-9]{64}$/.test(sourceFingerprint) || documents.some((item) => !existsSync(item.localPath) || !/^[a-f0-9]{64}$/.test(item.responseSha256))) {
      throw new Error("crm_document_analysis_source_revision_invalid");
    }
    const incomingKeys = new Set(documents.map((item) => item.documentKey));
    if (current.items.some((item) => !incomingKeys.has(item.documentKey))) throw new Error("crm_document_analysis_source_revision_removed_existing_source");
    const existingKeys = new Set(current.items.map((item) => item.documentKey));
    const additions = documents.filter((item) => !existingKeys.has(item.documentKey));
    if (!additions.length) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.sourceFingerprint = sourceFingerprint; next.currentDocumentKey = null;
    next.items.push(...additions.map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, semanticKind: item.kind, documentClassification: null, localPdfPath: item.localPath, sourceSha256: item.responseSha256,
      state: "queued" as const, attemptCount: 0, extractionMode: null, pageCount: 0, textCharacterCount: 0, textSha256: null, textPath: null, invoiceResult: null, screeningItems: [], historicalEneaAppendixExcluded: false, nonFiscalImageExcluded: false,
      reason: "In coda dopo correzione identita; estrazione esclusivamente locale non ancora eseguita.", startedAt: null, endedAt: null })));
    next.reason = `Aggiunti ${additions.length} documenti dopo correzione delle fonti; ${current.items.length} analisi precedenti preservate.`;
    next.nextAction = "Analizzare esclusivamente i nuovi documenti locali senza ripetere download o OCR esistenti.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "source_revision_applied", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  async tick(now = new Date()) {
    const current = this.load(now); if (current.status === "unprepared" || current.status === "completed") return current;
    let item = current.items.find((candidate) => candidate.state === "analyzing") ?? null;
    if (!item) {
      const index = current.items.findIndex((candidate) => candidate.state === "queued"); if (index < 0) return this.complete(now);
      const claimed = structuredClone(current); item = claimed.items[index]; claimed.revision += 1; claimed.status = "running"; claimed.currentDocumentKey = item.documentKey;
      item.state = "analyzing"; item.attemptCount += 1; item.startedAt ??= now.toISOString(); item.reason = "Analisi locale reclamata; ripresa sicura dopo riavvio.";
      claimed.reason = `${item.customerKey}: analisi ${item.kind} in corso.`; claimed.audit.push({ revision: claimed.revision, at: now.toISOString(), type: "analysis_claimed", documentKey: item.documentKey, reason: item.reason, appliedRuleIds: RULE_IDS }); this.write(claimed);
    }
    try {
      const result = await this.analyzer(item.localPdfPath); const textHash = sha256(result.text); const textPath = path.join(this.textDirectory, item.customerKey, `${item.documentKey}.txt`); atomicWrite(textPath, result.text);
      const image = [".png", ".jpg", ".jpeg"].includes(path.extname(item.localPdfPath).toLowerCase());
      const compactText = result.text.replace(/\s+/g, "");
      const hasFiscalSignal = /fattur|ricevut|totale|imponibile|\biva\b|\beur\b|€|\d+[,.]\d{2}/i.test(result.text);
      const nonFiscalImageExcluded = image && compactText.length < 40 && !hasFiscalSignal;
      const parsed = item.kind === "invoice" && !nonFiscalImageExcluded ? parseScreeningInvoiceText(result.text, item.documentKey) : null;
      const historicalEneaAppendixExcluded = containsHistoricalEneaAppendix(result.text);
      const documentClassification = classifyAprInfissiTechnicalDocument({ storageKind: item.kind, text: result.text, historicalEneaAppendixExcluded });
      const next = structuredClone(this.load(now)); const target = next.items.find((candidate) => candidate.documentKey === item!.documentKey)!; next.revision += 1; target.state = "analyzed";
      target.extractionMode = result.extractionMode; target.pageCount = result.pageCount; target.textCharacterCount = result.text.length; target.textSha256 = textHash; target.textPath = textPath;
      target.invoiceResult = parsed?.result ?? null; target.screeningItems = parsed?.items ?? []; target.nonFiscalImageExcluded = nonFiscalImageExcluded; target.historicalEneaAppendixExcluded = historicalEneaAppendixExcluded; target.semanticKind = documentClassification.verifiedKind; target.documentClassification = documentClassification; target.endedAt = now.toISOString(); target.reason = nonFiscalImageExcluded
        ? "Immagine originaria acquisita e OCR eseguito, ma priva di segnali fiscali: conservata come fonte non fiscale ed esclusa dai calcoli."
        : `Testo estratto localmente (${result.extractionMode}); ${parsed ? `${parsed.items.length} righe schermatura rilevate` : documentClassification.verifiedKind === "third_party_certificate" ? `certificato tecnico di terza parte verificato (${documentClassification.profile})` : "documento non fiscale conservato come fonte"}.${target.historicalEneaAppendixExcluded ? " Appendice ENEA storica rilevata ed esclusa dall'uso." : ""}`;
      next.currentDocumentKey = null; next.reason = `${target.customerKey}: ${target.reason}`; next.nextAction = "Proseguire con il prossimo documento; ENEA resta chiusa.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "analyzed", documentKey: target.documentKey, reason: target.reason, appliedRuleIds: [...RULE_IDS, ...documentClassification.appliedRuleIds] }); this.write(next);
      return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "analyzing") ? next : this.complete(now);
    } catch (error) {
      const next = structuredClone(this.load(now)); const target = next.items.find((candidate) => candidate.documentKey === item!.documentKey)!; next.revision += 1; target.state = "blocked_analysis"; target.endedAt = now.toISOString();
      target.reason = `Analisi locale non riuscita: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300); next.currentDocumentKey = null; next.reason = `${target.customerKey}: ${target.reason}`; next.nextAction = "Registrare blocco documento e proseguire con il successivo.";
      next.audit.push({ revision: next.revision, at: now.toISOString(), type: "analysis_blocked", documentKey: target.documentKey, reason: target.reason, appliedRuleIds: RULE_IDS }); this.write(next);
      return next.items.some((candidate) => candidate.state === "queued" || candidate.state === "analyzing") ? next : this.complete(now);
    }
  }
  applyAnalyzerRepair(repairId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.analyzerRepairsApplied.includes(repairId)) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(repairId)) throw new Error("crm_document_analyzer_repair_id_invalid");
    const repairable = current.items.filter((item) => item.state === "blocked_analysis" && item.reason === "Analisi locale non riuscita: ocr_executable_unavailable");
    if (!repairable.length) return current;
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.currentDocumentKey = null; next.analyzerRepairsApplied.push(repairId);
    for (const item of next.items) if (repairable.some((candidate) => candidate.documentKey === item.documentKey)) {
      item.state = "queued"; item.reason = `Riarmato dopo riparazione locale ${repairId}; nessun accesso CRM o ENEA ripetuto.`; item.endedAt = null;
    }
    next.reason = `Riparato il percorso dell'analizzatore PDF locale per ${repairable.length} documenti; i PDF già acquisiti vengono riusati.`;
    next.nextAction = "Riprendere esclusivamente l'analisi locale dei PDF già salvati, senza ripetere download o accessi esterni.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "analyzer_repaired", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  applyNonFiscalImageRepair(repairId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.analyzerRepairsApplied.includes(repairId)) return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(repairId)) throw new Error("crm_document_analyzer_repair_id_invalid");
    const repairable = current.items.filter((item) => item.state === "blocked_analysis" && item.reason === "Analisi locale non riuscita: pdf_text_insufficient"
      && [".png", ".jpg", ".jpeg"].includes(path.extname(item.localPdfPath).toLowerCase()));
    if (!repairable.length) return current;
    const repairableKeys = new Set(repairable.map((item) => item.documentKey));
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.currentDocumentKey = null; next.analyzerRepairsApplied.push(repairId);
    for (const item of next.items) if (repairableKeys.has(item.documentKey)) { item.state = "queued"; item.reason = `Riarmato per classificazione immagine non fiscale ${repairId}.`; item.endedAt = null; }
    next.reason = `${repairable.length} immagini brevi riarmate per distinguere fonte non fiscale da documento illeggibile.`;
    next.nextAction = "Ripetere soltanto l'OCR locale delle immagini riarmate; nessun accesso CRM o ENEA.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "analyzer_repaired", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  applyTechnicalPerformanceDiagramOcrRepair(repairId: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.analyzerRepairsApplied.includes(repairId) || current.status !== "completed") return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(repairId)) throw new Error("crm_document_analyzer_repair_id_invalid");
    const repairable = current.items.filter((item) => {
      if (item.state !== "analyzed" || !item.textPath || item.nonFiscalImageExcluded) return false;
      const text = readFileSync(item.textPath, "utf8");
      return /DICHIARAZIONE DI PRESTAZIONE/iu.test(text)
        && /Trasmittanza\s+termica\s+U[wd]/iu.test(text)
        && !text.includes("APR_VERTICAL_DIMENSION_CLOCKWISE_OCR:");
    });
    if (!repairable.length) return current;
    const repairableKeys = new Set(repairable.map((item) => item.documentKey));
    const next = structuredClone(current); next.revision += 1; next.status = "queued"; next.currentDocumentKey = null; next.analyzerRepairsApplied.push(repairId);
    for (const item of next.items) if (repairableKeys.has(item.documentKey)) {
      item.state = "queued"; item.reason = `Riarmato per OCR focalizzato sui diagrammi tecnici ${repairId}; PDF locale e identita fonte preservati.`; item.endedAt = null;
    }
    next.reason = `${repairable.length} dichiarazioni di prestazione riarmate per leggere le dimensioni esterne dei diagrammi; nessun nuovo accesso CRM.`;
    next.nextAction = "Ripetere soltanto l'OCR locale dei PDF tecnici riarmati e ricalcolare la cardinalita.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "analyzer_repaired", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS });
    return this.write(next);
  }
  applyTechnicalDocumentClassificationRevision(classificationRevision: string, now = new Date()) {
    const current = this.initialize(now);
    if (current.classificationRevisionsApplied.includes(classificationRevision) || current.status !== "completed") return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(classificationRevision)) throw new Error("crm_document_classification_revision_invalid");
    const next = structuredClone(current); next.revision += 1; let promoted = 0; let evaluated = 0;
    for (const item of next.items) {
      if (item.state !== "analyzed" || !item.textPath) continue;
      const text = readFileSync(item.textPath, "utf8");
      const classification = classifyAprInfissiTechnicalDocument({ storageKind: item.kind, text, historicalEneaAppendixExcluded: item.historicalEneaAppendixExcluded });
      item.semanticKind = classification.verifiedKind;
      item.documentClassification = classification;
      evaluated += 1;
      if (classification.verifiedKind === "third_party_certificate") promoted += 1;
    }
    next.classificationRevisionsApplied.push(classificationRevision);
    next.reason = `Classificazione semantica ${classificationRevision} applicata a ${evaluated} documenti locali; ${promoted} certificati tecnici di terza parte verificati.`;
    next.nextAction = "Ricalcolare i preflight Infissi usando il tipo semantico verificato, senza ripetere download o OCR.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "document_classified", documentKey: null, reason: next.reason,
      appliedRuleIds: [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.thirdPartyTechnicalCertificateClassification, USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted] });
    return this.write(next);
  }
  applyParserRevision(parserRevision: string, now = new Date()) {
    const current = this.initialize(now); if (current.parserRevisionsApplied.includes(parserRevision) || current.status !== "completed") return current;
    if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/.test(parserRevision)) throw new Error("crm_document_parser_revision_invalid");
    const next = structuredClone(current); next.revision += 1; let reparsed = 0;
    for (const item of next.items) {
      if (item.state !== "analyzed" || !item.textPath) continue;
      if (item.nonFiscalImageExcluded) continue;
      const text = readFileSync(item.textPath, "utf8"); item.historicalEneaAppendixExcluded = containsHistoricalEneaAppendix(text);
      if (item.kind !== "invoice") {
        item.reason = `Testo gia' estratto localmente; documento non fiscale conservato come fonte.${item.historicalEneaAppendixExcluded ? " Appendice ENEA storica rilevata ed esclusa dall'uso." : ""}`;
        continue;
      }
      const parsed = parseScreeningInvoiceText(text, item.documentKey); item.invoiceResult = parsed.result; item.screeningItems = parsed.items; item.reason = `Testo gia' estratto localmente; ${parsed.items.length} righe schermatura rilevate.${item.historicalEneaAppendixExcluded ? " Appendice ENEA storica rilevata ed esclusa dall'uso." : ""}`; reparsed += 1;
    }
    next.parserRevisionsApplied.push(parserRevision); next.reason = `Parser ${parserRevision} applicato localmente a ${reparsed} fatture senza ripetere download, OCR o accessi CRM.`;
    next.nextAction = "Ricalcolare i report per-pratica e isolare soltanto i conflitti residui verificabili.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "parser_reanalyzed", documentKey: null, reason: next.reason,
      appliedRuleIds: parserRevision === "invoice-parser-v14-multipage-vat-inclusive-total" ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded]
        : parserRevision === "invoice-parser-v15-narrative-product-groups" ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.narrativeInvoiceProductExtraction, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]
          : parserRevision === "invoice-parser-v33-header-identity-over-body-reference" ? [...RULE_IDS, "system-invoice-header-identity-over-body-reference", USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded]
          : ["invoice-parser-v26-zanzasol-description-after-price", "invoice-parser-v28-lm-tende-multi-product-balance", "invoice-parser-v29-odhaus-avvolgibili-supporting-declaration", "invoice-parser-v31-rinaldi-sp-dot-and-vat-layout"].includes(parserRevision) ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.narrativeInvoiceProductExtraction, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, USER_AUTHORIZED_RULE_IDS.invoiceGrossTotalVatIncluded]
          : ["invoice-parser-v34-linea-sole-partial-paper-scomparsa", "invoice-parser-v35-composite-invoice-transfer-segmentation"].includes(parserRevision) ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]
          : parserRevision === "invoice-parser-v25-vans-awning-missing-gtot" ? [...RULE_IDS, USER_AUTHORIZED_RULE_IDS.genericAwningScreening, USER_AUTHORIZED_RULE_IDS.technicalProductCardinality]
          : RULE_IDS });
    return this.write(next);
  }
  private complete(now: Date) {
    const current = this.load(now); if (current.status === "completed") return current; const next = structuredClone(current); next.revision += 1; next.status = "completed"; next.currentDocumentKey = null;
    const analyzed = next.items.filter((item) => item.state === "analyzed").length; const blocked = next.items.length - analyzed; next.reason = `Analisi documenti locale conclusa: ${analyzed} analizzati, ${blocked} bloccati.`; next.nextAction = "Validare per pratica form, fatture, prodotti e differenze applicando il registro unico.";
    next.audit.push({ revision: next.revision, at: now.toISOString(), type: "completed", documentKey: null, reason: next.reason, appliedRuleIds: RULE_IDS }); return this.write(next);
  }
  snapshot(now = new Date()) {
    const state = this.load(now); const customerReports = [...new Set(state.items.map((item) => item.customerKey))].map((customerKey) => {
      const items = state.items.filter((item) => item.customerKey === customerKey); const parsed = items.filter((item) => item.kind === "invoice" && item.invoiceResult).map((item) => ({ result: item.invoiceResult!, items: item.screeningItems }));
      const combined = parsed.length ? combineDocumentResults(parsed) : null;
      return { customerKey, documents: items.length, analyzed: items.filter((item) => item.state === "analyzed").length, ocrDocuments: items.filter((item) => item.extractionMode === "macos_vision_ocr").length,
        historicalEneaExcludedDocuments: items.filter((item) => item.historicalEneaAppendixExcluded).length,
        nonFiscalImagesExcluded: items.filter((item) => item.nonFiscalImageExcluded).length,
        invoiceTotal: combined?.invoiceTotal ?? null, eligibleExpense: combined?.eligibleExpense ?? null, screeningRows: combined?.items.length ?? 0, blockers: combined?.blockers ?? [] };
    });
    return { ...state, progress: { total: state.items.length, queued: state.items.filter((item) => item.state === "queued" || item.state === "analyzing").length, analyzed: state.items.filter((item) => item.state === "analyzed").length, blocked: state.items.filter((item) => item.state === "blocked_analysis").length }, customerReports, lastEvent: state.audit.at(-1)!, observedAt: now.toISOString() };
  }
}
