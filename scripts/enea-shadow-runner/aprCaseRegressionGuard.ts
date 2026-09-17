import { createHash } from "node:crypto";

export const APR_CASE_REGRESSION_GUARD_VERSION = "apr-case-regression-guard-v1" as const;

/**
 * Il cricchetto che mancava.
 *
 * Ogni regola nuova aggiunge un cancello fail-closed: giusto per una pratica
 * mai vista, distruttivo per una gia' completata. Fra l'8 e il 13 settembre
 * 2026 cinque pratiche gia' salvate — Codognato, Giuga, Depalma, Cappello,
 * Dettori — sono tornate ferme, ciascuna per un cancello diverso introdotto
 * dopo, e nessuno se n'e' accorto: nel lotto delle 76 il saldo netto e' stato
 * di una pratica guadagnata e cinque perse.
 *
 * Qui non si aggira nessun cancello: un cancello che blocca puo' avere
 * ragione. Si riconosce e si dichiara la regressione, con la prova che i
 * documenti non sono cambiati, cosi' che sia un difetto da chiudere e non una
 * pratica da rilavorare.
 */
export interface AprCaseDocumentIdentity {
  /** Chiavi di contenuto dei documenti originari, in qualunque ordine. */
  documentKeys: readonly string[];
}

export interface AprCaseOutcomeRecord {
  customerKey: string;
  runId: string;
  observedAt: string;
  state: string;
  documentKeys: readonly string[];
}

export interface AprCaseRegression {
  customerKey: string;
  previousRunId: string;
  previousObservedAt: string;
  currentRunId: string;
  currentState: string;
  documentFingerprint: string;
  reason: string;
}

/**
 * Identita' del fascicolo: il contenuto dei documenti, non la coorte. Le
 * impronte calcolate dal preflight includono il numero di coorte e cambiano a
 * ogni giro, quindi non distinguono "stessi documenti" da "documenti nuovi".
 */
export function aprCaseDocumentFingerprint(identity: AprCaseDocumentIdentity): string | null {
  const keys = [...new Set(identity.documentKeys.filter((key) => typeof key === "string" && key.trim()))].sort();
  if (keys.length === 0) return null;
  return createHash("sha256").update(keys.join("|")).digest("hex");
}

const SAVED = "saved";

/**
 * Un verdetto emesso su un fascicolo vuoto non e' un verdetto. Nel lotto del
 * 13/09/2026 due pratiche su 76 sono state giudicate senza alcun documento
 * acquisito: Depalma, fermata sulle revisioni, e De Filippo, fermata da un
 * HTTP 504 del CRM. Vanno distinte dalle ferme vere, perche' non dicono nulla
 * sulla pratica e vanno solo rilavorate.
 */
export function detectAprCasesJudgedWithoutDocuments(current: readonly AprCaseOutcomeRecord[]) {
  return current
    .filter((record) => record.state !== SAVED && aprCaseDocumentFingerprint(record) === null)
    .map((record) => ({
      customerKey: record.customerKey,
      runId: record.runId,
      state: record.state,
      reason: "Nessun documento originario acquisito o analizzato: l'esito non riguarda la pratica ma l'acquisizione, e va rilavorata.",
    }))
    .sort((left, right) => left.customerKey.localeCompare(right.customerKey));
}

/**
 * Una regressione richiede tre prove: la pratica era salvata, adesso non lo
 * e', e il fascicolo e' identico. Un giro senza documenti acquisiti non prova
 * nulla e non viene mai confrontato.
 */
export function detectAprCaseRegressions(
  current: readonly AprCaseOutcomeRecord[],
  history: readonly AprCaseOutcomeRecord[],
): AprCaseRegression[] {
  const bestSaved = new Map<string, AprCaseOutcomeRecord>();
  for (const record of history) {
    if (record.state !== SAVED) continue;
    if (aprCaseDocumentFingerprint(record) === null) continue;
    const known = bestSaved.get(record.customerKey);
    if (!known || record.observedAt > known.observedAt) bestSaved.set(record.customerKey, record);
  }

  const regressions: AprCaseRegression[] = [];
  for (const record of current) {
    if (record.state === SAVED) continue;
    const fingerprint = aprCaseDocumentFingerprint(record);
    if (fingerprint === null) continue;
    const previous = bestSaved.get(record.customerKey);
    if (!previous || previous.runId === record.runId) continue;
    if (aprCaseDocumentFingerprint(previous) !== fingerprint) continue;
    regressions.push({
      customerKey: record.customerKey,
      previousRunId: previous.runId,
      previousObservedAt: previous.observedAt,
      currentRunId: record.runId,
      currentState: record.state,
      documentFingerprint: fingerprint,
      reason: `La pratica era salvata il ${previous.observedAt.slice(0, 10)} con gli stessi documenti ed e' tornata ${record.state}: e' un difetto del cancello che la blocca, non un problema della pratica.`,
    });
  }
  return regressions.sort((left, right) => left.customerKey.localeCompare(right.customerKey));
}
