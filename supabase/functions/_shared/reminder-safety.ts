export const COMPILATION_REMINDER_STAGE_TYPES = ["inviata", "attesa_compilazione"] as const;

type DeliveryCommunication = {
  status?: string | null;
  body_preview?: string | null;
  metadata?: unknown;
};

const SUCCESSFUL_STATUSES = new Set(["sent", "delivered", "read"]);
const DELIVERY_EMAIL_TEMPLATES = new Set(["pratica_inviata", "recensione"]);
const DELIVERY_WHATSAPP_TEMPLATES = new Set([
  "pratica_completata",
  "pratica_inviata",
  "pratica_inviata_recensione",
  "invio_avvenuto_recensione",
]);

function metadataTemplate(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>).template;
  return typeof value === "string" ? value : "";
}

/**
 * Seconda barriera anti-sollecito: anche con dati legacy incoerenti sulla
 * pratica, una consegna gia riuscita non puo mai essere seguita da un invito
 * a compilare il modulo.
 */
export function isCompletedDeliveryCommunication(row: DeliveryCommunication): boolean {
  if (!SUCCESSFUL_STATUSES.has(String(row.status ?? ""))) return false;

  if (DELIVERY_EMAIL_TEMPLATES.has(metadataTemplate(row.metadata))) return true;

  const match = String(row.body_preview ?? "").match(/^\[([^\]]+)\]/);
  return !!match && DELIVERY_WHATSAPP_TEMPLATES.has(match[1]);
}
