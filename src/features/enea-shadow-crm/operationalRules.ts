import { isValidCodiceFiscale } from "@/components/form-cliente/validation-utils";
import { ANPR_FOREIGN_BIRTH_COUNTRIES } from "./anprForeignBirthCountries.generated";

export const OPERATIONAL_RULES = Object.freeze({
  "ricevuta_at": "Metadata interno: non alimenta ENEA e non blocca se assente.",
  "beneficiario.nazione_nascita": "Italia se la provincia di nascita è italiana; per nascita estera usare soltanto la nazione verificata dal codice catastale del CF nel registro istituzionale ANPR/MAECI; altrimenti intervento operatore.",
  "beneficiario.nazione_residenza": "Italia se la provincia di residenza è italiana; altrimenti intervento operatore.",
  "beneficiario.aliquota": "Abitazione principale secondo aliquota applicabile; seconda casa 36%.",
  "beneficiario.cf": "Il form prevale se il CF è valido; se è formalmente invalido prevale un CF valido e coerente da documento originario.",
  "immobile.codice_comune": "Auto-compilato da ENEA: non ricavare, memorizzare o richiedere al CRM ombra.",
  "immobile.gradi_giorno": "Auto-compilati da ENEA dopo la selezione del Comune.",
  "immobile.zona_climatica": "Derivata dal Comune nel portale ENEA: non è richiesta al CRM ombra.",
  "immobile.fascia_solare": "Determinata dal portale ENEA: non è richiesta al CRM ombra.",
  "intervento.data_fine_lavori": "La data esplicita del form prevale; se manca usare la data più recente dell'ultima fattura originaria valida. Nei collaudi APR su portale reale, oltre 90 giorni o anno diverso dal portale: Richiesto intervento operatore, senza sostituire la data.",
  "intervento.data_inizio_lavori": "Può coincidere con la fine lavori per schermature solari.",
  "intervento.unita_totali_edificio": "Distinta dalle unità interessate; incoerenze con la tipologia edilizia richiedono operatore.",
  "intervento.unita_interessate": "Numero delle sole unità oggetto della detrazione, mai usato come totale edificio.",
  "intervento.accorpamenti": "No per le schermature solari.",
  "schermature.superficie_finestrata": "Fonte verificata prevale; zanzariera da misura reale; altrimenti policy deterministica v1 tra 1,9 e 3,1 m² da pratica+riga.",
  "schermature.meccanismo": "Una fonte specifica verificata prevale; arganello o molla indicano movimentazione manuale; se la movimentazione non è specificata usare Manuale secondo policy operativa confermata dall'utente.",
  "impianto.tipo_distribuzione": "Prima voce disponibile; con riscaldamento a pavimento: orizzontale ad anello.",
  "impianto.rendimento": "Dato reale se presente; altrimenti 96,5–99,1 stabile per pratica, escluso Ideal Sistem.",
  "impianto.potenza": "Dato reale se presente; altrimenti 24,5–33,5 stabile per impronta immobile o pratica.",
  "impianto.regolazione": "Regolazione ad ambiente o a zona.",
  "schermature.gtot": "0,15 indicativo quando assente e soltanto se non si applica una regola utente specifica per Cristal o pergola.",
  "schermature.materiale": "Tessuto quando assente.",
  "schermature.esposizione": "Una esposizione esplicita per riga prevale; se assente nelle fonti originarie usare SUD.",
  "schermature.tipo_vetro": "La fonte specifica della pratica prevale; se assente usare Vetro doppio chiaro secondo policy operativa confermata dall'utente.",
  "impianto.eer_gue": "La fonte specifica della pratica prevale, incluso EER calcolato come capacità frigorifera divisa per potenza elettrica; altrimenti usare EER 6,2 secondo policy operativa confermata dall'utente.",
  "schermature.risparmio_energia": "Policy screening-energy-savings-v1: somma delle sole superfici schermatura riconciliate con provenienza valida × 16,8 kWh/anno per m², arrotondata a 2 decimali e con audit completo. Sostituisce ShadoWindow nel percorso operativo; ShadoWindow resta solo archivio esterno non usato.",
  "impianto.provenienza": "Tipo impianto e generatore richiedono provenienza esplicita; i fallback sono assunzioni operative auditabili, non fonti verificate.",
} as const);

export type FiscalCodeResolution =
  | { source: "form"; value: string }
  | { source: "original_document"; value: string }
  | { source: "operator_required"; value: null; reason: "missing_or_invalid" | "identity_conflict" };

export function resolveBeneficiaryFiscalCode(input: {
  formFiscalCode?: string | null;
  originalDocumentFiscalCode?: string | null;
  documentCoherentWithIdentity?: boolean;
}): FiscalCodeResolution {
  const formFiscalCode = input.formFiscalCode?.trim().toUpperCase() ?? "";
  const documentFiscalCode = input.originalDocumentFiscalCode?.trim().toUpperCase() ?? "";
  if (isValidCodiceFiscale(documentFiscalCode) && input.documentCoherentWithIdentity === true) return { source: "original_document", value: documentFiscalCode };
  if (isValidCodiceFiscale(documentFiscalCode) && input.documentCoherentWithIdentity === false) return { source: "operator_required", value: null, reason: "identity_conflict" };
  if (isValidCodiceFiscale(formFiscalCode)) return { source: "form", value: formFiscalCode };
  if (isValidCodiceFiscale(documentFiscalCode)) return { source: "operator_required", value: null, reason: "identity_conflict" };
  return { source: "operator_required", value: null, reason: "missing_or_invalid" };
}

export interface FiscalCodeIdentity {
  surname: string;
  name: string;
  birthDate: string;
  sex: "M" | "F";
  birthPlaceCode: string;
}

export type FiscalCodePartialIdentity = Omit<FiscalCodeIdentity, "birthPlaceCode">;

/**
 * Registro completo e versionato dei codici catastali esteri ammessi per la
 * nascita dalla tabella istituzionale ANPR/MAECI. Un codice non presente non
 * viene mai dedotto: resta un dato da sottoporre all'operatore.
 */
export const VERIFIED_FOREIGN_BIRTH_COUNTRIES = ANPR_FOREIGN_BIRTH_COUNTRIES;

export type VerifiedForeignBirthCountry = (typeof VERIFIED_FOREIGN_BIRTH_COUNTRIES)[keyof typeof VERIFIED_FOREIGN_BIRTH_COUNTRIES];

export function resolveForeignBirthCountryFromFiscalCode(fiscalCode: string | null | undefined):
  | ({ placeCode: string } & VerifiedForeignBirthCountry)
  | null {
  const clean = fiscalCode?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (!isValidCodiceFiscale(clean)) return null;
  const placeCode = clean.slice(11, 15);
  const resolved = VERIFIED_FOREIGN_BIRTH_COUNTRIES[placeCode as keyof typeof VERIFIED_FOREIGN_BIRTH_COUNTRIES];
  return resolved ? { placeCode, ...resolved } : null;
}

const FISCAL_CODE_MONTHS = "ABCDEHLMPRST";

function fiscalCodeLetters(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/gi, "").toUpperCase();
}

function surnameFiscalCode(value: string) {
  const letters = fiscalCodeLetters(value);
  const consonants = letters.replace(/[AEIOU]/g, "");
  const vowels = letters.replace(/[^AEIOU]/g, "");
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

function nameFiscalCode(value: string) {
  const letters = fiscalCodeLetters(value);
  const consonants = letters.replace(/[AEIOU]/g, "");
  if (consonants.length >= 4) return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  const vowels = letters.replace(/[^AEIOU]/g, "");
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

function parseFiscalCodeBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

/**
 * Verifica i segmenti anagrafici che possono essere dimostrati dal form senza
 * ricavare o inventare il codice catastale del comune di nascita. Il controllo
 * completo resta disponibile in `fiscalCodeMatchesIdentity` quando anche il
 * codice Belfiore e' una fonte esplicita.
 */
export function fiscalCodeMatchesPartialIdentity(fiscalCode: string, identity: FiscalCodePartialIdentity): boolean {
  const clean = fiscalCode.replace(/\s+/g, "").toUpperCase();
  const birthDate = parseFiscalCodeBirthDate(identity.birthDate);
  if (!birthDate || !isValidCodiceFiscale(clean)) return false;
  const encodedDay = birthDate.day + (identity.sex === "F" ? 40 : 0);
  const identityPrefix = [
    surnameFiscalCode(identity.surname),
    nameFiscalCode(identity.name),
    String(birthDate.year).slice(-2),
    FISCAL_CODE_MONTHS[birthDate.month - 1],
    String(encodedDay).padStart(2, "0"),
  ].join("");
  return clean.slice(0, 11) === identityPrefix;
}

const FISCAL_CODE_OCR_CONFUSABLES = Object.freeze<Record<string, readonly string[]>>({
  "0": ["O"], O: ["0"], "1": ["I", "L"], I: ["1"], L: ["1"],
  "2": ["Z"], Z: ["2"], "5": ["S"], S: ["5"], "6": ["G"], G: ["6"],
  "8": ["B"], B: ["8"],
});

/** Ripara un solo carattere OCR confondibile solo se checksum e anagrafica
 * producono una variante univoca. Non genera il codice catastale. */
export function repairFiscalCodeSingleOcrConfusable(input: {
  fiscalCode?: string | null;
  surname: string;
  name: string;
  birthDate: string;
}): { original: string; corrected: string; position: number } | null {
  const original = input.fiscalCode?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (!/^[A-Z0-9]{16}$/.test(original) || isValidCodiceFiscale(original)) return null;
  const candidates: Array<{ corrected: string; position: number }> = [];
  for (let position = 0; position < original.length; position += 1) {
    for (const replacement of FISCAL_CODE_OCR_CONFUSABLES[original[position]] ?? []) {
      const corrected = `${original.slice(0, position)}${replacement}${original.slice(position + 1)}`;
      if (!isValidCodiceFiscale(corrected)) continue;
      const identityMatches = (["M", "F"] as const).some((sex) => fiscalCodeMatchesPartialIdentity(corrected, {
        surname: input.surname, name: input.name, birthDate: input.birthDate, sex,
      }));
      if (identityMatches) candidates.push({ corrected, position });
    }
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.corrected, candidate])).values()];
  return unique.length === 1 ? { original, ...unique[0] } : null;
}

/** Verifica locale deterministica: checksum e segmenti anagrafici devono coincidere. */
export function fiscalCodeMatchesIdentity(fiscalCode: string, identity: FiscalCodeIdentity): boolean {
  const clean = fiscalCode.replace(/\s+/g, "").toUpperCase();
  const birthDate = parseFiscalCodeBirthDate(identity.birthDate);
  const placeCode = identity.birthPlaceCode.trim().toUpperCase();
  if (!birthDate || !/^[A-Z]\d{3}$/.test(placeCode) || !isValidCodiceFiscale(clean)) return false;
  return fiscalCodeMatchesPartialIdentity(clean, identity) && clean.slice(11, 15) === placeCode;
}

const ITALIAN_PROVINCES = new Set([
  "ag", "al", "an", "ao", "ap", "aq", "ar", "at", "av", "ba", "bg", "bi", "bl", "bn", "bo", "br", "bs", "bt", "bz", "ca", "cb", "ce", "ch", "ci", "cl", "cn", "co", "cr", "cs", "ct", "cz", "en", "fc", "fe", "fg", "fi", "fm", "fr", "ge", "go", "gr", "im", "is", "kr", "lc", "le", "li", "lo", "lt", "lu", "mb", "mc", "me", "mi", "mn", "mo", "ms", "mt", "na", "no", "nu", "og", "or", "ot", "pa", "pc", "pd", "pe", "pg", "pi", "pn", "po", "pr", "pt", "pu", "pv", "pz", "ra", "rc", "re", "rg", "ri", "rm", "rn", "ro", "sa", "si", "so", "sp", "sr", "ss", "su", "sv", "ta", "te", "tn", "to", "tp", "tr", "ts", "tv", "ud", "va", "vb", "vc", "ve", "vi", "vr", "vs", "vt", "vv",
  "agrigento", "alessandria", "ancona", "aosta", "ascoli piceno", "laquila", "arezzo", "asti", "avellino", "bari", "bergamo", "biella", "belluno", "benevento", "bologna", "brindisi", "brescia", "barletta andria trani", "bolzano", "cagliari", "campobasso", "caserta", "chieti", "caltanissetta", "cuneo", "como", "cremona", "cosenza", "catania", "catanzaro", "enna", "forli cesena", "ferrara", "foggia", "firenze", "fermo", "frosinone", "genova", "gorizia", "grosseto", "imperia", "isernia", "crotone", "lecco", "lecce", "livorno", "lodi", "latina", "lucca", "monza e brianza", "monza brianza", "macerata", "messina", "milano", "mantova", "modena", "massa carrara", "matera", "napoli", "novara", "nuoro", "oristano", "palermo", "piacenza", "padova", "pescara", "perugia", "pisa", "pordenone", "prato", "parma", "pistoia", "pesaro e urbino", "pavia", "potenza", "ravenna", "reggio calabria", "reggio emilia", "ragusa", "rieti", "roma", "rimini", "rovigo", "salerno", "siena", "sondrio", "la spezia", "siracusa", "sassari", "sud sardegna", "savona", "taranto", "teramo", "trento", "torino", "trapani", "terni", "trieste", "treviso", "udine", "varese", "verbano cusio ossola", "vercelli", "venezia", "vicenza", "verona", "viterbo", "vibo valentia",
]);

export function birthNationFromProvince(province: string): { source: "italian_province"; value: "Italia" } | { source: "operator_required"; value: null } {
  const normalized = province.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/gi, " ").trim().toLowerCase();
  const parts = normalized.split(/\s+/);
  const trailingCode = parts.at(-1) ?? "";
  return (ITALIAN_PROVINCES.has(normalized) || (trailingCode.length === 2 && ITALIAN_PROVINCES.has(trailingCode)))
    ? { source: "italian_province", value: "Italia" }
    : { source: "operator_required", value: null };
}

export const residenceNationFromProvince = birthNationFromProvince;

export type ShadowWindowGlassType =
  | "vetro_singolo_chiaro"
  | "vetro_doppio_chiaro"
  | "vetro_doppio_basso_emissivo"
  | "vetro_triplo_basso_emissivo";

export function verifiedShadowWindowGlassType(value?: ShadowWindowGlassType | null) {
  return value
    ? { source: "practice_source" as const, value }
    : { source: "user_confirmed_operational_policy" as const, value: "vetro_doppio_chiaro" as const };
}

export interface CoolingPerformanceInput {
  eer?: number | null;
  gue?: number | null;
  coolingCapacityKw?: number | null;
  absorbedPowerKw?: number | null;
}

export interface ShadowWindowTestAssumptions {
  mode: "test_not_submittable";
  glassType: ShadowWindowGlassType;
  coolingEfficiency: number;
  suppliedBy: "user";
}

export function shadowWindowTestAssumptions(
  glassType: ShadowWindowGlassType,
  coolingEfficiency: number,
): ShadowWindowTestAssumptions | null {
  return Number.isFinite(coolingEfficiency) && coolingEfficiency > 0
    ? { mode: "test_not_submittable", glassType, coolingEfficiency, suppliedBy: "user" }
    : null;
}

export function resolveCoolingPerformance(input: CoolingPerformanceInput):
  | { source: "verified_eer" | "verified_gue" | "calculated_eer" | "user_confirmed_operational_policy"; value: number; formula: string | null } {
  if (typeof input.eer === "number" && Number.isFinite(input.eer) && input.eer > 0) {
    return { source: "verified_eer", value: input.eer, formula: null };
  }
  if (typeof input.gue === "number" && Number.isFinite(input.gue) && input.gue > 0) {
    return { source: "verified_gue", value: input.gue, formula: null };
  }
  if (typeof input.coolingCapacityKw === "number" && Number.isFinite(input.coolingCapacityKw)
    && typeof input.absorbedPowerKw === "number" && Number.isFinite(input.absorbedPowerKw)
    && input.coolingCapacityKw > 0 && input.absorbedPowerKw > 0) {
    return {
      source: "calculated_eer",
      value: Math.round((input.coolingCapacityKw / input.absorbedPowerKw) * 1000) / 1000,
      formula: `${input.coolingCapacityKw} kW / ${input.absorbedPowerKw} kW`,
    };
  }
  return { source: "user_confirmed_operational_policy", value: 6.2, formula: null };
}

export type OperationalRuleField = keyof typeof OPERATIONAL_RULES;

export function operationalRuleFor(field: string): string | null {
  return Object.prototype.hasOwnProperty.call(OPERATIONAL_RULES, field)
    ? OPERATIONAL_RULES[field as OperationalRuleField]
    : null;
}

export function isPortalManagedField(field: string): boolean {
  return field === "immobile.codice_comune"
    || field === "immobile.gradi_giorno"
    || field === "immobile.zona_climatica"
    || field === "immobile.fascia_solare";
}

function stableTenths(key: string, minimumTenths: number, span: number): number {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return minimumTenths + ((hash >>> 0) % span);
}

export function normalizeBuildingFingerprint(address: string, cadastralData: string): string | null {
  const normalize = (value: string) => value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const normalizedAddress = normalize(address);
  const normalizedCadastral = normalize(cadastralData);
  if (!normalizedAddress || !normalizedCadastral) return null;
  const opaqueKey = `${normalizedAddress}:${normalizedCadastral}`;
  let hash = 2166136261;
  for (const char of opaqueKey) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `building-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function indicativeGeneratorEfficiency(practiceKey: string): number {
  return stableTenths(practiceKey, 965, 27) / 10;
}

export function indicativeGeneratorPower(practiceKey: string, buildingFingerprint?: string | null): number {
  return stableTenths(buildingFingerprint || practiceKey, 245, 91) / 10;
}

export const PROTECTED_WINDOW_POLICY_VERSION = "protected-window-v1";

export function deterministicProtectedWindowSurface(practiceId: string, rowId: string) {
  const seed = `${practiceId.trim()}:${rowId.trim()}`;
  if (!practiceId.trim() || !rowId.trim()) return null;
  return {
    value: stableTenths(seed, 19, 13) / 10,
    source: "operational_assumption" as const,
    policyVersion: PROTECTED_WINDOW_POLICY_VERSION,
    seed,
  };
}

export function resolveScreeningMechanism(
  description: string,
  explicit?: { value: "manuale" | "automatico"; sourceId: string; verified: boolean } | null,
) {
  const normalized = description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const manualDescription = /\barganell[oi]\b|\bmoll[ae]\b/.test(normalized);
  if (explicit?.verified && explicit.sourceId.trim()) {
    return { value: explicit.value, source: explicit.sourceId, conflict: manualDescription && explicit.value === "automatico" } as const;
  }
  if (manualDescription) return { value: "manuale", source: "product_description", conflict: false } as const;
  if (/motoriz|motore|automatic/.test(normalized)) return { value: "automatico", source: "product_description", conflict: false } as const;
  return { value: "manuale", source: "user_confirmed_operational_policy", conflict: false } as const;
}
