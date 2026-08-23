export const APR_FUTURE_TEST_EXCLUSIONS_VERSION = "apr-future-test-exclusions-v4" as const;

export const APR_FUTURE_TEST_EXCLUSION_RULE_ID = "user-2026-08-18-future-test-exclusions" as const;

export interface AprFutureTestExclusion {
  customerKey: string;
  displayName: string;
  reason: string;
  authorizedAt: string;
}

export const APR_FUTURE_TEST_EXCLUSIONS: readonly AprFutureTestExclusion[] = Object.freeze([
  Object.freeze({
    customerKey: "beatrice-ciotta",
    displayName: "Beatrice Ciotta",
    reason: "Esclusione permanente gia attiva per tutte le coorti APR.",
    authorizedAt: "2026-08-15T00:00:00+02:00",
  }),
  Object.freeze({
    customerKey: "giovanni-dalle-donne",
    displayName: "Giovanni Dalle Donne",
    reason: "Pratica dichiarata non lavorabile dall'utente; escludere da tutti i test APR futuri.",
    authorizedAt: "2026-08-17T21:30:00+02:00",
  }),
  Object.freeze({
    customerKey: "vittorio-paolinelli",
    displayName: "Vittorio Paolinelli",
    reason: "Form cliente originario assente e pratica non automatizzabile nel modulo schermature corrente; escludere dai test APR futuri.",
    authorizedAt: "2026-08-18T01:30:00+02:00",
  }),
  Object.freeze({
    customerKey: "sara-lionti",
    displayName: "Sara Lionti",
    reason: "Pratica VEPA: esclusa dai test schermature fino all'attivazione del modulo prodotto dedicato.",
    authorizedAt: "2026-08-18T01:30:00+02:00",
  }),
  Object.freeze({
    customerKey: "nicoletta-garbarino",
    displayName: "Nicoletta Garbarino",
    reason: "Due fatture indicate nel CRM ma documenti originari non disponibili: mantenere Richiesto intervento operatore ed escludere dai test APR futuri.",
    authorizedAt: "2026-08-22T22:52:00+02:00",
  }),
]);

function normalizedCustomerKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function aprFutureTestExclusion(customerKey: string) {
  const normalized = normalizedCustomerKey(customerKey);
  return APR_FUTURE_TEST_EXCLUSIONS.find((entry) => entry.customerKey === normalized) ?? null;
}
