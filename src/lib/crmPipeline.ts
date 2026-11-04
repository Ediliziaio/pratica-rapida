export interface CrmPipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
}

export const CLIENTI_50_STAGE_ID = "clienti_50";
export const LEAD_50_INCOMING_STAGE_ID = "lead_50_incoming";
export const NEW_LEAD_STAGE_ID = "lead";
export const CLIENTI_50_FORM_ID = "2546968312490707";

export const DEFAULT_CRM_STAGES: CrmPipelineStage[] = [
  { id: LEAD_50_INCOMING_STAGE_ID, name: "Lead €50 in entrata", color: "#0ea5e9", order: 0 },
  { id: CLIENTI_50_STAGE_ID, name: "Lead €50 contattati", color: "#16a34a", order: 1 },
  { id: NEW_LEAD_STAGE_ID, name: "Nuovo Lead", color: "#6366f1", order: 2 },
  { id: "contatto", name: "Primo Contatto", color: "#f59e0b", order: 3 },
  { id: "demo", name: "Demo Programmata", color: "#8b5cf6", order: 4 },
  { id: "onboarding", name: "In Onboarding", color: "#3b82f6", order: 5 },
  { id: "attivo", name: "Cliente Attivo", color: "#10b981", order: 6 },
];

/**
 * Mantiene a sinistra le due fasi del percorso €50: prima i lead in entrata,
 * poi quelli contattati. Non assegna né sposta alcun cliente.
 */
export function normalizeCrmStages(stages: CrmPipelineStage[]): CrmPipelineStage[] {
  const incoming = stages.find(stage => stage.id === LEAD_50_INCOMING_STAGE_ID);
  const fifty = stages.find(stage => stage.id === CLIENTI_50_STAGE_ID);
  const legacyIncoming = stages.find(stage => stage.id === NEW_LEAD_STAGE_ID);
  const rest = stages
    .filter(stage => ![
      LEAD_50_INCOMING_STAGE_ID,
      CLIENTI_50_STAGE_ID,
      NEW_LEAD_STAGE_ID,
    ].includes(stage.id))
    .sort((a, b) => a.order - b.order);

  return [
    {
      id: LEAD_50_INCOMING_STAGE_ID,
      name: "Lead €50 in entrata",
      color: incoming?.color || "#0ea5e9",
      order: 0,
    },
    {
      id: CLIENTI_50_STAGE_ID,
      name: "Lead €50 contattati",
      color: fifty?.color || "#16a34a",
      order: 1,
    },
    {
      id: NEW_LEAD_STAGE_ID,
      name: "Nuovo Lead",
      color: legacyIncoming?.color || "#6366f1",
      order: 2,
    },
    ...rest.map((stage, index) => ({ ...stage, order: index + 3 })),
  ];
}

export function isFiftyEuroLead(lead: {
  stage_id: string;
  meta_form_id?: string | null;
  commercial_price_eur?: number | null;
}): boolean {
  return Number(lead.commercial_price_eur) === 50
    || lead.stage_id === LEAD_50_INCOMING_STAGE_ID
    || lead.stage_id === CLIENTI_50_STAGE_ID;
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
