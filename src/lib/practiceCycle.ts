const DAY_MS = 86_400_000;

type PracticeCycleDates = {
  created_at: string | null | undefined;
  ciclo_chiuso_at?: string | null;
};

/** Giorni interi dalla creazione al primo ingresso in "Invio pratica chiusa". */
export function practiceCycleDays(
  practice: PracticeCycleDates,
  now = new Date(),
): number {
  if (!practice.created_at) return 0;

  const startedAt = new Date(practice.created_at).getTime();
  const endedAt = practice.ciclo_chiuso_at
    ? new Date(practice.ciclo_chiuso_at).getTime()
    : now.getTime();

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.max(0, Math.floor((endedAt - startedAt) / DAY_MS));
}

