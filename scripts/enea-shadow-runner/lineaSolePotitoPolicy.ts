import { createHash } from "node:crypto";
import type { SchermaturaDirezione } from "../../src/types/form-cliente";
import { USER_AUTHORIZED_RULE_IDS } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { isValidCodiceFiscale } from "../../src/components/form-cliente/validation-utils";
import { fiscalCodeMatchesPartialIdentity } from "../../src/features/enea-shadow-crm/operationalRules";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

export const LINEA_SOLE_POTITO_POLICY_VERSION = "linea-sole-potito-paper-form-v1" as const;
export const LINEA_SOLE_POTITO_RULE_ID = USER_AUTHORIZED_RULE_IDS.lineaSolePotitoPaperForm;
export const PAPER_FORM_BIRTH_DATE_OCR_REPAIR_RULE_ID = "system-paper-form-birth-date-leading-digit-ocr-repair" as const;

export function lineaSolePotitoSupplierEvidence(rowValue: unknown) {
  const row = object(rowValue); const company = object(row?.companies);
  const candidates = [
    { field: "row.fornitore", value: text(row?.fornitore) },
    { field: "row.companies.ragione_sociale", value: text(company?.ragione_sociale) },
    { field: "row.ragione_sociale", value: text(row?.ragione_sociale) },
  ].filter((candidate) => candidate.value);
  const match = candidates.find((candidate) => normalize(candidate.value) === "linea sole potito") ?? null;
  return { matched: Boolean(match), match, candidates };
}

export function isLineaSolePotitoPaperForm(documentText: string) {
  const normalized = normalize(documentText);
  const templateIdentity = normalized.includes("compilazione a cura del richiedente la detrazione")
    && normalized.includes("dati generali edificio abitazione oggetto d intervento");
  const completeScreeningPage = normalized.includes("installazione di schermature solari")
    && (normalized.includes("pag 5 5") || normalized.includes("foglio 5 5"));
  const partialPaperPacket = normalized.includes("pag 2 5")
    || normalized.includes("pag 3 5")
    || normalized.includes("dati identificativi impianto termico esistente");
  // Linea Sole Potito puo' consegnare il pacchetto cartaceo senza la pagina
  // tecnica finale. Il match fornitore resta obbligatorio nel chiamante: qui
  // riconosciamo anche il template parziale, senza inventare le crocette perse.
  return templateIdentity && (completeScreeningPage || (normalized.includes("praticarapida") && partialPaperPacket));
}

const isoDate = (day: string, month: string, year: string) => `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
const CF_MONTHS = "ABCDEHLMPRST";

function reconcileBirthDateWithFiscalCode(birth: { day: string; month: string; year: string } | null, fiscalCode: string) {
  if (!birth) return { value: "", repaired: false, observed: "", reason: "birth_date_absent" as const };
  const observed = isoDate(birth.day, birth.month, birth.year);
  if (!isValidCodiceFiscale(fiscalCode)) return { value: observed, repaired: false, observed, reason: "fiscal_code_invalid" as const };
  const encodedYear = Number(fiscalCode.slice(6, 8));
  const encodedMonth = CF_MONTHS.indexOf(fiscalCode[8]) + 1;
  const encodedSexDay = Number(fiscalCode.slice(9, 11));
  const encodedDay = encodedSexDay > 40 ? encodedSexDay - 40 : encodedSexDay;
  const observedDay = Number(birth.day); const observedMonth = Number(birth.month); const observedYear = Number(birth.year);
  const missingLeadingOne = birth.day.length === 1 && encodedDay >= 10 && encodedDay <= 19 && observedDay === encodedDay - 10;
  if (missingLeadingOne && observedMonth === encodedMonth && observedYear % 100 === encodedYear) return {
    value: isoDate(String(encodedDay), String(encodedMonth), String(observedYear)), repaired: true, observed,
    reason: "single_leading_one_lost_and_cf_date_segments_concordant" as const,
  };
  return { value: observed, repaired: false, observed, reason: "no_unique_leading_digit_repair" as const };
}

/**
 * Estrae soltanto valori testuali inequivoci del template cartaceo. Le crocette
 * la cui posizione viene persa dall'estrazione lineare non sono interpretate:
 * restano vuote, invece di trasformare un layout ambiguo in un dato inventato.
 */
export function parseLineaSolePotitoPaperForm(documentText: string, expectedIdentity?: { name?: string | null; surname?: string | null; taxCode?: string | null }) {
  if (!isLineaSolePotitoPaperForm(documentText)) return null;
  const person = documentText.match(/PERSONA\s+FISICA\s*\n\s*([^\n]+?)\s+([A-Z0-9]{16})\s*\n/i);
  const birth = documentText.match(/\n\s*([A-ZÀ-ÖØ-Ý' -]+)\s+([A-Z]{2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*\n\s*Luogo\s+di\s+nascita/i);
  const labelledBirth = documentText.match(/Data\s+di\s+nascita\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  // Nei moduli cartacei la barra prima del mese puo essere letta come cifra
  // `1` e il separatore successivo come virgola (es. `18\n108,1934` per
  // 18/08/1934). Accettiamo questa sola deformazione strutturale; il valore
  // resta utilizzabile soltanto se la riconciliazione col CF valido concorda.
  const wrappedLabelledBirth = documentText.match(/Data\s+di\s+nascita\s*(\d{1,2})[\s/.,_-]+1?(\d{2})[\s/.,_-]+(\d{4})/i);
  const labelledBirthPlace = documentText.match(/Luogo\s+di\s+nascita\s*\n\s*([^\n]+?)\s*\n\s*Prov\.?\s*_?\s*\n?\s*([A-Z]{2})\b/i);
  const birthParts = birth ? { day: birth[3], month: birth[4], year: birth[5] }
    : labelledBirth ? { day: labelledBirth[1], month: labelledBirth[2], year: labelledBirth[3] }
      : wrappedLabelledBirth ? { day: wrappedLabelledBirth[1], month: wrappedLabelledBirth[2], year: wrappedLabelledBirth[3] } : null;
  const contact = documentText.match(/\n\s*([+\d][\d ]{6,})\s+([^\s@]+@[^\s@]+)\s*\n\s*N\.\s*telefono/i);
  const residence = documentText.match(/LUOGO\s+DI\s+RESIDENZA\s*\n\s*([^\n]+?)\s*\n(?:\s*([^\n]+?)\s*\n)?\s*Indirizzo[^\n]*\n\s*([A-ZÀ-ÖØ-Ý' -]+?)\s+([A-Z]{2})\s+(\d{5})\s*\n\s*Comune/i);
  const buildingAddress = documentText.match(/DATI\s+GENERALI\s+EDIFICIO\/ABITAZIONE\s+OGGETTO\s+D[’']INTERVENTO\s*\n\s*([^\n]+?)\s*\n(?:\s*([^\n]+?)\s*\n)?\s*Indirizzo[^\n]*\n\s*([A-ZÀ-ÖØ-Ý' -]+?)\s+([A-Z]{2})\s+(\d{5})\s*\n\s*Comune/i);
  const cadastral = documentText.match(/DATI\s+CATASTALI\s*\n\s*([^\s\n]+)\s+([^\s\n]+)\s+([^\s\n]+)\s*\n\s*Foglio/i);
  const building = documentText.match(/ANNO\s+DI\s+COSTRUZIONE\s+(\d{4})\s+([0-9]+(?:[,.][0-9]+)?)/i);
  const units = documentText.match(/NUMERO\s+DI\s+UNITA[’']?\s+IMMOBILIARI[^\n]*\n\s*(\d+)\s*\n/i);
  const explicitScreenings = [...documentText.matchAll(/Prodotto\s*[:=]\s*([^\n]+)[\s\S]{0,500}?Orientamento\s*[:=]\s*(Sud\s*\/\s*Est|Sud\s*\/\s*Ovest|Sud|Est|Ovest)[\s\S]{0,500}?Dimensioni\s+finestra\s+protetta\s*[:=]\s*([0-9]+(?:[,.][0-9]+)?)\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)\s*(mm|cm|m)?/gi)].map((match) => {
    const direction = normalize(match[2]).replace(/ /g, "_").replace("sud_est", "sud_est").replace("sud_ovest", "sud_ovest") as SchermaturaDirezione;
    const width = Number(match[3].replace(",", ".")); const height = Number(match[4].replace(",", ".")); const unit = match[5]?.toLowerCase() || "m";
    const factor = unit === "mm" ? 0.001 : unit === "cm" ? 0.01 : 1;
    return { description: match[1].trim(), direzione: direction, protectedWindowSurfaceM2: Math.round(width * factor * height * factor * 1000) / 1000, sourceText: match[0] };
  }).filter((item) => item.protectedWindowSurfaceM2 > 0);
  const expectedName = text(expectedIdentity?.name); const expectedSurname = text(expectedIdentity?.surname);
  const identityLine = normalize(person?.[1] ?? "");
  const expectedTaxCode = text(expectedIdentity?.taxCode).replace(/\s+/g, "").toUpperCase();
  const candidateCf = isValidCodiceFiscale(expectedTaxCode) ? expectedTaxCode : person?.[2].toUpperCase() ?? "";
  const birthDateResolution = reconcileBirthDateWithFiscalCode(birthParts, candidateCf);
  const encodedDay = Number(candidateCf.slice(9, 11));
  const identityMatchesText = Boolean(expectedName && expectedSurname && identityLine.includes(normalize(expectedName)) && identityLine.includes(normalize(expectedSurname)));
  const identityMatchesFiscalSegments = Boolean(expectedName && expectedSurname && birthDateResolution.value && isValidCodiceFiscale(candidateCf)
    && fiscalCodeMatchesPartialIdentity(candidateCf, { name: expectedName, surname: expectedSurname, birthDate: birthDateResolution.value, sex: encodedDay > 40 ? "F" : "M" }));
  const identityMatches = identityMatchesText || identityMatchesFiscalSegments;
  const [name, surname, cf] = identityMatches ? [expectedName, expectedSurname, candidateCf] : ["", "", ""];
  return {
    richiedente: {
      nome: name, cognome: surname, cf,
      comune_nascita: birth?.[1].trim() ?? labelledBirthPlace?.[1].trim() ?? "", provincia_nascita: birth?.[2] ?? labelledBirthPlace?.[2]?.toUpperCase() ?? "",
      data_nascita: birthDateResolution.value,
      telefono: contact?.[1].replace(/\s+/g, "") ?? "", email: contact?.[2] ?? "",
    },
    residenza: { indirizzo: residence?.[1].trim() ?? "", civico: residence?.[2]?.trim() ?? "", comune: residence?.[3].trim() ?? "", provincia: residence?.[4] ?? "", cap: residence?.[5] ?? "" },
    appartamento_lavori: { indirizzo: buildingAddress?.[1].trim() ?? "", numero: buildingAddress?.[2]?.trim() ?? "", comune: buildingAddress?.[3].trim() ?? "", provincia: buildingAddress?.[4] ?? "", cap: buildingAddress?.[5] ?? "" },
    catastali: { foglio: cadastral?.[1] ?? "", mappale: cadastral?.[2] ?? "", subalterno: cadastral?.[3] ?? "" },
    edificio: { anno_costruzione: building?.[1] ?? "", superficie_mq: building?.[2]?.replace(",", ".") ?? "", numero_appartamenti: units?.[1] ?? "" },
    prodotto: { tipo: "schermature" as const, schermature: explicitScreenings.map((item) => ({ tipo_prodotto: "", direzione: item.direzione })) },
    _lineaSolePotito: { explicitScreenings, birthDateResolution, wrappedBirthOcrRepair: Boolean(!birth && !labelledBirth && wrappedLabelledBirth) },
  };
}

export function resolveLineaSolePotitoExposure(explicitValue?: string | null) {
  const explicit = normalize(explicitValue ?? "").replace(/ /g, "_");
  const allowed = new Set<SchermaturaDirezione>(["sud", "sud_est", "sud_ovest", "est", "ovest"]);
  if (allowed.has(explicit as SchermaturaDirezione)) return {
    value: explicit as SchermaturaDirezione,
    source: "paper_form_explicit" as const,
    ruleId: LINEA_SOLE_POTITO_RULE_ID,
  };
  return { value: "sud" as const, source: "linea_sole_potito_fallback" as const, ruleId: LINEA_SOLE_POTITO_RULE_ID };
}

export function resolveLineaSolePotitoProtectedWindowSurface(input: {
  practiceId: string; rowId: string; explicitValue?: number | null;
}) {
  if (typeof input.explicitValue === "number" && Number.isFinite(input.explicitValue) && input.explicitValue > 0) return {
    value: input.explicitValue,
    source: "paper_form_explicit" as const,
    policyVersion: LINEA_SOLE_POTITO_POLICY_VERSION,
    seed: null,
    fingerprint: null,
    ruleId: LINEA_SOLE_POTITO_RULE_ID,
  };
  const seed = `${input.practiceId.trim()}:${input.rowId.trim()}`;
  if (!input.practiceId.trim() || !input.rowId.trim()) return null;
  const fingerprint = createHash("sha256").update(seed).digest("hex");
  const value = 2 + (Number.parseInt(fingerprint.slice(0, 8), 16) % 10) / 10;
  return {
    value,
    source: "linea_sole_potito_fallback" as const,
    policyVersion: LINEA_SOLE_POTITO_POLICY_VERSION,
    seed,
    fingerprint,
    ruleId: LINEA_SOLE_POTITO_RULE_ID,
  };
}
