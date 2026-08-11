export type CommercialHealthStatus =
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
  if (input.totalPractices === 0) {
    return { status: "mai_attivato", attentionScore: 60 };
  }

  if (input.lastPracticeDaysAgo !== null && input.lastPracticeDaysAgo > 60) {
    return { status: "inattivo", attentionScore: 90 };
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

  if (input.firstPracticeDaysAgo !== null && input.firstPracticeDaysAgo <= 30) {
    return { status: "nuovo_attivo", attentionScore: 40 };
  }

  return { status: "stabile", attentionScore: 20 };
}
