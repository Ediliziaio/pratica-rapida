import {
  CALDAIA_LABELS,
  SCHERMATURA_DIREZIONE_LABELS,
  TIPOLOGIA_LABELS,
  TITOLO_LABELS,
  isValidPhone,
} from "@/types/form-cliente";
import {
  ENEA_ENERGY_CARRIER,
  ENEA_PLANT_DISTRIBUTIONS,
  ENEA_PLANT_REGULATIONS,
  ENEA_PLANT_TERMINAL,
  ENEA_PLANT_TYPE,
} from "./plantRules";
import {
  ENEA_SCREENING_CALCULATION,
  ENEA_SCREENING_INSTALLATION,
  ENEA_SCREENING_MATERIAL,
  ENEA_SCREENING_REGULATION,
  ENEA_SCREENING_TYPE,
} from "./screeningRules";

export interface EneaLabOperatorValidation {
  valid: boolean;
  value: string;
  message?: string;
}

const ENEA_SCREENING_EXPOSURES = [
  ...Object.values(SCHERMATURA_DIREZIONE_LABELS),
  "Nord",
  "Nord-Est",
  "Nord-Ovest",
  "P-orizzontale",
] as const;

const ITALIAN_FISCAL_CODE_ODD_VALUES: Record<string, number> = {
  0: 1,
  1: 0,
  2: 5,
  3: 7,
  4: 9,
  5: 13,
  6: 15,
  7: 17,
  8: 19,
  9: 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

const ITALIAN_FISCAL_CODE_PERSONAL_PATTERN = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

type EneaNumericUnit = "area" | "power" | "energy" | "currency" | "percent" | "thermal-resistance";
type EneaExpectedNumericUnit = EneaNumericUnit | "dimensionless";

function parseItalianNumber(value: string): number | null {
  const tokens = value.trim().match(/[+-]?\d+(?:[.,]\d+)*/g) ?? [];
  if (tokens.length !== 1) return null;
  const token = tokens[0];
  const tokenMatch = token.match(/^([+-]?)(\d+(?:[.,]\d+)*)$/);
  if (!tokenMatch) return null;

  const [, sign, body] = tokenMatch;
  let normalized: string | null = null;

  if (/^0\.\d+$/.test(body)) {
    normalized = `${sign}${body}`;
  } else if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(body)) {
    normalized = `${sign}${body.replace(/\./g, "").replace(",", ".")}`;
  } else if (/^\d+,\d+$/.test(body)) {
    normalized = `${sign}${body.replace(",", ".")}`;
  } else if (/^\d+\.\d+$/.test(body) || /^\d+$/.test(body)) {
    normalized = `${sign}${body}`;
  }

  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function explicitNumericUnits(value: string): EneaNumericUnit[] {
  const units = new Set<EneaNumericUnit>();
  const lower = value.toLocaleLowerCase("it");
  const thermalResistance = /(?:k\s*m(?:²|2)\s*\/\s*w|m(?:²|2)\s*k\s*\/\s*w)/gi;
  const withoutThermalResistance = lower.replace(thermalResistance, " ");

  if (thermalResistance.test(lower)) units.add("thermal-resistance");
  if (/\bkwh\b/i.test(lower)) units.add("energy");
  if (/(?:^|[^a-z0-9])m(?:²|2)(?:$|[^a-z0-9])/i.test(withoutThermalResistance) || /\bmq\b/i.test(withoutThermalResistance)) {
    units.add("area");
  }
  if (/(?:^|[^a-z])kw(?:$|[^a-z])/i.test(lower)) units.add("power");
  if (/€|\beur\b|\beuro\b/i.test(lower)) units.add("currency");
  if (/%/.test(value)) units.add("percent");

  return [...units];
}

function expectedNumericUnit(fieldId: string): EneaExpectedNumericUnit | null {
  if (fieldId === "impianto.potenza") return "power";
  if (fieldId === "impianto.rendimento") return "percent";
  if (fieldId === "immobile.superficie" || fieldId === "schermature.superficie_totale" || /^schermature\.\d+\.(?:superficie|superficie_finestrata)$/.test(fieldId)) {
    return "area";
  }
  if (fieldId === "schermature.spesa") return "currency";
  if (fieldId === "schermature.risparmio_energia") return "energy";
  if (/^schermature\.\d+\.rsupp$/.test(fieldId)) return "thermal-resistance";
  if (/^schermature\.\d+\.gtot$/.test(fieldId)) return "dimensionless";
  if (/^(?:immobile\.anno|immobile\.unita|intervento\.unita_totali|intervento\.unita_oggetto|impianto\.numero_generatori|schermature\.numero)$/.test(fieldId)) {
    return "dimensionless";
  }
  return null;
}

function hasCompatibleExplicitUnit(fieldId: string, value: string): boolean {
  const expected = expectedNumericUnit(fieldId);
  if (!expected) return true;
  const units = explicitNumericUnits(value);
  if (units.length === 0) return true;
  return expected !== "dimensionless" && units.every((unit) => unit === expected);
}

function isValidDate(value: string): boolean {
  const italian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = italian
    ? [Number(italian[3]), Number(italian[2]), Number(italian[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : null;
  if (!parts) return false;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isFutureDate(value: string): boolean {
  const italian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = italian
    ? [Number(italian[3]), Number(italian[2]), Number(italian[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : null;
  if (!parts) return false;
  const [year, month, day] = parts;
  const candidate = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return candidate > today;
}

function hasValidItalianFiscalCodeControlCharacter(value: string): boolean {
  if (!ITALIAN_FISCAL_CODE_PERSONAL_PATTERN.test(value)) return false;

  let total = 0;
  for (let index = 0; index < 15; index += 1) {
    const character = value[index];
    if ((index + 1) % 2 === 1) {
      const oddValue = ITALIAN_FISCAL_CODE_ODD_VALUES[character];
      if (oddValue === undefined) return false;
      total += oddValue;
      continue;
    }

    total += character >= "0" && character <= "9"
      ? Number(character)
      : character.charCodeAt(0) - "A".charCodeAt(0);
  }

  return String.fromCharCode("A".charCodeAt(0) + (total % 26)) === value[15];
}

function invalid(value: string, message: string): EneaLabOperatorValidation {
  return { valid: false, value, message };
}

function allowedValue(value: string, allowed: readonly string[], message: string): EneaLabOperatorValidation {
  const match = allowed.find((candidate) => candidate.toLocaleLowerCase("it") === value.toLocaleLowerCase("it"));
  return match ? { valid: true, value: match } : invalid(value, message);
}

/**
 * Controlla soltanto i formati che il laboratorio conosce con certezza.
 * I campi non elencati restano comunque soggetti alla conferma dell'operatore.
 */
export function validateOperatorOverride(
  fieldId: string,
  rawValue: string,
): EneaLabOperatorValidation {
  const value = rawValue.trim();
  if (!value) return invalid(value, "Inserire un valore verificato.");
  if (!hasCompatibleExplicitUnit(fieldId, value)) {
    return invalid(value, "L'unità di misura esplicita non è coerente con il campo ENEA.");
  }

  if (fieldId === "beneficiario.email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return invalid(value, "Indirizzo email non valido.");
  }

  if (fieldId === "beneficiario.telefono" && !isValidPhone(value)) {
    return invalid(value, "Il telefono deve contenere da 9 a 13 cifre.");
  }

  if (fieldId === "beneficiario.sesso") {
    return allowedValue(value.toUpperCase(), ["M", "F"], "Indicare M oppure F.");
  }

  if (/^(?:beneficiario\.abitazione_principale|beneficiario\.cointestazione|impianto\.condizionamento|intervento\.(?:accorpamenti|impianto_centralizzato))$/.test(fieldId)) {
    const normalized = value.toLocaleLowerCase("it").replace("ì", "i");
    return normalized === "si"
      ? { valid: true, value: "Sì" }
      : normalized === "no"
        ? { valid: true, value: "No" }
        : invalid(value, "Indicare Sì oppure No.");
  }

  const labelSets: Record<string, readonly string[]> = {
    "beneficiario.titolo": Object.values(TITOLO_LABELS),
    "immobile.tipologia": Object.values(TIPOLOGIA_LABELS),
    "immobile.destinazione_generale": ["Residenziale", "Non residenziale", "Misto"],
    "immobile.destinazione_particolare": [
      "Edifici adibiti a residenza e assimilabili (con carattere continuativo o saltuario)",
      "Edifici adibiti a uffici e assimilabili",
      "Edifici adibiti a ospedali, cliniche o case di cura e assimilabili",
      "Edifici adibiti ad attività ricreative, associative o di culto e assimilabili (cinema, teatri, sale riunioni, musei, chiese e similari)",
      "Edifici adibiti ad attività commerciali e assimilabili",
      "Edifici adibiti ad attività sportive (piscine, palestre, servizi di supporto alle attività sportive)",
      "Edifici adibiti ad attività scolastiche a tutti i livelli e assimilabili",
      "Edifici adibiti ad attività industriali ed artigianali e assimilabili",
    ],
    "intervento.ambito": [
      "Singola unità immobiliare (in un edificio costituito da più unità immobiliari)",
      "Edificio costituito da una singola unità immobiliare",
      "Intero edificio (qualsiasi altro tipo di edificio non incluso nei casi sopra riportati)",
    ],
    "intervento.tipo": [
      "Comma 345A - Interventi sull'involucro",
      "Comma 345B - Schermature solari",
      "Comma 347A - Sostituzione di impianto di climatizzazione",
    ],
    "impianto.tipo": Object.values(ENEA_PLANT_TYPE),
    "impianto.terminali": Object.values(ENEA_PLANT_TERMINAL),
    "impianto.distribuzione": Object.values(ENEA_PLANT_DISTRIBUTIONS),
    "impianto.regolazione": Object.values(ENEA_PLANT_REGULATIONS),
    "impianto.generatore": Object.values(CALDAIA_LABELS),
    "impianto.combustibile": Object.values(ENEA_ENERGY_CARRIER),
  };
  const allowedLabels = labelSets[fieldId];
  if (allowedLabels) {
    return allowedValue(value, allowedLabels, "Selezionare uno dei valori previsti dal modulo.");
  }

  if (/^schermature\.\d+\.tipo$/.test(fieldId)) {
    return allowedValue(value, Object.values(ENEA_SCREENING_TYPE), "Selezionare un tipo di schermatura previsto da ENEA.");
  }

  if (/^schermature\.\d+\.installazione$/.test(fieldId)) {
    return allowedValue(value, Object.values(ENEA_SCREENING_INSTALLATION), "Selezionare un'installazione prevista da ENEA.");
  }

  if (/^schermature\.\d+\.modalita_calcolo$/.test(fieldId)) {
    return allowedValue(value, Object.values(ENEA_SCREENING_CALCULATION), "Selezionare una modalità di calcolo prevista da ENEA.");
  }

  if (/^schermature\.\d+\.materiale$/.test(fieldId)) {
    return allowedValue(value, Object.values(ENEA_SCREENING_MATERIAL), "Selezionare un materiale previsto da ENEA.");
  }

  if (/^schermature\.\d+\.regolazione$/.test(fieldId)) {
    return allowedValue(value, Object.values(ENEA_SCREENING_REGULATION), "Selezionare un meccanismo previsto da ENEA.");
  }

  if (/^schermature\.\d+\.esposizione$/.test(fieldId)) {
    return allowedValue(
      value,
      ENEA_SCREENING_EXPOSURES,
      "L'esposizione deve essere una delle orientazioni previste da ENEA; le direzioni nord sono ammesse solo per chiusure oscuranti compatibili.",
    );
  }

  if (/^(?:beneficiario\.cf|beneficiario\.cointestatario_cf)$/.test(fieldId)) {
    const normalized = value.replace(/\s/g, "").toUpperCase();
    if (!hasValidItalianFiscalCodeControlCharacter(normalized)) {
      return invalid(
        value,
        "Il codice fiscale del beneficiario deve essere personale, di 16 caratteri, con struttura e carattere di controllo coerenti.",
      );
    }
    return { valid: true, value: normalized };
  }

  if (fieldId === "beneficiario.data_nascita") {
    return isValidDate(value) && !isFutureDate(value)
      ? { valid: true, value }
      : invalid(value, "La data di nascita deve essere reale, nel formato GG/MM/AAAA e non futura.");
  }

  if (/^intervento\.(?:data_inizio|data_fine)$/.test(fieldId)) {
    return isValidDate(value)
      ? { valid: true, value }
      : invalid(value, "Usare una data reale nel formato GG/MM/AAAA.");
  }

  if (/^(?:beneficiario\.provincia_nascita|immobile\.provincia)$/.test(fieldId)) {
    const normalized = value.toUpperCase();
    return /^[A-Z]{2}$/.test(normalized)
      ? { valid: true, value: normalized }
      : invalid(value, "La provincia deve contenere due lettere.");
  }

  if (/^(?:immobile\.cap|beneficiario\.cap_residenza)$/.test(fieldId)) {
    return /^\d{5}$/.test(value)
      ? { valid: true, value }
      : invalid(value, "Il CAP deve contenere cinque cifre.");
  }

  if (fieldId === "immobile.codice_comune") {
    const normalized = value.toUpperCase();
    return /^[A-Z][0-9]{3}$/.test(normalized)
      ? { valid: true, value: normalized }
      : invalid(value, "Il codice catastale del Comune deve avere una lettera e tre cifre.");
  }

  if (fieldId === "immobile.zona_climatica") {
    const normalized = value.toUpperCase();
    return /^[A-F]$/.test(normalized)
      ? { valid: true, value: normalized }
      : invalid(value, "La zona climatica deve essere compresa tra A e F.");
  }

  if (fieldId === "immobile.anno") {
    const year = parseItalianNumber(value);
    const currentYear = new Date().getFullYear();
    return year !== null && Number.isInteger(year) && year >= 1000 && year <= currentYear
      ? { valid: true, value: String(year) }
      : invalid(value, `Inserire un anno compreso tra 1000 e ${currentYear}.`);
  }

  if (fieldId === "schermature.numero") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 && parsed <= 50
      ? { valid: true, value: String(parsed) }
      : invalid(value, "Inserire un numero intero di schermature compreso tra 1 e 50.");
  }

  if (/^(?:immobile\.unita|intervento\.unita_totali|intervento\.unita_oggetto|impianto\.numero_generatori)$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0
      ? { valid: true, value: String(parsed) }
      : invalid(value, "Inserire un numero intero maggiore di zero.");
  }

  if (fieldId === "immobile.superficie") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0
      ? { valid: true, value }
      : invalid(value, "La superficie utile deve essere maggiore di zero.");
  }

  if (/^schermature\.\d+\.gtot$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0 && parsed <= 0.35
      ? { valid: true, value }
      : invalid(value, "Il gTot documentato deve essere maggiore di 0 e non superiore a 0,35.");
  }

  if (/^schermature\.\d+\.dimensioni$/.test(fieldId)) {
    const match = value.match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})(?:\s*mm)?$/i);
    if (!match || Number(match[1]) < 100 || Number(match[2]) < 100) {
      return invalid(value, "Inserire larghezza × altezza in millimetri, entrambe almeno 100 mm.");
    }
    return { valid: true, value: `${Number(match[1])} × ${Number(match[2])} mm` };
  }

  if (fieldId === "impianto.rendimento") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0 && parsed <= 100
      ? { valid: true, value }
      : invalid(value, "Il rendimento deve essere maggiore di 0 e non superiore al 100%.");
  }

  if (fieldId === "impianto.potenza") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0
      ? { valid: true, value }
      : invalid(value, "La potenza nominale deve essere maggiore di zero.");
  }

  if (/^schermature\.\d+\.(?:superficie|superficie_finestrata)$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0
      ? { valid: true, value }
      : invalid(value, "Le superfici della schermatura devono essere maggiori di zero.");
  }

  if (fieldId === "schermature.superficie_totale") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0
      ? { valid: true, value }
      : invalid(value, "La superficie totale delle schermature deve essere maggiore di zero.");
  }

  if (fieldId === "schermature.spesa") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed > 0
      ? { valid: true, value }
      : invalid(value, "La spesa congrua deve essere maggiore di zero.");
  }

  if (/^(?:immobile\.gradi_giorno|schermature\.risparmio_energia|schermature\.\d+\.(?:superficie|superficie_finestrata|rsupp))$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed >= 0
      ? { valid: true, value }
      : invalid(value, "Inserire un valore numerico non negativo.");
  }

  return { valid: true, value };
}
