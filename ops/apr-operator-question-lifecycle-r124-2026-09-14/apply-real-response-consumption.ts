import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprOperatorQuestions } from "../../scripts/enea-shadow-runner/operatorQuestions";
import {
  applyOperatorResponseDossierOverrides,
  PersistentAprOperatorResponseLedger,
} from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const cases = [
  { directory: "apr-pilot-9017-global-controller-cesare-imperiali", customerKey: "cesare-imperiali" },
  { directory: "apr-pilot-9018-global-controller-mauro-leonardi", customerKey: "mauro-leonardi" },
  { directory: "apr-pilot-9019-global-controller-gabriele-girelli", customerKey: "gabriele-girelli" },
] as const;
const now = new Date();

const results = cases.map(({ directory, customerKey }) => {
  const root = path.join(cohortsRoot, directory);
  const dossierPath = path.join(root, "crm-acquisition/dossiers", `${customerKey}.json`);
  const dossierText = readFileSync(dossierPath, "utf8");
  const dossier = JSON.parse(dossierText);
  const practiceId = dossier.row.id as string;
  const responseLedger = new PersistentAprOperatorResponseLedger(root);
  const projection = responseLedger.projection(customerKey, practiceId, now);
  const prepared = applyOperatorResponseDossierOverrides(dossier, projection);
  const sourceFingerprint = createHash("sha256").update(dossierText).digest("hex");
  responseLedger.recordApplications(prepared.applications.map((application) => ({
    responseId: application.responseId,
    customerKey,
    practiceId,
    runRoot: root,
    sourceFingerprint,
    outcome: application.outcome,
    evidence: application.evidence,
    appliedAt: now.toISOString(),
  })), now);

  const questions = new PersistentAprOperatorQuestions(root);
  const before = questions.load(now);
  const blockerCodes = before.questions.map((question) => question.payload.blockerCode).filter((value): value is string => Boolean(value));
  const after = questions.retireResolvedQuestions({
    items: [{
      customerKey,
      displayName: projection.entries.at(-1)?.displayName ?? customerKey,
      practiceId,
      state: "blocked_case",
      report: { blockers: blockerCodes.map((code) => ({ code, field: "operator_response", sourceIds: [customerKey] })) },
    }],
  }, [], now);

  return {
    customerKey,
    appliedResponseIds: prepared.appliedResponseIds,
    applicationOutcomes: prepared.applications,
    retiredQuestionIds: after.questions.filter((question) => question.status === "retired" && before.questions.find((old) => old.id === question.id)?.status !== "retired").map((question) => question.id),
  };
});

process.stdout.write(`${JSON.stringify({ mode: "persist_verified_response_application", at: now.toISOString(), cases: results }, null, 2)}\n`);
