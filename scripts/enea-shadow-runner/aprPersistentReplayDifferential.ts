import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APR_RULE_RUNTIME_REVISION } from "./aprRuleRuntimeRevision";
import { buildAprDifferentialReport, type AprDifferentialReport, type AprDifferentialSnapshot } from "./aprDifferentialReport";
import { canonicalJson, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope, type AprImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";

export const APR_PERSISTENT_REPLAY_DIFFERENTIAL_VERSION = "apr-persistent-replay-differential-v1" as const;

export interface AprPersistentReplayDifferentialPayload {
  schemaVersion: typeof APR_PERSISTENT_REPLAY_DIFFERENTIAL_VERSION;
  generatedAt: string;
  gitCommit: string;
  runtimeRevision: string;
  baselineRunId: string;
  candidateRunId: string;
  corpusFingerprint: string;
  reportArtifactId: string;
  report: AprDifferentialReport;
}

export type AprPersistentReplayDifferential = AprImmutableArtifactEnvelope<AprPersistentReplayDifferentialPayload>;

export class PersistentAprReplayDifferentialStore {
  readonly directory: string;
  constructor(rootDirectory: string) { this.directory = path.join(path.resolve(rootDirectory), "learning-replay", "differential-reports"); }

  persist(artifact: AprPersistentReplayDifferential) {
    if (!verifyImmutableArtifactEnvelope(artifact) || !verifyImmutableArtifactEnvelope(artifact.payload.report)) throw new Error("apr_replay_differential_envelope_invalid");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, `${artifact.artifactId}.json`);
    const contents = `${canonicalJson(artifact)}\n`;
    if (existsSync(target)) {
      if (readFileSync(target, "utf8") !== contents) throw new Error("apr_replay_differential_immutable_collision");
      return { artifact, path: target, created: false };
    }
    const descriptor = openSync(target, "wx", 0o600);
    try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
    const directory = openSync(this.directory, "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
    return { artifact, path: target, created: true };
  }

  load(artifactId: string): AprPersistentReplayDifferential {
    if (!/^[a-f0-9]{64}$/.test(artifactId)) throw new Error("apr_replay_differential_artifact_id_invalid");
    const artifact = JSON.parse(readFileSync(path.join(this.directory, `${artifactId}.json`), "utf8")) as AprPersistentReplayDifferential;
    if (!verifyImmutableArtifactEnvelope(artifact) || !verifyImmutableArtifactEnvelope(artifact.payload.report)) throw new Error("apr_replay_differential_persisted_invalid");
    return artifact;
  }

  list() {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => this.load(name.slice(0, -5)))
      .sort((left, right) => left.payload.generatedAt.localeCompare(right.payload.generatedAt) || left.artifactId.localeCompare(right.artifactId));
  }
}

export function persistAprReplayDifferential(input: {
  targetRoot: string;
  baseline: AprDifferentialSnapshot;
  candidate: AprDifferentialSnapshot;
  gitCommit: string;
  runtimeRevision?: string;
  now?: Date;
}) {
  if (!/^[a-f0-9]{7,64}$/.test(input.gitCommit)) throw new Error("apr_replay_differential_git_commit_invalid");
  const generatedAt = (input.now ?? new Date()).toISOString();
  const report = buildAprDifferentialReport({ baseline: input.baseline, candidate: input.candidate, now: new Date(generatedAt) });
  const artifact = envelopeImmutableArtifact({
    schemaVersion: APR_PERSISTENT_REPLAY_DIFFERENTIAL_VERSION,
    generatedAt,
    gitCommit: input.gitCommit,
    runtimeRevision: input.runtimeRevision ?? APR_RULE_RUNTIME_REVISION,
    baselineRunId: input.baseline.runId,
    candidateRunId: input.candidate.runId,
    corpusFingerprint: report.payload.inputCorpusFingerprint.sourceSetSha256,
    reportArtifactId: report.artifactId,
    report,
  });
  return new PersistentAprReplayDifferentialStore(input.targetRoot).persist(artifact);
}
