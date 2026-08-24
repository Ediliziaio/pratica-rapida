import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const APR_CHECKPOINT_MIGRATION_TRANSACTION_VERSION = "apr-checkpoint-migration-transaction-v1" as const;

const STORE_PATHS = Object.freeze([
  "crm-document-analysis/checkpoint.json",
  "crm-local-preflight/checkpoint.json",
  "infissi-batch-preflight/checkpoint.json",
  "enea-draft-execution/checkpoint.json",
] as const);

type StorePath = typeof STORE_PATHS[number];
type StoreContents = Record<StorePath, string | null>;

export interface AprCheckpointMigrationTransaction {
  version: typeof APR_CHECKPOINT_MIGRATION_TRANSACTION_VERSION;
  transactionId: string;
  generationId: string;
  status: "prepared" | "committed" | "rolled_back";
  startedAt: string;
  completedAt: string | null;
  before: StoreContents;
  after: StoreContents | null;
  caseKeys: string[];
  reason: string;
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

function readStores(rootDirectory: string): StoreContents {
  return Object.fromEntries(STORE_PATHS.map((relativePath) => {
    const target = path.join(rootDirectory, relativePath);
    return [relativePath, existsSync(target) ? readFileSync(target, "utf8") : null];
  })) as StoreContents;
}

function restoreStores(rootDirectory: string, stores: StoreContents) {
  for (const relativePath of STORE_PATHS) {
    const target = path.join(rootDirectory, relativePath);
    const contents = stores[relativePath];
    if (contents === null) {
      if (existsSync(target)) unlinkSync(target);
    } else atomicWrite(target, contents);
  }
}

function caseKeys(stores: StoreContents) {
  const keys = new Set<string>();
  for (const contents of Object.values(stores)) {
    if (!contents) continue;
    const value = JSON.parse(contents) as { items?: Array<{ customerKey?: unknown }> };
    for (const item of value.items ?? []) if (typeof item.customerKey === "string" && item.customerKey) keys.add(item.customerKey);
  }
  return [...keys].sort();
}

export class PersistentAprCheckpointMigrationTransaction {
  readonly directory: string;
  readonly checkpointPath: string;

  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "checkpoint-migration");
    this.checkpointPath = path.join(this.directory, "transaction.json");
  }

  load(): AprCheckpointMigrationTransaction | null {
    if (!existsSync(this.checkpointPath)) return null;
    return JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCheckpointMigrationTransaction;
  }

  private write(value: AprCheckpointMigrationTransaction) {
    atomicWrite(this.checkpointPath, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  }

  recover(now = new Date()) {
    const current = this.load();
    if (!current || current.status !== "prepared") return current;
    restoreStores(this.rootDirectory, current.before);
    return this.write({ ...current, status: "rolled_back", completedAt: now.toISOString(), reason: "Migrazione interrotta ripristinata integralmente alla generazione precedente." });
  }

  begin(now = new Date()) {
    this.recover(now);
    const before = readStores(this.rootDirectory);
    return this.write({
      version: APR_CHECKPOINT_MIGRATION_TRANSACTION_VERSION,
      transactionId: `migration-${randomUUID()}`,
      generationId: `generation-${now.toISOString()}-${randomUUID()}`,
      status: "prepared",
      startedAt: now.toISOString(),
      completedAt: null,
      before,
      after: null,
      caseKeys: caseKeys(before),
      reason: "Generazione precedente congelata prima della migrazione esplicita multi-store.",
    });
  }

  commit(transactionId: string, now = new Date()) {
    const current = this.load();
    if (!current || current.transactionId !== transactionId || current.status !== "prepared") throw new Error("apr_checkpoint_migration_transaction_not_prepared");
    const after = readStores(this.rootDirectory);
    for (const contents of Object.values(after)) if (contents !== null) JSON.parse(contents);
    return this.write({ ...current, status: "committed", completedAt: now.toISOString(), after, caseKeys: [...new Set([...current.caseKeys, ...caseKeys(after)])].sort(), reason: "Migrazione esplicita multi-store completata come unica generazione durevole." });
  }

  rollback(transactionId: string, reason: string, now = new Date()) {
    const current = this.load();
    if (!current || current.transactionId !== transactionId) throw new Error("apr_checkpoint_migration_transaction_not_found");
    if (current.status === "rolled_back") return current;
    if (current.status === "committed") throw new Error("apr_checkpoint_migration_transaction_already_committed");
    restoreStores(this.rootDirectory, current.before);
    return this.write({ ...current, status: "rolled_back", completedAt: now.toISOString(), reason: `Migrazione annullata senza stato ibrido: ${reason}` });
  }
}
