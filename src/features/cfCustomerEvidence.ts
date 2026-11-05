import type { FormSchema } from "@/types/form-module";
import { normalizeItalianDateToIso } from "@/components/form-cliente/validation-utils";

/** Solo l'apertura interna del Servizio Completo CF rinvia i dati al cliente. */
export function isStaffCfIntake(input: {
  isInternal: boolean;
  publicMode: boolean;
  isFgasOnly: boolean;
  tipoServizio: string | null;
  tipoFatturazione: string | null;
}): boolean {
  return input.isInternal && !input.publicMode && !input.isFgasOnly &&
    input.tipoServizio === "servizio_completo" &&
    input.tipoFatturazione === "cliente_finale";
}

/**
 * Il contenitore gia' presente nel menu aziende raccoglie anche i clienti
 * privati che contattano direttamente lo staff. La scelta dell'azienda non
 * cambia il percorso dei rivenditori: soltanto questa voce rinvia la raccolta
 * tecnica a dopo l'invio del link.
 */
export function isDirectPrivateCfIntake(input: {
  staffCfIntake: boolean;
  selectedCompanyName: string | null | undefined;
}): boolean {
  return input.staffCfIntake &&
    (input.selectedCompanyName ?? "").toLocaleLowerCase("it-IT").includes("clienti privati");
}

/** Nessuna domanda o allegato tecnico prima del link nel canale privato diretto. */
export function shouldRequestTechnicalEvidenceAtIntake(input: {
  isPrivato: boolean;
  directPrivateCfIntake: boolean;
}): boolean {
  return !input.isPrivato && !input.directPrivateCfIntake;
}

/**
 * Nel Servizio Completo CF lo staff apre soltanto la pratica: i documenti
 * tecnici della pompa vengono raccolti dal modulo cliente dopo il pagamento.
 * Il percorso pubblico del privato segue la stessa regola.
 */
export function shouldRequestPumpEvidenceAtIntake(input: {
  isPump: boolean;
  isFgasOnly: boolean;
  isPrivato: boolean;
  staffCfIntake: boolean;
}): boolean {
  return input.isPump && !input.isFgasOnly && !input.isPrivato && !input.staffCfIntake;
}

/** I prezzi/pacchetti F-Gas sono riservati a rivenditori e installatori. */
export function shouldOfferResellerFgas(input: {
  isPump: boolean;
  isPrivato: boolean;
  staffCfIntake: boolean;
}): boolean {
  return input.isPump && !input.isPrivato && !input.staffCfIntake;
}

/** L'eventuale modulo gestito da DB non può omettere la fine lavori CF. */
export function withCfCustomerDate(schema: FormSchema, isCf: boolean): FormSchema {
  if (!isCf) return schema;
  const field = {
    key: "data_fine_lavori",
    label: "Data di fine lavori",
    type: "date" as const,
    required: true,
    help_text: "La data di fine lavori può essere quella dell’ultima fattura, dell’ultimo bonifico oppure, se presente, del documento di fine lavori rilasciato dall’installatore.",
  };
  const steps = schema.steps ?? [];
  const documenti = steps.find((step) => step.key === "documenti");
  if (!documenti) {
    return { ...schema, steps: [...steps, { key: "documenti", label: "Documenti", fields: [field] }] };
  }
  return { ...schema, steps: steps.map((step) => step.key === "documenti" ? {
    ...step,
    visible_if: undefined,
    fields: step.fields.some((candidate) => candidate.key === field.key)
      ? step.fields.map((candidate) => candidate.key === field.key ? { ...candidate, ...field } : candidate)
      : [...step.fields, field],
  } : step) };
}

/**
 * Compatibilità con le bozze create quando il campo data memorizzava il
 * formato visuale gg/mm/aaaa. Il database continua a ricevere solo ISO.
 */
export function normalizeCfCustomerCompletionDate(
  data: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const documenti = data.documenti;
  const rawDate = documenti?.data_fine_lavori;
  if (!documenti || typeof rawDate !== "string") return data;
  const normalized = normalizeItalianDateToIso(rawDate);
  if (normalized === rawDate) return data;
  return {
    ...data,
    documenti: { ...documenti, data_fine_lavori: normalized },
  };
}
