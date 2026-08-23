import { createHash, randomUUID } from "node:crypto";
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprCrmAcquisitionItem } from "./crmAuthenticatedReadOnly";
import { PersistentAprCrmDocumentAnalysis, analyzePdfLocally, resolveAprPdfOcrExecutable } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { resolveAprDocumentedProductRouting } from "../../src/features/enea-shadow-crm/documentedProductRouting";

export const APR_LEARNING_REPLAY_VERSION = "apr-learning-replay-v1" as const;

type SourceAcquisition = { candidateFingerprint: string; items: AprCrmAcquisitionItem[] };
type SourceDocuments = { sourceSetFingerprint: string; items: Array<{
  documentKey: string; customerKey: string; practiceId: string; kind: "invoice" | "additional";
  state: string; localPath: string; responseSha256: string; contentType: string; byteLength: number; sourcePath: string;
}> };

const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const json = <T>(target: string) => JSON.parse(readFileSync(target, "utf8")) as T;

function atomicJson(target: string, value: unknown) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

function extension(source: string) {
  const value = path.extname(source).toLowerCase();
  return [".pdf", ".png", ".jpg", ".jpeg"].includes(value) ? value : ".pdf";
}

export interface AprLearningReplayResult {
  version: typeof APR_LEARNING_REPLAY_VERSION;
  sourceRoot: string;
  targetRoot: string;
  corpusFingerprint: string;
  startedAt: string;
  endedAt: string;
  freshStateVerified: true;
  counts: { total: number; ready: number; blocked: number; inconsistent: number; screeningReady: number; infissiReady: number; mixedReady: number };
  cases: Array<{
    customerKey: string;
    declaredProductModule: "screening" | "infissi";
    productModule: "screening" | "infissi" | "mixed";
    routingSource: "original_documents" | "declared_label" | "unresolved";
    routingEvidence: { screening: string[]; infissi: string[] };
    appliedRuleIds: string[];
    state: "READY" | "OPERATOR_REQUIRED" | "INCONSISTENT";
    blockerCodes: string[];
  }>;
}

export class PersistentAprLearningReplay {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  constructor(sourceRoot: string, targetRoot: string) {
    this.sourceRoot = path.resolve(sourceRoot);
    this.targetRoot = path.resolve(targetRoot);
  }

  async run(now = new Date()): Promise<AprLearningReplayResult> {
    const forbidden = ["crm-document-analysis", "crm-local-preflight", "infissi-batch-preflight"];
    if (forbidden.some((directory) => existsSync(path.join(this.targetRoot, directory)))) throw new Error("apr_learning_replay_target_not_fresh");
    const sourceAcquisition = json<SourceAcquisition>(path.join(this.sourceRoot, "crm-acquisition", "checkpoint.json"));
    const sourceDocuments = json<SourceDocuments>(path.join(this.sourceRoot, "crm-original-documents", "checkpoint.json"));
    const sourceSeed = json<Record<string, unknown>>(path.join(this.sourceRoot, "cohort-seed", "checkpoint.json"));
    const sourceItems = sourceAcquisition.items.filter((item) => item.state === "acquired" && item.practiceId && item.dossierPath);
    if (sourceItems.length < 1 || sourceItems.length > 40 || sourceDocuments.items.some((item) => item.state !== "downloaded" || !existsSync(item.localPath))) {
      throw new Error("apr_learning_replay_source_corpus_invalid");
    }
    mkdirSync(this.targetRoot, { recursive: true, mode: 0o700 });
    const acquired = sourceItems.map((item) => {
      const dossierPath = path.join(this.targetRoot, "crm-acquisition", "dossiers", `${item.customerKey}.json`);
      mkdirSync(path.dirname(dossierPath), { recursive: true, mode: 0o700 });
      copyFileSync(item.dossierPath!, dossierPath);
      return { ...item, dossierPath, attemptCount: 1, startedAt: now.toISOString(), endedAt: now.toISOString() };
    });
    const documents = sourceDocuments.items.map((item) => {
      const localPath = path.join(this.targetRoot, "crm-original-documents", "files", item.customerKey, `${item.documentKey}${extension(item.localPath)}`);
      mkdirSync(path.dirname(localPath), { recursive: true, mode: 0o700 });
      copyFileSync(item.localPath, localPath);
      return { ...item, localPath, state: "downloaded", requestAttemptCount: 1, startedAt: now.toISOString(), endedAt: now.toISOString() };
    });
    const corpusFingerprint = sha256({
      candidateFingerprint: sourceAcquisition.candidateFingerprint,
      dossiers: acquired.map((item) => [item.customerKey, item.responseSha256]),
      documents: documents.map((item) => [item.documentKey, item.responseSha256]),
    });
    atomicJson(path.join(this.targetRoot, "cohort-seed", "checkpoint.json"), { ...sourceSeed, replaySourceFingerprint: corpusFingerprint, createdAt: now.toISOString() });
    atomicJson(path.join(this.targetRoot, "crm-acquisition", "checkpoint.json"), {
      version: "apr-crm-acquisition-v1", revision: acquired.length + 1, status: "completed", candidateFingerprint: corpusFingerprint,
      currentCustomerKey: null, items: acquired, externalActionAllowed: false, operationalGate: "readonly", reason: "Corpus locale rimaterializzato da fonti originarie; nessun CRM consultato.", nextAction: "Eseguire OCR e parser da zero.", repairsApplied: [], audit: [],
    });
    atomicJson(path.join(this.targetRoot, "crm-original-documents", "checkpoint.json"), {
      version: "apr-crm-original-documents-v1", revision: documents.length + 1, status: "completed", sourceSetFingerprint: corpusFingerprint,
      currentDocumentKey: null, items: documents, externalActionAllowed: false, operationalGate: "readonly", reason: "Documenti originari copiati byte-per-byte nel corpus di replay.", nextAction: "Rieseguire estrazione locale.", documentFormatRepairsApplied: [], audit: [],
    });

    const ocrExecutable = resolveAprPdfOcrExecutable(this.sourceRoot);
    const analysis = new PersistentAprCrmDocumentAnalysis(this.targetRoot, (file) => analyzePdfLocally(file, ocrExecutable));
    analysis.prepare(documents.map((item) => ({ documentKey: item.documentKey, customerKey: item.customerKey, kind: item.kind, localPath: item.localPath, responseSha256: item.responseSha256 })), corpusFingerprint, now);
    let analysisState = analysis.load(now);
    for (let tick = 0; tick < documents.length * 2 + 8 && analysisState.status !== "completed"; tick += 1) analysisState = await analysis.tick(new Date(now.getTime() + tick + 1));
    if (analysisState.status !== "completed") throw new Error("apr_learning_replay_analysis_incomplete");

    const common = new PersistentAprCrmLocalPreflight(this.targetRoot, analysis);
    common.prepare(acquired, corpusFingerprint, new Date(now.getTime() + 1_000));
    const commonState = common.runToCompletion(new Date(now.getTime() + 2_000), 256);
    const infissi = new PersistentAprInfissiBatchPreflight(this.targetRoot);
    let infissiState = infissi.tick(new Date(now.getTime() + 3_000));
    for (let tick = 0; tick < 96 && infissiState.status !== "completed"; tick += 1) infissiState = infissi.tick(new Date(now.getTime() + 4_000 + tick));
    if (infissiState.status !== "completed") throw new Error("apr_learning_replay_infissi_incomplete");

    const commonByKey = new Map(commonState.items.map((item) => [item.customerKey, item]));
    const infissiByKey = new Map(infissiState.items.map((item) => [item.customerKey, item]));
    const cases = acquired.map((item) => {
      const sources = analysisState.items.filter((source) => source.customerKey === item.customerKey && source.state === "analyzed" && source.textPath)
        .map((source) => ({ sourceId: source.documentKey, text: readFileSync(source.textPath!, "utf8") }));
      const declaredModule = item.productModule === "infissi" ? "infissi" as const : "screening" as const;
      const routing = resolveAprDocumentedProductRouting({ declaredModule, sources });
      const productModule = routing.module === "screening" || routing.module === "mixed" ? routing.module : "infissi" as const;
      const commonSource = commonByKey.get(item.customerKey);
      const infissiSource = infissiByKey.get(item.customerKey);
      const requiredSources = productModule === "mixed" ? [commonSource, infissiSource]
        : productModule === "infissi" ? [infissiSource] : [commonSource];
      const blockerCodes = [...new Set(requiredSources.flatMap((source) => source?.report?.blockers.map((blocker) => blocker.code) ?? []))];
      const state = requiredSources.some((source) => !source) ? "INCONSISTENT" as const
        : requiredSources.every((source) => source?.state === "ready_local_plan") ? "READY" as const
          : requiredSources.some((source) => source?.state === "blocked_case") ? "OPERATOR_REQUIRED" as const
            : "INCONSISTENT" as const;
      return {
        customerKey: item.customerKey,
        declaredProductModule: declaredModule,
        productModule,
        routingSource: routing.source,
        routingEvidence: { screening: routing.screeningEvidence, infissi: routing.infissiEvidence },
        appliedRuleIds: routing.appliedRuleIds,
        state,
        blockerCodes,
      };
    });
    const result: AprLearningReplayResult = {
      version: APR_LEARNING_REPLAY_VERSION, sourceRoot: this.sourceRoot, targetRoot: this.targetRoot, corpusFingerprint,
      startedAt: now.toISOString(), endedAt: new Date().toISOString(), freshStateVerified: true,
      counts: {
        total: cases.length, ready: cases.filter((item) => item.state === "READY").length,
        blocked: cases.filter((item) => item.state === "OPERATOR_REQUIRED").length,
        inconsistent: cases.filter((item) => item.state === "INCONSISTENT").length,
        screeningReady: cases.filter((item) => item.productModule === "screening" && item.state === "READY").length,
        infissiReady: cases.filter((item) => item.productModule === "infissi" && item.state === "READY").length,
        mixedReady: cases.filter((item) => item.productModule === "mixed" && item.state === "READY").length,
      }, cases,
    };
    atomicJson(path.join(this.targetRoot, "learning-replay", "checkpoint.json"), result);
    return result;
  }
}
