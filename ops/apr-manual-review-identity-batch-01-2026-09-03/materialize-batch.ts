import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const outputRoot = path.join(import.meta.dirname, "blind-documents");
const renderTool = "/Users/giulianolavoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm";
const seed = "manual-identity-batch-01-2026-09-03";
const cases = [
  { order: 1, cohort: 2962, customerKey: "massimiliano-montemorra", displayName: "Massimiliano Montemorra", reviewScope: "identity" },
  { order: 2, cohort: 3000, customerKey: "francesca-monti", displayName: "Francesca Monti", reviewScope: "identity" },
  { order: 3, cohort: 3006, customerKey: "enrico-amos-maria-berneri", displayName: "Enrico Amos Maria Berneri", reviewScope: "identity" },
  { order: 4, cohort: 2964, customerKey: "sabrina-eustomi", displayName: "Sabrina Eustomi", reviewScope: "identity" },
  { order: 5, cohort: 2932, customerKey: "marco-de-marinis", displayName: "Marco De Marinis", reviewScope: "economic_control" },
] as const;

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const batchManifest: any = {
  schemaVersion: "apr-blind-document-review-batch-v1",
  generatedAt: new Date().toISOString(),
  selection: { method: "sha256_rank", seed, identityCandidateCount: 8, selectedIdentityCount: 4 },
  safety: { sourceReadOnly: true, crmWrite: false, portalAccess: false, communications: false },
  cases: [],
};

for (const item of cases) {
  const stateDirectory = path.join(cohortRoot, `apr-pilot-${item.cohort}-global-controller-${item.customerKey}`);
  if (!existsSync(stateDirectory)) throw new Error(`state_directory_missing:${item.customerKey}`);
  const checkpointPath = path.join(stateDirectory, "crm-original-documents/checkpoint.json");
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  if (checkpoint.status !== "completed" || checkpoint.externalActionAllowed !== false) throw new Error(`source_checkpoint_not_readonly_completed:${item.customerKey}`);
  const sources = checkpoint.items.filter((source: any) => source.customerKey === item.customerKey && source.state === "downloaded");
  if (!sources.length) throw new Error(`source_documents_missing:${item.customerKey}`);
  const caseDirectory = path.join(outputRoot, `${String(item.order).padStart(2, "0")}-${slug(item.displayName)}`);
  const documentDirectory = path.join(caseDirectory, "documents");
  const renderDirectory = path.join(caseDirectory, "rendered-pages");
  mkdirSync(documentDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(renderDirectory, { recursive: true, mode: 0o700 });
  const documents = sources.map((source: any, index: number) => {
    const extension = path.extname(source.localPath).toLowerCase();
    const neutralKind = source.kind === "invoice" ? "fiscal-or-payment" : "supporting";
    const filename = `${String(index + 1).padStart(2, "0")}-${neutralKind}${extension}`;
    const destination = path.join(documentDirectory, filename);
    cpSync(source.localPath, destination, { preserveTimestamps: true });
    const actualHash = sha256(destination);
    if (actualHash !== source.responseSha256) throw new Error(`copied_hash_mismatch:${item.customerKey}:${filename}`);
    let renderedPages: string[] = [];
    if (extension === ".pdf") {
      const prefix = path.join(renderDirectory, `${String(index + 1).padStart(2, "0")}`);
      execFileSync(renderTool, ["-png", "-r", "150", destination, prefix], { stdio: "ignore" });
      renderedPages = readdirSync(renderDirectory).filter((name) => name.startsWith(`${String(index + 1).padStart(2, "0")}-`) && name.endsWith(".png")).sort();
    } else if ([".jpg", ".jpeg", ".png"].includes(extension)) {
      const renderedName = `${String(index + 1).padStart(2, "0")}-1${extension === ".png" ? ".png" : ".jpg"}`;
      cpSync(destination, path.join(renderDirectory, renderedName), { preserveTimestamps: true });
      renderedPages = [renderedName];
    }
    return {
      filename,
      sha256: actualHash,
      byteLength: readFileSync(destination).byteLength,
      mediaType: source.contentType,
      neutralKind,
      renderedPages,
    };
  });
  const neutralManifest = {
    schemaVersion: "apr-blind-case-documents-v1",
    caseId: `case-${String(item.order).padStart(2, "0")}`,
    displayName: item.displayName,
    documentCount: documents.length,
    documents,
    instructions: item.reviewScope === "identity"
      ? "Verificare esclusivamente dai documenti se identità e codice fiscale del beneficiario sono espliciti, leggibili e coerenti."
      : "Individuare nei documenti ogni occorrenza di 4.090/4.090,91 e stabilirne la funzione contabile leggendo etichette, righe e totali circostanti.",
  };
  writeFileSync(path.join(caseDirectory, "case-manifest.json"), `${JSON.stringify(neutralManifest, null, 2)}\n`, { mode: 0o600 });
  batchManifest.cases.push({ caseId: neutralManifest.caseId, directory: path.relative(outputRoot, caseDirectory), reviewScope: item.reviewScope, documentCount: documents.length });
}

writeFileSync(path.join(outputRoot, "batch-manifest.json"), `${JSON.stringify(batchManifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outputRoot, cases: batchManifest.cases, totalDocuments: batchManifest.cases.reduce((sum: number, item: any) => sum + item.documentCount, 0) }, null, 2)}\n`);
