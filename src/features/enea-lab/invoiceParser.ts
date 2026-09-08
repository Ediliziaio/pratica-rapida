import type {
  EneaLabDocumentAnalysis,
  EneaLabDocumentResult,
  EneaLabScreeningItem,
} from "./types";

const MAX_SCREENING_QUANTITY = 50;
const PERSIANA_RULE_ID = "user-2026-08-31-persiana-screening-contract-v2";
const AVVOLGIBILE_RULE_ID = "user-2026-08-31-avvolgibile-screening-contract-v2";
const SCREENING_DIMENSION_SURFACE_RULE_ID = "user-2026-08-26-screening-dimension-unit-surface-coherence-v1";
export const POSITIONED_TECHNICAL_ORDER_PRODUCTS_RULE_ID = "system-positioned-technical-order-products-v1" as const;
export const INLINE_DESCRIPTION_PRODUCT_MEASUREMENTS_RULE_ID = "system-inline-description-product-measurements-v1" as const;
export const TABULAR_EQUAL_PRICE_AMOUNT_SINGLE_QUANTITY_RULE_ID = "system-tabular-equal-price-amount-single-quantity-v1" as const;
export const DIMENSIONED_AWNING_ROW_PRESERVATION_RULE_ID = "system-dimensioned-awning-row-preservation-v1" as const;
export const LABELLED_SCREENING_DEPTH_ABBREVIATION_RULE_ID = "system-labelled-screening-depth-abbreviation-v1" as const;
export const GENERIC_LABELLED_MEASUREMENT_PAIR_AREA_RULE_ID = "user-2026-09-07-generic-two-measurement-screening-area-fallback-v1" as const;
export const LINEA_SOLE_POTITO_SCOMPARSA_TOTALE_MODEL_CODE_TOLERANCE_RULE_ID = "user-2026-09-07-linea-sole-potito-scomparsa-totale-model-code-tolerance-v1" as const;
export const FINESTRA_ITALIA_POSITIONAL_DIMENSION_NOTATION_RULE_ID = "user-2026-09-07-finestra-italia-positional-dimension-notation-v1" as const;
export const MULTIPLE_MEASUREMENT_PAIRS_ALWAYS_DISTINCT_PRODUCTS_RULE_ID = "user-2026-09-07-multiple-measurement-pairs-always-distinct-products-v1" as const;
export const LAST_BARE_TOTALE_OCCURRENCE_WINS_RULE_ID = "user-2026-09-07-last-bare-totale-occurrence-wins-v1" as const;
export const UNLABELLED_UNAMBIGUOUS_MEASUREMENT_PAIR_RULE_ID = "user-2026-09-07-unlabelled-unambiguous-measurement-pair-v1" as const;
export const ZANZASOL_PLURAL_HEADER_AND_GTOT_PERIOD_TOLERANCE_RULE_ID = "user-2026-09-07-zanzasol-plural-header-and-gtot-period-tolerance-v1" as const;
export const LM_TENDE_NARRATIVE_AWNING_MEASUREMENT_RULE_ID = "user-2026-09-07-lm-tende-narrative-awning-measurement-v1" as const;
export const LINEA_SOLE_POTITO_MODELLO_LABEL_DIMENSION_RULE_ID = "user-2026-09-08-linea-sole-potito-modello-label-dimension-v1" as const;
export const LINEA_SOLE_POTITO_DIMENSION_BEFORE_SCOMPARSA_LABEL_RULE_ID = "user-2026-09-08-linea-sole-potito-dimension-before-scomparsa-label-v1" as const;
export const LM_TENDE_SALDO_DIMENSION_CONNECTOR_PREPOSITION_RULE_ID = "user-2026-09-08-lm-tende-saldo-dimension-connector-preposition-v1" as const;
export const DOTTED_NUMBERED_HEADER_DATE_OVER_NARRATIVE_REFERENCE_RULE_ID = "user-2026-09-08-dotted-numbered-header-date-over-narrative-reference-v1" as const;
export const VAILA_OPEN_HOUSE_PERGOTENDA_ORDER_FORM_DIMENSION_RULE_ID = "user-2026-09-08-vaila-open-house-pergotenda-order-form-dimension-v1" as const;
export const SCHERMATURA_SOLARE_NARRATIVE_SINGLE_PRODUCT_TRIGGER_RULE_ID = "user-2026-09-08-schermatura-solare-narrative-single-product-trigger-v1" as const;
export const MULTISERVICE_HOME_MULTI_MEASURE_NARRATIVE_RULE_ID = "user-2026-09-08-multiservice-home-multi-measure-narrative-v1" as const;
export const VENEZIANA_PERSIANA_EQUIVALENT_TREATMENT_RULE_ID = "user-2026-09-08-veneziana-persiana-equivalent-treatment-v1" as const;
export const NARRATIVE_PAYMENT_SENTENCE_AWNING_DIMENSION_RULE_ID = "user-2026-09-08-narrative-payment-sentence-awning-dimension-v1" as const;
export const ZANZASOL_NARRATIVE_QUANTITY_FROM_PRICE_ROW_RULE_ID = "user-2026-09-08-zanzasol-narrative-quantity-from-price-row-v1" as const;
export const ARCHITECTURAL_OPENING_LABEL_OVER_INCIDENTAL_NUMBER_PAIR_RULE_ID = "user-2026-09-08-architectural-opening-label-over-incidental-number-pair-v1" as const;
export const FINESTRA_ITALIA_SEPARATED_LABEL_VALUE_BLOCK_DOCUMENT_IDENTITY_RULE_ID = "user-2026-09-08-finestra-italia-separated-label-value-block-document-identity-v1" as const;
export const TOTALE_CONTRATTO_COMMESSA_NEVER_DOCUMENT_TOTAL_RULE_ID = "user-2026-09-08-totale-contratto-commessa-never-document-total-v1" as const;
export const FINESTRA_ITALIA_SCADENZE_INTERVENING_LABEL_VERTICAL_RECAP_RULE_ID = "user-2026-09-08-finestra-italia-scadenze-intervening-label-vertical-recap-v1" as const;
const SCREENING_SURFACE_RELATIVE_TOLERANCE = 0.05;

type ScreeningMeasureUnit = "m" | "cm" | "mm";
type ScreeningMeasureResolution = "explicit_m" | "explicit_cm" | "explicit_mm" | "surface_reconciled_m" | "surface_reconciled_cm" | "surface_reconciled_mm" | "inferred_m" | "inferred_cm" | "inferred_mm";

function screeningUnitMultiplier(unit: ScreeningMeasureUnit): number {
  return unit === "m" ? 1_000 : unit === "cm" ? 10 : 1;
}

function screeningSurfaceM2(width: number, height: number, unit: ScreeningMeasureUnit): number {
  const multiplier = screeningUnitMultiplier(unit);
  return roundSurface((width * multiplier * height * multiplier) / 1_000_000);
}

function screeningSurfaceDifference(calculated: number, explicit: number): number {
  return explicit > 0 ? Math.abs(calculated - explicit) / explicit : Number.POSITIVE_INFINITY;
}

function screeningSurfacesAreCoherent(calculated: number, explicit: number): boolean {
  return screeningSurfaceDifference(calculated, explicit) <= SCREENING_SURFACE_RELATIVE_TOLERANCE + Number.EPSILON;
}

function resolveScreeningMeasurePair(
  width: number,
  height: number,
  explicitUnit: ScreeningMeasureUnit | null,
  explicitSurfaceM2: number | null,
): { widthMm: number; heightMm: number; unit: ScreeningMeasureUnit; resolution: ScreeningMeasureResolution } {
  let unit = explicitUnit;
  let resolution: ScreeningMeasureResolution | null = explicitUnit ? `explicit_${explicitUnit}` : null;
  if (!unit && explicitSurfaceM2 !== null) {
    const coherentUnits = (["m", "cm", "mm"] as const)
      .filter((candidate) => screeningSurfacesAreCoherent(screeningSurfaceM2(width, height, candidate), explicitSurfaceM2));
    if (coherentUnits.length === 1) {
      unit = coherentUnits[0];
      resolution = `surface_reconciled_${unit}`;
    }
  }
  if (!unit) {
    const maximum = Math.max(width, height);
    unit = maximum <= 20 ? "m" : maximum < 2_000 ? "cm" : "mm";
    resolution = `inferred_${unit}`;
  }
  const multiplier = screeningUnitMultiplier(unit);
  return { widthMm: Math.round(width * multiplier), heightMm: Math.round(height * multiplier), unit, resolution: resolution! };
}

export type PersianaMeasureAxis = "width" | "height";
export type PersianaMeasureResolution = "explicit_cm" | "explicit_mm" | "inferred_cm" | "inferred_mm" | "ambiguous";
export const PERSIANA_MEASURE_LIMITS_MM = {
  width: { minimum: 500, maximum: 4_000 },
  height: { minimum: 450, maximum: 3_200 },
} as const;

export function normalizePersianaMeasure(
  rawValue: number,
  axis: PersianaMeasureAxis,
  explicitUnit: "cm" | "mm" | null,
): { millimeters: number; resolution: PersianaMeasureResolution } | null {
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
  const limits = PERSIANA_MEASURE_LIMITS_MM[axis];
  const withinLimits = (millimeters: number) => millimeters >= limits.minimum && millimeters <= limits.maximum;
  if (explicitUnit === "cm") return withinLimits(rawValue * 10) ? { millimeters: Math.round(rawValue * 10), resolution: "explicit_cm" } : null;
  if (explicitUnit === "mm") return withinLimits(rawValue) ? { millimeters: Math.round(rawValue), resolution: "explicit_mm" } : null;
  if (withinLimits(rawValue * 10)) return { millimeters: Math.round(rawValue * 10), resolution: "inferred_cm" };
  if (withinLimits(rawValue)) return { millimeters: Math.round(rawValue), resolution: "inferred_mm" };
  return null;
}

const HISTORICAL_ENEA_APPENDIX = /\n\s*CPID\s*\n[\s\S]{0,240}?\bData\s+chiusura\b/i;

export function containsHistoricalEneaAppendix(text: string): boolean {
  return HISTORICAL_ENEA_APPENDIX.test(text);
}

export function stripHistoricalEneaAppendix(text: string): string {
  const match = HISTORICAL_ENEA_APPENDIX.exec(text);
  return match?.index === undefined ? text : text.slice(0, match.index);
}

function parseItalianNumber(value: string): number | null {
  const normalized = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSurfaceNumber(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Regola generale (Giuliano, 2026-09-07): l'estrazione delle misure tecniche
 * non deve mai leggere, interpretare o verificare i dati economici della
 * fattura (importi, aliquote IVA, percentuali di acconto/saldo). Quando
 * l'estrazione tabellare OCR intercala queste righe fra una descrizione
 * tecnica e la sua misura, vanno soltanto saltate come rumore — non lette,
 * non usate per validare nulla — mai richieste ne' vietate.
 */
function stripInvoicePricingNoiseLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*€?\s*[0-9][0-9.]*,[0-9]{2}\s*€?(?:\s*\d{1,2}\s*%)?\s*$/i.test(line)
      && !/^\s*\d{1,3}\s*%\)?\s*$/.test(line))
    .join("\n");
}

function roundSurface(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function toIsoDate(value: string): string | undefined {
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4}|\d{2})$/);
  if (!match) return undefined;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const iso = `${year}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(match[2])
    && parsed.getUTCDate() === Number(match[1])
    ? iso
    : undefined;
}

function documentIdentity(document: EneaLabDocumentResult): string | null {
  if (document.documentType === "unknown" || !document.documentNumber || !document.documentDate || document.total === null) {
    return null;
  }
  return [
    document.documentType,
    document.documentNumber.replace(/\s+/g, "").toLocaleUpperCase("it"),
    document.documentDate,
    document.total.toFixed(2),
  ].join("|");
}

function extractDocumentIdentity(text: string): {
  documentNumber?: string;
  documentDate?: string;
} {
  // Regressione Cirillo: alcune fatture (fatturazione elettronica emessa da
  // intermediario terzo, es. "Fattura emessa da soggetto terzo") stampano
  // l'intestazione come "Fattura\nNumero: <n>\n<data con i punti>"
  // (es. "26.02.2025", non "26/02/2025"). Nessun controllo precedente in
  // questa funzione riconosce la data con i punti: senza questo controllo,
  // l'identita' del documento cadeva sull'unica data in formato "/" trovata
  // altrove nel testo - qui la data di una fattura precedente del 2024,
  // citata soltanto come riferimento in una riga "a detrarre" - scambiando
  // un semplice riferimento a un credito pregresso per la data del
  // documento corrente. Controllato per primo perche' l'intestazione con i
  // punti e' un'ancora piu' specifica e affidabile di qualunque riferimento
  // narrativo altrove nel corpo del documento.
  const dottedNumberedHeader = text.match(/(?:^|\n)\s*Fattura\s*\n\s*Numero\s*:\s*([A-Z0-9./-]+)\s*\n\s*(\d{2})\.(\d{2})\.(\d{4})\b/i);
  if (dottedNumberedHeader) return {
    documentNumber: dottedNumberedHeader[1].trim(),
    documentDate: toIsoDate(`${dottedNumberedHeader[2]}/${dottedNumberedHeader[3]}/${dottedNumberedHeader[4]}`),
  };
  // OCR Vision puo restituire una testata tabellare in ordine visuale inverso
  // (valori prima delle rispettive etichette). Numero e data vengono scelti
  // soltanto dentro una singola pagina che contiene l'intero set di etichette
  // Ideal Sistem; la selezione per distanza deve avere un vincitore univoco.
  if (/\bTipo\s+documento\b/i.test(text) && /\bNum\.\s*Doc\.?\b/i.test(text)
    && /\bData\s+Docum\.?\b/i.test(text) && /\bFATTURA\b/i.test(text)) {
    const numberLabelIndex = text.search(/\bNum\.\s*Doc\.?\b/i);
    const dateLabelIndex = text.search(/\bData\s+Docum\.?\b/i);
    const numberCandidates = [...text.matchAll(/(?:^|\n)\s*(\d{2,8}\/\d{2,4})\s*(?=\n|$)/g)]
      .map((match) => ({ value: match[1], distance: Math.abs((match.index ?? 0) - numberLabelIndex) }))
      .sort((left, right) => left.distance - right.distance);
    const dateCandidates = [...text.matchAll(/(?:^|\n)\s*(\d{2}\/\d{2}\/\d{4})\s*(?=\n|$)/g)]
      .map((match) => ({ value: match[1], distance: Math.abs((match.index ?? 0) - dateLabelIndex) }))
      .sort((left, right) => left.distance - right.distance);
    if (numberCandidates[0] && dateCandidates[0]
      && numberCandidates[0].distance !== numberCandidates[1]?.distance
      && dateCandidates[0].distance !== dateCandidates[1]?.distance) {
      return { documentNumber: numberCandidates[0].value, documentDate: toIsoDate(dateCandidates[0].value) };
    }
  }
  const sdiPaDigitale = text.match(/\bTD0\d\s+fattura\s+([A-Z0-9./-]+)\s+(\d{2}[/-]\d{2}[/-]\d{4})/i);
  if (sdiPaDigitale) return { documentNumber: sdiPaDigitale[1].trim(), documentDate: toIsoDate(sdiPaDigitale[2]) };
  // Una scansione tabellare puo conservare numero e data ma perdere la loro
  // adiacenza. Accettiamo il numero dalla testata fiscale esplicita soltanto
  // quando l'intera pagina contiene una sola data civile distinta. Date
  // discordanti mantengono l'identita irrisolta e il gate fail-closed.
  const accompanyingHeader = text.match(/(?:^|\n)\s*FATTURA\s+ACCOMPAGNATORIA\s+([A-Z0-9./-]+)\s*(?:\n|$)/i);
  if (accompanyingHeader) {
    const uniqueDates = [...new Set([...text.matchAll(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/g)].map((match) => match[1]))];
    if (uniqueDates.length === 1) return { documentNumber: accompanyingHeader[1].trim(), documentDate: toIsoDate(uniqueDates[0]) };
  }
  // Variante Ideal Sistem nella quale la data del documento e' stampata
  // prima del valore FATTURA/numero. La distanza dopo la data e' vincolata a
  // due righe della stessa testata: in questo modo riferimenti narrativi o
  // totali presenti piu' avanti non possono diventare identita' fiscali.
  const verticalDateBeforeNumber = text.match(/\bData\s+Docum\.?[^\f]{0,160}?(\d{2}[/-]\d{2}[/-]\d{4})\s*\n(?:[^\n]*\n){0,2}\s*FATTURA\s*\n\s*([A-Z0-9./-]+)/i);
  if (verticalDateBeforeNumber) return { documentNumber: verticalDateBeforeNumber[2].trim(), documentDate: toIsoDate(verticalDateBeforeNumber[1]) };
  // Intestazione tabellare generica: eventuali colonne prima/dopo le due
  // etichette, numero e data disposti su righe separate oppure numero in coda
  // alla riga delle etichette. Il riconoscimento resta legato allo stesso
  // blocco di intestazione e non usa riferimenti narrativi nel corpo.
  const separatedNumberDate = text.match(
    /(?:^|\n)[^\n]{0,80}\bN[°º.]?\s*DOCUMENTO\s+DATA\s+DOCUMENTO(?:\s+[A-Z][A-Z ]{1,30})?\s+([A-Z0-9./-]+)\s*\n\s*(\d{2}[/-]\d{2}[/-](?:\d{4}|\d{2}))\b/i,
  );
  if (separatedNumberDate) {
    return { documentNumber: separatedNumberDate[1].trim(), documentDate: toIsoDate(separatedNumberDate[2]) };
  }
  // Regressione Biagioni/Riviera (fornitore "Finestra Italia S.r.l."): la
  // tabella anagrafica stampa TUTTE le etichette in un blocco (COD.CLI.,
  // PARTITA IVA, ..., N° DOCUMENTO DATA DOCUMENTO, PAG., CONDIZIONI DI
  // PAGAMENTO) e poi TUTTI i valori in un blocco separato molte righe dopo;
  // colonne vuote (Partita IVA, Fax, Codice Fiscale) comprimono
  // l'allineamento, e un valore segnaposto "BANCA D'APPOGGIO" si sposta di
  // posizione da un documento all'altro (a volte subito prima del numero
  // documento, a volte subito dopo). Nessun pattern sopra copre questo
  // caso: senza questo controllo il numero documento restava sempre
  // irrisolto, pur essendo scritto in chiaro, rompendo il riconoscimento
  // delle fatture di acconto richiamate da un saldo (falso blocco "fattura
  // di acconto non acquisita" anche quando la fattura richiamata era gia'
  // presente e corretta). L'unico ancoraggio affidabile e' il formato data
  // GG-MM-AA con trattini e anno a due cifre, esclusivo di questo
  // fornitore, seguito subito dal valore pagina "N/N": il numero documento
  // e' la riga immediatamente precedente quella data (l'unico scarto
  // tollerato e' il segnaposto "BANCA D'APPOGGIO", mai un'altra riga, per
  // non risalire per errore a un valore precedente come "TERRITORY").
  const finestraItaliaSeparatedBlocks = text.match(
    /\bN[°º.]?\s*DOCUMENTO\s+DATA\s+DOCUMENTO\b[\s\S]{0,400}?\n\s*([A-Z0-9][A-Z0-9./-]{0,15})\s*\n(?:\s*BANCA\s+D['’]?APPOGGIO\s*\n)?\s*(\d{2}-\d{2}-\d{2})\s*\n\s*\d{1,2}\/\d{1,2}\s*\n/i,
  );
  if (finestraItaliaSeparatedBlocks) {
    return { documentNumber: finestraItaliaSeparatedBlocks[1].trim(), documentDate: toIsoDate(finestraItaliaSeparatedBlocks[2]) };
  }
  // Layout tabellare generico nel quale il titolo Fattura precede una riga
  // "Data <valore> Numero <valore>". Numero e data devono provenire dalla
  // stessa intestazione, non da riferimenti narrativi nel corpo.
  const titledDateNumber = text.match(/(?:^|\n)\s*Fattura\s*\n\s*Data\s+(\d{2}\/\d{2}\/\d{4})\s+Numero\s+([A-Z0-9./-]+)/i);
  if (titledDateNumber) return { documentNumber: titledDateNumber[2].trim(), documentDate: toIsoDate(titledDateNumber[1]) };
  // Alcuni gestionali esportano l'intestazione in ordine visuale a colonne:
  // DATA, poi il valore data e la parola NUMERO sulla stessa riga OCR, quindi
  // PAGINA e infine "numero pagina". Questa fonte di intestazione deve
  // precedere qualunque riferimento narrativo a fatture di acconto, altrimenti
  // il numero citato nel corpo viene scambiato per il numero del documento.
  const staggeredTabularHeader = text.match(/\bDATA\s*\n\s*(\d{2}\/\d{2}\/\d{4})\s+NUMERO\s*\n\s*PAGINA\s*\n\s*([A-Z0-9./-]+)(?:\s+[0-9]+)?/i);
  if (staggeredTabularHeader) return { documentNumber: staggeredTabularHeader[2].trim(), documentDate: toIsoDate(staggeredTabularHeader[1]) };
  const tabularHeader = text.match(/\bDATA\s+NUMERO\s+PAGINA\s*\n\s*(\d{2}\/\d{2}\/\d{4})\s*\n\s*([A-Z0-9./-]+)/i);
  if (tabularHeader) return { documentNumber: tabularHeader[2].trim(), documentDate: toIsoDate(tabularHeader[1]) };
  const documentTable = text.match(/\bNUMERO\s+DOCUMENTO\s+DATA\s+DOCUMENTO\s+PAG\.?\s*\n\s*([A-Z0-9./-]+)\s+(\d{2}\/\d{2}\/\d{4})\b/i);
  if (documentTable) return { documentNumber: documentTable[1].trim(), documentDate: toIsoDate(documentTable[2]) };
  const labeled = text.match(/TIPO\s+DOCUMENTO\s+Fattura[\s\S]{0,220}?DATA\s+DOCUMENTO\s*(\d{2}\/\d{2}\/\d{4})\s+NUMERO\s+DOCUMENTO\s*([A-Z0-9][A-Z0-9./-]{0,39})/i);
  if (labeled) return { documentNumber: labeled[2].trim(), documentDate: toIsoDate(labeled[1]) };
  const courtesy = text.match(/Copia\s+di\s+cortesia\s+Fattura\s+([A-Z0-9][A-Z0-9./-]{0,39})\s+del\s+(\d{2})[-/](\d{2})[-/](\d{4})/i);
  if (courtesy) return { documentNumber: courtesy[1].trim(), documentDate: toIsoDate(`${courtesy[2]}/${courtesy[3]}/${courtesy[4]}`) };
  const vertical = text.match(/(?:^|\n)\s*(?:fattura|acconto\/anticipo\s+su\s+fattura)\s*\n\s*([A-Z0-9][A-Z0-9./-]{0,39})\s*\n\s*del\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (vertical) return { documentNumber: vertical[1].trim(), documentDate: toIsoDate(vertical[2]) };
  const match = text.match(
    /(?:nota\s+di\s+credito|fattura(?:\s+accompagnatoria)?)\s*(?:n(?:r|umero)?\.?\s*)?([A-Z0-9][A-Z0-9./-]*(?:[ \t]+[A-Z0-9][A-Z0-9./-]*)*)\s+(?:del|data)\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (!match) {
    const dateFirst = text.match(/\bDATA\s*\n\s*(\d{2}\/\d{2}\/\d{4})\s+NUMERO\s*\n(?:\s*PAGINA\s*\n)?\s*([A-Z0-9][A-Z0-9./-]{0,39})/i);
    if (dateFirst) return { documentNumber: dateFirst[2].trim(), documentDate: toIsoDate(dateFirst[1]) };
    const accompanying = text.match(/fattura\s+accompagnatoria\s+([^\s\n]{1,40})\s+(?:data\s*)?\n?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!accompanying) return {};
    return { documentNumber: accompanying[1].trim(), documentDate: toIsoDate(accompanying[2]) };
  }
  return {
    documentNumber: match[1].trim(),
    documentDate: toIsoDate(match[2]),
  };
}

function extractDocumentTotal(text: string): number | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const amount = (value: string) => [...value.matchAll(/([0-9][0-9.]*,[0-9]{2})/g)].at(-1)?.[1] ?? null;
  const moneyAt = (index: number) => {
    const value = amount(lines[index] ?? "");
    return value ? parseItalianNumber(value) : null;
  };
  const currencyBefore = (index: number, lookbehind: number) => {
    for (let offset = 1; offset <= lookbehind && index - offset >= 0; offset += 1) {
      const line = lines[index - offset];
      if (!/(?:€|\bEuro\b)/i.test(line)) continue;
      const value = amount(line); if (value) return parseItalianNumber(value);
    }
    return null;
  };
  const fromWindow = (index: number, lookahead: number) => {
    for (let offset = 0; offset <= lookahead && index + offset < lines.length; offset += 1) {
      const value = amount(lines[index + offset]); if (value) return parseItalianNumber(value);
    }
    return null;
  };
  const lastFromWindow = (index: number, lookahead: number) => {
    const values: number[] = [];
    for (let offset = 0; offset <= lookahead && index + offset < lines.length; offset += 1) {
      const value = amount(lines[index + offset]);
      const parsed = value ? parseItalianNumber(value) : null;
      if (parsed !== null) values.push(parsed);
    }
    return values.at(-1) ?? null;
  };
  // Regola generale di Giuliano (2026-09-07): APR non deve mai calcolare,
  // verificare o incrociare i dati economici interni della fattura (aliquote
  // IVA, singole voci, coerenza imponibile+IVA=lordo). "Totale dovuto" e' la
  // cifra finale che il fornitore stesso dichiara come importo da pagare:
  // va usata cosi' com'e', con priorita' massima, senza mai ricostruirla o
  // validarla sommando imponibile e IVA — quella somma puo' fallire su
  // fatture con piu' aliquote IVA diverse (es. prodotto al 10% e una riga
  // servizi/pratica ENEA al 22% sulla stessa fattura), pur essendo la
  // fattura correttissima.
  for (let index = 0; index < lines.length; index += 1) {
    const label = /\btotale\s+dovuto\b/i.exec(lines[index]);
    if (!label) continue;
    const trailing = amount(lines[index].slice(label.index + label[0].length));
    if (trailing) return parseItalianNumber(trailing);
    const nextLine = amount(lines[index + 1] ?? "");
    if (nextLine) return parseItalianNumber(nextLine);
  }
  // Il campo fiscale puo essere l'ultima colonna di una riga di intestazioni
  // (anche insieme a "Totale a pagare") e il valore puo comparire sulla riga
  // immediatamente successiva. Si considerano soltanto gli importi dopo
  // l'etichetta, mai quelli che la precedono sulla stessa riga.
  for (let index = 0; index < lines.length; index += 1) {
    const label = /\btotale\s+documento\b/i.exec(lines[index]);
    if (!label) continue;
    const trailing = amount(lines[index].slice(label.index + label[0].length));
    if (trailing) return parseItalianNumber(trailing);
    const nextLine = amount(lines[index + 1] ?? "");
    if (nextLine) return parseItalianNumber(nextLine);
  }
  // Il netto contabile e il blocco esplicito "Totale documento" hanno
  // precedenza su totali fiscali o massimali detraibili presenti prima nel PDF.
  for (let index = 0; index < lines.length; index += 1) {
    if (/^netto\s+a\s+pagare\b/i.test(lines[index])) {
      const preceding = currencyBefore(index, 8); if (preceding !== null) return preceding;
      for (let offset = 1; offset <= 6 && index + offset < lines.length; offset += 1) {
        if (!/(?:€|\bEuro\b)/i.test(lines[index + offset])) continue;
        const currencyTotal = amount(lines[index + offset]); if (currencyTotal) return parseItalianNumber(currencyTotal);
      }
      const value = fromWindow(index, 2); if (value !== null) return value;
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (/^totale\s+documento\b/i.test(lines[index])) {
      // Alcuni gestionali stampano l'etichetta prima del riepilogo IVA e il
      // totale lordo come ultimo importo del blocco. Se l'importo e' gia'
      // sulla riga dell'etichetta resta sempre la prima scelta; altrimenti si
      // usa l'ultimo valore della finestra, non l'IVA incontrata per prima.
      const sameLine = moneyAt(index); if (sameLine !== null) return sameLine;
      const preceding = currencyBefore(index, 8); if (preceding !== null) return preceding;
      const totalToPayIndex = lines.slice(index + 1, index + 8).findIndex((line) => /^totale\s+a\s+pagare\b/i.test(line));
      if (totalToPayIndex >= 0) {
        for (let offset = 0; offset <= 8 && index + 1 + totalToPayIndex + offset < lines.length; offset += 1) {
          const candidateLine = lines[index + 1 + totalToPayIndex + offset];
          if (!/(?:\bEuro\b|€)/i.test(candidateLine)) continue;
          const currencyTotal = amount(candidateLine);
          if (currencyTotal) return parseItalianNumber(currencyTotal);
        }
        const totalToPay = fromWindow(index + 1 + totalToPayIndex, 2);
        if (totalToPay !== null) return totalToPay;
      }
      for (let offset = 1; offset <= 6 && index + offset < lines.length; offset += 1) {
        if (!/(?:€|\bEuro\b)/i.test(lines[index + offset])) continue;
        const currencyTotal = amount(lines[index + offset]);
        if (currencyTotal) return parseItalianNumber(currencyTotal);
      }
      const value = lastFromWindow(index + 1, 5); if (value !== null) return value;
    }
    if (/^totale$/i.test(lines[index]) && /^documento$/i.test(lines[index + 1] ?? "")) {
      const values = lines.slice(index + 1, index + 7).flatMap((line) => {
        const found = amount(line); return found ? [parseItalianNumber(found)] : [];
      }).filter((value): value is number => value !== null);
      if (values.length) return values.at(-1)!;
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (/^tot(?:ale|\.)\s+documento\b/i.test(lines[index])) {
      const value = fromWindow(index, 3); if (value !== null) return value;
    }
  }
  // Regola generale di Giuliano (Laurelli): senza un'etichetta piu'
  // specifica ("Totale fattura" riconciliato, "Netto a pagare"), quando lo
  // stesso documento espone piu' righe che iniziano semplicemente con
  // "Totale" vince sempre l'ULTIMA occorrenza, non la prima. E' quasi
  // sempre quella dopo un eventuale storno/acconto interno al documento
  // (es. un saldo che riporta prima il lordo della sola fornitura e poi,
  // piu' avanti, il vero totale netto dopo l'acconto accreditato), quindi
  // la piu' vicina all'importo finale realmente da pagare.
  let lastBareTotale: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isTotaleFattura = /^totale\s+fattura(?:\s|$)/i.test(line);
    const isNettoAPagare = /^netto\s+a\s+pagare(?:\s|$)/i.test(line);
    const isBareTotale = !isTotaleFattura && !isNettoAPagare && /^totale(?:\s|$)/i.test(line);
    if (!isTotaleFattura && !isNettoAPagare && !isBareTotale) continue;
    // Regressione Lavezzi: "Totale contratto"/"Totale commessa" indicano il
    // valore complessivo dell'intera commessa (spesso su piu' fatture di
    // acconto/saldo), mai il totale di QUESTO documento. Senza
    // quest'esclusione, quando il documento non ha un'etichetta piu'
    // specifica ("Totale fattura"/"Netto a pagare") piu' avanti a fare da
    // override, la scansione in avanti da "Totale contratto" trovava il
    // primo importo con simbolo di valuta incontrato per caso (l'imponibile
    // dell'acconto/saldo descritto narrativamente subito dopo), non il vero
    // totale del documento.
    if (/^totale\s+(?:imponibile|iva|imposta|compreso|merce|fornitura|ordine|sconto|spese\s+congrue|contratto|commessa)\b/i.test(line)) continue;
    // Alcuni gestionali di serramenti stampano il riepilogo in colonna:
    //   Totale fattura
    //   <imponibile>
    //   <IVA>
    //   <lordo>
    // La prima cifra dopo l'etichetta non e' quindi il totale fattura. Il
    // lordo e' accettato solo quando la terna si riconcilia al centesimo.
    if (/^totale\s+fattura\s*$/i.test(line)) {
      const taxable = moneyAt(index + 1);
      const vat = moneyAt(index + 2);
      const gross = moneyAt(index + 3);
      if (taxable !== null && vat !== null && gross !== null
        && Math.abs(Math.round((taxable + vat + Number.EPSILON) * 100) / 100 - gross) <= 0.011) return gross;
      // Regressione Biagioni/Riviera (fornitore Finestra Italia S.r.l.): una
      // variante dello stesso riepilogo verticale intromette l'etichetta
      // "SCADENZE" (talvolta corrotta dall'OCR con una parentesi iniziale,
      // "(SCADENZE") subito dopo "Totale fattura", prima di imponibile e
      // IVA; il vero lordo e' poi accostato alla sigla valuta "EUR" (mai
      // "€"/"Euro"), non e' la prima cifra incontrata. Senza questa
      // variante il fallback generico piu' sotto prendeva l'imponibile del
      // riepilogo (es. 1.274,00) invece del vero totale (es. 1.401,40).
      if (/^\(?\s*scadenze\b/i.test(lines[index + 1] ?? "")) {
        const taxableAfterSchedule = moneyAt(index + 2);
        const vatAfterSchedule = moneyAt(index + 3);
        for (let offset = 4; offset <= 6 && index + offset < lines.length; offset += 1) {
          if (!/\bEUR\b/i.test(lines[index + offset])) continue;
          const grossAfterSchedule = moneyAt(index + offset) ?? moneyAt(index + offset + 1);
          if (taxableAfterSchedule !== null && vatAfterSchedule !== null && grossAfterSchedule !== null
            && Math.abs(Math.round((taxableAfterSchedule + vatAfterSchedule + Number.EPSILON) * 100) / 100 - grossAfterSchedule) <= 0.011) return grossAfterSchedule;
          break;
        }
      }
    }
    let candidate: number | null = null;
    for (let offset = 1; offset <= 6 && index + offset < lines.length; offset += 1) {
      if (!/(?:€|\bEuro\b)/i.test(lines[index + offset])) continue;
      const currencyTotal = amount(lines[index + offset]);
      if (currencyTotal) { candidate = parseItalianNumber(currencyTotal); break; }
    }
    if (candidate === null) candidate = fromWindow(index, 2);
    if (candidate === null) continue;
    if (!isBareTotale) return candidate;
    lastBareTotale = candidate;
  }
  if (lastBareTotale !== null) return lastBareTotale;
  let lastBareTotaleFallback: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^totale\b/i.test(lines[index]) || /^totale\s+(?:imponibile|iva|imposta|compreso|merce|fornitura|ordine|sconto|spese\s+congrue|contratto|commessa)\b/i.test(lines[index])) continue;
    const value = fromWindow(index, 2); if (value !== null) lastBareTotaleFallback = value;
  }
  if (lastBareTotaleFallback !== null) return lastBareTotaleFallback;
  // Alcune fatture multipagina espongono il totale lordo senza etichetta,
  // subito dopo "Imponibile" e "Totale IVA". Accettiamo la riga isolata
  // soltanto quando coincide, al centesimo, con imponibile + IVA.
  for (let vatIndex = 0; vatIndex < lines.length; vatIndex += 1) {
    if (!/^totale\s+iva\b/i.test(lines[vatIndex])) continue;
    const vat = moneyAt(vatIndex);
    if (vat === null) continue;
    let taxable: number | null = null;
    for (let index = vatIndex - 1; index >= Math.max(0, vatIndex - 5); index -= 1) {
      if (!/\b(?:totale\s+)?imponibile\b/i.test(lines[index])) continue;
      taxable = moneyAt(index);
      break;
    }
    if (taxable === null) continue;
    for (let index = vatIndex + 1; index <= Math.min(lines.length - 1, vatIndex + 2); index += 1) {
      if (!/^€?\s*[0-9][0-9.]*,[0-9]{2}\s*€?$/.test(lines[index])) continue;
      const candidate = moneyAt(index);
      const expected = Math.round((taxable + vat + Number.EPSILON) * 100) / 100;
      if (candidate !== null && Math.abs(candidate - expected) <= 0.01) return candidate;
    }
  }
  return null;
}

function cleanDescription(value: string): string {
  return value
    .replace(/\bNR\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Schermatura solare";
}

function extractExplicitSurfaceValues(text: string): number[] {
  return [...text.matchAll(/(?:Schermatura\s+superficie\s+mq\s*:?\s*([0-9]+(?:[,.][0-9]+)?)|Superficie\s+schermatura\s*:?\s*([0-9]+(?:[,.][0-9]+)?)\s*mq|Tot\s*mq\s*:?\s*([0-9]+(?:[,.][0-9]+)?))/gi)]
    .map((match) => parseSurfaceNumber(match[1] ?? match[2] ?? match[3]))
    .filter((value): value is number => value !== null);
}

/**
 * Alcune fatture non espongono una tabella tecnica: descrivono i prodotti in
 * prosa con blocchi del tipo `N.2 ... L.395xh.240` e riportano un unico gTot
 * esplicito in chiusura. Il fallback si attiva solo quando i parser strutturati
 * non hanno gia trovato righe, cosi una descrizione narrativa non duplica mai
 * una riga tecnica esistente.
 */
function extractNarrativeScreeningItems(text: string) {
  const compact = text.replace(/\s+/g, " ");
  const gTotValues = [...compact.matchAll(/\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)]
    .map((match) => parseItalianNumber(match[1]))
    .filter((value): value is number => value !== null && value > 0 && value <= 0.35);
  const uniqueGTotValues = [...new Set(gTotValues.map((value) => value.toFixed(4)))].map(Number);
  // Un unico valore di chiusura e' attribuibile in modo deterministico a tutti
  // i prodotti enumerati. Valori multipli senza associazione locale restano un
  // caso operatore: non scegliamo arbitrariamente.
  if (uniqueGTotValues.length !== 1) return [];
  const gTot = uniqueGTotValues[0];
  const starts = [...compact.matchAll(/\bN\.?\s*(\d{1,2})\s+(?=[A-ZÀ-ÖØ-öø-ÿ])/gi)];
  const groups: Array<{ quantity: number; widthMm: number; heightMm: number; gTot: number; description: string }> = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const slice = compact.slice(start.index!, starts[index + 1]?.index ?? compact.length);
    const dimensions = slice.match(/\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*(?:H|SP)\.?\s*([0-9]+(?:[,.][0-9]+)?)/i);
    if (!dimensions || !/pergol|pergotend|cristal|pvc|tend[ae]|schermatur/i.test(slice)) continue;
    const widthCm = parseItalianNumber(dimensions[1]);
    const heightCm = parseItalianNumber(dimensions[2]);
    const quantity = Number(start[1]);
    if (widthCm === null || heightCm === null || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SCREENING_QUANTITY) continue;
    // Il formato narrativo L/H o L/SP di questa famiglia di fatture esprime
    // centimetri. Le misure di ferramenta espresse esplicitamente in mm non
    // vengono considerate perche prive delle etichette L/H o L/SP prodotto.
    const rawDescription = slice.slice(0, dimensions.index).replace(/^N\.?\s*\d+\s*/i, "").trim();
    const description = /pergol|pergotend/i.test(rawDescription)
      ? `Pergotenda - ${rawDescription}`
      : /cristal/i.test(rawDescription)
        ? `Tenda Cristal - ${rawDescription}`
        : /tend[ae]\s+da\s+sole/i.test(rawDescription)
          ? `Tenda da sole - ${rawDescription}`
          : `Tenda perimetrale - ${rawDescription}`;
    groups.push({ quantity, widthMm: Math.round(widthCm * 10), heightMm: Math.round(heightCm * 10), gTot, description });
  }
  // Le fatture descrittive di un solo prodotto possono omettere "N.1" e
  // riportare Larghezza/Sporgenza in centimetri. Il singolare esplicito e
  // l'unico gTot locale producono una sola riga; i plurali restano fail-closed.
  // Il trigger include anche "Schermatura solare" (regressione Pescatori,
  // SCHERMATURA_SOLARE_NARRATIVE_SINGLE_PRODUCT_TRIGGER_RULE_ID): stesso
  // formato Larghezza/Sporgenza gia' autorizzato per pergotenda/tenda da
  // sole, solo con una parola-innesco diversa.
  if (!groups.length) {
    const single = compact.match(/\b((?:pergo\s*tenda|pergotenda|tenda\s+da\s+sole|schermatura\s+solare)[\s\S]{0,160}?)\bLarghezza\s+([0-9]+(?:[,.][0-9]+)?)\s*cm[\s\S]{0,100}?\b(?:Sporgenza|Altezza)\s+([0-9]+(?:[,.][0-9]+)?)\s*cm/i);
    if (single && !/\b(?:n\.?|quantit[aà]|pezzi)\s*[2-9]\d*\b/i.test(single[0])) {
      const widthCm = parseItalianNumber(single[2]);
      const heightCm = parseItalianNumber(single[3]);
      if (widthCm !== null && heightCm !== null) groups.push({
        quantity: 1,
        widthMm: Math.round(widthCm * 10),
        heightMm: Math.round(heightCm * 10),
        gTot,
        description: /pergo/i.test(single[1]) ? `Pergotenda - ${single[1].trim()}` : `Tenda da sole - ${single[1].trim()}`,
      });
    }
  }
  return groups;
}

const GENERIC_LABELLED_MEASUREMENT_UNIT: Record<string, ScreeningMeasureUnit> = { MT: "m", M: "m", CM: "cm", MM: "mm" };
const GENERIC_SCREENING_PRODUCT_KEYWORD = /\b(?:tend[ae]|pergotend[ae]|pergol[ae]|zanzarier[ae]|persian[ae]|avvolgibil[ei]|tapparell[ae]|schermatur[ae])\b/gi;

/**
 * Fallback estremo e generico, senza etichette note: alcune fatture
 * dichiarano le due misure di un prodotto di schermatura con sigle mai viste
 * altrove nel file (es. "L. MT. 3,50 X P. MT. 2,50", dove "P." non e' ne' H
 * ne' SP). Il significato della seconda etichetta non serve per calcolare
 * l'area: bastano due misure numeriche, ciascuna con la propria unita' di
 * misura esplicita, connesse dalla stessa "X"/"×" che ogni altro formato di
 * questo file usa gia' per separare le due dimensioni di un prodotto. La
 * sigla della singola etichetta (L., P., B., SP., ...) non viene mai
 * interpretata: non esiste un elenco da aggiornare quando arriva una sigla
 * mai vista.
 *
 * Si attiva solo quando NESSUN parser piu' specifico (ne' i formati dedicati
 * ne' il fallback narrativo) ha gia' trovato righe, cosi' non duplica mai una
 * riga tecnica gia' riconosciuta. L'unita' di misura resta obbligatoria su
 * entrambi i lati: senza di essa la conversione andrebbe inventata, e questo
 * file non lo fa mai (vedi "senza inventare conversioni" altrove) - una
 * coppia di misure senza unita' esplicita resta fail-closed e richiede
 * intervento operatore, non una supposizione silenziosa.
 */
function extractGenericTwoMeasurementScreeningItems(text: string) {
  const compact = text.replace(/\s+/g, " ");
  const pairPattern = /\b[A-ZÀ-Ö]{1,4}\.?\s*(MT|CM|MM|M)\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*[A-ZÀ-Ö]{1,4}\.?\s*(MT|CM|MM|M)\.?\s*([0-9]+(?:[,.][0-9]+)?)\b/gi;
  const groups: Array<{ quantity: number; widthMm: number; heightMm: number; description: string; widthOriginal: number; heightOriginal: number; widthUnit: ScreeningMeasureUnit; heightUnit: ScreeningMeasureUnit }> = [];
  for (const match of compact.matchAll(pairPattern)) {
    const start = match.index ?? 0;
    const before = compact.slice(Math.max(0, start - 900), start);
    const productMatches = [...before.matchAll(GENERIC_SCREENING_PRODUCT_KEYWORD)];
    const nearestProduct = productMatches.at(-1);
    if (!nearestProduct) continue;
    const widthUnit = GENERIC_LABELLED_MEASUREMENT_UNIT[match[1].toUpperCase()];
    const heightUnit = GENERIC_LABELLED_MEASUREMENT_UNIT[match[3].toUpperCase()];
    const widthOriginal = parseItalianNumber(match[2]);
    const heightOriginal = parseItalianNumber(match[4]);
    if (widthOriginal === null || heightOriginal === null || widthOriginal <= 0 || heightOriginal <= 0) continue;
    const widthMm = Math.round(widthOriginal * screeningUnitMultiplier(widthUnit));
    const heightMm = Math.round(heightOriginal * screeningUnitMultiplier(heightUnit));
    if (widthMm <= 0 || heightMm <= 0) continue;
    const quantityMatch = before.match(/\bN[.°º]?\s*(\d{1,2})\s*(?:MIS\.?)?\s*$/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SCREENING_QUANTITY) continue;
    const productWord = nearestProduct[0].toLowerCase();
    const description = /pergotend|pergol/.test(productWord) ? "Pergotenda"
      : /zanzarier/.test(productWord) ? "Zanzariera"
      : /persian/.test(productWord) ? "Persiana"
      : /avvolgibil|tapparell/.test(productWord) ? "Tapparella"
      : /tend[ae]/.test(productWord) ? "Tenda da sole"
      : "Schermatura solare";
    groups.push({ quantity, widthMm, heightMm, description, widthOriginal, heightOriginal, widthUnit, heightUnit });
  }
  return groups;
}

export function parseScreeningInvoiceText(
  text: string,
  path = "documento.pdf",
): { result: EneaLabDocumentResult; items: EneaLabScreeningItem[] } {
  // I PDF CRM possono contenere in coda una vecchia pratica ENEA conclusa.
  // La parte storica e' esclusa prima di qualunque riconoscimento: resta nel
  // file immutabile per audit, ma non puo' diventare fonte di dati APR.
  const sourceText = stripHistoricalEneaAppendix(text);
  const nonFiscalSupportingDocument = /DICHIARAZIONE\s+SOSTITUTIVA\s+DELL[’']ATTO\s+DI\s+NOTORIETA/i.test(sourceText);
  const documentType = /nota\s+di\s+credito|\bstorno\b/i.test(sourceText)
    ? "credit_note"
    : !nonFiscalSupportingDocument && /\bfattura\b/i.test(sourceText)
      ? "invoice"
      : "unknown";
  const compact = sourceText.replace(/\s+/g, " ");
  const pattern = /SCHERMATURA\s+SOLARE([\s\S]{0,260}?)LARGHEZZA\s+(\d{2,5})\s*[X×]\s*(\d{2,5})\s+VALORE\s+G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi;
  const items: EneaLabScreeningItem[] = [];
  const seenEmbeddedProductGroups = new Set<string>();
  let authoritativeVendorItems: EneaLabScreeningItem[] | null = null;
  let invalidExplicitQuantity = false;
  let invalidScreeningDimensionUnit = false;
  const surfaceCoherenceFailures: string[] = [];

  const appendItems = (
    quantity: number,
    widthMm: number,
    heightMm: number,
    gTot: number | null,
    description: string,
    explicitSurfaceM2?: number | null,
    target: EneaLabScreeningItem[] = items,
  ) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SCREENING_QUANTITY) { invalidExplicitQuantity = true; return; }
    const calculatedSurface = roundSurface((widthMm * heightMm) / 1_000_000);
    const surfaceM2 = explicitSurfaceM2 !== null && explicitSurfaceM2 !== undefined
      ? roundSurface(explicitSurfaceM2)
      : calculatedSurface;
    for (let index = 0; index < quantity; index += 1) target.push({ widthMm, heightMm,
      surfaceM2, gTot, description: cleanDescription(description), sourcePath: path });
  };

  if (documentType === "invoice") {
    for (const match of compact.matchAll(pattern)) {
      const widthMm = Number(match[2]);
      const heightMm = Number(match[3]);
      const gTot = parseItalianNumber(match[4]);
      const quantityMatch = match[1].match(/\bNR\s+([0-9]+(?:[,.][0-9]+)?)/i);
      const quantityValue = quantityMatch ? parseItalianNumber(quantityMatch[1]) : 1;
      const quantityIsValid = Number.isInteger(quantityValue)
        && quantityValue! >= 1
        && quantityValue! <= MAX_SCREENING_QUANTITY;

      // Se la fattura espone esplicitamente una quantità ma il valore non è un
      // intero plausibile, non possiamo trasformarlo silenziosamente in 1. Un
      // fallback del genere sottostimerebbe il numero di schermature e potrebbe
      // rendere apparentemente pronto un payload ufficiale incompleto.
      if (quantityMatch && !quantityIsValid) {
        invalidExplicitQuantity = true;
        continue;
      }
      const quantity = quantityMatch ? quantityValue! : 1;

      appendItems(quantity, widthMm, heightMm, gTot, `Schermatura solare${match[1]}`);
    }

    for (const match of compact.matchAll(/DIM\.?\s*L\.?\s*CM\s*(\d{2,4})\s*[X×]\s*H\.?\s*CM\s*(\d{2,4})[\s\S]{0,900}?g\s*tot\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      appendItems(1, Number(match[1]) * 10, Number(match[2]) * 10, parseItalianNumber(match[3]), "Tenda a caduta verticale");
    }
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TENDE?\s+DA\s+CM\s*(\d{2,4})\s*[X×]\s*(\d{2,4})[\s\S]{0,360}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      appendItems(Number(match[1]), Number(match[2]) * 10, Number(match[3]) * 10, parseItalianNumber(match[4]), "Tenda da sole");
    }
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE[\s\S]{0,180}?DIM\.?\s*CM\s+L\s*(\d{2,4})\s*[X×]\s*(\d{2,4})[\s\S]{0,260}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      appendItems(1, Number(match[1]) * 10, Number(match[2]) * 10, parseItalianNumber(match[3]), "Tenda da sole cassonetto");
    }
    // Alcuni saldi Parolo espongono una riga prodotto completa con modello,
    // dimensioni L×SP e superficie, ma senza gTot. L'assenza del solo gTot
    // non cancella la prova del prodotto fisico: il classificatore condiviso
    // lo manterra' fail-closed per quel dato tecnico. Una fattura di solo
    // acconto o una riga "ACCONTO RIF. FATTURA" non possiede questa firma e
    // non puo' generare prodotti.
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE(?:(?!\b(?:TENDA\s+DA\s+SOLE|ACCONTO\s+RIF\.?\s*FATTURA)\b)[\s\S]){0,220}?DIM\.?\s*CM\.?\s*L\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)\s*SP\b[\s\S]{0,80}?\(\s*=?\s*MQ\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*\)/gi)) {
      const widthCm = parseItalianNumber(match[1]);
      const heightCm = parseItalianNumber(match[2]);
      const explicitSurface = parseSurfaceNumber(match[3]);
      if (widthCm === null || heightCm === null || explicitSurface === null) continue;
      const widthMm = Math.round(widthCm * 10);
      const heightMm = Math.round(heightCm * 10);
      if (items.some((item) => item.widthMm === widthMm && item.heightMm === heightMm && /tenda.*sole/i.test(item.description))) continue;
      const calculatedSurface = screeningSurfaceM2(widthCm, heightCm, "cm");
      if (!screeningSurfacesAreCoherent(calculatedSurface, explicitSurface)) {
        surfaceCoherenceFailures.push(`Riga tenda dimensionata: superficie esplicita ${explicitSurface} m2 non coerente con ${calculatedSurface} m2 calcolati dalle misure oltre la tolleranza del 5%.`);
        continue;
      }
      const before = items.length;
      appendItems(1, widthMm, heightMm, null, "Tenda da sole cassonetto", explicitSurface);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: widthCm,
        heightOriginal: heightCm,
        explicitUnit: "cm",
        widthResolution: "explicit_cm",
        heightResolution: "explicit_cm",
        ruleId: DIMENSIONED_AWNING_ROW_PRESERVATION_RULE_ID,
      };
    }
    // Regressione Padoani (MULTISERVICE_HOME_MULTI_MEASURE_NARRATIVE_RULE_ID):
    // una fattura elettronica MULTISERVICE HOME descrive in un'unica riga
    // narrativa 2 tende da sole fisicamente distinte con la notazione
    // "misure 396x241 ed 182x241" (una sola coppia per riga in ogni altro
    // formato gia' riconosciuto). Le misure sono centimetri, coerenti con
    // ogni altro formato narrativo L/H senza etichetta di unita' esplicita
    // di questo file. Il gTot non viene mai dedotto qui: resta
    // responsabilita' del solo classificatore condiviso e delle sue fallback
    // autorizzate (famiglia "tenda" -> 0,13).
    for (const match of compact.matchAll(/\bTEND[AE]\s+DA\s+SOLE(?:(?!\bTEND[AE]\s+DA\s+SOLE\b)[\s\S]){0,220}?\bMISURE\s+([0-9]{2,4})\s*[X×]\s*([0-9]{2,4})\s+ED\s+([0-9]{2,4})\s*[X×]\s*([0-9]{2,4})\b/gi)) {
      const width1Cm = parseItalianNumber(match[1]);
      const height1Cm = parseItalianNumber(match[2]);
      const width2Cm = parseItalianNumber(match[3]);
      const height2Cm = parseItalianNumber(match[4]);
      if (width1Cm === null || height1Cm === null || width2Cm === null || height2Cm === null) continue;
      const pairs = [{ widthCm: width1Cm, heightCm: height1Cm }, { widthCm: width2Cm, heightCm: height2Cm }];
      for (const pair of pairs) {
        const before = items.length;
        appendItems(1, Math.round(pair.widthCm * 10), Math.round(pair.heightCm * 10), null, "Tenda da sole a caduta");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: pair.widthCm,
          heightOriginal: pair.heightCm,
          explicitUnit: "cm",
          widthResolution: "inferred_cm",
          heightResolution: "inferred_cm",
          ruleId: MULTISERVICE_HOME_MULTI_MEASURE_NARRATIVE_RULE_ID,
        };
      }
    }
    // Alcune fatture descrittive etichettano la profondita/sporgenza con la
    // sola lettera `S` (es. `Pergotenda ... L 500 x S 290`). La coppia viene
    // accettata soltanto quando e' adiacente a una famiglia di schermatura
    // riconosciuta e entrambe le assi hanno etichette esplicite. Una coppia
    // numerica non etichettata, incompleta o con quantita non valida resta
    // fail-closed. Il gTot non viene dedotto qui: resta responsabilita del
    // classificatore condiviso e delle sue sole fallback autorizzate.
    for (const match of compact.matchAll(/\b((?:PERGO\s*TENDA|PERGOTENDA|TENDA\s+DA\s+SOLE)(?:(?!\b(?:PERGO\s*TENDA|PERGOTENDA|TENDA\s+DA\s+SOLE)\b)[\s\S]){0,180}?)\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*S\.?\s*([0-9]+(?:[,.][0-9]+)?)\b/gi)) {
      const width = parseItalianNumber(match[2]);
      const depth = parseItalianNumber(match[3]);
      if (width === null || depth === null) continue;
      const localTail = compact.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 120);
      // I formati che espongono gia gTot o superficie esplicita sono gestiti
      // dai parser piu autorevoli, che devono restare gli unici a produrre la
      // riga e il relativo audit di coerenza.
      if (/\b(?:G\s*TOT|GHOT|TOT\s*MQ|SUPERFICIE)\b/i.test(localTail)) continue;
      const explicitQuantityMatch = localTail.match(/\b([0-9]+(?:[,.][0-9]+)?)\s*(?:PZ\.?|PEZZI?)\b/i);
      const quantity = explicitQuantityMatch ? parseItalianNumber(explicitQuantityMatch[1]) : 1;
      if (quantity === null || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SCREENING_QUANTITY) {
        invalidExplicitQuantity = true;
        continue;
      }
      const resolved = resolveScreeningMeasurePair(width, depth, null, null);
      if (items.some((item) => item.widthMm === resolved.widthMm && item.heightMm === resolved.heightMm && /pergotend|tenda.*sole/i.test(item.description))) continue;
      const before = items.length;
      const description = /pergo/i.test(match[1]) ? "Pergotenda" : "Tenda da sole";
      appendItems(quantity, resolved.widthMm, resolved.heightMm, null, description);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: width,
        heightOriginal: depth,
        explicitUnit: null,
        widthResolution: resolved.resolution,
        heightResolution: resolved.resolution,
        ruleId: LABELLED_SCREENING_DEPTH_ABBREVIATION_RULE_ID,
      };
    }
    // Le vetrate scorrevoli/VEPA vengono riconosciute e conservate 1:1 nel
    // ledger, ma la loro classificazione ENEA resta disabilitata finche' non
    // sara' attivato e verificato il modulo dedicato.
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+VETRAT[AE]\s+SCORREVOL[EI]\b[\s\S]{0,760}?\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*H\.?\s*([0-9]+(?:[,.][0-9]+)?)[\s\S]{0,420}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm !== null && heightCm !== null) appendItems(Number(match[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[4]), "VEPA - vetrata scorrevole");
    }
    // Formato Vans per sistemi accoppiati: la fattura dichiara separatamente
    // N tende verticali e N tende da sole integrate, poi elenca le misure di
    // ciascuna struttura (anche con quantita' in lettere). Le due famiglie
    // restano prodotti fisici distinti e ricevono le stesse misure per varco.
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TENDE\s+VERTICALI\b[\s\S]{0,260}?\+\s*N\.?\s*(\d+)\s+TENDE\s+DA\s+SOLE\s+INTEGRATE\b[\s\S]{0,520}?\bSTRUTTURA\s+DA\s+([\s\S]{1,300}?)\b(?:PRATICA\s+ENEA|G\s*TOT)\b[\s\S]{0,300}?\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const verticalCount = Number(match[1]);
      const integratedCount = Number(match[2]);
      const gTot = parseItalianNumber(match[4]);
      const dimensions: Array<{ quantity: number; widthMm: number; heightMm: number }> = [];
      for (const dimension of match[3].matchAll(/\b(DUE|UNO|UNA|N\.?\s*(\d+))\s+(?:DA\s+)?L\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*H\.?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
        const wordQuantity = dimension[1].toUpperCase();
        const quantity = dimension[2] ? Number(dimension[2]) : wordQuantity === "DUE" ? 2 : 1;
        const widthCm = parseItalianNumber(dimension[3]);
        const heightCm = parseItalianNumber(dimension[4]);
        if (widthCm !== null && heightCm !== null) dimensions.push({ quantity, widthMm: Math.round(widthCm * 10), heightMm: Math.round(heightCm * 10) });
      }
      const structureCount = dimensions.reduce((sum, dimension) => sum + dimension.quantity, 0);
      if (structureCount !== verticalCount || structureCount !== integratedCount || gTot === null) {
        invalidExplicitQuantity = true;
        continue;
      }
      for (const dimension of dimensions) {
        appendItems(dimension.quantity, dimension.widthMm, dimension.heightMm, gTot, "Tenda verticale in PVC trasparente");
        appendItems(dimension.quantity, dimension.widthMm, dimension.heightMm, gTot, "Tenda da sole integrata");
      }
    }
    // Formato Vans: quantita' nella descrizione, larghezza/proiezione in cm
    // ("N.1 ... L.460xsp.220") e gTot esplicito piu avanti nella riga.
    // La quantita' viene espansa in prodotti fisici distinti.
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TEND[AE]\s+DA\s+SOLE[\s\S]{0,260}?\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*SP\.?\s*([0-9]+(?:[,.][0-9]+)?)[\s\S]{0,520}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm !== null && heightCm !== null) appendItems(Number(match[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[4]), /motorizzat|\bmotore\b/i.test(match[0]) ? "Tenda da sole motorizzata" : "Tenda da sole");
    }
    // Formato Vans senza gTot documentato: il prodotto, la cardinalita', le
    // misure e l'eventuale motorizzazione restano dati espliciti di fattura.
    // Il parser conserva gTot=null; sara' il registro unico ad applicare il
    // fallback tenda 0,33, senza inventare un valore nella fonte originaria.
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TEND[AE]\s+(?:DA\s+SOLE|A\s+BRACCI\s+ESTENSIBILI)[\s\S]{0,320}?\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*SP\.?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm === null || heightCm === null) continue;
      const widthMm = Math.round(widthCm * 10); const heightMm = Math.round(heightCm * 10);
      if (items.some((item) => item.widthMm === widthMm && item.heightMm === heightMm && /tenda.*(?:sole|bracci)/i.test(item.description))) continue;
      appendItems(Number(match[1]), widthMm, heightMm, null, /motorizzat|\bmotore\b/i.test(match[0]) ? "Tenda da sole a bracci estensibili motorizzata" : "Tenda da sole a bracci estensibili");
    }
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TENDA[\s\S]{0,260}?\bL\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*H\.?\s*([0-9]+(?:[,.][0-9]+)?)[\s\S]{0,520}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm !== null && heightCm !== null) appendItems(Number(match[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[4]), "Tenda verticale");
    }
    // Regola generale di Giuliano (Laurelli): quando il formato e' gia'
    // inequivocabile ("N. <n> TEND[AE] DA <numero> X <numero>", due numeri
    // separati da X subito dopo "DA"), la misura e' riconosciuta anche senza
    // le etichette esplicite "L."/"H.": non servono sempre, quando il
    // pattern numerico non lascia dubbi su quali siano le due dimensioni.
    for (const match of compact.matchAll(/N\.?\s*(\d+)\s+TEND[AE]\s+DA\s+([0-9]+(?:[,.][0-9]+)?)\s*[Xx×]\s*([0-9]+(?:[,.][0-9]+)?)\b[\s\S]{0,320}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm === null || heightCm === null) continue;
      const widthMm = Math.round(widthCm * 10); const heightMm = Math.round(heightCm * 10);
      if (items.some((item) => item.widthMm === widthMm && item.heightMm === heightMm && /tenda/i.test(item.description))) continue;
      const before = items.length;
      appendItems(Number(match[1]), widthMm, heightMm, parseItalianNumber(match[4]), "Tenda da sole");
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: widthMm,
        heightOriginal: heightMm,
        explicitUnit: "mm",
        widthResolution: "explicit_mm",
        heightResolution: "explicit_mm",
        ruleId: UNLABELLED_UNAMBIGUOUS_MEASUREMENT_PAIR_RULE_ID,
      };
    }
    // Formato S.A. Montaggi: il gTot precede la misura espressa in cm.
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE(?:(?!\b(?:ZANZARIERA|TENDA\s+DA\s+SOLE)\b)[\s\S]){0,520}?G\s*TOT\s*(?:TESSUTO\s*)?([0-9]+(?:[,.][0-9]+)?)(?:(?!\b(?:ZANZARIERA|TENDA\s+DA\s+SOLE)\b)[\s\S]){0,300}?MISURA\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[1]), "Tenda da sole");
    }
    // Regola generale di Giuliano (Ferletic): quando la stessa descrizione
    // tenda elenca due o piu' coppie "N) L. ... X H ..." prima del gTot
    // condiviso, sono sempre altrettanti prodotti fisici distinti: non
    // esiste il caso di un'unica tenda descritta con misure parziali o
    // alternative. Non collassare mai due coppie di misure in una riga sola.
    for (const match of compact.matchAll(/\bTENDA\s+DA\s+SOLE\b(?:(?!\bTENDA\s+DA\s+SOLE\b)[\s\S]){0,600}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const gTot = parseItalianNumber(match[1]);
      const pairs = [...match[0].matchAll(/(\d+)\)\s*L\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[Xx×]\s*H\.?\s*([0-9]+(?:[,.][0-9]+)?)/gi)];
      if (pairs.length < 2) continue;
      const groupKey = `${match.index}|tenda-a-caduta-multi-coppia`;
      if (seenEmbeddedProductGroups.has(groupKey)) continue;
      seenEmbeddedProductGroups.add(groupKey);
      for (const pair of pairs) {
        const widthCm = parseItalianNumber(pair[2]); const heightCm = parseItalianNumber(pair[3]);
        const quantity = Number.parseInt(pair[1], 10) || 1;
        if (widthCm === null || heightCm === null) continue;
        const before = items.length;
        appendItems(quantity, Math.round(widthCm * 10), Math.round(heightCm * 10), gTot, "Tenda da sole a caduta");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Math.round(widthCm * 10),
          heightOriginal: Math.round(heightCm * 10),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: MULTIPLE_MEASUREMENT_PAIRS_ALWAYS_DISTINCT_PRODUCTS_RULE_ID,
        };
      }
    }
    // Formato saldo LM Tende con piu prodotti nella stessa descrizione:
    // ogni riga economica puo elencare piu occorrenze `N°1 da L x H` e un
    // unico gTot esplicito di chiusura. L'acconto privo di gTot non genera
    // righe tecniche, cosi acconto e saldo restano economicamente distinti ma
    // i prodotti fisici non vengono duplicati.
    if (/\bLM\s+TENDE\s+DA\s+SOLE\s+E\s+ZANZARIERE\b/i.test(sourceText) && /fattura\s+saldo\b/i.test(sourceText)) {
      const productSection = sourceText.match(/PRODOTTI\s+E\s+SERVIZI[\s\S]*?(?=METODO\s+DI\s+PAGAMENTO)/i)?.[0] ?? "";
      const starts = [...productSection.matchAll(/(?:^|\n)\s*\d+\s+(?=(?:fattura\s+saldo\s+per\s+fornitura\s+e\s+posa\s+di\s+(?:tend[ae]\b|zanzariere?)|tend[ae]\b|zanzariere?))/gim)];
      const lmItems: EneaLabScreeningItem[] = [];
      for (let index = 0; index < starts.length; index += 1) {
        const group = productSection.slice(starts[index].index!, starts[index + 1]?.index ?? productSection.length);
        const gTotValues = [...group.matchAll(/\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)]
          .map((match) => parseItalianNumber(match[1]))
          .filter((value): value is number => value !== null && value > 0 && value <= 0.35);
        const uniqueGTot = [...new Set(gTotValues.map((value) => value.toFixed(4)))].map(Number);
        if (uniqueGTot.length !== 1) continue;
        // Regressione Pezzani: "zanzariere?" non riconosce mai il singolare
        // "Zanzariera" (finale in "a", non "e") come parola intera: dopo
        // "zanzarier" non c'e' alcun confine di parola prima della "a" che
        // segue nello stesso vocabolo, quindi "\b" alla fine del pattern
        // falliva sempre su questa forma - mai notato prima perche' tutte le
        // fatture di prova usavano soltanto il plurale "Zanzariere".
        const isZanzariera = /\bzanzarier[ae]?\b/i.test(group);
        const isMotorized = /\bmotorizzat[aeio]?\b|\bmotori?\b/i.test(group);
        const description = isZanzariera
          ? `Altra schermatura solare - zanzariera${isMotorized ? " motorizzata" : ""}`
          : /\ba\s+caduta\b/i.test(group)
            ? `Tenda da sole a caduta${isMotorized ? " motorizzata" : ""}`
            : `Tenda da sole${isMotorized ? " motorizzata" : ""}`;
        const explicitSurfaces = extractExplicitSurfaceValues(group);
        // Regressione Pezzani: la riga tenda di questo fornitore puo' usare
        // la preposizione "a" invece di "da" fra il quantitativo e la misura
        // (es. "N° 1 a 500 x 185 cm" contro "N° 1 da 344 x 174 cm" della
        // zanzariera nella stessa fattura) - stesso significato, sinonimo
        // sintattico. Le righe "piantane" (es. "N° 4 piantane 6 x 3 cm")
        // restano escluse perche' dopo "N° <n>" non compare ne' "da" ne' "a".
        const dimensions = [...group.matchAll(/\bN[°º.]?\s*(\d{1,2})\s+(?:da|a)\s+([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)/gi)];
        for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
          const dimension = dimensions[dimensionIndex];
          const widthCm = parseItalianNumber(dimension[2]); const heightCm = parseItalianNumber(dimension[3]);
          if (widthCm === null || heightCm === null) continue;
          const before = lmItems.length;
          appendItems(
            Number(dimension[1]),
            Math.round(widthCm * 10),
            Math.round(heightCm * 10),
            uniqueGTot[0],
            description,
            explicitSurfaces[dimensionIndex],
            lmItems,
          );
          for (const item of lmItems.slice(before)) item.measurementAudit = {
            widthOriginal: Math.round(widthCm * 10),
            heightOriginal: Math.round(heightCm * 10),
            explicitUnit: "mm",
            widthResolution: "explicit_mm",
            heightResolution: "explicit_mm",
            ruleId: LM_TENDE_SALDO_DIMENSION_CONNECTOR_PREPOSITION_RULE_ID,
          };
        }
      }
      // Questo parser e' specifico per il saldo LM e conserva anche gruppi
      // eterogenei e quantita' N>1. Viene applicato dopo tutti i parser
      // generici, cosi questi ultimi non possono riaggiungere copie parziali.
      if (lmItems.length > 0) authoritativeVendorItems = lmItems;
    }
    // Fatture miste serramenti + tapparelle: la descrizione fiscale puo'
    // contenere piu occorrenze `N° 1 da L x H` nella stessa riga. Ogni
    // occorrenza e' un prodotto fisico distinto; superficie e gTot che seguono
    // la misura appartengono a quella sola tapparella.
    if (/fattura\s+saldo\s+per\s+fornitura\s+e\s+posa\s+di\s+tapparell/i.test(sourceText)) {
      const group = sourceText.match(/fattura\s+saldo\s+per\s+fornitura\s+e\s+posa\s+di\s+tapparell[ae][\s\S]*?(?=\n\s*\d+\s+Infissi\b|\n\s*METODO\s+DI\s+PAGAMENTO\b)/i)?.[0] ?? "";
      const dimensions = [...group.matchAll(/\bN[°º.]?\s*(\d{1,2})\s+da\s+([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)\s*cm\b/gi)];
      const tapparellaItems: EneaLabScreeningItem[] = [];
      for (let index = 0; index < dimensions.length; index += 1) {
        const dimension = dimensions[index];
        const widthCm = parseItalianNumber(dimension[2]); const heightCm = parseItalianNumber(dimension[3]);
        if (widthCm === null || heightCm === null) continue;
        const detail = group.slice(dimension.index!, dimensions[index + 1]?.index ?? group.length);
        const explicitGTot = detail.match(/\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1];
        const explicitSurface = extractExplicitSurfaceValues(detail)[0];
        appendItems(Number(dimension[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), explicitGTot ? parseItalianNumber(explicitGTot) : null, "Tapparella in alluminio", explicitSurface, tapparellaItems);
      }
      if (tapparellaItems.length > 0) authoritativeVendorItems = tapparellaItems;
    }
    // Avvolgibili/tapparelle: stesso contratto dimensionale delle persiane.
    // Ogni occorrenza fisica resta una riga distinta; 229 in altezza viene
    // quindi normalizzato deterministicamente a 2290 mm, mentre valori fuori
    // intervallo restano auditati come ambigui e verranno fermati dal preflight.
    const avvolgibileStarts = [...compact.matchAll(/(?:\bN[.°º]?\s*(\d{1,2})\s+)?\b(?:AVVOLGIBIL[EI]|TAPPARELL[AE])\b/gi)];
    for (let index = 0; index < avvolgibileStarts.length; index += 1) {
      const start = avvolgibileStarts[index];
      const block = compact.slice(start.index!, Math.min(avvolgibileStarts[index + 1]?.index ?? compact.length, start.index! + 520));
      const dimensions = block.match(/(?:MISUR[AE]?\s*(?:IN\s*)?(CM|MM)?\s*[:=-]?\s*)?(?:L(?:ARGHEZZA)?\.?\s*)?([0-9]{2,5}(?:[,.][0-9]+)?)\s*[X×]\s*(?:H(?:ALTEZZA)?\.?\s*)?([0-9]{2,5}(?:[,.][0-9]+)?)(?:\s*(CM|MM)\b)?/i);
      if (!dimensions) continue;
      const rawWidth = parseItalianNumber(dimensions[2]);
      const rawHeight = parseItalianNumber(dimensions[3]);
      if (rawWidth === null || rawHeight === null) continue;
      const explicitUnit = (dimensions[1] || dimensions[4] || "").toLowerCase() as "cm" | "mm" | "";
      const unit = explicitUnit || null;
      const width = normalizePersianaMeasure(rawWidth, "width", unit);
      const height = normalizePersianaMeasure(rawHeight, "height", unit);
      const widthMm = width?.millimeters ?? Math.round(unit === "cm" ? rawWidth * 10 : rawWidth);
      const heightMm = height?.millimeters ?? Math.round(unit === "cm" ? rawHeight * 10 : rawHeight);
      const documentedGTot = block.match(/\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1];
      // Nei documenti misti il blocco successivo puo descrivere infissi in
      // PVC. Il materiale dell'avvolgibile proviene dalla sua frase,
      // delimitata dalla misura, non dai prodotti successivi della fattura.
      const productPhrase = block.slice(0, (dimensions.index ?? 0) + dimensions[0].length);
      const material = /\bpvc\b/i.test(productPhrase) ? " in PVC" : /\blegno\b/i.test(productPhrase) ? " in legno" : /\ballumini|\bmetall/i.test(productPhrase) ? " in alluminio" : "";
      const description = `${/TAPPARELL/i.test(start[0]) ? "Tapparella" : "Avvolgibile"}${material}${/\bmotore\b|motorizzat|automatic/i.test(block) ? " motorizzato" : ""}`;
      const quantity = Number(start[1] ?? block.match(/\b(?:Q(?:TA|TY)|QUANTIT[AÀ])\.?\s*[:=]?\s*(\d{1,2})\b/i)?.[1] ?? 1);
      const before = items.length;
      appendItems(quantity, widthMm, heightMm, documentedGTot ? parseItalianNumber(documentedGTot) : null, description);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: rawWidth,
        heightOriginal: rawHeight,
        explicitUnit: unit,
        widthResolution: width?.resolution ?? "ambiguous",
        heightResolution: height?.resolution ?? "ambiguous",
        ruleId: AVVOLGIBILE_RULE_ID,
      };
    }
    // Fatture serramenti multipagina: una sola intestazione descrive un
    // gruppo di avvolgibili e le righe successive espongono L x H + Pezzi.
    // La misura 14x55 della lamella non e' la dimensione del prodotto. Quando
    // il blocco strutturato e' completo sostituisce soltanto le righe
    // avvolgibile generiche, preservando le altre famiglie (es. zanzariere).
    const groupedAvvolgibileItems: EneaLabScreeningItem[] = [];
    for (const group of compact.matchAll(/CHIUSURE\s+OSCURANTI\s+AVVOLGIBIL[EI][\s\S]{0,240}?DIMENSIONI\s+L\s*[X×]\s*H\s*:\s*([\s\S]{1,2600}?)(?=\bZANZARIERE\b|\bSERVIZI\s+DI\s+VENDITA\b|\bTOTALE\s+(?:FATTURA|DOCUMENTO)\b)/gi)) {
      for (const dimension of group[1].matchAll(/\b(\d{3,4})\s*[X×]\s*(\d{3,4})\s*MM\b[\s\S]{0,260}?\bPEZZI\s+(\d{1,2})\b/gi)) {
        appendItems(Number(dimension[3]), Number(dimension[1]), Number(dimension[2]), null, "Avvolgibile in alluminio", null, groupedAvvolgibileItems);
      }
    }
    // Riepiloghi tecnici compatti: `Superficie Avvolgibili ... L1545mm x
    // h1700mm - 5 pz`. Ogni quantita viene espansa in righe fisiche 1:1.
    for (const group of compact.matchAll(/SUPERFICIE\s+AVVOLGIBIL[EI]\s+IN\s+ALLUMINIO([\s\S]{1,900}?)(?=\bPAGINA\b|\bSOMMARIO\b|$)/gi)) {
      for (const dimension of group[1].matchAll(/\bL\s*(\d{3,4})\s*MM\s*[X×]\s*H\s*(\d{3,4})\s*MM\s*-\s*(\d{1,2})\s*PZ\b/gi)) {
        appendItems(Number(dimension[3]), Number(dimension[1]), Number(dimension[2]), null, "Avvolgibile in alluminio", null, groupedAvvolgibileItems);
      }
    }
    if (groupedAvvolgibileItems.length > 0) {
      for (let index = items.length - 1; index >= 0; index -= 1) if (/\b(?:avvolgibil|tapparell)/i.test(items[index].description)) items.splice(index, 1);
      items.push(...groupedAvvolgibileItems);
    }
    // Persiane: la fonte puo esprimere le misure in centimetri o millimetri
    // anche senza indicare l'unita. Gli intervalli autorizzati dall'utente
    // rendono la conversione deterministica; fuori intervallo il valore viene
    // conservato come ambiguo e il preflight lo instrada all'operatore.
    // Il trigger include anche "VENEZIAN..." (regressione Monti, decisione
    // generale di Giuliano 2026-09-08, VENEZIANA_PERSIANA_EQUIVALENT_
    // TREATMENT_RULE_ID): il prodotto "veneziana" segue esattamente lo
    // stesso riconoscimento dimensionale e lo stesso trattamento (gTot,
    // materiale, resistenza termica) gia' autorizzato per le persiane,
    // incluse letture OCR degradate come "Venezianita"/"Venezianina".
    // "VENEZIAN(?!E\b)" esclude deliberatamente il plurale "Veneziane", gia'
    // gestito come famiglia "tenda" da un formato narrativo distinto e
    // testato altrove ("Veneziane da 50mm N0x Da l WxH"): la nuova
    // equivalenza con le persiane riguarda solo le forme singolari reali
    // della parola (incluse le letture OCR degradate "Venezianita"/
    // "Venezianina"), mai il formato plurale gia' autorizzato.
    const persianaStarts = [...compact.matchAll(/(?:\bN[.°º]?\s*(\d{1,2})\s+)?\b(?:PERSIAN[AE]|VENEZIAN(?!E\b)\w*)\b/gi)];
    for (let index = 0; index < persianaStarts.length; index += 1) {
      const start = persianaStarts[index];
      const isVeneziana = /VENEZIAN/i.test(start[0]);
      const block = compact.slice(start.index!, Math.min(persianaStarts[index + 1]?.index ?? compact.length, start.index! + 520));
      // Regressione Garbato: un modulo tecnico di posa puo' citare, prima
      // della misura reale, una coppia di numeri estranea al prodotto (es.
      // "Guida inferiore esistente incassata 17x18", la sede della guida di
      // scorrimento, non l'apertura della persiana). Quando compare
      // l'etichetta esplicita "Misure Luce Architettonica: LxH", quella e'
      // sempre la misura autorevole del prodotto e ha precedenza sulla prima
      // coppia di numeri trovata nel blocco.
      const architecturalOpening = block.match(/\bMisure\s+Luce\s+Architettonica\s*:?\s*([0-9]{2,5}(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]{2,5}(?:[,.][0-9]+)?)\s*(CM|MM)?\b/i);
      const dimensions = architecturalOpening
        ?? block.match(/(?:MISUR[AE]?\s*(?:IN\s*)?(CM|MM)?\s*[:=-]?\s*)?(?:L(?:ARGHEZZA)?\.?\s*)?([0-9]{2,5}(?:[,.][0-9]+)?)\s*[X×]\s*(?:H(?:ALTEZZA)?\.?\s*)?([0-9]{2,5}(?:[,.][0-9]+)?)(?:\s*(CM|MM)\b)?/i);
      if (!dimensions) continue;
      const rawWidth = parseItalianNumber(architecturalOpening ? dimensions[1] : dimensions[2]);
      const rawHeight = parseItalianNumber(architecturalOpening ? dimensions[2] : dimensions[3]);
      if (rawWidth === null || rawHeight === null) continue;
      const explicitUnit = (architecturalOpening ? (dimensions[3] ?? "") : (dimensions[1] || dimensions[4] || "")).toLowerCase() as "cm" | "mm" | "";
      const unit = explicitUnit || null;
      const width = normalizePersianaMeasure(rawWidth, "width", unit);
      const height = normalizePersianaMeasure(rawHeight, "height", unit);
      const widthMm = width?.millimeters ?? Math.round(unit === "cm" ? rawWidth * 10 : rawWidth);
      const heightMm = height?.millimeters ?? Math.round(unit === "cm" ? rawHeight * 10 : rawHeight);
      const documentedGTot = block.match(/\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1];
      const motorized = /\bmotore\b|motorizzat|automatic/i.test(block);
      const description = isVeneziana
        ? (motorized ? "Persiana veneziana in alluminio motorizzata" : "Persiana veneziana in alluminio")
        : (motorized ? "Persiana in alluminio motorizzata" : "Persiana in alluminio");
      const quantity = Number(start[1] ?? block.match(/\b(?:Q(?:TA|TY)|QUANTIT[AÀ])\.?\s*[:=]?\s*(\d{1,2})\b/i)?.[1] ?? 1);
      const before = items.length;
      appendItems(quantity, widthMm, heightMm, documentedGTot ? parseItalianNumber(documentedGTot) : null, description);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: rawWidth,
        heightOriginal: rawHeight,
        explicitUnit: unit,
        widthResolution: width?.resolution ?? "ambiguous",
        heightResolution: height?.resolution ?? "ambiguous",
        ruleId: architecturalOpening
          ? ARCHITECTURAL_OPENING_LABEL_OVER_INCIDENTAL_NUMBER_PAIR_RULE_ID
          : isVeneziana ? VENEZIANA_PERSIANA_EQUIVALENT_TREATMENT_RULE_ID : PERSIANA_RULE_ID,
      };
    }
    // Formato Finestra Italia (DDT posizionale): ogni posizione riporta le
    // misure tra parentesi come "(L=2.235;A=1.435;)", con il punto usato come
    // separatore delle migliaia (2.235 = 2235 mm), non come decimale. La
    // stessa notazione compare identica sia per gli infissi sia per le
    // persiane dello stesso fornitore (regressione Codognato: infissi e
    // persiane della stessa fattura, combinazione normale, restavano
    // entrambi senza misure riconosciute perche' nessun parser esistente
    // accettava "(L=...;A=...;)").
    for (const match of compact.matchAll(/\bPERSIAN[AE]\b[^()\n]{0,80}?\(\s*L\s*=\s*([0-9]{1,2}\.[0-9]{3}|[0-9]{3,4})\s*;\s*A\s*=\s*([0-9]{1,2}\.[0-9]{3}|[0-9]{3,4})\s*;?\s*\)/gi)) {
      const widthMm = Number(match[1].replace(".", ""));
      const heightMm = Number(match[2].replace(".", ""));
      if (!(widthMm > 0 && heightMm > 0)) continue;
      const before = items.length;
      appendItems(1, widthMm, heightMm, null, "Persiana in alluminio");
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: widthMm,
        heightOriginal: heightMm,
        explicitUnit: "mm",
        widthResolution: "explicit_mm",
        heightResolution: "explicit_mm",
        ruleId: FINESTRA_ITALIA_POSITIONAL_DIMENSION_NOTATION_RULE_ID,
      };
    }
    // Schede ordine tecniche a posizioni: il nome famiglia puo comparire
    // soltanto nell'intestazione, mentre ogni posizione Pxx contiene quantità,
    // misure L/H e gTot. Una posizione incompleta resta esclusa fail-closed.
    if (/\bPERSIAN[AE]\b/i.test(compact)) {
      const positionStarts = [...compact.matchAll(/\bPOS\.?\s+P\d{1,3}\b/gi)];
      for (let index = 0; index < positionStarts.length; index += 1) {
        const start = positionStarts[index];
        const block = compact.slice(start.index!, positionStarts[index + 1]?.index ?? compact.length);
        const quantityMatch = block.match(/\bQuantit[aà]\s+(\d{1,2})\s*PZ\b/i);
        const widthMatch = block.match(/\bmisure\s+L\s+([0-9]{2,5}(?:[,.][0-9]+)?)/i);
        const heightMatch = block.match(/\bmisure\s+H\s+([0-9]{2,5}(?:[,.][0-9]+)?)/i);
        const gTotMatch = block.match(/\bG\s*[- ]?TOT\s+([0-9]+(?:[,.][0-9]+)?)/i);
        if (!quantityMatch || !widthMatch || !heightMatch || !gTotMatch) continue;
        const quantity = Number(quantityMatch[1]);
        const rawWidth = parseItalianNumber(widthMatch[1]);
        const rawHeight = parseItalianNumber(heightMatch[1]);
        const gTot = parseItalianNumber(gTotMatch[1]);
        if (rawWidth === null || rawHeight === null || gTot === null) continue;
        const width = normalizePersianaMeasure(rawWidth, "width", null);
        const height = normalizePersianaMeasure(rawHeight, "height", null);
        if (!width || !height) continue;
        const before = items.length;
        appendItems(quantity, width.millimeters, height.millimeters, gTot, "Persiana in alluminio");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: rawWidth,
          heightOriginal: rawHeight,
          explicitUnit: null,
          widthResolution: width.resolution,
          heightResolution: height.resolution,
          ruleId: POSITIONED_TECHNICAL_ORDER_PRODUCTS_RULE_ID,
        };
      }
    }
    // Formato Zanzasol: la riga economica può precedere la descrizione
    // tecnica, mentre modello, `misura: LxH` e gTot sono riportati nelle
    // righe successive. La quantità fisica documentata è una tenda; motore,
    // posa e pratica ENEA sono servizi/accessori e non prodotti aggiuntivi.
    // Correzione di Giuliano (2026-09-07): l'intestazione compare anche come
    // "FORNITURA E POSA TENDE DA SOLE" (plurale, con "E POSA") e il gTot come
    // "Gtot." con un punto prima del valore, non solo "G TOT" con spazio;
    // entrambe le varianti reali erano ignorate senza generare alcuna riga.
    for (const match of compact.matchAll(/FORNITURA\s+(?:E\s+POSA\s+|DI\s+)?TEND[EA]\s+DA\s+SOLE(?:(?!\b(?:FORNITURA\s+(?:E\s+POSA\s+|DI\s+)?TEND[EA]\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])\b)[\s\S]){0,700}?\bMISUR[AE]?\s*:?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)(?:(?!\b(?:FORNITURA\s+(?:E\s+POSA\s+|DI\s+)?TEND[EA]\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])\b)[\s\S]){0,220}?\bG\s*TOT\.?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[1]); const heightCm = parseItalianNumber(match[2]);
      const following = compact.slice(match.index! + match[0].length, match.index! + match[0].length + 420).split(/(?=FORNITURA\s+(?:E\s+POSA\s+|DI\s+)?TEND[EA]\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])/i)[0];
      const motorized = /\bFORNITURA\s+MOTORE\b[\s\S]{0,180}?\bPER\s+TENDA\s+DA\s+SOLE\b/i.test(following);
      // Regressione Falconi: la riga economica del prezzo unitario riporta la
      // quantita' fisica reale come "N <prezzo> <iva%> <quantita>,00
      // <totale>" subito dopo il gTot. Il default 1 restava corretto finche'
      // la quantita' era sempre 1,00; con "2,00" il parser produceva una
      // sola riga fisica invece di due, pur avendo la fattura la quantita'
      // esplicita in chiaro.
      const quantityMatch = following.match(/^\s*Classe\s+\d\s*\bN\s+[0-9.]+,[0-9]{2}\s+[0-9]{1,2}\s+([0-9]{1,2}),[0-9]{2}\s+[0-9.]+,[0-9]{2}\b/i)
        ?? following.match(/^\s*\bN\s+[0-9.]+,[0-9]{2}\s+[0-9]{1,2}\s+([0-9]{1,2}),[0-9]{2}\s+[0-9.]+,[0-9]{2}\b/i);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      if (widthCm !== null && heightCm !== null && Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_SCREENING_QUANTITY) {
        const before = items.length;
        appendItems(quantity, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[3]), motorized ? "Tenda da sole motorizzata" : "Tenda da sole");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: widthCm, heightOriginal: heightCm, explicitUnit: "cm",
          widthResolution: "explicit_cm", heightResolution: "explicit_cm",
          ruleId: quantityMatch ? ZANZASOL_NARRATIVE_QUANTITY_FROM_PRICE_ROW_RULE_ID : ZANZASOL_PLURAL_HEADER_AND_GTOT_PERIOD_TOLERANCE_RULE_ID,
        };
      }
    }
    // Regressione Lavezzi: alcune fatture (formato "Vostro dare...")
    // descrivono il saldo come una frase narrativa di pagamento con la
    // misura incorporata subito dopo "tenda da sole", senza etichette L/H
    // ne' un gTot locale ("Vostro dare per fornitura e posa di tenda da
    // sole 300x250, presso vostra abitazione..."). Fallback di ultima
    // istanza, attivo solo se nessun altro parser ha gia' trovato righe: il
    // gTot resta responsabilita' del solo classificatore condiviso (famiglia
    // "tenda" -> fallback 0,13 autorizzato).
    if (items.length === 0) {
      const narrativePaymentMatch = compact.match(/\btend[ae]\s+da\s+sole\s+([0-9]{2,4})\s*[xX×]\s*([0-9]{2,4})\s*,/i);
      if (narrativePaymentMatch) {
        const widthCm = parseItalianNumber(narrativePaymentMatch[1]);
        const heightCm = parseItalianNumber(narrativePaymentMatch[2]);
        if (widthCm !== null && heightCm !== null) {
          const before = items.length;
          appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), null, "Tenda da sole");
          for (const item of items.slice(before)) item.measurementAudit = {
            widthOriginal: widthCm, heightOriginal: heightCm, explicitUnit: "cm",
            widthResolution: "explicit_cm", heightResolution: "explicit_cm",
            ruleId: NARRATIVE_PAYMENT_SENTENCE_AWNING_DIMENSION_RULE_ID,
          };
        }
      }
    }
    // Le zanzariere sono "Altra schermatura solare" e ogni occorrenza fisica
    // resta una riga. Il gTot rimane nullo se non documentato: il registro
    // applichera' successivamente il fallback autorizzato 0,33.
    for (const match of compact.matchAll(/ZANZARIERA(?:(?!\bZANZARIERA\b)[\s\S]){0,260}?MISURA\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)(?:(?!\bZANZARIERA\b)[\s\S]){0,180}/gi)) {
      const widthCm = parseItalianNumber(match[1]); const heightCm = parseItalianNumber(match[2]);
      const explicitGTot = match[0].match(/G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1];
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), explicitGTot ? parseItalianNumber(explicitGTot) : null, "Altra schermatura solare - zanzariera");
    }
    // Formato narrativo LM Tende: la zanzariera e' descritta senza una
    // tabella tecnica e usa `N° 1 da 490 x 355`; il gTot compare in chiusura
    // dello stesso blocco. Le misure sono centimetri (coerenti anche con la
    // superficie dichiarata) e l'eventuale motore e' evidenza primaria, non un
    // fallback manuale.
    for (const match of compact.matchAll(/ZANZARIERA(?:(?!\bZANZARIERA\b)[\s\S]){0,420}?\bN[°º.]?\s*(\d{1,2})\s+DA\s+([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)(?:(?!\bZANZARIERA\b)[\s\S]){0,360}?\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm === null || heightCm === null) continue;
      const description = /\bMOTOR(?:E|IZZAT[AOEI])\b/i.test(match[0])
        ? "Altra schermatura solare - zanzariera motorizzata"
        : "Altra schermatura solare - zanzariera";
      appendItems(Number(match[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[4]), description);
    }
    // Correzione di Giuliano (2026-09-07): lo stesso formato narrativo LM
    // Tende (`N° <qta> da <L> x <H> cm`) e' usato anche per la tenda da sole
    // cassonata, non solo per la zanzariera, e spesso senza gTot esplicito
    // (il fallback autorizzato per tende generiche si applica a valle).
    for (const match of compact.matchAll(/\bTENDA\s+DA\s+SOLE\s+CASSONATA(?:(?!\bTENDA\s+DA\s+SOLE\b)[\s\S]){0,260}?\bN[°º.]?\s*(\d{1,2})\s+DA\s+([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)\s*CM\b(?:(?!\bTENDA\s+DA\s+SOLE\b)[\s\S]){0,180}/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm === null || heightCm === null) continue;
      const explicitGTot = match[0].match(/G\s*TOT\.?\s*([0-9]+(?:[,.][0-9]+)?)/i)?.[1];
      const motorized = /\bMOTOR(?:E|IZZAT[AOEI])\b/i.test(match[0]);
      const before = items.length;
      appendItems(Number(match[1]), Math.round(widthCm * 10), Math.round(heightCm * 10), explicitGTot ? parseItalianNumber(explicitGTot) : null, motorized ? "Tenda da sole motorizzata" : "Tenda da sole");
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: widthCm, heightOriginal: heightCm, explicitUnit: "cm",
        widthResolution: "explicit_cm", heightResolution: "explicit_cm",
        ruleId: LM_TENDE_NARRATIVE_AWNING_MEASUREMENT_RULE_ID,
      };
    }
    // Formato Rinaldi con profondita' indicata come SP.CM anziche' H.CM.
    for (const match of compact.matchAll(/DIM\.?\s*L\.?\s*CM\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*SP\.?\s*CM\.?\s*([0-9]+(?:[,.][0-9]+)?)[\s\S]{0,900}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[1]); const heightCm = parseItalianNumber(match[2]);
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[3]), "Tenda a bracci estensibili");
    }
    // Formato Galbiati: modello e misura in centimetri precedono il gTot,
    // anche con decimali italiani (es. 165,5x275). Ogni descrizione e' un
    // prodotto fisico distinto; l'acconto privo di misure non genera righe.
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE[\s\S]{0,90}?CM\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)[\s\S]{0,90}?G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[1]); const heightCm = parseItalianNumber(match[2]);
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[3]), "Tenda da sole");
    }
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE[\s\S]{0,180}?\bL\s*(?:(MM|CM|M)\.?\s*)?([0-9]+(?:[,.][0-9]+)?)\s*(MM|CM|M)?\s*[X×]\s*S\s*(?:(MM|CM|M)\.?\s*)?([0-9]+(?:[,.][0-9]+)?)\s*(MM|CM|M)?[\s\S]{0,220}?G\s*TOT(?:\s+CLASSE\s+\d+)?(?:\s+VALORE)?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const rawWidth = parseItalianNumber(match[2]); const rawHeight = parseItalianNumber(match[5]);
      if (rawWidth === null || rawHeight === null) continue;
      const explicitUnits = [match[1], match[3], match[4], match[6]].filter(Boolean).map((unit) => unit.toLowerCase() as ScreeningMeasureUnit);
      const uniqueUnits = [...new Set(explicitUnits)];
      if (uniqueUnits.length > 1) { invalidScreeningDimensionUnit = true; continue; }
      const localSurfaceValues = extractExplicitSurfaceValues(match[0]);
      const explicitSurface = localSurfaceValues.length === 1 ? localSurfaceValues[0] : null;
      const resolved = resolveScreeningMeasurePair(rawWidth, rawHeight, uniqueUnits[0] ?? null, explicitSurface);
      const before = items.length;
      appendItems(1, resolved.widthMm, resolved.heightMm, parseItalianNumber(match[7]), "Tenda da sole", explicitSurface);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: rawWidth,
        heightOriginal: rawHeight,
        explicitUnit: uniqueUnits[0] ?? null,
        widthResolution: resolved.resolution,
        heightResolution: resolved.resolution,
        ruleId: SCREENING_DIMENSION_SURFACE_RULE_ID,
      };
    }
    // Formato Suman: una sola descrizione narrativa elenca piu misure dopo
    // "Mis Mt" e dichiara un unico gTot. Valori come 410x225 sono centimetri
    // nonostante l'intestazione storica; valori decimali <=20 sono metri e
    // valori >=2000 sono millimetri. Ogni coppia resta un prodotto distinto.
    if (/\bSUMAN\s+GIANNI\b/i.test(sourceText)) {
      const group = compact.match(/tend[ae]\s+da\s+sole[\s\S]{0,360}?\bMis(?:ura|ure)?\.?\s*(?:Mt\.?\s*)?((?:[0-9]+(?:[,.][0-9]+)?\s*[x×]\s*[0-9]+(?:[,.][0-9]+)?)(?:\s*(?:e|,|\+)\s*[0-9]+(?:[,.][0-9]+)?\s*[x×]\s*[0-9]+(?:[,.][0-9]+)?)*)[\s\S]{0,520}?\bG\s*\.?\s*tot\s*([0-9]+(?:[,.][0-9]+)?)/i);
      if (group) {
        const gTot = parseItalianNumber(group[2]);
        for (const dimensions of group[1].matchAll(/([0-9]+(?:[,.][0-9]+)?)\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
          const width = parseItalianNumber(dimensions[1]); const height = parseItalianNumber(dimensions[2]);
          if (width === null || height === null || gTot === null) continue;
          const maximum = Math.max(width, height);
          const multiplier = maximum <= 20 ? 1000 : maximum < 2000 ? 10 : 1;
          appendItems(1, Math.round(width * multiplier), Math.round(height * multiplier), gTot, "Tenda da sole a bracci estensibili");
        }
      }
    }
    for (const match of compact.matchAll(/N[°º]\s*(\d+)\s+da\s+(\d{2,4})\s*[X×]\s*(\d{2,4})\s*cm[\s\S]{0,240}?G\s*tot\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      appendItems(Number(match[1]), Number(match[2]) * 10, Number(match[3]) * 10, parseItalianNumber(match[4]), "Tenda da sole cassonata");
    }
    for (const match of compact.matchAll(/n[°º]\s*(\d+)\s*\+\s*(\d+)\s+tende[\s\S]{0,300}?L\s*(\d{2,5})\s*[X×]\s*H\s*(\d{2,5})\s*mm/gi)) {
      appendItems(Number(match[1]) + Number(match[2]), Number(match[3]), Number(match[4]), null, /cristal/i.test(match[0]) ? "Tenda Cristal" : "Tenda tecnica a caduta");
    }
    for (const match of compact.matchAll(/n[°º]\s*(\d+)\s+tenda\s+tecnica[\s\S]{0,240}?L\s*(\d{2,5})\s*[X×]\s*H\s*(\d{2,5})\s*mm/gi)) {
      appendItems(Number(match[1]), Number(match[2]), Number(match[3]), null, /cristal/i.test(match[0]) ? "Tenda Cristal" : "Tenda tecnica a caduta");
    }
    // Formato Linea Sole Potito: la quantita' fisica e' incorporata nella
    // descrizione (es. "N04 Da l 1290x3000"), mentre la colonna quantita'
    // della fattura descrive il blocco servizio. N04 significa quattro pezzi.
    for (const match of compact.matchAll(/Veneziane\s+da\s+\d{2}\s*mm[\s\S]{0,260}?\bN\s*0?(\d{1,2})\s+Da\s*(?:[Il|]\s*)?(\d{3,5})\s*[x×]\s*(\d{3,5})/gi)) {
      const groupKey = `${Number(match[1])}|${Number(match[2])}|${Number(match[3])}|tenda-veneziana`;
      // Alcuni allegati CRM sono PDF compositi che ripetono integralmente la
      // stessa fattura. La cardinalita' N04 va applicata una volta sola alla
      // stessa evidenza incorporata, non una volta per ogni copia della pagina.
      if (seenEmbeddedProductGroups.has(groupKey)) continue;
      seenEmbeddedProductGroups.add(groupKey);
      appendItems(Number(match[1]), Number(match[2]), Number(match[3]), null, "Tenda veneziana");
    }
    // Linea Sole Potito, tende a bracci: la quantita' e' la prima colonna
    // numerica subito dopo la riga Larghezza×Sporgenza. Il numero iniziale
    // della descrizione e' invece il progressivo riga e non va usato come
    // cardinalita'. Il valore puo essere stampato come GHOT TENDA.
    for (const match of sourceText.matchAll(/Tenda\s+da\s+Sole[^\n\r]{0,180}[\r\n]+\s*L\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\s*[\r\n]+\s*(\d{1,2})\s+(?=\d{1,3}(?:[.,]\d{2,4})?)[\s\S]{0,1200}?(?:G\s*HOT|G\s*TOT)(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const groupKey = `${Number(match[3])}|${Number(match[1])}|${Number(match[2])}|${match[4]}|tenda-linea-sole-potito`;
      if (seenEmbeddedProductGroups.has(groupKey)) continue;
      seenEmbeddedProductGroups.add(groupKey);
      appendItems(Number(match[3]), Number(match[1]), Number(match[2]), parseItalianNumber(match[4]), "Tenda da sole a bracci");
    }
    // Variante della stessa fattura in cui LxH resta sulla riga descrittiva e
    // la quantità è una riga numerica autonoma dopo al massimo tre righe di
    // attributi. La presenza congiunta di famiglia prodotto, quantità isolata
    // e gTot locale impedisce di promuovere generiche misure di vano.
    for (const match of sourceText.matchAll(/Tenda\s+da\s+Sole[^\n\r]{0,180}?\bL\s*(\d{3,5})\s*[x×]\s*(\d{3,5})[^\n\r]*[\r\n]+(?:[^\n\r]*[\r\n]+){0,3}\s*(\d{1,2})\s*[\r\n]+\s*(?=\d{1,3}(?:[.,]\d{2,4})?)[\s\S]{0,1200}?(?:G\s*HOT|G\s*TOT)(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const groupKey = `${Number(match[3])}|${Number(match[1])}|${Number(match[2])}|${match[4]}|tenda-linea-sole-inline`;
      if (seenEmbeddedProductGroups.has(groupKey)) continue;
      seenEmbeddedProductGroups.add(groupKey);
      const duplicate = items.some((item) => item.widthMm === Number(match[1])
        && item.heightMm === Number(match[2]) && /tenda.*sole/i.test(item.description));
      if (!duplicate) {
        const before = items.length;
        appendItems(Number(match[3]), Number(match[1]), Number(match[2]), parseItalianNumber(match[4]), "Tenda da sole a bracci");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Number(match[1]),
          heightOriginal: Number(match[2]),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: INLINE_DESCRIPTION_PRODUCT_MEASUREMENTS_RULE_ID,
        };
      }
    }
    // Nelle rappresentazioni SdI OCR la colonna quantità può sparire pur
    // lasciando prezzo unitario e importo su due righe consecutive. Una sola
    // unità è dimostrata soltanto se le intestazioni tabellari sono presenti,
    // i due importi coincidono al centesimo e misura e gTot restano espliciti.
    if (/\bPRODOTTI\s+E\s+SERVIZI\b[\s\S]{0,500}?\bQUANTITA'?\b[\s\S]{0,120}?\bPREZZO\b[\s\S]{0,120}?\bIMPORTO\b/i.test(sourceText)) {
      for (const match of sourceText.matchAll(/Tenda\s+da\s+Sole[^\n\r]{0,180}?\bL\s*(\d{3,5})\s*[x×]\s*(\d{3,5})[^\n\r]*/gi)) {
        const tail = sourceText.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 1400);
        const leadingLines = tail.split(/\r?\n/).slice(0, 7);
        const monetaryValues = leadingLines.flatMap((line) => {
          const amount = line.match(/^\s*([0-9.]+,[0-9]{2})\s*€?/);
          return amount ? [amount[1]] : [];
        });
        const explicitGtot = tail.match(/(?:G\s*HOT|G\s*TOT)(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/i);
        if (monetaryValues.length < 2 || !explicitGtot) continue;
        const unitPrice = parseItalianNumber(monetaryValues[0]);
        const rowAmount = parseItalianNumber(monetaryValues[1]);
        if (unitPrice === null || rowAmount === null || Math.abs(unitPrice - rowAmount) > 0.01) continue;
        const duplicate = items.some((item) => item.widthMm === Number(match[1])
          && item.heightMm === Number(match[2]) && /tenda.*sole/i.test(item.description));
        if (duplicate) continue;
        const before = items.length;
        appendItems(1, Number(match[1]), Number(match[2]), parseItalianNumber(explicitGtot[1]), "Tenda da sole a bracci");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Number(match[1]),
          heightOriginal: Number(match[2]),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: TABULAR_EQUAL_PRICE_AMOUNT_SINGLE_QUANTITY_RULE_ID,
        };
      }
    }
    // Linea Sole Potito, modello "scomparsa totale": descrizione e misura
    // possono precedere di alcune righe la dicitura tenda da sole, mentre il
    // gTot e' riportato come GHOT nella fattura di saldo. La coppia di misure
    // identifica un singolo prodotto fisico; acconto e saldo vengono poi
    // riconciliati dal segmentatore senza aggregare righe tecniche diverse.
    // Il codice modello del fornitore puo' comparire anche TRA "totale" e
    // "L" (es. "scomparsa totale S/2022 L 5000x2000"), non solo prima di
    // "scomparsa" (regressione Mocenighi: il codice modello rompeva
    // l'adiacenza richiesta e azzerava il riconoscimento della misura).
    // Regola generale di Giuliano: la ricerca della misura non deve mai
    // leggere o verificare le righe di importo/IVA che l'estrazione OCR
    // tabellare intercala fra la descrizione e la misura stessa (vengono
    // saltate come rumore da stripInvoicePricingNoiseLines, non usate). Una
    // "scomparsa totale" cassonata e' gia' di per se' una tenda da sole: non
    // serve piu' richiedere che la dicitura compaia di nuovo vicino alla
    // misura, dato che nella fattura reale puo' comparire solo altrove, in
    // una riga di servizio scollegata (es. "impianto elettrico x 2 tende da
    // sole"), mai adiacente alla misura del prodotto stesso.
    if (/\bLINEA\s+SOLE\s+POTITO\b/i.test(sourceText)) {
      const explicitGtot = sourceText.match(/\bG\s*HOT(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/i);
      const noiseFreeSourceText = stripInvoicePricingNoiseLines(sourceText);
      for (const match of noiseFreeSourceText.matchAll(/\bscomparsa\s+totale(?:\s+[A-Z0-9/]{1,12})?\s+L\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\b/gi)) {
        const groupKey = `1|${Number(match[1])}|${Number(match[2])}|scomparsa-totale`;
        if (seenEmbeddedProductGroups.has(groupKey)) continue;
        seenEmbeddedProductGroups.add(groupKey);
        const before = items.length;
        appendItems(1, Number(match[1]), Number(match[2]), explicitGtot ? parseItalianNumber(explicitGtot[1]) : null, "Tenda da sole scomparsa totale");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Number(match[1]),
          heightOriginal: Number(match[2]),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: LINEA_SOLE_POTITO_SCOMPARSA_TOTALE_MODEL_CODE_TOLERANCE_RULE_ID,
        };
      }
      // Regressione Bellotti/Madia: alcune fatture di questo fornitore
      // descrivono il prodotto come "Tenda modello <codice> [qualificatore]
      // L <largh>x<alt>" senza mai citare "scomparsa" (es. "Tenda modello
      // S/2022 L 310 x1600 Acconto", "Tenda modello T/v cassonata
      // L700x1600 Saldo"). Il codice modello e un eventuale qualificatore
      // (es. "cassonata") possono comparire fra il modello e la misura;
      // "scomparsa" non e' un requisito - "modello ... L <misura>" e' gia'
      // di per se' una riga prodotto reale su questo fornitore.
      for (const match of noiseFreeSourceText.matchAll(/\bmodello\s+([A-Z0-9/]{1,12})(?:\s+[A-Za-zàèéìòù]{1,20})?\s+L\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\b/gi)) {
        const groupKey = `1|${Number(match[2])}|${Number(match[3])}|modello-label`;
        if (seenEmbeddedProductGroups.has(groupKey)) continue;
        seenEmbeddedProductGroups.add(groupKey);
        const before = items.length;
        appendItems(1, Number(match[2]), Number(match[3]), explicitGtot ? parseItalianNumber(explicitGtot[1]) : null, `Tenda da sole modello ${match[1]}`);
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Number(match[2]),
          heightOriginal: Number(match[3]),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: LINEA_SOLE_POTITO_MODELLO_LABEL_DIMENSION_RULE_ID,
        };
      }
      // Regressione Di Bello: la tabella OCR di alcune fatture di questo
      // fornitore intercala la misura PRIMA della frase descrittiva, cosi'
      // "scomparsa totale ... L" resta senza una vera coppia largh.x/alt.
      // subito dopo la "L" (es. "...Struttura bianco\n2\n3000×1800\nN01
      // Acconto Tenda modello S/2022 scomparsa totale L\n3\n<importo>",
      // dove il "3" residuo dopo "L" e' soltanto il numero della riga
      // successiva sopravvissuto alla rimozione del rumore economico, non
      // l'inizio di una misura). Si esclude un falso orfano soltanto quando
      // dopo "L" segue davvero un'altra coppia "<cifre> x/×" (la misura e'
      // gia' al suo posto, gestita dal pattern precedente): una singola
      // cifra residua isolata non basta a escludere la ricerca all'indietro.
      for (const match of noiseFreeSourceText.matchAll(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b(?=[\s\S]{0,120}?\bscomparsa\s+totale(?:\s+[A-Z0-9/]{1,12})?\s+L\b(?!\s*\d+\s*[x×]))/gi)) {
        const groupKey = `1|${Number(match[1])}|${Number(match[2])}|scomparsa-orphaned-dimension`;
        if (seenEmbeddedProductGroups.has(groupKey)) continue;
        seenEmbeddedProductGroups.add(groupKey);
        const before = items.length;
        appendItems(1, Number(match[1]), Number(match[2]), explicitGtot ? parseItalianNumber(explicitGtot[1]) : null, "Tenda da sole scomparsa totale");
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: Number(match[1]),
          heightOriginal: Number(match[2]),
          explicitUnit: "mm",
          widthResolution: "explicit_mm",
          heightResolution: "explicit_mm",
          ruleId: LINEA_SOLE_POTITO_DIMENSION_BEFORE_SCOMPARSA_LABEL_RULE_ID,
        };
      }
    }
    // Regressione Pasinato: la fattura di una pergotenda spesso non riporta
    // alcuna misura (solo "FORNITURA N. 1 PERGOTENDA..."): la misura reale
    // e' soltanto nel modulo d'ordine tecnico del produttore VA.ILA.
    // ("MODULO ORDINE OPEN HOUSE"), che intercala scelte di colore/motore
    // scollegate fra ogni etichetta e il proprio valore ("Larghezza
    // totale\nL\ncm 500", "Profondita\n[motore]\nSP\n[colore]\nCm 300").
    // Verificato su un solo documento reale finora: se un futuro cliente
    // con lo stesso modulo usa una formulazione diversa, questo pattern
    // specifico potrebbe non generalizzare e andra' esteso, non l'unico
    // riferimento resta comunque fail-closed (nessuna misura inventata).
    if (items.length === 0 && /\bPERGOTENDA\b/i.test(sourceText) && /MODULO\s+ORDINE\s+OPEN\s+HOUSE/i.test(sourceText)) {
      const widthMatch = compact.match(/Larghezza\s+totale[\s\S]{0,40}?\bcm\s*(\d{2,4})\b/i);
      const depthMatch = compact.match(/Profondit[aà][\s\S]{0,120}?\bSP\b[\s\S]{0,60}?\bcm\s*(\d{2,4})\b/i);
      if (widthMatch && depthMatch) {
        const widthCm = parseItalianNumber(widthMatch[1]);
        const depthCm = parseItalianNumber(depthMatch[1]);
        if (widthCm !== null && depthCm !== null) {
          const before = items.length;
          appendItems(1, Math.round(widthCm * 10), Math.round(depthCm * 10), null, "Pergotenda");
          for (const item of items.slice(before)) item.measurementAudit = {
            widthOriginal: Math.round(widthCm * 10),
            heightOriginal: Math.round(depthCm * 10),
            explicitUnit: "mm",
            widthResolution: "explicit_mm",
            heightResolution: "explicit_mm",
            ruleId: VAILA_OPEN_HOUSE_PERGOTENDA_ORDER_FORM_DIMENSION_RULE_ID,
          };
        }
      }
    }
    if (authoritativeVendorItems) items.splice(0, items.length, ...authoritativeVendorItems);
    const narrativeGroups = extractNarrativeScreeningItems(sourceText);
    const narrativeCount = narrativeGroups.reduce((sum, group) => sum + group.quantity, 0);
    // Se il parser strutturato ha catturato soltanto la prima riga di una
    // descrizione narrativa, il gruppo completo e' una prova piu ricca della
    // cardinalita'. Sostituiamo solo quando enumera strettamente piu pezzi.
    if (items.length === 0 || narrativeCount > items.length) {
      items.splice(0, items.length);
      for (const group of narrativeGroups) {
        appendItems(group.quantity, group.widthMm, group.heightMm, group.gTot, group.description);
      }
    }

    // Ultimo fallback, generico e senza etichette note: si attiva solo se
    // nessun parser dedicato ne' il fallback narrativo hanno trovato righe.
    if (items.length === 0) {
      const genericGroups = extractGenericTwoMeasurementScreeningItems(sourceText);
      for (const group of genericGroups) {
        const before = items.length;
        appendItems(group.quantity, group.widthMm, group.heightMm, null, group.description);
        for (const item of items.slice(before)) item.measurementAudit = {
          widthOriginal: group.widthOriginal,
          heightOriginal: group.heightOriginal,
          explicitUnit: null,
          widthResolution: `explicit_${group.widthUnit}`,
          heightResolution: `explicit_${group.heightUnit}`,
          ruleId: GENERIC_LABELLED_MEASUREMENT_PAIR_AREA_RULE_ID,
        };
      }
    }

    // Quando la fattura espone una superficie per ciascuna riga fisica, il
    // valore documentato prevale sul calcolo da dimensioni. Questo evita la
    // perdita di centesimi dovuta a troncamenti o arrotondamenti intermedi.
    const explicitSurfaceValues = extractExplicitSurfaceValues(sourceText);
    if (explicitSurfaceValues.length === items.length) {
      for (let index = 0; index < items.length; index += 1) {
        const calculatedSurfaceM2 = roundSurface((items[index].widthMm * items[index].heightMm) / 1_000_000);
        const relativeDifference = screeningSurfaceDifference(calculatedSurfaceM2, explicitSurfaceValues[index]);
        const consistent = screeningSurfacesAreCoherent(calculatedSurfaceM2, explicitSurfaceValues[index]);
        items[index] = { ...items[index], surfaceAudit: {
          explicitSurfaceM2: explicitSurfaceValues[index],
          calculatedSurfaceM2,
          relativeDifference,
          toleranceRelative: SCREENING_SURFACE_RELATIVE_TOLERANCE,
          consistent,
          ruleId: SCREENING_DIMENSION_SURFACE_RULE_ID,
        } };
        if (!consistent) surfaceCoherenceFailures.push(`Riga ${index + 1}: superficie esplicita ${explicitSurfaceValues[index]} m2 non coerente con ${calculatedSurfaceM2} m2 calcolati dalle misure oltre la tolleranza del 5%.`);
        items[index] = { ...items[index], surfaceM2: roundSurface(explicitSurfaceValues[index]) };
      }
    }
  }

  return {
    items,
    result: {
      path,
      status: invalidExplicitQuantity || invalidScreeningDimensionUnit || surfaceCoherenceFailures.length > 0 ? "failed" : "parsed",
      documentType,
      total: extractDocumentTotal(sourceText),
      itemCount: items.length,
      ...(invalidExplicitQuantity || invalidScreeningDimensionUnit || surfaceCoherenceFailures.length > 0
        ? { message: [
          invalidExplicitQuantity ? "Quantità schermatura esplicita non valida: controllo umano richiesto." : "",
          invalidScreeningDimensionUnit ? "Unità di misura discordanti nella stessa riga schermatura: controllo umano richiesto." : "",
          ...surfaceCoherenceFailures,
        ].filter(Boolean).join(" ") }
        : {}),
      ...extractDocumentIdentity(sourceText),
    },
  };
}

/**
 * Estrae soltanto righe tecniche da preventivi, schede ordine e certificati
 * originari non fiscali. Il chiamante non usa mai tipo documento o importi
 * della fonte: vengono riusati esclusivamente i parser dimensionali.
 */
export function parseScreeningTechnicalSourceText(text: string, path = "documento-tecnico.pdf"): EneaLabScreeningItem[] {
  return parseScreeningInvoiceText(`FATTURA\n${text}`, path).items;
}

export function combineDocumentResults(
  parsed: Array<{ result: EneaLabDocumentResult; items: EneaLabScreeningItem[] }>,
): EneaLabDocumentAnalysis {
  const documents = parsed.map(({ result }) => result);
  const items = parsed
    .filter(({ result }) => result.documentType === "invoice")
    .flatMap((entry) => entry.items);
  const invoiceDocuments = documents.filter(({ documentType }) => documentType === "invoice");
  const invoiceTotal = invoiceDocuments.reduce((sum, document) => sum + (document.total ?? 0), 0);
  const creditTotal = documents
    .filter(({ documentType }) => documentType === "credit_note")
    .reduce((sum, document) => sum + Math.abs(document.total ?? 0), 0);
  const invoiceDates = invoiceDocuments
    .flatMap(({ documentDate }) => documentDate ? [documentDate] : [])
    .sort();
  const firstInvoiceDate = invoiceDates[0] ?? null;
  const lastInvoiceDate = invoiceDates.at(-1) ?? null;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const identities = documents.map(documentIdentity).filter((identity): identity is string => identity !== null);
  const duplicateIdentities = identities.filter((identity, index) => identities.indexOf(identity) !== index);
  const hasDuplicateDocuments = duplicateIdentities.length > 0;

  if (!invoiceDocuments.length) blockers.push("Nessuna fattura riconosciuta tra i documenti fiscali.");
  if (!items.length) blockers.push("Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture.");
  if (documents.some(({ total }) => total === null)) {
    blockers.push("Il totale di almeno un documento fiscale non è stato riconosciuto.");
  }
  if (documents.some(({ status }) => status !== "parsed")) {
    blockers.push("Almeno un documento deve essere letto o controllato manualmente.");
    blockers.push(...documents.filter(({ status, message }) => status !== "parsed" && message).map(({ message }) => message!));
  }
  if (documents.some(({ documentType }) => documentType === "unknown")) {
    blockers.push("Almeno un documento non è stato riconosciuto come fattura o nota di credito.");
  }
  if (invoiceTotal > 0 && creditTotal > invoiceTotal) {
    blockers.push("Le note di credito superano il totale delle fatture.");
  }
  if (hasDuplicateDocuments) {
    blockers.push("Possibile documento fiscale duplicato: verificare numero, data e importo prima di calcolare la spesa.");
  }
  if (items.some(({ widthMm, heightMm }) => widthMm < 100 || heightMm < 100)) {
    warnings.push("Almeno una schermatura ha dimensioni inferiori a 100 mm: verificare l'unità di misura.");
  }
  if (invoiceDocuments.some(({ documentDate }) => !documentDate)) {
    warnings.push("La data non è stata riconosciuta in almeno una fattura.");
  }

  const totalsComplete = documents.length > 0 && !documents.some(({ total }) => total === null);
  const eligibleExpense = totalsComplete && !hasDuplicateDocuments ? invoiceTotal - creditTotal : null;

  return {
    items,
    invoiceTotal,
    creditTotal,
    eligibleExpense: eligibleExpense !== null && eligibleExpense >= 0 ? eligibleExpense : null,
    firstInvoiceDate,
    lastInvoiceDate,
    documents,
    blockers,
    warnings,
  };
}
