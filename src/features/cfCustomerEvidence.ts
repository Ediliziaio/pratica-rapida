import type { FormSchema } from "@/types/form-module";

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

/** L'eventuale modulo gestito da DB non può omettere la fine lavori CF. */
export function withCfCustomerDate(schema: FormSchema, isCf: boolean): FormSchema {
  if (!isCf) return schema;
  const field = {
    key: "data_fine_lavori",
    label: "Data di fine lavori",
    type: "date" as const,
    required: true,
    help_text: "Indica la data effettiva in cui sono terminati i lavori.",
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
