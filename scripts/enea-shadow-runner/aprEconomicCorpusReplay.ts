import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { buildCrmLocalPreflightReport } from "./crmLocalPreflight";
import { extractBankTransferEvidences } from "./bankTransferEvidence";
import { extractLocalInvoiceFinancialEvidence } from "./localInvoiceFinancialEvidence";
import { reconcileLocalInvoiceSegments, splitLocalInvoiceText } from "./localInvoiceSegmentation";
import { canonicalSha256 } from "./aprMonotonicArtifacts";
import { runEconomicVertical, type AprEconomicFactsInput } from "./aprEconomicVertical";

export const APR_ECONOMIC_CORPUS_REPLAY_VERSION = "apr-economic-corpus-replay-v1" as const;

interface ReplayCase { practiceId: string; customerKey: string }
export interface ManifestCase {
  practiceId: string;
  customerKey: string;
  evidence: {
    dossierPath: string;
    analysisCheckpoint: string;
    sourceSha256: string[];
  };
}

interface AnalysisItem {
  documentKey: string;
  customerKey: string;
  kind: string;
  state: string;
  textPath?: string | null;
  textSha256?: string | null;
  sourceSha256?: string | null;
  extractionMode?: "native_text" | "macos_vision_ocr" | null;
  nonFiscalImageExcluded?: boolean;
  invoiceResult?: unknown;
}

export interface AnalysisCheckpoint { items: AnalysisItem[] }

export interface AprEconomicCorpusReplayReport {
  schemaVersion: typeof APR_ECONOMIC_CORPUS_REPLAY_VERSION;
  caseCount: number;
  unchanged: number;
  improvements: number;
  regressions: number;
  differences: readonly {
    customerKey: string;
    kind: "IMPROVEMENT" | "REGRESSION" | "CHANGED";
    legacy: { usable: boolean; total: number | null; bankStatus: string };
    parallel: { usable: boolean; total: number | null; bankStatus: string };
    reason: string;
  }[];
  firstReplayFingerprint: string;
  status: "PASS" | "FAIL";
}

const sha256Text = (value: string) => createHash("sha256").update(value).digest("hex");
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function fiscalSegment(text: string) {
  const bankEvidence = extractBankTransferEvidences("probe", text);
  if (!bankEvidence.length) return true;
  return /\b(?:totale\s+(?:documento|fattura|imponibile|iva)|riepilogo\s+iva|calcolo\s+fattura|imponibile\s+(?:iva|aliquota))\b/i.test(text);
}

export function observedEconomicInput(item: ManifestCase, analysis: AnalysisCheckpoint): AprEconomicFactsInput {
  const documents = analysis.items.filter((candidate) => candidate.customerKey === item.customerKey
    && candidate.kind === "invoice" && candidate.state === "analyzed" && !candidate.nonFiscalImageExcluded
    && candidate.invoiceResult && candidate.textPath && existsSync(candidate.textPath));
  const texts = documents.map((document) => ({ document, text: readFileSync(document.textPath!, "utf8") }));
  const transferKeys = new Set<string>();
  const bankTransfers = texts.flatMap(({ document, text }) => extractBankTransferEvidences(document.documentKey, text).filter((entry) => {
    const identity = entry.transactionReference
      ? `transaction:${entry.transactionReference}`
      : `economic:${entry.principalAmount ?? "unknown"}:${entry.invoiceReference ?? "unknown"}:${entry.taxReliefType ?? "unknown"}`;
    if (transferKeys.has(identity)) return false;
    transferKeys.add(identity);
    return true;
  }).map((entry) => ({
    ...entry,
    locator: {
      sourceId: entry.sourceId,
      pageNumber: null,
      contentSha256: document.sourceSha256 ?? null,
      excerptSha256: document.textSha256 ?? sha256Text(text),
    },
  })));
  const seenDocuments = new Set<string>();
  const segments = texts.filter(({ document, text }) => {
    const fingerprint = document.textSha256 ?? sha256Text(text);
    if (seenDocuments.has(fingerprint)) return false;
    seenDocuments.add(fingerprint);
    return true;
  }).flatMap(({ document, text }) => splitLocalInvoiceText({
    documentKey: document.documentKey,
    text,
    extractionMode: document.extractionMode ?? "macos_vision_ocr",
  })).filter((segment) => ["invoice", "credit_note"].includes(segment.result.documentType) && fiscalSegment(segment.text));
  const reconciled = reconcileLocalInvoiceSegments(segments);
  const documentByKey = new Map(documents.map((document) => [document.documentKey, document]));
  const invoices = reconciled.observedFinancialSegments.map((segment) => {
    const evidence = extractLocalInvoiceFinancialEvidence({
      sourceId: segment.sourceId,
      text: segment.text,
      extractionMode: segment.extractionMode,
      documentNumber: segment.documentNumber,
      documentDate: segment.documentDate,
      grossTotal: segment.total,
    });
    const document = documentByKey.get(segment.parentDocumentKey);
    return {
      ...evidence,
      locator: {
        sourceId: segment.sourceId,
        pageNumber: null,
        contentSha256: document?.sourceSha256 ?? null,
        excerptSha256: sha256Text(segment.text),
      },
    };
  });
  return {
    customerKey: item.customerKey,
    practiceId: item.practiceId,
    sourceFingerprint: canonicalSha256([...new Set(item.evidence.sourceSha256)].sort()),
    invoices,
    bankTransfers,
    replacements: reconciled.replacementPairs.map((pair) => {
      const segment = reconciled.observedFinancialSegments.find((candidate) => candidate.sourceId === pair.replacementSourceId)!;
      const document = documentByKey.get(segment.parentDocumentKey);
      return {
        ...pair,
        locator: {
          sourceId: pair.replacementSourceId,
          pageNumber: null,
          contentSha256: document?.sourceSha256 ?? null,
          excerptSha256: sha256Text(segment.text),
        },
      };
    }),
  };
}

export function runEconomicVerticalForManifestCase(manifestPath: string, customerKey: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: ManifestCase[] };
  const item = manifest.cases.find((candidate) => candidate.customerKey === customerKey);
  if (!item) throw new Error(`apr_economic_manifest_case_missing:${customerKey}`);
  const analysis = JSON.parse(readFileSync(item.evidence.analysisCheckpoint, "utf8")) as AnalysisCheckpoint;
  return runEconomicVertical(observedEconomicInput(item, analysis));
}

function legacyFinancial(report: ReturnType<typeof buildCrmLocalPreflightReport>) {
  const methods = report.financial.methods;
  const totals = methods.map((method) => method.total);
  const usable = methods.length === 3 && methods.every((method) => method.ok && method.total !== null)
    && totals.every((total) => roundMoney(Math.abs((total ?? 0) - (totals[0] ?? 0))) <= 0.01);
  return {
    usable,
    total: usable ? totals[0] : null,
    bankStatus: report.financial.bankTransferReconciliation.status,
  };
}

export async function replayEconomicCorpusFiles(replayPath: string, manifestPath: string): Promise<AprEconomicCorpusReplayReport> {
  const [replayText, manifestText] = await Promise.all([readFile(replayPath, "utf8"), readFile(manifestPath, "utf8")]);
  const replay = JSON.parse(replayText) as { replayedAtBusinessTime: string; sourceManifestSha256: string; cases: ReplayCase[] };
  const manifest = JSON.parse(manifestText) as { cases: ManifestCase[] };
  const manifestSha256 = sha256Text(manifestText);
  if (manifestSha256 !== replay.sourceManifestSha256) throw new Error(`apr_economic_manifest_hash_mismatch:${manifestSha256}`);
  const manifestByKey = new Map(manifest.cases.map((item) => [item.customerKey, item]));
  const analysisCache = new Map<string, AnalysisCheckpoint>();
  const rows = replay.cases.map((replayCase) => {
    const item = manifestByKey.get(replayCase.customerKey);
    if (!item || item.practiceId !== replayCase.practiceId) throw new Error(`apr_economic_manifest_case_missing:${replayCase.customerKey}`);
    const analysis = analysisCache.get(item.evidence.analysisCheckpoint)
      ?? JSON.parse(readFileSync(item.evidence.analysisCheckpoint, "utf8")) as AnalysisCheckpoint;
    analysisCache.set(item.evidence.analysisCheckpoint, analysis);
    const dossier = JSON.parse(readFileSync(item.evidence.dossierPath, "utf8"));
    const legacyReport = buildCrmLocalPreflightReport(
      dossier,
      item.customerKey,
      analysis as Parameters<typeof buildCrmLocalPreflightReport>[2],
      new Date(replay.replayedAtBusinessTime),
    );
    const legacy = legacyFinancial(legacyReport);
    const parallelResult = runEconomicVertical(observedEconomicInput(item, analysis));
    const parallel = {
      usable: parallelResult.invoiceReconciliation.usable,
      total: parallelResult.invoiceReconciliation.total,
      bankStatus: parallelResult.bankTransferReconciliation.status,
    };
    const identical = canonicalSha256(legacy) === canonicalSha256(parallel);
    const kind = identical ? null
      : legacy.usable && !parallel.usable ? "REGRESSION" as const
        : !legacy.usable && parallel.usable ? "IMPROVEMENT" as const : "CHANGED" as const;
    const reason = identical ? "identical"
      : `legacy usable=${legacy.usable} total=${legacy.total} bank=${legacy.bankStatus}; parallel usable=${parallel.usable} total=${parallel.total} bank=${parallel.bankStatus}`;
    return { customerKey: item.customerKey, legacy, parallel, kind, reason, factsId: parallelResult.factsArtifact.artifactId, decisionsId: parallelResult.decisionsArtifact.artifactId };
  }).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const differences = rows.flatMap((row) => row.kind ? [{ customerKey: row.customerKey, kind: row.kind, legacy: row.legacy, parallel: row.parallel, reason: row.reason }] : []);
  const regressions = differences.filter((item) => item.kind === "REGRESSION").length;
  return {
    schemaVersion: APR_ECONOMIC_CORPUS_REPLAY_VERSION,
    caseCount: rows.length,
    unchanged: rows.length - differences.length,
    improvements: differences.filter((item) => item.kind === "IMPROVEMENT").length,
    regressions,
    differences,
    firstReplayFingerprint: canonicalSha256(rows.map(({ customerKey, legacy, parallel, factsId, decisionsId }) => ({ customerKey, legacy, parallel, factsId, decisionsId }))),
    status: regressions === 0 ? "PASS" : "FAIL",
  };
}
