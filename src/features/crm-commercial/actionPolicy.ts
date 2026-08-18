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

function hasContradictoryVolumeSnapshot(input: CommercialActionInput): boolean {
  const { practicesLast30d: recent, practicesPrev30d: previous } = input;
  if (!Number.isInteger(recent) || recent < 0 || !Number.isInteger(previous) || previous < 0) {
    return true;
  }

  const strongRisk = (recent === 0 && previous >= 2)
    || (previous >= 4 && recent <= Math.floor(previous * 0.5));

  switch (input.healthStatus) {
    case "a_rischio":
      return !strongRisk;
    case "in_calo":
      return strongRisk || recent >= previous;
    case "in_crescita":
      return recent <= previous;
    case "stabile":
      return recent !== previous;
    default:
      return false;
  }
}

function hasContradictoryRecencySnapshot(input: CommercialActionInput): boolean {
  const last = input.lastPracticeDaysAgo;
  if (last !== null && (!Number.isFinite(last) || last < 0)) return true;

  // Se l'ultima pratica e' chiaramente negli ultimi 30 giorni, quella stessa
  // pratica deve comparire nel bucket recente. Tolleriamo il confine esatto a
  // 30 giorni perché daysAgo puo' essere un intero derivato da un timestamp.
  if (last !== null && last < 30 && input.practicesLast30d === 0) {
    return true;
  }

  // Se l'ultima pratica cade nella finestra 30-60 giorni, quella stessa pratica
  // deve comparire nel conteggio del periodo precedente. Uno zero in quel bucket
  // indica uno snapshot stale/incoerente e non deve diventare un'azione commerciale.
  if (last !== null && last > 30 && last <= 60 && input.practicesPrev30d === 0) {
    return true;
  }

  switch (input.healthStatus) {
    case "needs_data_review":
      return false;
    case "mai_attivato":
      return last !== null || input.practicesLast30d !== 0 || input.practicesPrev30d !== 0;
    case "inattivo":
      // La vista assegna inattivo soltanto oltre 60 giorni. Tolleriamo il
      // confine esatto perché un eventuale daysAgo intero può derivare da un
      // timestamp appena oltre soglia, ma una pratica recente è incompatibile.
      return last === null || last < 60 || input.practicesLast30d > 0;
    case "nuovo_attivo":
      return last === null || last > 30 || input.practicesLast30d === 0;
    default:
      // a_rischio / in_calo / in_crescita / stabile vengono assegnati dalla
      // health policy soltanto dopo aver escluso l'inattività (>60 giorni).
      // Se la recenza supera quella soglia, lo stato trasportato è stale e non
      // deve produrre un'azione commerciale.
      return last === null || last > 60;
  }
}

/**
 * Il Supervisor propone, non contatta mai il cliente da solo.
 * La policy serve a rendere trasparente il motivo del suggerimento e a evitare
 * follow-up aggressivi o inutili quando il cliente è stabile.
 */
export function suggestCommercialAction(input: CommercialActionInput): CommercialActionDecision {
  // Lo stato salute e i volumi arrivano normalmente dalla stessa vista read-only,
  // ma la policy può essere invocata anche con snapshot stale. Se i segnali si
  // contraddicono non scegliamo quale credere: fermiamo il contatto e chiediamo
  // una revisione dati.
  if (hasContradictoryVolumeSnapshot(input) || hasContradictoryRecencySnapshot(input)) {
    return {
      action: "review_data",
      channel: "none",
      priority: "high",
      requiresHumanApproval: true,
      reason: "Stato salute e cronologia recente non sono coerenti: verificare i dati prima di qualsiasi azione commerciale.",
    };
  }

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