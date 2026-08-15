import type { EneaLabMappedPractice } from "./types";
import {
  buildEneaPortalRuntimeScript,
  type EneaPortalScriptOptions,
} from "./portalScript";

export interface EneaScreeningSummaryPortalPreparation {
  script: string;
  readyFieldIds: string[];
  skippedFieldIds: string[];
  runtime: EneaPortalScriptOptions;
}

function numericValue(value: string): string {
  const normalized = value.trim().replace(/\s*€\s*$/i, "").replace(/\.(?=\d{3}(?:\D|$))/g, "");
  if (!/\d/.test(normalized)) return "";
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? normalized : "";
}

/** Compila i dati riepilogativi osservati nella pagina delle schermature. */
export function buildEneaScreeningSummaryPortalScript(
  mapped: EneaLabMappedPractice,
): EneaScreeningSummaryPortalPreparation {
  const field = mapped.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === "schermature.spesa");
  // La spesa calcolata dal parser è solo una proposta: il confronto storico ha
  // mostrato che il totale fiscale può differire dalla spesa congrua comunicata
  // a ENEA. Anche il builder diretto resta quindi fail-closed e compila id-costo
  // soltanto dopo una riscrittura/verifica esplicita dell'operatore.
  const ready = field?.status === "ready"
    && !field.testOnly
    && field.source === "Inserimento operatore";
  const value = ready ? numericValue(field.value) : "";
  const runtime: EneaPortalScriptOptions = {
    fields: value ? [{ portalId: "id-costo", control: "input", value }] : [],
    pageName: "Schermature solari",
    markerIds: ["id-costo"],
    successMessage: "ENEA Lab: spese congrue compilate. Nessun salvataggio o invio eseguito.",
  };

  return {
    script: buildEneaPortalRuntimeScript(runtime),
    readyFieldIds: value ? ["schermature.spesa"] : [],
    skippedFieldIds: value ? [] : ["schermature.spesa"],
    runtime,
  };
}
