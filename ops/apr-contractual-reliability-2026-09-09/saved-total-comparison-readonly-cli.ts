#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { parseCompletedEneaText } from "../../src/features/enea-lab/completedEneaAudit";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";

type ExecutionItem = {
  customerKey: string;
  displayName: string;
  practiceId: string;
  draftId: string | null;
  state: string;
};

function atomicWrite(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, filePath);
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let normalized = value.replace(/[€\s\u00a0]/g, "").replace(/[^0-9,.-]/g, "");
  if (!normalized) return null;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    const last = normalized.lastIndexOf(".");
    normalized = `${normalized.slice(0, last).replace(/\./g, "")}${normalized.slice(last)}`;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current: string[] = [];
    let previousY: number | null = null;
    const flush = () => {
      const line = current.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
      current = [];
    };
    for (const rawItem of content.items) {
      if (!("str" in rawItem) || typeof rawItem.str !== "string") continue;
      const y = Array.isArray(rawItem.transform) && typeof rawItem.transform[5] === "number"
        ? rawItem.transform[5]
        : null;
      if (current.length && y !== null && previousY !== null && Math.abs(y - previousY) > 2) flush();
      if (rawItem.str.trim()) current.push(rawItem.str);
      if (rawItem.hasEOL) flush();
      if (y !== null) previousY = y;
    }
    flush();
    pages.push(lines.join("\n"));
  }
  await pdf.destroy();
  return pages.join("\n");
}

const root = path.resolve(process.argv[2] ?? "");
if (!root) throw new Error("state_dir_required");
const execution = JSON.parse(readFileSync(path.join(root, "enea-draft-execution", "checkpoint.json"), "utf8")) as {
  status: string;
  items: ExecutionItem[];
};
if (execution.status !== "completed") throw new Error("execution_not_terminal");
const saved = execution.items.filter((item) => item.state === "saved" && /^\d{4,}$/.test(item.draftId ?? ""));
if (saved.length !== 1) throw new Error(`expected_one_saved_case:${saved.length}`);
const item = saved[0];

const seed = JSON.parse(readFileSync(path.join(root, "cohort-seed", "checkpoint.json"), "utf8"));
const moduleName = seed.candidates?.[0]?.productModule;
if (moduleName !== "infissi" && moduleName !== "screening") throw new Error(`unsupported_module:${String(moduleName)}`);

const auth = new PersistentAprCrmAuth(root);
const analysis = new PersistentAprCrmDocumentAnalysis(root);
const preflight = new PersistentAprCrmLocalPreflight(root, analysis);
const infissi = new PersistentAprInfissiBatchPreflight(root);
const fieldId = moduleName === "infissi" ? "infissi.spesa" : "schermature.spesa";
const currentRaw = moduleName === "infissi"
  ? infissi.buildDraftExecutionPackage(item.customerKey).infissiPayload?.expenseGrossVatIncluded ?? null
  : preflight.buildDraftExecutionPackage(item.customerKey).payload.portalFields.find((field) => field.id === fieldId)?.value ?? null;
const aprTotal = parseMoney(currentRaw);

const historicalBenchmark = JSON.parse(readFileSync(path.join(root, "historical-benchmark", "checkpoint.json"), "utf8"));
const historicalCase = historicalBenchmark.cases?.find((candidate: { practiceId?: string }) => candidate.practiceId === item.practiceId);
const historicalPath = historicalCase?.historicalPath;
if (typeof historicalPath !== "string" || !historicalPath.startsWith(`${item.practiceId}/`) || !/\.pdf$/i.test(historicalPath)) {
  throw new Error("validated_historical_path_missing");
}

const response = await auth.readOnlyStorageGet("enea-documents", historicalPath, new Date());
if (!response.ok) throw new Error(`historical_pdf_http_${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("historical_pdf_signature_rejected");
// pdf.js trasferisce/detacha il buffer ricevuto: l'hash va sigillato prima
// dell'estrazione, altrimenti si finirebbe per hashare un Uint8Array vuoto.
const historicalPdfSha256 = sha256(bytes);
const historicalText = await extractPdfText(bytes);
const historical = parseCompletedEneaText(historicalText);
// I PDF ENEA Schermature osservati in produzione inseriscono spesso spazi
// dentro le parentesi quadre ("[ € ]"). Il parser storico principale conserva
// una regex piu stretta; questo lettore di audit accetta entrambe le grafie,
// senza usare il valore per alcuna compilazione o decisione operativa.
const humanRaw = historical.fields[fieldId]
  ?? historicalText.replace(/\s+/g, " ").match(/Spese congrue sostenute\s*\[\s*€\s*\]\s*([0-9][0-9.,]*)/i)?.[1]
  ?? null;
const humanTotal = parseMoney(humanRaw);
const comparable = aprTotal !== null && humanTotal !== null;
const delta = comparable ? Math.round((aprTotal - humanTotal) * 100) / 100 : null;
const status = !comparable ? "not_comparable" : Math.abs(delta!) <= 0.01 ? "concordant" : "discordant";

const report = {
  version: "apr-saved-total-comparison-readonly-v3",
  generatedAt: new Date().toISOString(),
  executorIdentity: "APR/saved-total-comparison-readonly",
  externalMutationAllowed: false,
  historicalValuesMayFeedMapper: false,
  customerKey: item.customerKey,
  displayName: item.displayName,
  practiceId: item.practiceId,
  draftId: item.draftId,
  moduleName,
  status,
  fieldId,
  aprTotal: { raw: currentRaw, euros: aprTotal },
  humanTotal: { raw: humanRaw, euros: humanTotal },
  deltaEuros: delta,
  historicalPath,
  historicalPdfSha256,
  sourceBenchmarkPath: path.join(root, "historical-benchmark", "checkpoint.json"),
};
const outputPath = path.join(root, "historical-total-comparison", "checkpoint.json");
atomicWrite(outputPath, report);
process.stdout.write(`${JSON.stringify({ outputPath, displayName: item.displayName, status, aprTotal, humanTotal, deltaEuros: delta })}\n`);
