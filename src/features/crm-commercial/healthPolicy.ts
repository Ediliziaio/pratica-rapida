export type CommercialHealthStatus =
  | "needs_data_review"
  | "mai_attivato"
  | "nuovo_attivo"
  | "stabile"
  | "in_crescita"
  | "in_calo"
  | "a_rischio"
  | "inattivo";

export interface CommercialHealthInput {
  totalPractices: number;
  practicesLast30d: number;
  practicesPrev30d: number;
  firstPracticeDaysAgo: number | null;
  lastPracticeDaysAgo: number | null;
}

export interface CommercialHealthDecision {
  status: CommercialHealthStatus;
  attentionScore: number;
}

export function classifyCommercialHealth(input: CommercialHealthInput): CommercialHealthDecision {
  const impossiblePracticeTiming = [input.firstPracticeDaysAgo, input.lastPracticeDaysAgo]
    .some((daysAgo) => daysAgo !== null && (!Number.isFinite(daysAgo) || daysAgo < 0));

  // Una pratica con data futura non deve diventare attivita commerciale valida:
  // la cronologia va verificata prima di proporre recuperi, onboarding o follow-up.
  if (impossiblePracticeTiming) {
    return { status: "needs_data_review", attentionScore: 80 };
  }

  if (input.totalPractices === 0) {
    return { status: "mai_attivato", attentionScore: 60 };
  }

  if (input.lastPracticeDaysAgo !== null && input.lastPracticeDaysAgo > 60) {
    return { status: "inattivo", attentionScore: 90 };
  }

  // Una prima attivazione recente resta sotto onboarding anche se, per definizione,
  // il confronto col periodo precedente (zero pratiche) sembrerebbe una crescita.
  if (input.firstPracticeDaysAgo !== null && input.firstPracticeDaysAgo <= 30) {
    return { status: "nuovo_attivo", attentionScore: 40 };
  }

  if (
    (input.practicesLast30d === 0 && input.practicesPrev30d >= 2)
    || (input.practicesPrev30d >= 4 && input.practicesLast30d <= Math.floor(input.practicesPrev30d * 0.5))
  ) {
    return { status: "a_rischio", attentionScore: 100 };
  }

  if (input.practicesLast30d < input.practicesPrev30d) {
    return { status: "in_calo", attentionScore: 70 };
  }

  if (input.practicesLast30d > input.practicesPrev30d) {
    return { status: "in_crescita", attentionScore: 10 };
  }

  return { status: "stabile", attentionScore: 20 };
}