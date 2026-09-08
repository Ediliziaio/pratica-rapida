import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomInt, randomUUID } from "node:crypto";
import path from "node:path";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";

export const APR_PILOT_SAMPLE_VERSION = "apr-pilot-sample-v1" as const;
export const APR_PILOT_EXPECTED_CANDIDATES = 15;
export const APR_PILOT_SAMPLE_SIZE = 5;
export type AprPilotCandidateSource = "crm_readonly_adapter" | "user_supplied_candidate_list";

export interface AprPilotCandidate {
  customerKey: string;
  displayName: string;
  practiceId?: string;
  expectedStageType?: "archiviate" | "recensione" | "pronte_da_fare" | "gestionale";
  productModule?: "screening" | "infissi";
}

export interface AprPilotSampleEvent {
  at: string;
  type: "pilot_initialized" | "candidate_list_rejected" | "pilot_selected";
  reason: string;
  nextAction: string;
  appliedRuleIds: string[];
}

export interface AprPilotSampleCheckpoint {
  version: typeof APR_PILOT_SAMPLE_VERSION;
  revision: number;
  status: "awaiting_candidates" | "blocked" | "selected";
  expectedCandidates: typeof APR_PILOT_EXPECTED_CANDIDATES;
  sampleSize: typeof APR_PILOT_SAMPLE_SIZE;
  source: AprPilotCandidateSource;
  sourceEvidenceId: string | null;
  candidateFingerprint: string | null;
  selected: AprPilotCandidate[];
  reason: string;
  nextAction: string;
  createdAt: string;
  selectedAt: string | null;
  audit: AprPilotSampleEvent[];
}

type RandomIndex = (upperExclusive: number) => number;

function writeAtomic(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
}

function normalizedCandidates(candidates: readonly AprPilotCandidate[]) {
  return candidates
    .map((candidate) => ({
      customerKey: candidate.customerKey.trim().toLocaleLowerCase("it-IT"),
      displayName: candidate.displayName.trim(),
    }))
    .sort((left, right) => left.customerKey.localeCompare(right.customerKey, "it-IT"));
}

function fingerprint(candidates: readonly AprPilotCandidate[]) {
  return createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
}

function validateCandidates(candidates: readonly AprPilotCandidate[]) {
  if (candidates.length !== APR_PILOT_EXPECTED_CANDIDATES) {
    return `candidate_count_${candidates.length}_expected_${APR_PILOT_EXPECTED_CANDIDATES}`;
  }
  if (candidates.some((candidate) => !candidate.customerKey || !candidate.displayName)) return "candidate_identity_missing";
  if (new Set(candidates.map((candidate) => candidate.customerKey)).size !== APR_PILOT_EXPECTED_CANDIDATES) return "duplicate_customer_key";
  return null;
}

export class PersistentAprPilotSample {
  readonly directory: string;
  readonly checkpointFile: string;
  readonly lockFile: string;

  constructor(rootDirectory: string) {
    this.directory = path.join(path.resolve(rootDirectory), "pilot-sample");
    this.checkpointFile = path.join(this.directory, "checkpoint.json");
    this.lockFile = path.join(this.directory, "selection.lock");
  }

  initialize(now = new Date()) {
    const current = this.load();
    if (current) return current;
    const checkpoint: AprPilotSampleCheckpoint = {
      version: APR_PILOT_SAMPLE_VERSION,
      revision: 0,
      status: "awaiting_candidates",
      expectedCandidates: APR_PILOT_EXPECTED_CANDIDATES,
      sampleSize: APR_PILOT_SAMPLE_SIZE,
      source: "crm_readonly_adapter",
      sourceEvidenceId: null,
      candidateFingerprint: null,
      selected: [],
      reason: "Selezione pilot inizializzata; elenco reale dei 15 candidati non ancora acquisito dall'adattatore CRM read-only.",
      nextAction: "Acquisire esattamente 15 clienti reali univoci tramite adapter APR read-only verificato.",
      createdAt: now.toISOString(),
      selectedAt: null,
      audit: [{
        at: now.toISOString(),
        type: "pilot_initialized",
        reason: "Checkpoint 5-su-15 creato senza inventare nominativi e senza azioni esterne.",
        nextAction: "Attendere i 15 candidati dal solo adapter APR read-only.",
        appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.randomPilotFiveOfFifteen, "system-atomic-checkpoint-resume"],
      }],
    };
    writeAtomic(this.checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }

  load(): AprPilotSampleCheckpoint | null {
    if (!existsSync(this.checkpointFile)) return null;
    try {
      const checkpoint = JSON.parse(readFileSync(this.checkpointFile, "utf8")) as AprPilotSampleCheckpoint;
      return checkpoint.version === APR_PILOT_SAMPLE_VERSION && Array.isArray(checkpoint.selected) && Array.isArray(checkpoint.audit)
        ? checkpoint
        : null;
    } catch {
      return null;
    }
  }

  select(
    candidates: readonly AprPilotCandidate[],
    sourceEvidenceId: string,
    now = new Date(),
    randomIndex: RandomIndex = (upperExclusive) => randomInt(upperExclusive),
    source: AprPilotCandidateSource = "crm_readonly_adapter",
  ) {
    if (!sourceEvidenceId.trim()) throw new Error("Prova sorgente dell'elenco candidati obbligatoria.");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    let lockDescriptor: number;
    try {
      lockDescriptor = openSync(this.lockFile, "wx", 0o600);
    } catch {
      throw new Error("PILOT_SELECTION_LOCKED");
    }
    try {
      const current = this.initialize(now);
      const normalized = normalizedCandidates(candidates);
      const candidateFingerprint = fingerprint(normalized);
      if (current.status === "selected") {
        if (current.candidateFingerprint !== candidateFingerprint || current.sourceEvidenceId !== sourceEvidenceId.trim() || current.source !== source) {
          throw new Error("Pilot già selezionato: sostituzione dei candidati vietata.");
        }
        return current;
      }
      const validationError = validateCandidates(normalized);
      if (validationError) {
        const blocked: AprPilotSampleCheckpoint = {
          ...current,
          revision: current.revision + 1,
          status: "blocked",
          source,
          sourceEvidenceId: sourceEvidenceId.trim(),
          candidateFingerprint,
          selected: [],
          reason: `Elenco candidati rifiutato: ${validationError}.`,
          nextAction: "Correggere l'elenco nella stessa fonte dichiarata; non selezionare né avviare pratiche.",
          audit: [...current.audit, {
            at: now.toISOString(),
            type: "candidate_list_rejected",
            reason: validationError,
            nextAction: "Ripetere esclusivamente l'acquisizione dalla stessa fonte dichiarata.",
            appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.randomPilotFiveOfFifteen, "system-operator-block-fail-closed", "system-atomic-checkpoint-resume"],
          }],
        };
        writeAtomic(this.checkpointFile, `${JSON.stringify(blocked, null, 2)}\n`);
        return blocked;
      }
      const pool = [...normalized];
      for (let index = pool.length - 1; index > 0; index -= 1) {
        const selectedIndex = randomIndex(index + 1);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > index) throw new Error("Generatore casuale non valido.");
        [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
      }
      const selected = pool.slice(0, APR_PILOT_SAMPLE_SIZE);
      const checkpoint: AprPilotSampleCheckpoint = {
        ...current,
        revision: current.revision + 1,
        status: "selected",
        source,
        sourceEvidenceId: sourceEvidenceId.trim(),
        candidateFingerprint,
        selected,
        reason: "Cinque pratiche estratte casualmente dai 15 candidati reali e congelate nel checkpoint.",
        nextAction: "Preparare la coda APR read-only dei cinque clienti selezionati; nessuna azione ENEA finché i gate restano chiusi.",
        selectedAt: now.toISOString(),
        audit: [...current.audit, {
          at: now.toISOString(),
          type: "pilot_selected",
          reason: `Selezionati 5 clienti su 15 dalla fonte ${source}; fingerprint candidati ${candidateFingerprint}.`,
          nextAction: "Avviare il solo preflight APR read-only sui cinque checkpoint congelati.",
          appliedRuleIds: [USER_AUTHORIZED_RULE_IDS.randomPilotFiveOfFifteen, "system-single-active-practice", "system-atomic-checkpoint-resume"],
        }],
      };
      writeAtomic(this.checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
      return checkpoint;
    } finally {
      closeSync(lockDescriptor!);
      try { unlinkSync(this.lockFile); } catch { /* lock già assente */ }
    }
  }

  snapshot(now = new Date()) {
    const checkpoint = this.load() ?? this.initialize(now);
    return {
      ...checkpoint,
      externalActionAllowed: false,
      operationalGate: checkpoint.status === "selected" ? "blocked_pending_real_readonly_preflight" : "blocked_pending_real_candidate_list",
      observedAt: now.toISOString(),
      lastEvent: checkpoint.audit.at(-1)!,
    };
  }
}
