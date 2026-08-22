import { mapSchermaturaPractice } from "./mapper";
import type {
  EneaLabDocumentAnalysis,
  EneaLabFieldStatus,
  EneaLabMapOptions,
  EneaLabMappedPractice,
  EneaLabSourcePractice,
} from "./types";

const COMMON_SECTION_IDS = new Set(["beneficiario", "immobile", "intervento", "impianto", "documenti"]);

/**
 * Riusa esclusivamente il core comune già validato del mapper APR.
 *
 * Il mapper storico si chiama `mapSchermaturaPractice`, ma beneficiario,
 * immobile, intervento e impianto sono indipendenti dal prodotto. Per Infissi
 * scartiamo integralmente la sezione schermature e qualunque suo campo prima
 * che il risultato esca da questa funzione. Nessuna regola tecnica schermature
 * viene quindi trasferita al prodotto Infissi.
 */
export function mapInfissiCommonPractice(
  source: EneaLabSourcePractice,
  analysis?: EneaLabDocumentAnalysis,
  options?: EneaLabMapOptions,
): EneaLabMappedPractice {
  if (source.form.prodotto.tipo !== "infissi") {
    throw new Error("APR Infissi common mapper richiede una pratica prodotto infissi");
  }

  const base = mapSchermaturaPractice(source, analysis, options);
  const sections = base.sections
    .filter((section) => COMMON_SECTION_IDS.has(section.id))
    .map((section) => section.id !== "documenti"
      ? section
      : {
          ...section,
          fields: section.fields.map((field) => field.id === "documenti.tecnici"
            ? {
                ...field,
                label: "Scheda tecnica / dichiarazione prestazione infissi",
                note: "Verificare documentazione tecnica del serramento, trasmittanze e prestazioni dichiarate. Nessun dato gTot viene applicato agli infissi.",
              }
            : field),
        });

  if (sections.some((section) => section.fields.some((field) => field.id.startsWith("schermature.")))) {
    throw new Error("APR Infissi common mapper ha ereditato un campo schermature");
  }

  const summary: Record<EneaLabFieldStatus, number> = { ready: 0, review: 0, missing: 0 };
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.required) summary[field.status] += 1;
    }
  }

  return { source, sections, summary };
}
