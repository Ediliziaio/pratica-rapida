export const APR_OPERATOR_QUESTION_EVIDENCE_VERSION = "apr-operator-question-evidence-v1" as const;

export interface AprOperatorQuestionEvidenceContext {
  labelLine: number;
  lines: string[];
  rendered: string;
}

/**
 * Restituisce un contesto breve e numerato attorno alla prima etichetta
 * candidata. Non interpreta il valore e non lo promuove a dato: serve solo a
 * rendere la domanda operatore verificabile senza riaprire il documento.
 */
export function operatorQuestionEvidenceAroundLabel(
  sourceText: string,
  candidateLabel: RegExp,
  maxLines = 15,
): AprOperatorQuestionEvidenceContext | null {
  const boundedMax = Math.max(3, Math.min(15, Math.floor(maxLines)));
  const lines = sourceText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const index = lines.findIndex((line) => {
    candidateLabel.lastIndex = 0;
    return candidateLabel.test(line);
  });
  if (index < 0) return null;
  const before = Math.floor((boundedMax - 1) / 2);
  let start = Math.max(0, index - before);
  let end = Math.min(lines.length, start + boundedMax);
  start = Math.max(0, end - boundedMax);
  const selected = lines.slice(start, end);
  return {
    labelLine: index + 1,
    lines: selected,
    rendered: selected.map((line, offset) => `L${start + offset + 1}: ${line || "[riga vuota]"}`).join("\n"),
  };
}
