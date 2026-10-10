export const APR_OPERATOR_RESPONSE_MARKER = "Risposta operatore:";

export type AprOperatorResponseState = Readonly<{
  issuedNote: string;
  question: string;
  answer: string | null;
}>;

export function parseAprOperatorResponseState(note: string | null | undefined): AprOperatorResponseState | null {
  const normalized = (note ?? "").replace(/\r\n/g, "\n");
  const markerIndex = normalized.lastIndexOf(APR_OPERATOR_RESPONSE_MARKER);
  if (markerIndex < 0) return null;

  const issuedNote = normalized.slice(0, markerIndex + APR_OPERATOR_RESPONSE_MARKER.length).trimEnd();
  if (!issuedNote.endsWith(`\n${APR_OPERATOR_RESPONSE_MARKER}`)) return null;
  const formalPrefix = "Domanda APR\nDestinatario: titolare\n";
  const fallbackPrefix = "APR si e' fermato. ";
  const prefix = issuedNote.startsWith(formalPrefix)
    ? formalPrefix
    : issuedNote.startsWith(fallbackPrefix) ? fallbackPrefix : null;
  if (!prefix) return null;

  const question = issuedNote
    .slice(prefix.length, -(`\n${APR_OPERATOR_RESPONSE_MARKER}`).length)
    .trim();
  if (!question) return null;

  const answer = normalized.slice(markerIndex + APR_OPERATOR_RESPONSE_MARKER.length).trim();
  return { issuedNote, question, answer: answer || null };
}

export function appendAprOperatorResponse(issuedNote: string, answer: string) {
  const cleanAnswer = answer.replace(/\r\n/g, "\n").trim();
  if (!issuedNote.endsWith(APR_OPERATOR_RESPONSE_MARKER) || !cleanAnswer || cleanAnswer.length > 2_000) {
    throw new Error("Risposta non valida");
  }
  return `${issuedNote}\n${cleanAnswer}`;
}
