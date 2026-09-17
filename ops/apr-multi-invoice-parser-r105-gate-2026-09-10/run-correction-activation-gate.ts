import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertAprCorrectionActivationGate,
  envelopeAprCorrectionActivationGateResult,
} from "../../scripts/enea-shadow-runner/aprCorrectionActivationGate";

const repositoryRoot = "/Users/giulianolavoro/.codex/worktrees/76cf/pratica-rapida";
const gateRoot = path.join(repositoryRoot, "ops/apr-multi-invoice-parser-r105-gate-2026-09-10");
const stagingDirectory = path.join(gateRoot, "staged-bundle");
const output = path.join(gateRoot, "correction-activation-gate.json");

const result = assertAprCorrectionActivationGate({ repositoryRoot, stagingDirectory });
const envelope = envelopeAprCorrectionActivationGateResult(result);
mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: result.status,
  reasons: result.reasons,
  artifactId: envelope.artifactId,
  output,
}, null, 2)}\n`);
