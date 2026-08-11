export interface LeadSupervisorInput {
  stageId: string;
  ageHours: number;
  contacted: boolean;
  hoursSinceContact?: number | null;
}

export interface LeadSupervisorDecision {
  status: "new" | "needs_first_contact" | "needs_followup" | "progressing" | "no_action";
  priority: "low" | "medium" | "high";
  reason: string;
}

/**
 * Policy di attenzione, non di invio: segnala quando un lead rischia di essere
 * dimenticato. Qualsiasi contatto resta soggetto ad approvazione umana.
 */
export function classifyLeadAttention(input: LeadSupervisorInput): LeadSupervisorDecision {
  if (["attivo", "onboarding", "demo"].includes(input.stageId)) {
    return { status: "progressing", priority: "low", reason: "Lead già avanzato nel percorso commerciale." };
  }

  if (!input.contacted) {
    if (input.ageHours >= 24) {
      return {
        status: "needs_first_contact",
        priority: "high",
        reason: `Lead senza primo contatto da ${Math.floor(input.ageHours)} ore.`,
      };
    }
    return {
      status: "new",
      priority: "medium",
      reason: "Lead nuovo ancora entro la finestra del primo contatto.",
    };
  }

  const sinceContact = input.hoursSinceContact ?? 0;
  if (["lead", "contatto"].includes(input.stageId) && sinceContact >= 72) {
    return {
      status: "needs_followup",
      priority: "medium",
      reason: `Nessun avanzamento da ${Math.floor(sinceContact)} ore dopo il contatto.`,
    };
  }

  return { status: "no_action", priority: "low", reason: "Nessuna azione commerciale urgente." };
}
