import type { CommercialHealthStatus } from "./healthPolicy";

export type CommercialSuggestedChannel = "none" | "whatsapp" | "call";
export type CommercialSuggestedAction =
  | "review_data"
  | "monitor"
  | "welcome_followup"
  | "activate_first_practice"
  | "check_decline"
  | "recover_customer"
  | "growth_opportunity";

export interface CommercialActionInput {
  healthStatus: CommercialHealthStatus;
  practicesLast30d: number;
  practicesPrev30d: number;
  lastPracticeDaysAgo: number | null;
  hasOpenConversation?: boolean;
}

export interface CommercialActionDecision {
  action: CommercialSuggestedAction;
  channel: CommercialSuggestedChannel;
  priority: "low" | "medium" | "high" | "critical";
  requiresHumanApproval: boolean;
  reason: string;
}

/**
 * Il Supervisor propone, non contatta mai il cliente da solo.
 * La policy serve a rendere trasparente il motivo del suggerimento e a evitare
 * follow-up aggressivi o inutili quando il cliente è stabile.
 */
export function suggestCommercialAction(input: CommercialActionInput): CommercialActionDecision {
  switch (input.healthStatus) {
    case "needs_data_review":
      return {
        action: "review_data",
        channel: "none",
        priority: "high",
        requiresHumanApproval: true,
        reason: "Cronologia pratiche incoerente o futura: verificare i dati prima di qualsiasi azione commerciale.",
      };
    case "a_rischio":
      return {
        action: "check_decline",
        channel: input.hasOpenConversation ? "whatsapp" : "call",
        priority: "critical",
        requiresHumanApproval: true,
        reason: `Volume passato da ${input.practicesPrev30d} a ${input.practicesLast30d} pratiche negli ultimi due periodi: verificare il motivo del calo senza assumere che il cliente sia perso.`,
      };
    case "inattivo":
      return {
        action: "recover_customer",
        channel: "whatsapp",
        priority: "high",
        requiresHumanApproval: true,
        reason: `Nessuna pratica recente${input.lastPracticeDaysAgo === null ? "" : ` da ${input.lastPracticeDaysAgo} giorni`}: proporre un contatto leggero di riattivazione.`,
      };
    case "in_calo":
      return {
        action: "check_decline",
        channel: "whatsapp",
        priority: "high",
        requiresHumanApproval: true,
        reason: `Il volume è sceso da ${input.practicesPrev30d} a ${input.practicesLast30d}: suggerire un controllo non invasivo prima che il calo diventi strutturale.`,
      };
    case "mai_attivato":
      return {
        action: "activate_first_practice",
        channel: "whatsapp",
        priority: "medium",
        requiresHumanApproval: true,
        reason: "Azienda registrata ma senza pratiche: verificare se l'onboarding è stato completato e facilitare la prima pratica.",
      };
    case "nuovo_attivo":
      return {
        action: "welcome_followup",
        channel: "whatsapp",
        priority: "medium",
        requiresHumanApproval: true,
        reason: "Prima attivazione recente: follow-up breve per verificare che il processo sia chiaro e favorire la seconda pratica.",
      };
    case "in_crescita":
      return {
        action: "growth_opportunity",
        channel: "none",
        priority: "low",
        requiresHumanApproval: true,
        reason: "Cliente in crescita: nessun sollecito; segnalare soltanto eventuali opportunità di servizio quando pertinenti.",
      };
    case "stabile":
    default:
      return {
        action: "monitor",
        channel: "none",
        priority: "low",
        requiresHumanApproval: true,
        reason: "Andamento stabile: nessun contatto commerciale suggerito.",
      };
  }
}