export const APR_STOP_DISPOSITION_VERSION = "apr-stop-disposition-v1" as const;

/**
 * Nessuna pratica si ferma in silenzio.
 *
 * Nel lotto r121 del 13/09/2026, 26 pratiche ferme su 28 non hanno prodotto
 * alcuna domanda: il registro `operator-questions` di ciascuna esisteva,
 * inizializzato, con la lista vuota. Il generatore di domande copriva un solo
 * blocco (`screenings_missing`) e solo per le schermature; tutto il resto
 * moriva senza dire niente.
 *
 * Qui una pratica ferma puo' avere due soli esiti, mai il silenzio:
 *
 *  - `domanda_operatore`: manca un dato che solo l'operatore o il cliente
 *    possono fornire. Si scrive la domanda, in italiano, che dice cosa serve.
 *  - `guasto_apr`: si e' rotto APR, non la pratica. Sessione scaduta, timeout
 *    del CRM, esito non dimostrabile, mappatura incompleta. Non si disturba
 *    l'operatore: la pratica va rilavorata e il guasto va chiuso.
 *
 * Un blocco che non sappiamo tradurre in domanda e' anch'esso un guasto di
 * APR — non sapere cosa chiedere e' un difetto nostro, non un dato mancante
 * del cliente — e viene dichiarato come tale invece di essere mascherato da
 * domanda generica.
 */
export type AprStopKind = "domanda_operatore" | "guasto_apr";

export interface AprStopDispositionEntry {
  kind: AprStopKind;
  /** Testo rivolto all'operatore, oppure descrizione del guasto. */
  text: string;
  /** Campo da compilare, quando la domanda ne indica uno. */
  field?: string;
}

/**
 * Le domande sono scritte a partire dai blocchi realmente persistiti nel lotto
 * r121, non da un elenco immaginato. Ogni testo dice cosa manca e cosa fare.
 */
const BLOCKER_DISPOSITIONS: Readonly<Record<string, AprStopDispositionEntry>> = {
  infissi_dimensions_and_cardinality_missing: {
    kind: "domanda_operatore",
    field: "infissi.dimensioni_e_numero",
    text: "Mancano le misure e il numero dei serramenti. Nei documenti allegati (certificati, ordini, schede tecniche) le misure di solito ci sono: indica quanti serramenti sono stati installati e la misura di ciascuno.",
  },
  screenings_missing: {
    kind: "domanda_operatore",
    field: "screenings",
    text: "Dalle fatture non risulta riconciliato nessun prodotto di schermatura. Indica quale prodotto e' stato installato e in quale documento e' descritto.",
  },
  screening_primary_measurements_missing: {
    kind: "domanda_operatore",
    field: "screenings.dimensions",
    text: "La fattura descrive la schermatura ma nessun documento riporta le misure del prodotto. Indica larghezza e altezza del prodotto installato (non della finestra protetta).",
  },
  infissi_shading_closures_form_answer_missing_or_ambiguous: {
    kind: "domanda_operatore",
    field: "infissi.chiusure_oscuranti",
    text: "Non e' chiaro se l'intervento comprenda chiusure oscuranti (persiane, tapparelle, zanzariere). Conferma se sono state installate e su quali serramenti.",
  },
  invoice_final_printed_total_not_verified: {
    kind: "domanda_operatore",
    field: "economic.invoiceTotal",
    text: "Il totale finale stampato sulla fattura non e' stato letto. Indica il totale come stampato sul documento, senza ricalcolarlo.",
  },
  completion_date_missing: {
    kind: "domanda_operatore",
    field: "completionDate",
    text: "Manca la data di fine lavori e non e' ricavabile dalla fattura. Indica la data di fine lavori.",
  },
  completion_date_portal_year_mismatch: {
    kind: "domanda_operatore",
    field: "completionDate.portalYear",
    text: "La data di fine lavori appartiene a un anno diverso da quello del portale aperto. Conferma su quale portale annuale va inserita la pratica.",
  },
  completion_over_90_days_operator_required: {
    kind: "domanda_operatore",
    field: "completionDate.procedibilita",
    text: "La fine lavori supera il termine di 90 giorni. Conferma se la pratica e' ancora procedibile o va ritirata.",
  },
  co_beneficiary_invoice_identity_unresolved: {
    kind: "domanda_operatore",
    field: "beneficiary.identity",
    text: "Le fatture non permettono di identificare con certezza un solo intestatario persona fisica. Indica nome, cognome e codice fiscale del beneficiario da inserire.",
  },
  customer_form_missing: {
    kind: "domanda_operatore",
    field: "customerForm",
    text: "Il fascicolo CRM non contiene un form cliente utilizzabile. Allega il form compilato del cliente.",
  },
  customer_form_required_sections_missing: {
    kind: "domanda_operatore",
    field: "customerForm.requiredSections",
    text: "Il form del cliente non e completo: mancano i dati dell'edificio e dell'impianto. Completa entrambe le sezioni.",
  },
  tax_code_missing_or_invalid: {
    kind: "domanda_operatore",
    field: "beneficiary.taxCode",
    text: "Il codice fiscale del beneficiario non e' presente o non e' valido nei documenti. Indica il codice fiscale corretto.",
  },
  operator_response_pending_external_data: {
    kind: "domanda_operatore",
    field: "operator.pendingData",
    text: "La pratica attende un dato che era stato richiesto e non e' ancora arrivato. Fornisci il dato mancante indicato nella richiesta.",
  },
  infissi_authoritative_economic_decision_required: {
    kind: "domanda_operatore",
    field: "economic.eligibleExpense",
    text: "Non e' stato possibile stabilire la spesa ammissibile dai documenti economici. Indica l'importo da portare in detrazione e il documento da cui va letto.",
  },
  crm_readonly_acquisition_invalid_response: {
    kind: "guasto_apr",
    text: "Il CRM ha risposto con un errore durante l'acquisizione dei documenti: la pratica non e' mai stata letta. Va rilavorata, non c'e' niente da chiedere al cliente.",
  },
  draft_payload_mapping_incomplete: {
    kind: "guasto_apr",
    text: "I documenti non presentano conflitti ma APR non riesce a completare il payload della bozza: manca una mappatura nel modulo. E' un difetto da chiudere nel codice.",
  },
};

/**
 * Un blocco riconosciuto dall'elenco vince sempre su un guasto generico: se la
 * pratica ha davvero un dato mancante, all'operatore serve la domanda, non la
 * notizia che la sessione era scaduta.
 */
const EXECUTION_FAULT_PATTERNS: readonly { pattern: RegExp; text: string }[] = [
  { pattern: /lease_expired|browser_lease/i, text: "La sessione del browser e' scaduta durante la lavorazione: la pratica era pronta e non e' stata portata a termine. Va rilavorata." },
  { pattern: /esito non dimostrabile|non dimostrabile/i, text: "APR non e' riuscito a dimostrare l'esito del salvataggio dopo l'unico tentativo di recupero autorizzato. La bozza puo' esistere o no: va riverificata." },
  { pattern: /apr_cdp_/i, text: "Errore tecnico del controllo del browser durante la compilazione sul portale. La pratica era pronta: va rilavorata." },
  { pattern: /timeout|504/i, text: "Timeout durante la lavorazione: la pratica non e' arrivata in fondo per un guasto di rete o del servizio, non per i suoi documenti." },
];

/**
 * Alcuni blocchi economici hanno un codice calcolato a runtime
 * (`invoice_<hash del messaggio>`), quindi non possono stare in un elenco
 * fisso. Il motivo persistito, pero', e' gia' scritto in italiano: si usa
 * quello, senza inventare nulla.
 */
const DYNAMIC_BLOCKER_PREFIXES: readonly { prefix: string; kind: AprStopKind; field: string; lead: string }[] = [
  { prefix: "invoice_", kind: "domanda_operatore", field: "economic.invoiceTotal", lead: "Problema sui documenti fiscali" },
];

export interface AprStopCaseInput {
  customerKey: string;
  /** Nome leggibile usato nei report; la classificazione non dipende dal nome. */
  displayName?: string;
  state: string;
  /** Codici di blocco persistiti, in qualunque ordine. */
  blockerCodes: readonly string[];
  /** Motivo persistito per ciascun codice, quando disponibile. */
  blockerReasons?: Readonly<Record<string, string>>;
  /** Stato dello stadio di esecuzione, quando la pratica ci e' arrivata. */
  executionState?: string | null;
  /** Motivo persistito dallo stadio di esecuzione. */
  executionReason?: string | null;
  /** Quante domande risultano gia' persistite per questa pratica. */
  persistedQuestionCount: number;
  /** Vero se nessun documento originario e' stato acquisito. */
  documentsAcquired: boolean;
}

export interface AprStopDisposition {
  customerKey: string;
  displayName?: string;
  kind: AprStopKind;
  /** Blocco da cui deriva l'esito, quando ce n'e' uno. */
  blockerCode: string | null;
  text: string;
  field: string | null;
  /** Vero se la domanda era gia' stata scritta e non serve riscriverla. */
  alreadyAsked: boolean;
}

/** Ordine stabile: il blocco piu' specifico prima di quelli generici. */
const GENERIC_LAST = ["infissi_authoritative_economic_decision_required", "screenings_missing"];

function pickBlocker(blockerCodes: readonly string[]): string | null {
  const known = [...new Set(blockerCodes)].filter((code) => code in BLOCKER_DISPOSITIONS);
  if (known.length === 0) return null;
  const specific = known.filter((code) => !GENERIC_LAST.includes(code)).sort();
  return specific[0] ?? known.sort()[0];
}

export function disposeAprStoppedCase(input: AprStopCaseInput): AprStopDisposition {
  const base = { customerKey: input.customerKey, displayName: input.displayName, alreadyAsked: input.persistedQuestionCount > 0 };

  if (!input.documentsAcquired) {
    return {
      ...base, kind: "guasto_apr", blockerCode: null, field: null,
      text: "Nessun documento originario e' stato acquisito: il verdetto non riguarda la pratica ma l'acquisizione. Va rilavorata.",
    };
  }

  const blockerCode = pickBlocker(input.blockerCodes);
  if (blockerCode) {
    const entry = BLOCKER_DISPOSITIONS[blockerCode];
    // Un blocco che aspetta un dato gia' richiesto porta con se' la richiesta
    // originale, che nomina il dato ("le misure della bioclimatica riportate
    // nel foglio manoscritto"). Riproporla parola per parola vale piu' di un
    // testo generico: su Munafo (r123) la domanda "fornisci il dato mancante
    // indicato nella richiesta" non diceva quale, e non era rispondibile.
    const persistedReason = input.blockerReasons?.[blockerCode]?.trim();
    const text = blockerCode === "operator_response_pending_external_data" && persistedReason
      ? persistedReason
      : entry.text;
    return { ...base, kind: entry.kind, blockerCode, text, field: entry.field ?? null };
  }

  const dynamic = [...new Set(input.blockerCodes)].sort()
    .flatMap((code) => DYNAMIC_BLOCKER_PREFIXES.filter((rule) => code.startsWith(rule.prefix)).map((rule) => ({ code, rule })));
  if (dynamic.length > 0) {
    const { code, rule } = dynamic[0];
    const reason = input.blockerReasons?.[code]?.trim();
    return {
      ...base, kind: rule.kind, blockerCode: code, field: rule.field,
      text: reason
        ? `${reason} Indica il dato corretto leggendolo dal documento, senza ricalcolarlo.`
        : `${rule.lead} non risolvibile automaticamente: indica il dato corretto leggendolo dal documento.`,
    };
  }

  // Il portale ha rifiutato una pagina nominando il campo. Se il campo e' un
  // dato del cliente (telefono, email, indirizzo, CAP, date) la risposta e'
  // dell'operatore: il valore nel form non e' accettabile. Se e' un campo
  // che compila APR (gtot, gradi giorno, superfici, calcoli) e' una
  // mappatura nostra lasciata vuota o sbagliata: guasto da chiudere.
  const rejected = (input.executionReason ?? "").match(/Il portale ENEA rifiuta la pagina (.+?): campo ([^ .(]+(?:, [^ .(]+)*)(?: \(([^)]*)\))?/);
  if (rejected) {
    const controls = rejected[2].split(",").map((id) => id.trim()).filter(Boolean);
    const messages = rejected[3]?.trim() ? ` Il portale dice: ${rejected[3].trim()}.` : "";
    const customerDataControls = controls.filter((id) => /telefono|email|indirizzo|civico|cap\b|data_|comune|nome|cognome|codice_fiscale/i.test(id));
    if (customerDataControls.length === controls.length) {
      return {
        ...base, kind: "domanda_operatore", blockerCode: `apr_enea_portal_field_rejected:${controls.join(",")}`, field: `portal.${controls[0]}`,
        text: `Il portale ENEA non accetta il valore di ${controls.map((id) => id.replace(/^id-/, "")).join(", ")} sulla pagina ${rejected[1]}.${messages} Indica il valore corretto (e correggilo nel form del cliente).`,
      };
    }
    return {
      ...base, kind: "guasto_apr", blockerCode: `apr_enea_portal_field_rejected:${controls.join(",")}`, field: null,
      text: `APR ha lasciato vuoto o non valido il campo ${controls.map((id) => id.replace(/^id-/, "")).join(", ")} sulla pagina ${rejected[1]} e il portale ha rifiutato il salvataggio.${messages} E' una mappatura nostra da chiudere nel codice, non un dato da chiedere.`,
    };
  }

  const executionText = `${input.executionState ?? ""} ${input.executionReason ?? ""}`;
  const fault = EXECUTION_FAULT_PATTERNS.find((candidate) => candidate.pattern.test(executionText));
  if (fault) {
    return { ...base, kind: "guasto_apr", blockerCode: null, field: null, text: fault.text };
  }

  if (input.executionState === "queued") {
    return {
      ...base, kind: "guasto_apr", blockerCode: null, field: null,
      text: "La pratica era pronta e in coda per il portale, ma il lotto si e' chiuso senza eseguirla. Va rilavorata.",
    };
  }

  const unknown = [...new Set(input.blockerCodes)].sort();
  return {
    ...base, kind: "guasto_apr", blockerCode: unknown[0] ?? null, field: null,
    text: unknown.length > 0
      ? `APR si e' fermato su ${unknown.join(", ")} e non sa formulare la domanda corrispondente: e' un difetto da chiudere, non un dato mancante del cliente.`
      : "APR si e' fermato senza registrare alcun motivo: non c'e' niente da chiedere all'operatore finche' il motivo non viene scritto.",
  };
}

export interface AprStopDispositionReport {
  version: typeof APR_STOP_DISPOSITION_VERSION;
  ferme: number;
  domandeOperatore: number;
  guastiApr: number;
  /** Domande che andavano scritte e non risultavano ancora persistite. */
  domandeMancanti: number;
  disposizioni: readonly AprStopDisposition[];
}

export function disposeAprStoppedCases(cases: readonly AprStopCaseInput[]): AprStopDispositionReport {
  const disposizioni = cases.map(disposeAprStoppedCase)
    .sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const domande = disposizioni.filter((item) => item.kind === "domanda_operatore");
  return {
    version: APR_STOP_DISPOSITION_VERSION,
    ferme: disposizioni.length,
    domandeOperatore: domande.length,
    guastiApr: disposizioni.filter((item) => item.kind === "guasto_apr").length,
    domandeMancanti: domande.filter((item) => !item.alreadyAsked).length,
    disposizioni,
  };
}
