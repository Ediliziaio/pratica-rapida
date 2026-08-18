import { suggestCommercialAction, type CommercialActionInput } from "./actionPolicy";
import { classifyLeadAttention, type LeadSupervisorInput } from "./leadPolicy";

export interface CustomerSupervisorInput extends CommercialActionInput {
  id: string;
  label: string;
  attentionScore: number;
  isActive?: boolean;
  blockedAt?: string | null;
  telefono?: string | null;
}

export interface LeadQueueInput extends LeadSupervisorInput {
  id: string;
  label: string;
  telefono?: string | null;
}

export interface CommercialSupervisorTask {
  id: string;
  kind: "customer" | "lead";
  label: string;
  score: number;
  action: string;
  channel: "none" | "whatsapp" | "call";
  reason: string;
  requiresHumanApproval: true;
}

function leadScore(priority: "low" | "medium" | "high"): number {
  if (priority === "high") return 90;
  if (priority === "medium") return 70;
  return 10;
}

export function buildCommercialSupervisorQueue(
  customers: CustomerSupervisorInput[],
  leads: LeadQueueInput[],
): CommercialSupervisorTask[] {
  const customerTasks = customers.flatMap((customer): CommercialSupervisorTask[] => {
    // is_active=false o blocked_at valorizzato sono stati amministrativi espliciti:
    // non devono trasformarsi automaticamente in campagne di recupero commerciale.
    if (customer.isActive === false || customer.blockedAt) return [];

    const decision = suggestCommercialAction(customer);
    if (decision.action === "monitor" || decision.action === "growth_opportunity") return [];

    // undefined significa che il chiamante non ha ancora passato il dato; null o
    // stringa vuota significano invece che sappiamo che il numero non esiste.
    const phoneExplicitlyMissing = customer.telefono === null
      || (typeof customer.telefono === "string" && customer.telefono.trim().length === 0);
    const channel = phoneExplicitlyMissing && decision.channel !== "none"
      ? "none"
      : decision.channel;

    return [{
      id: `customer:${customer.id}`,
      kind: "customer",
      label: customer.label,
      score: customer.attentionScore,
      action: decision.action,
      channel,
      reason: phoneExplicitlyMissing
        ? `${decision.reason} Nessun numero di telefono disponibile: definire manualmente il canale di contatto.`
        : decision.reason,
      requiresHumanApproval: true,
    }];
  });

  const leadTasks = leads.flatMap((lead): CommercialSupervisorTask[] => {
    const decision = classifyLeadAttention(lead);
    if (decision.status === "new" || decision.status === "no_action" || decision.status === "progressing") return [];

    const hasPhone = typeof lead.telefono === "string" && lead.telefono.trim().length > 0;
    return [{
      id: `lead:${lead.id}`,
      kind: "lead",
      label: lead.label,
      score: leadScore(decision.priority),
      action: decision.status,
      channel: hasPhone ? "whatsapp" : "none",
      reason: hasPhone
        ? decision.reason
        : `${decision.reason} Nessun numero di telefono disponibile: definire manualmente il canale di contatto.`,
      requiresHumanApproval: true,
    }];
  });

  return [...customerTasks, ...leadTasks].sort((a, b) =>
    b.score - a.score || a.label.localeCompare(b.label, "it"),
  );
}
