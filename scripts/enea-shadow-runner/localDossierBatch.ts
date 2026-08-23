import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AutonomousExecutionLoop } from "./autonomousExecutionLoop";
import { PersistentExecutionPlanStore, type ExecutionPlanItem } from "./executionPlan";
import { PersistentLocalDossierPipeline, localDossierDashboardSnapshot } from "./localDossierPipeline";

export const APR_ENEA_BATCH_VERSION = "apr-enea-local-batch-v1" as const;
export interface LocalDossierBatchInput { displayName: string; dossierPath: string; customerKey: string; }
export interface LocalDossierBatchManifest { version: typeof APR_ENEA_BATCH_VERSION; id: string; createdAt: string; inputs: LocalDossierBatchInput[]; }

function writeAtomic(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
}
const safeCaseDirectory = (ordinal: number) => `case-${String(ordinal).padStart(3, "0")}`;

export class PersistentLocalDossierBatch {
  readonly rootDirectory: string;
  readonly manifestFile: string;
  readonly reportFile: string;
  readonly planStore: PersistentExecutionPlanStore;
  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory); this.manifestFile = path.join(this.rootDirectory, "batch-manifest.json");
    this.reportFile = path.join(this.rootDirectory, "batch-report.json"); this.planStore = new PersistentExecutionPlanStore(this.rootDirectory);
  }
  loadManifest(): LocalDossierBatchManifest | null {
    if (!existsSync(this.manifestFile)) return null;
    try { const value = JSON.parse(readFileSync(this.manifestFile, "utf8")) as LocalDossierBatchManifest;
      return value.version === APR_ENEA_BATCH_VERSION && Array.isArray(value.inputs) ? value : null; } catch { return null; }
  }
  prepare(inputs: readonly LocalDossierBatchInput[], id: string, now = new Date()) {
    if (!inputs.length) throw new Error("Il batch APR richiede almeno un dossier locale.");
    const normalized = inputs.map((input) => ({ displayName: input.displayName.trim(), dossierPath: path.resolve(input.dossierPath), customerKey: input.customerKey.trim().toLocaleLowerCase("it-IT") }));
    if (normalized.some((input) => !input.displayName || !input.customerKey || !existsSync(input.dossierPath))) throw new Error("Manifest batch locale non valido.");
    const existing = this.loadManifest();
    if (existing) {
      if (existing.id !== id || JSON.stringify(existing.inputs) !== JSON.stringify(normalized)) throw new Error("Manifest batch attivo diverso: sovrascrittura vietata.");
      return this.planStore.load();
    }
    const manifest: LocalDossierBatchManifest = { version: APR_ENEA_BATCH_VERSION, id, createdAt: now.toISOString(), inputs: normalized };
    writeAtomic(this.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    const seen = new Set<string>();
    const names = normalized.map((input) => {
      const duplicate = seen.has(input.customerKey); seen.add(input.customerKey);
      return duplicate ? normalized.find((candidate) => candidate.customerKey === input.customerKey)!.displayName : input.displayName;
    });
    const plan = this.planStore.create(names, id, now); this.writeReport(); return plan;
  }
  arm(now = new Date()) { const plan = this.planStore.arm(`batch-arm:${now.getTime()}`, now); this.writeReport(); return plan; }

  private executionGate() {
    const manifest = this.loadManifest();
    const plan = this.planStore.load();
    if (!manifest) return { allowed: false, reason: "Manifest dossier locale assente: nessuna pratica può essere reclamata." };
    if (plan && plan.id !== manifest.id) return { allowed: false, reason: "Piano e manifest non corrispondono: coda lasciata integra." };
    return { allowed: true, reason: "Manifest dossier locale verificato; azioni esterne disabilitate." };
  }

  processItem(item: Readonly<ExecutionPlanItem>, now = new Date()) {
    const manifest = this.loadManifest();
    if (!manifest) throw new Error("Manifest batch APR assente.");
    const input = manifest.inputs[item.inputOrdinal - 1];
    if (!input) throw new Error(`Dossier batch assente per l'ordinale ${item.inputOrdinal}.`);
    const caseRoot = path.join(this.rootDirectory, "cases", safeCaseDirectory(item.inputOrdinal));
    const checkpoint = new PersistentLocalDossierPipeline(caseRoot).runFromFile(input.dossierPath, `${manifest.id}:${input.customerKey}`, now);
    const review = checkpoint.review!;
    const outcome = review.outcome === "blocked"
      ? { state: "blocked" as const, note: `Blocco locale: ${review.blockers.join("; ")}. Fonti ${review.sources.map((source) => source.sourceId).join(", ")}.` }
      : { state: "completed" as const, note: `Piano bozza locale pronto; ${review.differences.length} differenze, ${review.warnings.length} avvisi; stop prima di azioni esterne.` };
    this.writeReport();
    return outcome;
  }

  createAutonomousLoop(executorId: string, intervalMs = 5_000, onError?: (error: unknown) => void) {
    return new AutonomousExecutionLoop(
      this.planStore,
      executorId,
      (item) => this.processItem(item),
      intervalMs,
      () => this.executionGate(),
      onError,
      () => { this.writeReport(); },
    );
  }

  async tick(executorId: string, now = new Date()) {
    const manifest = this.loadManifest(); if (!manifest) throw new Error("Manifest batch APR assente.");
    const loop = new AutonomousExecutionLoop(this.planStore, executorId, (item) => this.processItem(item, now), 5_000, () => this.executionGate());
    const result = await loop.tick(now); this.writeReport(); return result;
  }
  report() {
    const manifest = this.loadManifest(); const plan = this.planStore.load();
    if (!manifest || !plan) return null;
    return { version: APR_ENEA_BATCH_VERSION, id: manifest.id, status: plan.status, revision: plan.revision,
      progress: { totalInputs: plan.items.length, uniqueCustomers: plan.items.filter((item) => item.state !== "duplicate_input").length,
        queued: plan.items.filter((item) => item.state === "queued").length, claimed: plan.items.filter((item) => item.state === "claimed").length,
        completed: plan.items.filter((item) => item.state === "completed").length, blocked: plan.items.filter((item) => item.state === "blocked").length,
        duplicates: plan.items.filter((item) => item.state === "duplicate_input").length },
      cases: plan.items.map((item) => ({ itemId: item.id, inputOrdinal: item.inputOrdinal, displayName: item.displayName, state: item.state, reason: item.note,
        result: item.state === "duplicate_input" ? null : localDossierDashboardSnapshot(path.join(this.rootDirectory, "cases", safeCaseDirectory(item.inputOrdinal))) })),
      externalGate: "blocked_adapters_unverified", externalActionAllowed: false, updatedAt: plan.updatedAt };
  }
  writeReport() { const report = this.report(); if (report) writeAtomic(this.reportFile, `${JSON.stringify(report, null, 2)}\n`); return report; }
}
