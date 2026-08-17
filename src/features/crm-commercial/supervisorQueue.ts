import { suggestCommercialAction, type CommercialActionInput } from "./actionPolicy";
import { classifyLeadAttention, type LeadSupervisorInput } from "./leadPolicy";

export interface CustomerSupervisorInput extends CommercialActionInput {
  id: string;
  label: string;
  attentionScore: number;
  isActive?: boolean;
}

export interface LeadQueueInput extends LeadSupervisorInput {
  id: string;
  label: string;
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
    // is_active=false è una disattivazione amministrativa esplicita: non deve
    // diventare automaticamente una campagna di recupero commerciale.
    if (customer.isActive === false) return [];

    const decision = suggestCommercialAction(customer);
    if (decision.action === "monitor" || decision.action === "growth_opportunity") return [];
    return [{
      id: `customer:${customer.id}`,
      kind: "customer",
      label: customer.label,
      score: customer.attentionScore,
      action: decision.action,
      channel: decision.channel,
      reason: decision.reason,
      requiresHumanApproval: true,
    }];
  });

  const leadTasks = leads.flatMap((lead): CommercialSupervisorTask[] => {
    const decision = classifyLeadAttention(lead);
    if (decision.status === "new" || decision.status === "no_action" || decision.status === "progressing") return [];
    return [{
      id: `lead:${lead.id}`,
      kind: "lead",
      label: lead.label,
      score: leadScore(decision.priority),
      action: decision.status,
      channel: "whatsapp",
      reason: decision.reason,
      requiresHumanApproval: true,
    }];
  });

  return [...customerTasks, ...leadTasks].sort((a, b) =>
    b.score - a.score || a.label.localeCompare(b.label, "it"),
  );
}
