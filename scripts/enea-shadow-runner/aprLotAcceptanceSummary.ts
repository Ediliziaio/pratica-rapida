export const APR_LOT_ACCEPTANCE_SUMMARY_VERSION = "apr-lot-acceptance-summary-v1" as const;

/**
 * Lo standard di accettazione del titolare, misurato invece che raccontato.
 *
 * Una pratica puo' finire in due soli modi ammessi: la bozza e' salvata sul
 * portale, oppure arriva all'operatore con la sua domanda scritta. Tutto il
 * resto e' non conforme, qualunque sia lo stato tecnico con cui il lotto la
 * etichetta: una pratica ferma senza domanda non e' "in attesa di operatore",
 * perche' all'operatore non e' arrivato niente.
 *
 * Le pratiche ritirate dall'operatore prima della lavorazione — rinunce del
 * cliente, fine lavori oltre i 90 giorni, pratiche dichiarate chiuse — non
 * entrano nel denominatore: il preflight scrive gia' "esclusa dal denominatore
 * di autonomia" e finora nessuno leggeva quella riga.
 */
export type AprLotCaseVerdict = "salvata" | "con_domanda" | "non_conforme" | "ritirata";

export interface AprLotCaseInput {
  customerKey: string;
  /** Stato terminale scritto dal lotto: saved | operator_required | technical_block | inconsistent. */
  state: string;
  /** Stato del preflight comune per questa pratica, se leggibile. */
  preflightState?: string | null;
  /** Tipo di disposizione registrata dal preflight, se presente. */
  dispositionKind?: string | null;
  /** Motivo persistito dal preflight per la disposizione. */
  withdrawalReason?: string | null;
  /** Quante domande operatore risultano effettivamente persistite per la pratica. */
  persistedQuestionCount: number;
}

export interface AprLotCaseAssessment {
  customerKey: string;
  verdict: AprLotCaseVerdict;
  state: string;
  reason: string;
}

export interface AprLotAcceptanceSummary {
  version: typeof APR_LOT_ACCEPTANCE_SUMMARY_VERSION;
  /** Pratiche presenti nel manifest del lotto. */
  presentate: number;
  /** Pratiche effettivamente in gioco: presentate meno le ritirate. */
  lavorabili: number;
  salvate: number;
  conDomanda: number;
  nonConformi: number;
  ritirate: number;
  /** salvate / lavorabili, arrotondato a un decimale; null se non c'e' denominatore. */
  autonomiaPercento: number | null;
  /**
   * Pratiche ferme che non hanno prodotto alcuna domanda: non sono arrivate
   * all'operatore e quindi non rispettano lo standard, per quanto il loro
   * stato tecnico possa suggerire il contrario.
   */
  fermeSenzaDomanda: readonly string[];
  casi: readonly AprLotCaseAssessment[];
}

const SAVED = "saved";
const WITHDRAWN_PREFLIGHT_STATE = "deferred_operator";
const WITHDRAWN_DISPOSITION = "user_deferred";

/**
 * Il ritiro e' un fatto scritto dal preflight, non una deduzione: servono lo
 * stato differito e la disposizione dell'operatore. Una pratica soltanto ferma
 * non e' ritirata, e non va tolta dal denominatore.
 */
export function isAprCaseWithdrawnByOperator(input: AprLotCaseInput): boolean {
  return input.preflightState === WITHDRAWN_PREFLIGHT_STATE && input.dispositionKind === WITHDRAWN_DISPOSITION;
}

function assess(input: AprLotCaseInput): AprLotCaseAssessment {
  if (isAprCaseWithdrawnByOperator(input)) {
    return {
      customerKey: input.customerKey,
      verdict: "ritirata",
      state: input.state,
      reason: input.withdrawalReason?.trim()
        ? `Ritirata prima della lavorazione: ${input.withdrawalReason.trim()}`
        : "Ritirata dall'operatore prima della lavorazione.",
    };
  }
  if (input.state === SAVED) {
    return { customerKey: input.customerKey, verdict: "salvata", state: input.state, reason: "Bozza salvata sul portale." };
  }
  if (input.persistedQuestionCount > 0) {
    return {
      customerKey: input.customerKey,
      verdict: "con_domanda",
      state: input.state,
      reason: `Ferma con ${input.persistedQuestionCount} domanda/e scritta/e per l'operatore.`,
    };
  }
  return {
    customerKey: input.customerKey,
    verdict: "non_conforme",
    state: input.state,
    reason: `Ferma in stato ${input.state} senza alcuna domanda persistita: non e' salvata e non e' arrivata all'operatore.`,
  };
}

export function summariseAprLotAcceptance(cases: readonly AprLotCaseInput[]): AprLotAcceptanceSummary {
  const casi = cases.map(assess).sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const count = (verdict: AprLotCaseVerdict) => casi.filter((item) => item.verdict === verdict).length;
  const ritirate = count("ritirata");
  const salvate = count("salvata");
  const lavorabili = casi.length - ritirate;
  return {
    version: APR_LOT_ACCEPTANCE_SUMMARY_VERSION,
    presentate: casi.length,
    lavorabili,
    salvate,
    conDomanda: count("con_domanda"),
    nonConformi: count("non_conforme"),
    ritirate,
    autonomiaPercento: lavorabili > 0 ? Math.round((salvate / lavorabili) * 1000) / 10 : null,
    fermeSenzaDomanda: casi.filter((item) => item.verdict === "non_conforme").map((item) => item.customerKey),
    casi,
  };
}
