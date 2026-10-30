export interface CrmPipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
}

export const CLIENTI_50_STAGE_ID = "clienti_50";
export const NEW_LEAD_STAGE_ID = "lead";

export const DEFAULT_CRM_STAGES: CrmPipelineStage[] = [
  { id: CLIENTI_50_STAGE_ID, name: "Clienti €50", color: "#16a34a", order: 0 },
  { id: NEW_LEAD_STAGE_ID, name: "Nuovo Lead", color: "#6366f1", order: 1 },
  { id: "contatto", name: "Primo Contatto", color: "#f59e0b", order: 2 },
  { id: "demo", name: "Demo Programmata", color: "#8b5cf6", order: 3 },
  { id: "onboarding", name: "In Onboarding", color: "#3b82f6", order: 4 },
  { id: "attivo", name: "Cliente Attivo", color: "#10b981", order: 5 },
];

/**
 * Mantiene la pipeline €50 sempre a sinistra senza cambiare l'identità delle
 * altre fasi. Non assegna né sposta alcun cliente.
 */
export function normalizeCrmStages(stages: CrmPipelineStage[]): CrmPipelineStage[] {
  const fifty = stages.find(stage => stage.id === CLIENTI_50_STAGE_ID);
  const rest = stages
    .filter(stage => stage.id !== CLIENTI_50_STAGE_ID)
    .sort((a, b) => a.order - b.order);

  return [
    {
      id: CLIENTI_50_STAGE_ID,
      name: fifty?.name || "Clienti €50",
      color: fifty?.color || "#16a34a",
      order: 0,
    },
    ...rest.map((stage, index) => ({ ...stage, order: index + 1 })),
  ];
}

/** Nuovi lead e aziende non assegnate restano sempre in "Nuovo Lead". */
export function defaultCrmStageId(stages: CrmPipelineStage[]): string {
  return stages.some(stage => stage.id === NEW_LEAD_STAGE_ID)
    ? NEW_LEAD_STAGE_ID
    : NEW_LEAD_STAGE_ID;
}

export function containsFiftyEuroPrice(subject: string, bodyHtml: string): boolean {
  const text = `${subject} ${bodyHtml.replace(/<[^>]*>/g, " ")}`;
  return /(?:€\s*50(?:[.,]00)?|50(?:[.,]00)?\s*(?:€|euro))/i.test(text);
}

/**
 * Qualunque comunicazione che mostri il prezzo €50 può partire soltanto verso
 * la pipeline dedicata, mai verso un indirizzo di prova o pipeline miste.
 */
export function isFiftyEuroAudienceSafe(
  selectedStages: string[],
  customRecipientActive: boolean,
): boolean {
  return !customRecipientActive
    && selectedStages.length === 1
    && selectedStages[0] === CLIENTI_50_STAGE_ID;
}
