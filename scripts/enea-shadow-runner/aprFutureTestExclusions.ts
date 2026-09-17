export const APR_FUTURE_TEST_EXCLUSIONS_VERSION = "apr-future-test-exclusions-v9" as const;

export const APR_FUTURE_TEST_EXCLUSION_RULE_ID = "user-2026-08-18-future-test-exclusions" as const;
export const APR_IDEAL_SISTEM_MANUAL_EXCLUSION_RULE_ID = "user-2026-09-10-ideal-sistem-manual-exclusion-v1" as const;

export interface AprFutureTestExclusion {
  customerKey: string;
  displayName: string;
  reason: string;
  authorizedAt: string;
}

export interface AprAutomationExclusion {
  kind: "customer" | "supplier";
  ruleId: typeof APR_FUTURE_TEST_EXCLUSION_RULE_ID | typeof APR_IDEAL_SISTEM_MANUAL_EXCLUSION_RULE_ID;
  canonicalKey: string;
  displayName: string;
  reason: string;
  sourceField: string;
  sourceValue: string;
  denominatorDisposition: "excluded_upstream";
}

const APR_EXCLUDED_SUPPLIERS = Object.freeze([
  Object.freeze({
    canonicalKey: "erre-emme-rm-legno",
    ruleId: APR_FUTURE_TEST_EXCLUSION_RULE_ID,
    displayName: "Erre Emme / RM Legno",
    aliases: ["erre emme", "erremme", "rm legno"],
    reason: "Fornitore escluso dall'elaborazione automatica per decisione permanente dell'utente.",
  }),
  Object.freeze({
    canonicalKey: "vans",
    ruleId: APR_FUTURE_TEST_EXCLUSION_RULE_ID,
    displayName: "Vans",
    aliases: ["vans", "vans tappezzeria"],
    reason: "Fornitore escluso dall'elaborazione automatica per decisione permanente dell'utente.",
  }),
  Object.freeze({
    canonicalKey: "linea-sole-potito",
    ruleId: APR_FUTURE_TEST_EXCLUSION_RULE_ID,
    displayName: "Linea Sole Potito",
    aliases: ["linea sole potito"],
    reason: "Fornitore con modulo cartaceo e fatture scansionate destinato alla lavorazione manuale per decisione permanente dell'utente.",
  }),
  Object.freeze({
    canonicalKey: "ideal-sistem",
    ruleId: APR_IDEAL_SISTEM_MANUAL_EXCLUSION_RULE_ID,
    displayName: "Ideal Sistem",
    aliases: ["ideal sistem"],
    reason: "Fornitore con allegati cartacei al posto del form digitale destinato alla lavorazione manuale per decisione permanente dell'utente.",
  }),
]);

export const APR_FUTURE_TEST_EXCLUSIONS: readonly AprFutureTestExclusion[] = Object.freeze([
  Object.freeze({
    customerKey: "beatrice-ciotta",
    displayName: "Beatrice Ciotta",
    reason: "Esclusione permanente gia attiva per tutte le coorti APR.",
    authorizedAt: "2026-08-15T00:00:00+02:00",
  }),
  Object.freeze({
    customerKey: "samuele-beretta",
    displayName: "Samuele Beretta / Overthemol",
    reason: "Pratica interna Overthemol esclusa permanentemente dall'automazione APR.",
    authorizedAt: "2026-09-02T00:00:00+02:00",
  }),
  Object.freeze({
    customerKey: "prova-rivenditore-1-30-04",
    displayName: "PROVA RIVENDITORE 1 30/04",
    reason: "Pratica interna confermata dall'utente ed esclusa permanentemente dall'automazione APR.",
    authorizedAt: "2026-09-03T23:00:00+02:00",
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
  Object.freeze({
    customerKey: "smaj-hhhhh",
    displayName: "Smaj Hhhhh",
    reason: "Dossier CRM interamente fittizio confermato dall'utente: CF non valido (\"BBNNNNNNN\"), indirizzo e comune segnaposto (\"Nn\", \"Nnn\", \"Bbbbbbnbn\"), data di nascita futura e rivenditore \"prova samu\"; escludere permanentemente dall'automazione APR come le altre pratiche interne.",
    authorizedAt: "2026-09-07T00:00:00+02:00",
  }),
]);

function normalizedCustomerKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function aprFutureTestExclusion(customerKey: string) {
  const normalized = normalizedCustomerKey(customerKey);
  return APR_FUTURE_TEST_EXCLUSIONS.find((entry) => entry.customerKey === normalized) ?? null;
}

function normalizedPartyName(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
    : "";
}

/**
 * Fail-closed admission rule used both while sampling and after the exact CRM
 * dossier has been acquired.  Supplier aliases are matched as complete word
 * sequences, never as arbitrary substrings (for example "Vans" does not
 * match "Evans").
 */
export function aprAutomationExclusion(input: {
  customerKey?: unknown;
  displayName?: unknown;
  fornitore?: unknown;
  ragioneSociale?: unknown;
  companies?: unknown;
}) : AprAutomationExclusion | null {
  const customerKey = normalizedCustomerKey(typeof input.customerKey === "string" ? input.customerKey : String(input.displayName ?? ""));
  const customer = aprFutureTestExclusion(customerKey);
  if (customer) return {
    kind: "customer", ruleId: APR_FUTURE_TEST_EXCLUSION_RULE_ID, canonicalKey: customer.customerKey, displayName: customer.displayName,
    reason: customer.reason, sourceField: "customerKey", sourceValue: customerKey, denominatorDisposition: "excluded_upstream",
  };
  const company = input.companies && typeof input.companies === "object" && !Array.isArray(input.companies)
    ? (input.companies as { ragione_sociale?: unknown }).ragione_sociale
    : null;
  const sources = [
    { field: "row.fornitore", value: input.fornitore },
    { field: "row.companies.ragione_sociale", value: input.ragioneSociale ?? company },
  ];
  for (const source of sources) {
    const normalized = normalizedPartyName(source.value);
    if (!normalized) continue;
    for (const supplier of APR_EXCLUDED_SUPPLIERS) {
      const alias = supplier.aliases.find((candidate) => normalized === candidate || normalized.startsWith(`${candidate} `) || normalized.endsWith(` ${candidate}`));
      if (alias) return {
        kind: "supplier", ruleId: supplier.ruleId, canonicalKey: supplier.canonicalKey, displayName: supplier.displayName,
        reason: supplier.reason, sourceField: source.field, sourceValue: String(source.value), denominatorDisposition: "excluded_upstream",
      };
    }
  }
  return null;
}
