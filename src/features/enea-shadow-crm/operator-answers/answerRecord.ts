import { isPendingDataQuestion, type OpenQuestion } from "./openQuestions.ts";
import { OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID, type OperatorResponsePayload, type OperatorResponseRecord } from "./responseLedger.ts";

export const CRM_OMBRA_RESPONSE_SOURCE = "giuliano_crm_ombra" as const;

export type AnswerOutcome =
  | { ok: true; record: OperatorResponseRecord; note: string | null }
  | { ok: false; reason: string };

const isMeasurementQuestion = (question: OpenQuestion) =>
  question.kind === "missing_measurement" || question.kind === "unit_confirmation" || /^screenings\.\d+\.dimensions(\.unit)?$/.test(question.field);

const DIMENSIONS = /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|per)\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|centimetri|millimetri)\b/i;
const UNIT_ONLY = /\b(mm|millimetri|cm|centimetri)\b/i;
const toNumber = (raw: string) => Number(raw.replace(",", "."));
const toMm = (value: number, unit: string) => Math.round(/^c/i.test(unit) ? value * 10 : value);

function normalizedName(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function productDescription(question: OpenQuestion, prefix: string): string {
  const typed = prefix.replace(/[\s:,;.-]+$/g, "").trim();
  if (typed.length >= 3) return typed;
  // APR nelle domande multi-fornitore mette il nome del cliente come descrizione: non è un prodotto.
  const fromQuestion = (question.payload?.description ?? "").trim();
  if (fromQuestion && normalizedName(fromQuestion) !== normalizedName(question.displayName)) return fromQuestion.replace(/^(la|il|lo|l'|le|i|gli)\s+/i, "");
  return "Prodotto";
}

// Le misure vanno scritte con l'unità (es. "400x300 cm", "Pergotenda 4000x3000 mm").
// Senza unità non si indovina: la stessa ambiguità è il motivo per cui APR ha chiesto.
function measurementPayload(question: OpenQuestion, answer: string): { payload: OperatorResponsePayload } | { reason: string } {
  const dims = DIMENSIONS.exec(answer);
  if (dims) {
    const widthMm = toMm(toNumber(dims[1]), dims[3]);
    const heightMm = toMm(toNumber(dims[2]), dims[3]);
    if (!(widthMm > 0 && heightMm > 0)) return { reason: "Misure non valide: larghezza e altezza devono essere maggiori di zero." };
    return { payload: { kind: "screening_products", products: [{ description: productDescription(question, answer.slice(0, dims.index)), quantity: 1, widthMm, heightMm }] } };
  }
  const unit = UNIT_ONLY.exec(answer);
  const rawWidth = question.payload?.rawWidth ?? 0;
  const rawHeight = question.payload?.rawHeight ?? 0;
  if (unit && rawWidth > 1 && rawHeight > 1) {
    return { payload: { kind: "screening_products", products: [{ description: productDescription(question, ""), quantity: 1, widthMm: toMm(rawWidth, unit[1]), heightMm: toMm(rawHeight, unit[1]) }] } };
  }
  return { reason: "Scrivi larghezza x altezza con l'unità, es. \"400x300 cm\" oppure \"Pergotenda 4000x3000 mm\"." };
}

const compactStamp = (now: Date) => now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
const safeIdPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");

// Trasforma la domanda aperta + la risposta scritta da Giuliano in un record del
// ledger, nella forma esatta dei record già presenti. Il questionId sta dentro il
// responseId così PRBoss può ricollegare risposta e domanda senza campi nuovi.
export function buildAnswerRecord(question: OpenQuestion, answerText: string, now: Date): AnswerOutcome {
  const answer = answerText.replace(/\s+/g, " ").trim();
  if (!answer) return { ok: false, reason: "La risposta è vuota." };
  if (!question.practiceId) return { ok: false, reason: `Pratica senza practiceId nel cohort-seed (${question.cohort}): non registro.` };

  let payload: OperatorResponsePayload;
  let note: string | null = null;
  const pendingMeasures = isPendingDataQuestion(question) ? measurementPayload(question, answer) : null;
  if (isMeasurementQuestion(question)) {
    const mapped = measurementPayload(question, answer);
    if ("reason" in mapped) return { ok: false, reason: mapped.reason };
    payload = mapped.payload;
  } else if (pendingMeasures && "payload" in pendingMeasures) {
    // "Dato mancante" risposto con misure e unità: è il caso Munafò. Il record
    // deve essere screening_products, che APR consuma, e superare la richiesta
    // rimasta attiva; un operator_required lascerebbe la pratica ferma.
    payload = pendingMeasures.payload;
  } else {
    // APR oggi non ha un payload che consumi questa risposta: la registriamo come
    // dato leggibile e la pratica resta in attesa operatore, com'è adesso.
    //
    // NOTA PER IL RUNNER (scripts/enea-shadow-runner, non si tocca da qui):
    // tipi di domanda incontrati nel giro del 2026-09-13 per cui il ledger non
    // ha ancora un payload.kind da consumare. Domanda e risposta sono in chiaro
    // nel record; per ognuno serve un kind nuovo lato runner:
    //   - field "shading_closures"           (case_decision, sì/no: chiusure oscuranti insieme agli infissi)
    //   - field "completionDate"             (case_decision, testo: data di fine lavori)
    //   - field "economic.invoiceTotal"      (case_decision, testo: totale stampato in fattura, mai ricalcolato)
    //   - field "infissi.dimensioni_e_numero" (case_decision, testo: quanti serramenti e misura di ciascuno)
    //   - field "operator.pendingData"       (case_decision, testo: il dato mancante richiesto in precedenza;
    //                                         se la risposta contiene misure con unità diventa screening_products, vedi sopra)
    payload = { kind: "operator_required", operatorQuestion: question.prompt, missingDocumentType: question.missingDocumentType };
    note = "Registrata. APR non ha ancora un consumo automatico per questo tipo di domanda: la pratica resta in attesa operatore.";
  }

  return {
    ok: true,
    note,
    record: {
      responseId: `response:crm-ombra:${safeIdPart(question.id)}:${compactStamp(now)}`,
      customerKey: question.customerKey,
      displayName: question.displayName,
      practiceId: question.practiceId,
      receivedAt: now.toISOString(),
      source: CRM_OMBRA_RESPONSE_SOURCE,
      question: question.prompt,
      answer,
      payload,
      status: "active",
      supersedesResponseId: null,
      appliedRuleIds: [OPERATOR_RESPONSE_RUNTIME_CONSUMPTION_RULE_ID],
    },
  };
}
