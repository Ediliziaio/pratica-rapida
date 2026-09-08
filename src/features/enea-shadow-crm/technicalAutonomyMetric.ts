import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export type AprTechnicalAutonomyCaseClassification =
  | "completed_autonomously"
  | "legitimate_external_data_unavailable"
  | "technical_failure"
  | "avoidable_false_block"
  | "unresolved_ambiguity";

export interface AprTechnicalAutonomyCase {
  practiceId: string;
  classification: AprTechnicalAutonomyCaseClassification;
  evidenceIds: readonly string[];
}

export interface AprStructuredResidualCase {
  practiceId: string;
  classification: "operator_required" | "technical_block" | "ambiguous";
  exactCause: string;
  missingDocumentType: string | null;
  operatorQuestion: string;
  onboardingGap: string;
}

const nonBlank = (value: string) => value.trim().length > 0;

export function calculateTechnicalAutonomyMetric(cases: readonly AprTechnicalAutonomyCase[]) {
  const ids = new Set<string>();
  for (const item of cases) {
    if (!nonBlank(item.practiceId) || ids.has(item.practiceId)) throw new Error("apr_technical_autonomy_case_identity_invalid");
    ids.add(item.practiceId);
    if (!item.evidenceIds.length || item.evidenceIds.some((value) => !nonBlank(value))) throw new Error("apr_technical_autonomy_evidence_missing");
  }
  const excluded = cases.filter((item) => item.classification === "legitimate_external_data_unavailable");
  const eligible = cases.filter((item) => item.classification !== "legitimate_external_data_unavailable");
  const completed = eligible.filter((item) => item.classification === "completed_autonomously");
  return {
    ruleId: USER_AUTHORIZED_RULE_IDS.technicalAutonomyProcedibleDenominator,
    totalCases: cases.length,
    excludedLegitimateExternalDataUnavailable: excluded.length,
    procedibleDenominator: eligible.length,
    autonomousNumerator: completed.length,
    technicalAutonomyRate: eligible.length ? completed.length / eligible.length : null,
    excludedPracticeIds: excluded.map((item) => item.practiceId),
    failedEligiblePracticeIds: eligible.filter((item) => item.classification !== "completed_autonomously").map((item) => item.practiceId),
  };
}

export function assertStructuredResidualCase(input: AprStructuredResidualCase) {
  if (![input.practiceId, input.exactCause, input.operatorQuestion, input.onboardingGap].every(nonBlank)) {
    throw new Error("apr_structured_residual_required_field_missing");
  }
  if (!/[?？]\s*$/.test(input.operatorQuestion.trim())) throw new Error("apr_structured_residual_operator_question_not_direct");
  if (/\b(manca|mancante|assente|non (?:e|è) presente)\b/i.test(input.exactCause) && !nonBlank(input.missingDocumentType ?? "")) {
    throw new Error("apr_structured_residual_missing_document_type_missing");
  }
  return { ...input, ruleId: USER_AUTHORIZED_RULE_IDS.structuredResidualCaseQuestion };
}

export function structureAprResidualBlocker(input: { practiceId: string; code: string; field: string; reason: string }) {
  const field = input.field.toLowerCase();
  const code = input.code.toLowerCase();
  const missingDocumentType = code.includes("invoice") && /(missing|unavailable|amount_missing)/.test(code)
    ? "fattura o pagina fiscale necessaria"
    : code.includes("customer_form_missing") ? "modulo cliente originario"
      : code.includes("completion_date_missing") ? "documento originario con data di fine lavori"
        : code.includes("tax_code_missing") ? "documento fiscale o ufficiale con codice fiscale"
          : code.includes("measurements_missing") || code === "screenings_missing" ? "documento tecnico con misure del prodotto"
            : null;
  const operatorQuestion = code === "screenings_missing"
    ? "Mancano le misure del prodotto in tutti i documenti originari verificati: puoi inserirle?"
    : missingDocumentType
    ? `Puoi inserire o indicare il ${missingDocumentType} richiesto per risolvere ${input.field}?`
    : code.includes("completion_over_90") || code.includes("portal_year")
      ? "Confermi che la pratica è ancora procedibile e indichi l'anno del portale ENEA corretto?"
      : field.includes("identity") || field.includes("tax_code")
        ? `Qual è il dato ufficiale corretto da usare per ${input.field}?`
        : `Confermi il valore corretto da usare per ${input.field}, sulla base dei documenti originari?`;
  const onboardingGap = missingDocumentType
    ? `Rendere obbligatorio in onboarding: ${missingDocumentType}.`
    : `Acquisire e validare in onboarding il dato ${input.field} con la relativa fonte originaria.`;
  return assertStructuredResidualCase({ practiceId: input.practiceId, classification: "operator_required", exactCause: input.reason, missingDocumentType, operatorQuestion, onboardingGap });
}
