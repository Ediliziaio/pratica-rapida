import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmAuthenticatedReadOnly } from "./crmAuthenticatedReadOnly";
import { JournalStore } from "./journalStore";
import type { AprPilotCandidate } from "./pilotSample";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { aprFutureTestExclusion } from "./aprFutureTestExclusions";

export const APR_COHORT_SEED_VERSION = "apr-cohort-seed-v1" as const;
export const APR_COHORT_SEED_SIZE = 10;
export const APR_COHORT_SEED_MAX_SIZE = 40;

const RULE_IDS = [
  "system-apr-independent-runtime",
  "system-apr-crm-readonly-adapter-contract",
  "system-single-active-practice",
  "system-atomic-checkpoint-resume",
  "authorized-19-test-stop-at-saved-draft",
] as const;

export interface AprCohortSeedManifest {
  version: typeof APR_COHORT_SEED_VERSION;
  sourceEvidenceId: string;
  candidates: AprPilotCandidate[];
  repeatTest?: {
    authorizationId: string;
    priorDrafts: Array<{ customerKey: string; draftId: string }>;
    deletionProofRequired?: boolean;
  };
  authorizedSmallBatch?: {
    authorizationId: string;
    minimumCases: 2;
  };
  authorizedBatch?: {
    authorizationId: string;
    exactCount: number;
  };
  historicalRetest?: {
    authorizationId: string;
    preservePriorDrafts: true;
  };
  authorizedSingleCase?: {
    authorizationId: string;
  };
}

export interface AprCohortSeedCheckpoint {
  version: typeof APR_COHORT_SEED_VERSION;
  revision: number;
  status: "armed_readonly" | "awaiting_deletion_proof" | "deletion_verified";
  sourceEvidenceId: string;
  candidateFingerprint: string;
  candidates: AprPilotCandidate[];
  externalActionAllowed: false;
  executor: "apr_persistent_runtime";
  /** New cohorts require the verified L4 bridge before browser auto-arm. */
  verifiedMapperBridgeRequired?: true;
  repeatTest: null | {
    authorizationId: string;
    priorDrafts: Array<{ customerKey: string; draftId: string }>;
    presentDraftIds: string[];
    deletionEvidenceId: string | null;
    deletionVerifiedAt: string | null;
    deletionProofRequired: boolean;
  };
  reason: string;
  nextAction: string;
  createdAt: string;
  audit: Array<{ at: string; type: "cohort_seeded" | "repeat_deletion_checked" | "repeat_deletion_verified"; reason: string; appliedRuleIds: string[] }>;
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

function normalized(candidates: readonly AprPilotCandidate[]) {
  return candidates.map((candidate) => ({
    customerKey: candidate.customerKey.trim().toLocaleLowerCase("it-IT"),
    displayName: candidate.displayName.trim(),
    ...(candidate.practiceId ? { practiceId: candidate.practiceId.trim().toLowerCase() } : {}),
    ...(candidate.expectedStageType ? { expectedStageType: candidate.expectedStageType } : {}),
    ...(candidate.productModule ? { productModule: candidate.productModule } : {}),
  }));
}

function priorDrafts(historyRoot: string) {
  const records = new Map<string, Set<string>>();
  if (!existsSync(historyRoot)) return records;
  for (const directory of readdirSync(historyRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const checkpoint = path.join(historyRoot, directory.name, "enea-draft-execution", "checkpoint.json");
    if (!existsSync(checkpoint)) continue;
    try {
      const value = JSON.parse(readFileSync(checkpoint, "utf8")) as { items?: Array<{ customerKey?: unknown; draftId?: unknown }> };
      for (const item of value.items ?? []) if (typeof item.customerKey === "string" && item.customerKey) {
        const ids = records.get(item.customerKey) ?? new Set<string>();
        if (typeof item.draftId === "string" && item.draftId) ids.add(item.draftId);
        records.set(item.customerKey, ids);
      }
    } catch { throw new Error(`apr_cohort_history_checkpoint_invalid:${directory.name}`); }
  }
  return records;
}

export function validateAprCohortSeed(manifest: AprCohortSeedManifest, historyRoot: string) {
  if (manifest.version !== APR_COHORT_SEED_VERSION) throw new Error("apr_cohort_seed_version_invalid");
  if (!/^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.sourceEvidenceId)) throw new Error("apr_cohort_seed_evidence_invalid");
  const candidates = normalized(manifest.candidates);
  const singleCaseAuthorized = Boolean(manifest.authorizedSingleCase)
    && /^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.authorizedSingleCase?.authorizationId ?? "");
  if (manifest.authorizedSingleCase && !singleCaseAuthorized) throw new Error("apr_cohort_single_case_authorization_invalid");
  const smallBatchAuthorized = manifest.authorizedSmallBatch?.minimumCases === 2
    && /^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.authorizedSmallBatch.authorizationId);
  if (manifest.authorizedSmallBatch && !smallBatchAuthorized) throw new Error("apr_cohort_small_batch_authorization_invalid");
  const authorizedBatchSize = manifest.authorizedBatch?.exactCount;
  const batchAuthorized = Number.isInteger(authorizedBatchSize)
    && authorizedBatchSize! >= 2
    && authorizedBatchSize! <= APR_COHORT_SEED_MAX_SIZE
    && /^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.authorizedBatch?.authorizationId ?? "");
  if (manifest.authorizedBatch && !batchAuthorized) throw new Error("apr_cohort_batch_authorization_invalid");
  const authorizationModeCount = Number(singleCaseAuthorized) + Number(smallBatchAuthorized) + Number(batchAuthorized);
  if (authorizationModeCount > 1) throw new Error("apr_cohort_authorization_mode_conflict");
  const validSize = singleCaseAuthorized
    ? candidates.length === 1
    : batchAuthorized
    ? candidates.length === manifest.authorizedBatch!.exactCount
    : manifest.repeatTest || smallBatchAuthorized
    ? candidates.length >= 2 && candidates.length <= APR_COHORT_SEED_SIZE
    : candidates.length === APR_COHORT_SEED_SIZE;
  if (!validSize) throw new Error(`apr_cohort_seed_size_invalid:${candidates.length}`);
  if (candidates.some((candidate) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.customerKey) || !candidate.displayName)) throw new Error("apr_cohort_seed_identity_invalid");
  if (candidates.some((candidate) => (candidate.practiceId && !/^[a-f0-9-]{36}$/.test(candidate.practiceId))
    || (candidate.expectedStageType && !["archiviate", "recensione", "pronte_da_fare"].includes(candidate.expectedStageType))
    || (candidate.productModule && !["screening", "infissi"].includes(candidate.productModule))
    || (candidate.expectedStageType && !candidate.practiceId))) throw new Error("apr_cohort_seed_practice_scope_invalid");
  if (new Set(candidates.flatMap((candidate) => candidate.practiceId ? [candidate.practiceId] : [])).size !== candidates.filter((candidate) => candidate.practiceId).length) throw new Error("apr_cohort_seed_duplicate_practice");
  if (new Set(candidates.map((candidate) => candidate.customerKey)).size !== candidates.length) throw new Error("apr_cohort_seed_duplicate_customer");
  const excludedCandidate = candidates.find((candidate) => aprFutureTestExclusion(candidate.customerKey));
  if (excludedCandidate?.customerKey === "beatrice-ciotta") throw new Error("apr_cohort_seed_ciotta_excluded");
  if (excludedCandidate) throw new Error(`apr_cohort_seed_future_test_customer_excluded:${excludedCandidate.customerKey}`);
  const history = priorDrafts(path.resolve(historyRoot));
  const historicalRetestAuthorized = manifest.historicalRetest?.preservePriorDrafts === true
    && /^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.historicalRetest.authorizationId);
  if (manifest.historicalRetest && !historicalRetestAuthorized) throw new Error("apr_cohort_historical_retest_authorization_invalid");
  if (manifest.repeatTest) {
    if (!/^[a-z0-9][a-z0-9._:-]{7,255}$/.test(manifest.repeatTest.authorizationId)) throw new Error("apr_cohort_repeat_authorization_invalid");
    const declared = manifest.repeatTest.priorDrafts;
    if (declared.length < 1 || declared.length > APR_COHORT_SEED_MAX_SIZE * 20 || new Set(declared.map((item) => `${item.customerKey}:${item.draftId}`)).size !== declared.length || declared.some((item) => !/^\d{4,}$/.test(item.draftId) || !candidates.some((candidate) => candidate.customerKey === item.customerKey))) throw new Error("apr_cohort_repeat_prior_drafts_invalid");
    for (const record of declared) {
      if (!history.get(record.customerKey)?.has(record.draftId)) throw new Error(`apr_cohort_repeat_history_mismatch:${record.customerKey}`);
    }
    for (const candidate of candidates) {
      const known = history.get(candidate.customerKey) ?? new Set<string>();
      const declaredIds = new Set(declared.filter((item) => item.customerKey === candidate.customerKey).map((item) => item.draftId));
      if ([...known].some((draftId) => !declaredIds.has(draftId))) throw new Error(`apr_cohort_repeat_history_undeclared:${candidate.customerKey}`);
    }
  } else if (!historicalRetestAuthorized) {
    const repeatedDraft = candidates.find((candidate) => history.has(candidate.customerKey));
    if (repeatedDraft) throw new Error(`apr_cohort_seed_prior_draft:${repeatedDraft.customerKey}`);
  }
  return candidates;
}

export class PersistentAprCohortSeed {
  readonly directory: string;
  readonly checkpointPath: string;
  constructor(readonly rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "cohort-seed");
    this.checkpointPath = path.join(this.directory, "checkpoint.json");
  }

  load() {
    if (!existsSync(this.checkpointPath)) return null;
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as AprCohortSeedCheckpoint;
    value.repeatTest ??= null;
    if (value.version !== APR_COHORT_SEED_VERSION || value.executor !== "apr_persistent_runtime" || value.externalActionAllowed !== false || value.audit.some((event) => event.appliedRuleIds.length === 0)) throw new Error("apr_cohort_seed_checkpoint_invalid");
    return value;
  }

  seed(manifest: AprCohortSeedManifest, historyRoot: string, now = new Date()) {
    const candidates = validateAprCohortSeed(manifest, historyRoot);
    const candidateFingerprint = createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
    const current = this.load();
    if (current) {
      if (current.candidateFingerprint !== candidateFingerprint || current.sourceEvidenceId !== manifest.sourceEvidenceId) throw new Error("apr_cohort_seed_immutable");
      return current;
    }
    new JournalStore(this.rootDirectory).initialize([]);
    const acquisition = new PersistentAprCrmAuthenticatedReadOnly(this.rootDirectory, new PersistentAprCrmAuth(this.rootDirectory));
    acquisition.prepare(candidates, candidateFingerprint, now, manifest.authorizedSingleCase ? 1 : 2);
    const repeatTest = manifest.repeatTest ? { authorizationId: manifest.repeatTest.authorizationId, priorDrafts: manifest.repeatTest.priorDrafts.map((item) => ({ ...item })), presentDraftIds: manifest.repeatTest.priorDrafts.map((item) => item.draftId), deletionEvidenceId: null, deletionVerifiedAt: null, deletionProofRequired: manifest.repeatTest.deletionProofRequired !== false } : null;
    const reason = repeatTest
      ? repeatTest.deletionProofRequired
        ? `Repeat-test APR di ${candidates.length} pratiche configurato; compilazione bloccata finché APR non prova lato server l'assenza delle vecchie bozze.`
        : `Repeat-test APR di ${candidates.length} pratiche configurato; le vecchie bozze sono storico intoccabile e APR produrra nuovi ID senza riusare risultati precedenti.`
      : manifest.historicalRetest
        ? `Test storico APR di ${candidates.length} pratiche configurato: le bozze precedenti restano intoccabili e non vengono riusate; ogni nuova esecuzione mantiene identita e audit separati.`
        : `Coda APR di ${candidates.length} pratiche configurata localmente; nessuna lettura CRM o azione ENEA eseguita dal processo di configurazione.`;
    const checkpoint: AprCohortSeedCheckpoint = {
      version: APR_COHORT_SEED_VERSION,
      revision: 1,
      status: repeatTest?.deletionProofRequired ? "awaiting_deletion_proof" : "armed_readonly",
      sourceEvidenceId: manifest.sourceEvidenceId,
      candidateFingerprint,
      candidates,
      externalActionAllowed: false,
      executor: "apr_persistent_runtime",
      verifiedMapperBridgeRequired: true,
      repeatTest,
      reason,
      nextAction: "Il supervisore APR persistente acquisirà i dossier in sola lettura; soltanto il worker APR potrà lavorare eventuali piani bozza verdi.",
      createdAt: now.toISOString(),
      audit: [{ at: now.toISOString(), type: "cohort_seeded", reason, appliedRuleIds: [...RULE_IDS,
        manifest.authorizedSingleCase ? USER_AUTHORIZED_RULE_IDS.singleCaseRegressionTest
          : manifest.authorizedBatch?.exactCount === 40 ? USER_AUTHORIZED_RULE_IDS.mixedFortyCaseReliabilityTest
          : manifest.authorizedBatch?.exactCount === 11 ? USER_AUTHORIZED_RULE_IDS.elevenCaseCleanRepeat
            : manifest.authorizedBatch?.exactCount === 15 ? USER_AUTHORIZED_RULE_IDS.fifteenCaseIntermezzoRepeat
              : manifest.authorizedBatch || manifest.authorizedSmallBatch ? USER_AUTHORIZED_RULE_IDS.twoCaseAutonomousBatch
                : USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart] }],
    };
    atomicWrite(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }

  recordRepeatDeletionObservation(presentDraftIds: string[], evidenceId: string, now = new Date()) {
    if (!evidenceId.trim() || new Set(presentDraftIds).size !== presentDraftIds.length) throw new Error("apr_cohort_repeat_deletion_evidence_invalid");
    const next = structuredClone(this.load());
    if (!next?.repeatTest) throw new Error("apr_cohort_repeat_not_configured");
    const expected = new Set(next.repeatTest.priorDrafts.map((item) => item.draftId));
    if (presentDraftIds.some((id) => !expected.has(id))) throw new Error("apr_cohort_repeat_unexpected_draft_id");
    if (next.repeatTest.deletionEvidenceId) return next;
    next.revision += 1;
    next.repeatTest.presentDraftIds = [...presentDraftIds].sort();
    next.repeatTest.deletionEvidenceId = presentDraftIds.length === 0 ? evidenceId.trim() : null;
    next.repeatTest.deletionVerifiedAt = presentDraftIds.length === 0 ? now.toISOString() : null;
    next.status = presentDraftIds.length === 0 ? "deletion_verified" : "awaiting_deletion_proof";
    next.reason = presentDraftIds.length === 0 ? "Assenza delle vecchie bozze provata dal server; repeat-test autorizzabile." : `${presentDraftIds.length} vecchie bozze risultano ancora presenti; compilazione bloccata.`;
    next.nextAction = presentDraftIds.length === 0 ? "Attendere il segnale timer; soltanto il worker APR potrà armare la coda." : "Ripetere soltanto la verifica read-only dopo l'eliminazione manuale.";
    next.audit.push({ at: now.toISOString(), type: presentDraftIds.length === 0 ? "repeat_deletion_verified" : "repeat_deletion_checked", reason: next.reason, appliedRuleIds: [...RULE_IDS, next.candidates.length === 11 ? USER_AUTHORIZED_RULE_IDS.elevenCaseCleanRepeat : next.candidates.length === 15 ? USER_AUTHORIZED_RULE_IDS.fifteenCaseIntermezzoRepeat : USER_AUTHORIZED_RULE_IDS.tenCaseMondayRestart] });
    atomicWrite(this.checkpointPath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
