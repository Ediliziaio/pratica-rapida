import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AprSingleCaseOperatorScope } from "../../src/features/enea-shadow-crm/aprOperatorUnlockContract";
import { PersistentAprEneaDraftExecution, type AprEneaDraftExecutionItem } from "./eneaDraftExecution";
import { PersistentAprOperatorUnlockRegistry, type AprOperatorUnlockVerification } from "./operatorUnlockRegistry";

export const APR_OPERATOR_UNLOCK_TRANSACTION_VERSION = "apr-operator-unlock-generation-transaction-v1" as const;
const LOCK_LEASE_MS = 30_000;

export interface AprOperatorUnlockActivationRequest {
  blockId: string;
  expectedScope: AprSingleCaseOperatorScope;
  verification: AprOperatorUnlockVerification;
  recomputedItem: AprEneaDraftExecutionItem | null;
}

export interface AprOperatorUnlockGenerationTransaction {
  version: typeof APR_OPERATOR_UNLOCK_TRANSACTION_VERSION;
  transactionId: string;
  status: "prepared" | "registry_verified" | "execution_activated" | "committed";
  blockId: string;
  evidenceId: string;
  expectedScope: AprSingleCaseOperatorScope;
  resumePolicy: "resume_existing_draft" | "recompute_before_draft";
  verification: AprOperatorUnlockVerification;
  recomputedItem: AprEneaDraftExecutionItem | null;
  activationGenerationId: string;
  preparedAt: string;
  committedAt: string | null;
  audit: Array<{ at: string; status: AprOperatorUnlockGenerationTransaction["status"]; reason: string }>;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function operatorUnlockRecomputedItemFingerprint(item: AprEneaDraftExecutionItem) {
  return fingerprint(item);
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function sameScope(left: AprSingleCaseOperatorScope, right: AprSingleCaseOperatorScope) {
  return left.kind === "single_practice_generation" && right.kind === "single_practice_generation"
    && left.practiceId === right.practiceId && left.customerKey === right.customerKey
    && left.generationId === right.generationId && left.propagation === "forbidden" && right.propagation === "forbidden";
}

function validTransaction(value: AprOperatorUnlockGenerationTransaction) {
  return value.version === APR_OPERATOR_UNLOCK_TRANSACTION_VERSION
    && ["prepared", "registry_verified", "execution_activated", "committed"].includes(value.status)
    && Boolean(value.transactionId && value.blockId && value.evidenceId && value.activationGenerationId)
    && value.expectedScope.propagation === "forbidden"
    && value.verification.outcome === "verified"
    && sameScope(value.expectedScope, value.verification.scope)
    && value.verification.blockId === value.blockId
    && value.verification.resumePolicy === value.resumePolicy
    && Array.isArray(value.audit);
}

export class PersistentAprOperatorUnlockGenerationTransaction {
  readonly directory: string;
  readonly lockDirectory: string;
  readonly registry: PersistentAprOperatorUnlockRegistry;
  readonly execution: PersistentAprEneaDraftExecution;

  constructor(readonly rootDirectory: string, readonly phaseObserver: ((status: AprOperatorUnlockGenerationTransaction["status"]) => void) | null = null) {
    const root = path.resolve(rootDirectory);
    this.directory = path.join(root, "operator-unlock-transactions");
    this.lockDirectory = path.join(this.directory, ".lock");
    this.registry = new PersistentAprOperatorUnlockRegistry(root);
    this.execution = new PersistentAprEneaDraftExecution(root);
  }

  private transactionPath(transactionId: string) {
    if (!/^operator-unlock-transaction:[a-f0-9]{64}$/.test(transactionId)) throw new Error("operator_unlock_transaction_id_invalid");
    return path.join(this.directory, `${transactionId.replace(":", "-")}.json`);
  }

  private write(transaction: AprOperatorUnlockGenerationTransaction) {
    if (!validTransaction(transaction)) throw new Error("operator_unlock_transaction_invalid");
    atomicWrite(this.transactionPath(transaction.transactionId), `${JSON.stringify(transaction, null, 2)}\n`);
    this.phaseObserver?.(transaction.status);
    return transaction;
  }

  load(transactionId: string) {
    try {
      const transaction = JSON.parse(readFileSync(this.transactionPath(transactionId), "utf8")) as AprOperatorUnlockGenerationTransaction;
      if (!validTransaction(transaction)) throw new Error("operator_unlock_transaction_invalid");
      return transaction;
    } catch (error) {
      if (error instanceof Error && error.message === "operator_unlock_transaction_invalid") throw error;
      throw new Error("operator_unlock_transaction_checkpoint_corrupt");
    }
  }

  private withLock<T>(ownerId: string, now: Date, action: () => T) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try { mkdirSync(this.lockDirectory, { mode: 0o700 }); }
    catch {
      let lease: { expiresAt?: string } = {};
      try { lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")); } catch { /* fail closed below */ }
      if (!lease.expiresAt || Date.parse(lease.expiresAt) > now.getTime()) throw new Error("operator_unlock_transaction_locked");
      try { unlinkSync(path.join(this.lockDirectory, "owner.json")); } catch { /* absent */ }
      try { rmdirSync(this.lockDirectory); } catch { throw new Error("operator_unlock_transaction_locked"); }
      mkdirSync(this.lockDirectory, { mode: 0o700 });
    }
    atomicWrite(path.join(this.lockDirectory, "owner.json"), `${JSON.stringify({ ownerId, expiresAt: new Date(now.getTime() + LOCK_LEASE_MS).toISOString() })}\n`);
    try { return action(); }
    finally {
      try {
        const lease = JSON.parse(readFileSync(path.join(this.lockDirectory, "owner.json"), "utf8")) as { ownerId?: string };
        if (lease.ownerId === ownerId) { unlinkSync(path.join(this.lockDirectory, "owner.json")); rmdirSync(this.lockDirectory); }
      } catch { /* recovered elsewhere */ }
    }
  }

  prepare(request: AprOperatorUnlockActivationRequest, now = new Date()) {
    const registry = this.registry.snapshot(now);
    const record = registry.records.find((candidate) => candidate.descriptor.blockId === request.blockId);
    if (!record?.evidence || !sameScope(record.descriptor.scope, request.expectedScope) || !sameScope(request.verification.scope, request.expectedScope)
      || request.verification.blockId !== request.blockId || request.verification.resumePolicy !== record.descriptor.resumePolicy
      || request.verification.outcome !== "verified" || request.verification.sourceEvidenceIds.length < 1) throw new Error("operator_unlock_transaction_prepare_invalid");
    if (record.descriptor.resumePolicy === "resume_existing_draft" && (request.verification.draftId !== record.descriptor.draftId || request.recomputedItem)) throw new Error("operator_unlock_transaction_resume_proof_invalid");
    if (record.descriptor.resumePolicy === "recompute_before_draft" && (!request.recomputedItem || request.verification.draftId
      || request.verification.recomputedItemFingerprint !== operatorUnlockRecomputedItemFingerprint(request.recomputedItem))) throw new Error("operator_unlock_transaction_recompute_proof_invalid");
    const transactionId = `operator-unlock-transaction:${fingerprint({ blockId: request.blockId, evidenceId: record.evidence.evidenceId, verificationId: request.verification.verificationId, scope: request.expectedScope })}`;
    const activationGenerationId = `generation-operator-unlock-${fingerprint({ blockId: request.blockId, evidenceId: record.evidence.evidenceId, verificationId: request.verification.verificationId, scope: request.expectedScope, resumePolicy: record.descriptor.resumePolicy }).slice(0, 24)}`;
    const target = this.transactionPath(transactionId);
    if (existsSync(target)) return this.load(transactionId);
    if (record.descriptor.status !== "answered" || record.evidence.verificationStatus !== "pending" || record.evidence.consumed) throw new Error("operator_unlock_transaction_prepare_state_invalid");
    return this.write({ version: APR_OPERATOR_UNLOCK_TRANSACTION_VERSION, transactionId, status: "prepared", blockId: request.blockId, evidenceId: record.evidence.evidenceId, expectedScope: structuredClone(request.expectedScope), resumePolicy: record.descriptor.resumePolicy, verification: structuredClone(request.verification), recomputedItem: structuredClone(request.recomputedItem), activationGenerationId, preparedAt: now.toISOString(), committedAt: null, audit: [{ at: now.toISOString(), status: "prepared", reason: "Transazione preparata prima di verificare, supersedere, attivare o consumare evidenze." }] });
  }

  execute(transactionId: string, now = new Date()) {
    return this.withLock(`execute:${process.pid}:${crypto.randomUUID()}`, now, () => {
      let transaction = this.load(transactionId);
      if (transaction.status === "committed") return transaction;
      if (transaction.status === "prepared") {
        this.registry.verify(transaction.blockId, transaction.verification, `${transaction.transactionId}:verify`, now);
        transaction.status = "registry_verified";
        transaction.audit.push({ at: now.toISOString(), status: transaction.status, reason: "Prova verificata nel registro; non ancora consumata." });
        transaction = this.write(transaction);
      }
      if (transaction.status === "registry_verified") {
        const registryRecord = this.registry.snapshot(now).records.find((record) => record.descriptor.blockId === transaction.blockId)!;
        this.execution.activateOperatorUnlock({ commandId: `${transaction.transactionId}:activate`, blockId: transaction.blockId, evidenceId: transaction.evidenceId, verificationId: transaction.verification.verificationId, scope: transaction.expectedScope, resumePolicy: transaction.resumePolicy, verifiedDraftId: transaction.verification.draftId, recomputedItem: transaction.recomputedItem, appliedRuleIds: [...registryRecord.descriptor.ruleIds] }, now);
        transaction.status = "execution_activated";
        transaction.audit.push({ at: now.toISOString(), status: transaction.status, reason: `Generazione ${transaction.activationGenerationId} attivata atomicamente nel checkpoint esecuzione.` });
        transaction = this.write(transaction);
      }
      if (transaction.status === "execution_activated") {
        this.registry.consume(transaction.blockId, transaction.evidenceId, transaction.activationGenerationId, `${transaction.transactionId}:consume`, now);
        transaction.status = "committed";
        transaction.committedAt = now.toISOString();
        transaction.audit.push({ at: now.toISOString(), status: transaction.status, reason: "Evidenza consumata; transazione conclusa e ripetibile senza effetti duplicati." });
        transaction = this.write(transaction);
      }
      return transaction;
    });
  }

  activate(request: AprOperatorUnlockActivationRequest, now = new Date()) {
    const transaction = this.prepare(request, now);
    return this.execute(transaction.transactionId, now);
  }

  recoverPending(now = new Date()) {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory)
      .filter((name) => /^operator-unlock-transaction-[a-f0-9]{64}\.json$/.test(name))
      .map((name) => `operator-unlock-transaction:${name.slice("operator-unlock-transaction-".length, -".json".length)}`)
      .map((transactionId) => this.load(transactionId))
      .filter((transaction) => transaction.status !== "committed")
      .map((transaction) => this.execute(transaction.transactionId, now));
  }
}
