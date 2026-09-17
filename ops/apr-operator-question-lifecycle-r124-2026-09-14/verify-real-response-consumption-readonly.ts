import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCrmLocalPreflightReport } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import {
  applyOperatorResponseDossierOverrides,
  PersistentAprOperatorResponseLedger,
} from "../../scripts/enea-shadow-runner/operatorResponseLedger";
import { activeResponseForQuestion } from "../../scripts/enea-shadow-runner/operatorQuestionLifecycle";

const cohortsRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
const observedAt = new Date("2026-09-14T10:30:00Z");
const cases = [
  { directory: "apr-pilot-9017-global-controller-cesare-imperiali", customerKey: "cesare-imperiali" },
  { directory: "apr-pilot-9018-global-controller-mauro-leonardi", customerKey: "mauro-leonardi" },
  { directory: "apr-pilot-9019-global-controller-gabriele-girelli", customerKey: "gabriele-girelli" },
] as const;

const result = cases.map(({ directory, customerKey }) => {
  const root = path.join(cohortsRoot, directory);
  const dossier = JSON.parse(readFileSync(path.join(root, "crm-acquisition/dossiers", `${customerKey}.json`), "utf8"));
  const analysis = JSON.parse(readFileSync(path.join(root, "crm-document-analysis/checkpoint.json"), "utf8"));
  const questionState = JSON.parse(readFileSync(path.join(root, "operator-questions/checkpoint.json"), "utf8"));
  const questions = questionState.questions;
  const practiceId = dossier.row.id as string;
  const responseLedger = new PersistentAprOperatorResponseLedger(root);
  const projection = responseLedger.projection(customerKey, practiceId, observedAt);
  const prepared = applyOperatorResponseDossierOverrides(dossier, projection);
  const report = buildCrmLocalPreflightReport(
    prepared.dossier,
    customerKey,
    analysis,
    observedAt,
    undefined,
    projection,
  );

  return {
    customerKey,
    activeResponses: projection.entries.map((entry) => ({
      responseId: entry.responseId,
      kind: entry.payload.kind,
      answer: entry.answer,
    })),
    dossierOverrideResponseIds: prepared.appliedResponseIds,
    preflight: {
      completionDate: report.completionDate,
      productCount: prepared.infissiSurfaceRows.length || report.products.length,
      blockerCodes: report.blockers.map((blocker) => blocker.code),
    },
    questionMatches: questions.map((question: any) => ({
      id: question.id,
      status: question.status,
      resolvedReason: [...questionState.audit].reverse().find((event: any) => event.questionId === question.id && event.type === "question_retired")?.reason ?? null,
      matchedResponseId: activeResponseForQuestion({
        ...question,
        practiceId: question.practiceId ?? practiceId,
        blockerCode: question.payload?.blockerCode ?? null,
      }, projection.entries)?.responseId ?? null,
      matchedResponseEffectivelyApplied: (() => {
        const response = activeResponseForQuestion({
          ...question,
          practiceId: question.practiceId ?? practiceId,
          blockerCode: question.payload?.blockerCode ?? null,
        }, projection.entries);
        return response ? responseLedger.hasEffectiveApplication(response.responseId, customerKey, practiceId, observedAt) : false;
      })(),
    })),
  };
});

process.stdout.write(`${JSON.stringify({ mode: "read_only", observedAt: observedAt.toISOString(), cases: result }, null, 2)}\n`);
