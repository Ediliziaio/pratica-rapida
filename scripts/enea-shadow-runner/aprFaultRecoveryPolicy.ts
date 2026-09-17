export const APR_FAULT_RECOVERY_POLICY_VERSION = "apr-fault-recovery-policy-v1" as const;

/**
 * Un guasto di APR non e' un verdetto sulla pratica.
 *
 * Nel lotto r121, 9 pratiche su 23 ferme si sono fermate perche' si e' rotta
 * la nostra macchina, non i documenti del cliente: lease del browser scaduta
 * durante la compilazione, esito del salvataggio non dimostrabile, CRM in
 * timeout prima di leggere il fascicolo, payload incompleto per una mappatura
 * mancante. Erano pratiche pronte, e sono finite nel conteggio come fallimenti
 * senza che nessuno le rimettesse in coda.
 *
 * Qui si decide, per ogni guasto, se la pratica va rilavorata e quando. La
 * decisione e' limitata e persistita: un guasto che si ripete oltre il tetto
 * di tentativi smette di essere un incidente e diventa un difetto da chiudere
 * nel codice, cosi' che nessun ciclo possa girare all'infinito nascondendo un
 * problema strutturale.
 */
export type AprFaultRecoveryAction =
  | "rilavora_subito"
  | "rilavora_a_fine_lotto"
  | "difetto_da_chiudere";

/**
 * Le classi derivano dai guasti realmente osservati, non da un elenco
 * immaginato. Ogni classe dice quando ritentare e perche'.
 */
export type AprFaultClass =
  | "sessione_browser_persa"
  | "esito_non_dimostrabile"
  | "servizio_esterno_non_disponibile"
  | "mai_eseguita"
  | "difetto_di_codice"
  | "motivo_non_registrato";

interface FaultRule {
  pattern: RegExp;
  faultClass: AprFaultClass;
  /** Quante volte ha senso ritentare lo stesso guasto sulla stessa pratica. */
  maxAttempts: number;
  action: Exclude<AprFaultRecoveryAction, "difetto_da_chiudere">;
  reason: string;
}

/**
 * Ordine significativo: la prima regola che riconosce il testo vince. Le
 * classi piu' specifiche stanno prima di quelle generiche.
 */
const FAULT_RULES: readonly FaultRule[] = [
  {
    pattern: /lease|sessione del browser|browser_lease|fenced/i,
    faultClass: "sessione_browser_persa",
    maxAttempts: 2,
    action: "rilavora_subito",
    reason: "La pratica era pronta e la sessione e' caduta durante la compilazione: si riprende subito, la sessione nuova e' gia' disponibile.",
  },
  {
    pattern: /controllo del browser|apr_cdp_/i,
    faultClass: "sessione_browser_persa",
    maxAttempts: 2,
    action: "rilavora_subito",
    reason: "Errore tecnico del pilotaggio del browser su una pratica pronta: si riprende subito con una connessione nuova.",
  },
  {
    pattern: /non dimostrabile|non e' riuscito a dimostrare|esito incerto|riverificata/i,
    faultClass: "esito_non_dimostrabile",
    maxAttempts: 1,
    action: "rilavora_a_fine_lotto",
    reason: "La bozza potrebbe essere gia' stata salvata: si riverifica a fine lotto per non crearne una seconda.",
  },
  {
    pattern: /timeout|504|gateway|acquisizione|non e' stato acquisito/i,
    faultClass: "servizio_esterno_non_disponibile",
    maxAttempts: 3,
    action: "rilavora_a_fine_lotto",
    reason: "Il servizio esterno non ha risposto: si riprova a fine lotto, quando il carico e' diverso.",
  },
  {
    pattern: /in coda|queued|senza eseguirla/i,
    faultClass: "mai_eseguita",
    maxAttempts: 2,
    action: "rilavora_subito",
    reason: "La pratica era pronta e non e' mai stata eseguita: va semplicemente eseguita.",
  },
];

const CODE_DEFECT: readonly { pattern: RegExp; faultClass: AprFaultClass; reason: string }[] = [
  {
    pattern: /mappatura|payload|non sa formulare/i,
    faultClass: "difetto_di_codice",
    reason: "Rilavorare non cambia l'esito: manca del codice. Va chiuso il difetto prima di riprovare.",
  },
  {
    pattern: /senza registrare alcun motivo/i,
    faultClass: "motivo_non_registrato",
    reason: "La pratica si e' fermata senza scrivere perche': finche' il motivo non viene registrato, un nuovo tentativo non insegna niente.",
  },
];

export interface AprFaultRecoveryInput {
  customerKey: string;
  /** Testo del guasto prodotto dalla disposizione della pratica ferma. */
  faultText: string;
  /** Tentativi gia' spesi su questa pratica per questo stesso guasto. */
  previousAttempts: number;
}

export interface AprFaultRecoveryDecision {
  customerKey: string;
  faultClass: AprFaultClass;
  action: AprFaultRecoveryAction;
  attemptsSpent: number;
  maxAttempts: number;
  reason: string;
}

export function decideAprFaultRecovery(input: AprFaultRecoveryInput): AprFaultRecoveryDecision {
  const attemptsSpent = Math.max(0, Math.trunc(input.previousAttempts));

  const defect = CODE_DEFECT.find((rule) => rule.pattern.test(input.faultText));
  if (defect) {
    return {
      customerKey: input.customerKey, faultClass: defect.faultClass, action: "difetto_da_chiudere",
      attemptsSpent, maxAttempts: 0, reason: defect.reason,
    };
  }

  const rule = FAULT_RULES.find((candidate) => candidate.pattern.test(input.faultText));
  if (!rule) {
    return {
      customerKey: input.customerKey, faultClass: "difetto_di_codice", action: "difetto_da_chiudere",
      attemptsSpent, maxAttempts: 0,
      reason: "Guasto non riconosciuto: non sappiamo se rilavorare abbia senso, quindi va guardato invece che ripetuto.",
    };
  }

  if (attemptsSpent >= rule.maxAttempts) {
    return {
      customerKey: input.customerKey, faultClass: rule.faultClass, action: "difetto_da_chiudere",
      attemptsSpent, maxAttempts: rule.maxAttempts,
      reason: `Lo stesso guasto si e' ripetuto ${attemptsSpent} volte sul tetto di ${rule.maxAttempts}: non e' piu' un incidente, e' un difetto da chiudere.`,
    };
  }

  return {
    customerKey: input.customerKey, faultClass: rule.faultClass, action: rule.action,
    attemptsSpent, maxAttempts: rule.maxAttempts, reason: rule.reason,
  };
}

export interface AprFaultRecoveryPlan {
  version: typeof APR_FAULT_RECOVERY_POLICY_VERSION;
  guasti: number;
  rilavoraSubito: readonly string[];
  rilavoraAFineLotto: readonly string[];
  difettiDaChiudere: readonly string[];
  decisioni: readonly AprFaultRecoveryDecision[];
}

export function planAprFaultRecovery(inputs: readonly AprFaultRecoveryInput[]): AprFaultRecoveryPlan {
  const decisioni = inputs.map(decideAprFaultRecovery)
    .sort((left, right) => left.customerKey.localeCompare(right.customerKey));
  const keysFor = (action: AprFaultRecoveryAction) =>
    decisioni.filter((item) => item.action === action).map((item) => item.customerKey);
  return {
    version: APR_FAULT_RECOVERY_POLICY_VERSION,
    guasti: decisioni.length,
    rilavoraSubito: keysFor("rilavora_subito"),
    rilavoraAFineLotto: keysFor("rilavora_a_fine_lotto"),
    difettiDaChiudere: keysFor("difetto_da_chiudere"),
    decisioni,
  };
}
