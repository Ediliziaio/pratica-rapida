import {
  CALDAIA_LABELS,
  COMBUSTIBILE_LABELS,
  IMPIANTO_TIPO_LABELS,
  SCHERMATURA_DIREZIONE_LABELS,
  SCHERMATURA_TIPO_LABELS,
  TERMINALI_LABELS,
  TIPOLOGIA_LABELS,
  TITOLO_LABELS,
  isValidPhone,
} from "@/types/form-cliente";

export interface EneaLabOperatorValidation {
  valid: boolean;
  value: string;
  message?: string;
}

function parseItalianNumber(value: string): number | null {
  if (!/\d/.test(value)) return null;
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

  if (fieldId === "beneficiario.email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return invalid(value, "Indirizzo email non valido.");
  }

  if (fieldId === "beneficiario.telefono" && !isValidPhone(value)) {
    return invalid(value, "Il telefono deve contenere da 9 a 13 cifre.");
  }

  if (fieldId === "beneficiario.sesso") {
    return allowedValue(value.toUpperCase(), ["M", "F"], "Indicare M oppure F.");
  }

  if (/^(?:beneficiario\.abitazione_principale|beneficiario\.cointestazione|impianto\.condizionamento|intervento\.accorpamenti)$/.test(fieldId)) {
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
    "impianto.tipo": Object.values(IMPIANTO_TIPO_LABELS),
    "impianto.terminali": Object.values(TERMINALI_LABELS),
    "impianto.generatore": Object.values(CALDAIA_LABELS),
    "impianto.combustibile": Object.values(COMBUSTIBILE_LABELS),
  };
  const allowedLabels = labelSets[fieldId];
  if (allowedLabels) {
    return allowedValue(value, allowedLabels, "Selezionare uno dei valori previsti dal modulo.");
  }

  if (/^schermature\.\d+\.tipo$/.test(fieldId)) {
    return allowedValue(value, Object.values(SCHERMATURA_TIPO_LABELS), "Selezionare un tipo di schermatura previsto.");
  }

  if (/^schermature\.\d+\.esposizione$/.test(fieldId)) {
    return allowedValue(value, Object.values(SCHERMATURA_DIREZIONE_LABELS), "L'esposizione deve essere Sud, Sud-Est, Sud-Ovest, Est oppure Ovest.");
  }

  if (/^(?:beneficiario\.cf|beneficiario\.cointestatario_cf)$/.test(fieldId)) {
    const normalized = value.replace(/\s/g, "").toUpperCase();
    if (!/^(?:[A-Z0-9]{16}|\d{11})$/.test(normalized)) {
      return invalid(value, "Il codice fiscale deve avere 16 caratteri; per un soggetto IVA sono ammesse 11 cifre.");
    }
    return { valid: true, value: normalized };
  }

  if (/^(?:beneficiario\.data_nascita|intervento\.data_inizio|intervento\.data_fine)$/.test(fieldId)) {
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
    const year = Number(value);
    const currentYear = new Date().getFullYear();
    return Number.isInteger(year) && year >= 1000 && year <= currentYear
      ? { valid: true, value }
      : invalid(value, `Inserire un anno compreso tra 1000 e ${currentYear}.`);
  }

  if (fieldId === "schermature.numero") {
    const parsed = parseItalianNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 && parsed <= 50
      ? { valid: true, value: String(parsed) }
      : invalid(value, "Inserire un numero intero di schermature compreso tra 1 e 50.");
  }

  if (/^(?:immobile\.unita|intervento\.unita_totali|intervento\.unita_oggetto)$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0
      ? { valid: true, value }
      : invalid(value, "Inserire un numero intero maggiore di zero.");
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

  if (/^(?:immobile\.gradi_giorno|immobile\.superficie|impianto\.potenza|schermature\.(?:spesa|superficie_totale|risparmio_energia)|schermature\.\d+\.(?:superficie|superficie_finestrata|rsupp))$/.test(fieldId)) {
    const parsed = parseItalianNumber(value);
    return parsed !== null && parsed >= 0
      ? { valid: true, value }
      : invalid(value, "Inserire un valore numerico non negativo.");
  }

  return { valid: true, value };
}
