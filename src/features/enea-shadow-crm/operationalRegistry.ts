import { OPERATIONAL_RULES } from "./operationalRules";

export const ENEA_OPERATIONAL_REGISTRY_VERSION = "enea-operational-registry-v1" as const;
export const ENEA_GLOBAL_PREREQUISITE = Object.freeze({
  id: "browser-session-contract-v1",
  scope: "global_not_practice",
  failure: "session_not_ready",
  rule: "Una sola istanza/profilo persistente e una sola scheda autenticata CRM+ENEA registrate e riusate; nessun fallback o sostituzione.",
});
export const ENEA_OPERATIONAL_PROTOCOL = Object.freeze([
  "customer_form", "identity_property", "dates", "economic_sources", "gross_reconciliation",
  "screenings", "plant", "enea_mapping", "preview", "submit_cpid",
] as const);
export type OperationalProtocolStep = typeof ENEA_OPERATIONAL_PROTOCOL[number];

export interface OperationalRegistryRule {
  id: string;
  step: OperationalProtocolStep;
  condition: string;
  sourcePrecedence: readonly string[];
  deterministicAction: string;
  audit: string;
  outcome: "continue" | "requested_operator";
}

const migratedRules = Object.entries(OPERATIONAL_RULES).map(([field, action], index): OperationalRegistryRule => ({
  id: `authorized-${String(index + 1).padStart(2, "0")}-${field.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
  step: field.startsWith("beneficiario") || field.startsWith("immobile") ? "identity_property"
    : field.startsWith("intervento") || field === "ricevuta_at" ? "dates"
    : field.startsWith("schermature") ? "screenings" : "plant",
  condition: `Campo ${field}: applicare quando la fonte specifica è assente o la regola ne definisce la gestione.`,
  sourcePrecedence: ["form cliente", "documento originario verificato", "policy operativa autorizzata"],
  deterministicAction: action,
  audit: `Registrare campo, fonte effettiva e ${ENEA_OPERATIONAL_REGISTRY_VERSION}.`,
  outcome: action.toLowerCase().includes("intervento operatore") || action.toLowerCase().includes("richiedono operatore") ? "requested_operator" : "continue",
}));

const contractRules: OperationalRegistryRule[] = [
  { id:"core-form-first", step:"customer_form", condition:"Ogni lavorazione", sourcePrecedence:["form cliente originario"], deterministicAction:"Acquisire il form per primo; distinguere fonte non acquisibile da dato assente.", audit:"sourceId, fingerprint, acquisizione", outcome:"continue" },
  { id:"core-economic-classification", step:"economic_sources", condition:"Sono presenti allegati", sourcePrecedence:["fatture originarie", "bonifici", "non economici"], deterministicAction:"Classificare prima del calcolo; fattura valida solo con numero, data e totale lordo IVA incluso.", audit:"terna, ruolo, deduplica", outcome:"continue" },
  { id:"core-gross-triple-reconciliation", step:"gross_reconciliation", condition:"Calcolo spesa ENEA", sourcePrecedence:["fatture uniche deduplicate"], deterministicAction:"Somma lordi IVA inclusa; tre verifiche concordi entro €0,01; bonifici non si sommano; storni interni solo audit.", audit:"tre esiti, fonti, tolleranza", outcome:"requested_operator" },
  { id:"core-mapping-complete", step:"enea_mapping", condition:"Prima della preview", sourcePrecedence:["fonti originarie", "policy autorizzate"], deterministicAction:"Produrre matrice completa valore/fonte/regola/stato; nessun campo coperto da policy genera ticket.", audit:"matrice completa", outcome:"continue" },
  { id:"core-preview-required", step:"preview", condition:"Preflight dati verde", sourcePrecedence:["portale ENEA"], deterministicAction:"Aprire e verificare anteprima prima del submit.", audit:"evento anteprima", outcome:"continue" },
  { id:"core-single-submit-cpid", step:"submit_cpid", condition:"Anteprima verificata", sourcePrecedence:["stato server ENEA"], deterministicAction:"Un solo submit; successo solo Inviata con CPID; nessun retry su esito incerto.", audit:"tentativo, stato server, CPID", outcome:"continue" },
];

export const ENEA_OPERATIONAL_REGISTRY: readonly OperationalRegistryRule[] = Object.freeze([...contractRules, ...migratedRules]);

export function rulesForStep(step: OperationalProtocolStep) { return ENEA_OPERATIONAL_REGISTRY.filter(rule=>rule.step===step); }
export function registryRule(id: string) { return ENEA_OPERATIONAL_REGISTRY.find(rule=>rule.id===id) ?? null; }
