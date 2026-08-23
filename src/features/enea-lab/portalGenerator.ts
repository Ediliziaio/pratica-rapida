import type { EneaLabMappedPractice } from "./types";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalRuntimeField,
  type EneaPortalScriptOptions,
} from "./portalScript";

interface GeneratorPortalFieldDefinition {
  fieldId: string;
  portalId: string;
}

export interface EneaGeneratorPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

const generatorPortalFields = (generatorLabel: string): readonly GeneratorPortalFieldDefinition[] => [
  { fieldId: "impianto.numero_generatori", portalId: "id-num" },
  // Il modale ENEA della riga "Pompa di calore / Impianto geotermico"
  // espone P.E.A. con id-pea al posto del rendimento id-n. La sorgente locale
  // resta il valore convenzionale TEST gia auditato; qui cambia soltanto il
  // binding al controllo osservato del portale.
  { fieldId: "impianto.rendimento", portalId: normalizeGeneratorLabel(generatorLabel) === "impianto geotermico" ? "id-pea" : "id-n" },
  { fieldId: "impianto.potenza", portalId: "id-pn" },
] as const;

function normalizeGeneratorLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

function numericValue(value: string): string {
  return value.trim().replace(/[^0-9,.-]/g, "");
}

function isValidGeneratorValue(fieldId: string, value: string): boolean {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return false;
  if (fieldId === "impianto.numero_generatori") return Number.isInteger(parsed) && parsed > 0;
  if (fieldId === "impianto.rendimento") return parsed > 0 && parsed <= 100;
  if (fieldId === "impianto.potenza") return parsed > 0;
  return false;
}

/** Compila soltanto la finestra del generatore gia aperta dall'operatore. */
export function buildEneaGeneratorPortalScript(
  mapped: EneaLabMappedPractice,
  includeTestValues = false,
): EneaGeneratorPortalPreparation {
  const fieldsById = new Map(
    mapped.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const generatorLabel = fieldsById.get("impianto.generatore")?.value.trim() ?? "";
  const portalFields = generatorPortalFields(generatorLabel);
  const readyNumericFields = portalFields.flatMap((definition) => {
    const field = fieldsById.get(definition.fieldId);
    const usableOfficialValue = field?.status === "ready" && !field.testOnly;
    const usableTestValue = includeTestValues
      && Boolean(field?.value)
      && Boolean(field?.testOnly || field?.status === "review" || usableOfficialValue);
    if (!field || (!usableOfficialValue && !usableTestValue)) return [];
    const value = numericValue(field.value);
    if (!value || !isValidGeneratorValue(definition.fieldId, value)) return [];
    const prepared: EneaPortalRuntimeField = {
      portalId: definition.portalId,
      control: "input",
      value,
    };
    return [{ ...definition, prepared }];
  });
  // ENEA raccoglie Energia elettrica, GPL e il generico Altro nella riga
  // tecnica "Altro". Il relativo modale espone però un quarto controllo,
  // "Nome generatori" (id-altro): senza questo valore il click Salva non
  // viene materializzato nella tabella, pur risultando il form HTML valido.
  // Riutilizziamo soltanto la classificazione esplicita già presente nel form.
  const usesOtherPortalRow = ["energia elettrica", "caldaia a gpl", "altro"]
    .includes(generatorLabel.toLocaleLowerCase("it"));
  const readyFields = [
    ...readyNumericFields,
    ...(usesOtherPortalRow && generatorLabel
      ? [{
          fieldId: "impianto.generatore",
          portalId: "id-altro",
          prepared: { portalId: "id-altro", control: "input" as const, value: generatorLabel },
        }]
      : []),
  ];
  const readyFieldIds = readyFields.map(({ fieldId }) => fieldId);
  const readySet = new Set(readyFieldIds);
  const skippedFieldIds = portalFields
    .map(({ fieldId }) => fieldId)
    .filter((fieldId) => !readySet.has(fieldId));
  const runtime: EneaPortalScriptOptions = {
    fields: readyFields.map(({ prepared }) => prepared),
    pageName: "Generatore dell'impianto termico",
    markerIds: portalFields.map(({ portalId }) => portalId),
    successMessage: "ENEA Lab: generatore compilato. Nessun salvataggio o invio eseguito.",
    activationLabel: generatorLabel,
    hostRoute: "impianto_esistente",
  };

  return {
    script: buildEneaPortalRuntimeScript(runtime),
    readyFieldIds,
    skippedFieldIds,
    runtime,
  };
}
