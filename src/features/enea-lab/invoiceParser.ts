import type {
  EneaLabDocumentAnalysis,
  EneaLabDocumentResult,
  EneaLabScreeningItem,
} from "./types";

const MAX_SCREENING_QUANTITY = 50;
const PERSIANA_RULE_ID = "user-2026-08-18-persiana-screening-contract-v1";
const AVVOLGIBILE_RULE_ID = "user-2026-08-18-avvolgibile-screening-contract-v1";
const SCREENING_DIMENSION_SURFACE_RULE_ID = "user-2026-08-26-screening-dimension-unit-surface-coherence-v1";
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
      const totalToPayIndex = lines.slice(index + 1, index + 6).findIndex((line) => /^totale\s+a\s+pagare\b/i.test(line));
      if (totalToPayIndex >= 0) {
        for (let offset = 0; offset <= 4 && index + 1 + totalToPayIndex + offset < lines.length; offset += 1) {
          const candidateLine = lines[index + 1 + totalToPayIndex + offset];
          if (!/(?:\bEuro\b|€)/i.test(candidateLine)) continue;
          const currencyTotal = amount(candidateLine);
          if (currencyTotal) return parseItalianNumber(currencyTotal);
        }
        const totalToPay = fromWindow(index + 1 + totalToPayIndex, 2);
        if (totalToPay !== null) return totalToPay;
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
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^(?:totale\s+fattura|netto\s+a\s+pagare|totale)(?:\s|$)/i.test(lines[index])
      || /^totale\s+(?:imponibile|iva|imposta|compreso|merce|fornitura|sconto|spese\s+congrue)\b/i.test(lines[index])) continue;
    // Alcuni gestionali di serramenti stampano il riepilogo in colonna:
    //   Totale fattura
    //   <imponibile>
    //   <IVA>
    //   <lordo>
    // La prima cifra dopo l'etichetta non e' quindi il totale fattura. Il
    // lordo e' accettato solo quando la terna si riconcilia al centesimo.
    if (/^totale\s+fattura\s*$/i.test(lines[index])) {
      const taxable = moneyAt(index + 1);
      const vat = moneyAt(index + 2);
      const gross = moneyAt(index + 3);
      if (taxable !== null && vat !== null && gross !== null
        && Math.abs(Math.round((taxable + vat + Number.EPSILON) * 100) / 100 - gross) <= 0.011) return gross;
    }
    const value = fromWindow(index, 2); if (value !== null) return value;
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^totale\b/i.test(lines[index]) || /^totale\s+(?:imponibile|iva|imposta|compreso|merce|fornitura|sconto|spese\s+congrue)\b/i.test(lines[index])) continue;
    const value = fromWindow(index, 2); if (value !== null) return value;
  }
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
  if (!groups.length) {
    const single = compact.match(/\b((?:pergo\s*tenda|pergotenda|tenda\s+da\s+sole)[\s\S]{0,160}?)\bLarghezza\s+([0-9]+(?:[,.][0-9]+)?)\s*cm[\s\S]{0,100}?\b(?:Sporgenza|Altezza)\s+([0-9]+(?:[,.][0-9]+)?)\s*cm/i);
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
    // Formato S.A. Montaggi: il gTot precede la misura espressa in cm.
    for (const match of compact.matchAll(/TENDA\s+DA\s+SOLE(?:(?!\b(?:ZANZARIERA|TENDA\s+DA\s+SOLE)\b)[\s\S]){0,520}?G\s*TOT\s*(?:TESSUTO\s*)?([0-9]+(?:[,.][0-9]+)?)(?:(?!\b(?:ZANZARIERA|TENDA\s+DA\s+SOLE)\b)[\s\S]){0,300}?MISURA\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[2]); const heightCm = parseItalianNumber(match[3]);
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[1]), "Tenda da sole");
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
        const isZanzariera = /\bzanzariere?\b/i.test(group);
        const isMotorized = /\bmotorizzat[aeio]?\b|\bmotori?\b/i.test(group);
        const description = isZanzariera
          ? `Altra schermatura solare - zanzariera${isMotorized ? " motorizzata" : ""}`
          : /\ba\s+caduta\b/i.test(group)
            ? `Tenda da sole a caduta${isMotorized ? " motorizzata" : ""}`
            : `Tenda da sole${isMotorized ? " motorizzata" : ""}`;
        const explicitSurfaces = extractExplicitSurfaceValues(group);
        const dimensions = [...group.matchAll(/\bN[°º.]?\s*(\d{1,2})\s+da\s+([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)/gi)];
        for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
          const dimension = dimensions[dimensionIndex];
          const widthCm = parseItalianNumber(dimension[2]); const heightCm = parseItalianNumber(dimension[3]);
          if (widthCm !== null && heightCm !== null) appendItems(
            Number(dimension[1]),
            Math.round(widthCm * 10),
            Math.round(heightCm * 10),
            uniqueGTot[0],
            description,
            explicitSurfaces[dimensionIndex],
            lmItems,
          );
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
    const persianaStarts = [...compact.matchAll(/(?:\bN[.°º]?\s*(\d{1,2})\s+)?\bPERSIAN[AE]\b/gi)];
    for (let index = 0; index < persianaStarts.length; index += 1) {
      const start = persianaStarts[index];
      const block = compact.slice(start.index!, Math.min(persianaStarts[index + 1]?.index ?? compact.length, start.index! + 520));
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
      const description = /\bmotore\b|motorizzat|automatic/i.test(block) ? "Persiana in alluminio motorizzata" : "Persiana in alluminio";
      const quantity = Number(start[1] ?? block.match(/\b(?:Q(?:TA|TY)|QUANTIT[AÀ])\.?\s*[:=]?\s*(\d{1,2})\b/i)?.[1] ?? 1);
      const before = items.length;
      appendItems(quantity, widthMm, heightMm, documentedGTot ? parseItalianNumber(documentedGTot) : null, description);
      for (const item of items.slice(before)) item.measurementAudit = {
        widthOriginal: rawWidth,
        heightOriginal: rawHeight,
        explicitUnit: unit,
        widthResolution: width?.resolution ?? "ambiguous",
        heightResolution: height?.resolution ?? "ambiguous",
        ruleId: PERSIANA_RULE_ID,
      };
    }
    // Formato Zanzasol: la riga economica può precedere la descrizione
    // tecnica, mentre modello, `misura: LxH` e gTot sono riportati nelle
    // righe successive. La quantità fisica documentata è una tenda; motore,
    // posa e pratica ENEA sono servizi/accessori e non prodotti aggiuntivi.
    for (const match of compact.matchAll(/FORNITURA\s+(?:DI\s+)?TENDA\s+DA\s+SOLE(?:(?!\b(?:FORNITURA\s+(?:DI\s+)?TENDA\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])\b)[\s\S]){0,700}?\bMISUR[AE]?\s*:?\s*([0-9]+(?:[,.][0-9]+)?)\s*[X×]\s*([0-9]+(?:[,.][0-9]+)?)(?:(?!\b(?:FORNITURA\s+(?:DI\s+)?TENDA\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])\b)[\s\S]){0,220}?\bG\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
      const widthCm = parseItalianNumber(match[1]); const heightCm = parseItalianNumber(match[2]);
      const following = compact.slice(match.index! + match[0].length, match.index! + match[0].length + 420).split(/(?=FORNITURA\s+(?:DI\s+)?TENDA\s+DA\s+SOLE|ZANZARIERA|VETRAT[AE]\s+SCORREVOL[EI])/i)[0];
      const motorized = /\bFORNITURA\s+MOTORE\b[\s\S]{0,180}?\bPER\s+TENDA\s+DA\s+SOLE\b/i.test(following);
      if (widthCm !== null && heightCm !== null) appendItems(1, Math.round(widthCm * 10), Math.round(heightCm * 10), parseItalianNumber(match[3]), motorized ? "Tenda da sole motorizzata" : "Tenda da sole");
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
    // Linea Sole Potito, modello "scomparsa totale": descrizione e misura
    // possono precedere di alcune righe la dicitura tenda da sole, mentre il
    // gTot e' riportato come GHOT nella fattura di saldo. La coppia di misure
    // identifica un singolo prodotto fisico; acconto e saldo vengono poi
    // riconciliati dal segmentatore senza aggregare righe tecniche diverse.
    if (/\bLINEA\s+SOLE\s+POTITO\b/i.test(sourceText)) {
      const explicitGtot = sourceText.match(/\bG\s*HOT(?:\s+TENDA)?\s*([0-9]+(?:[,.][0-9]+)?)/i);
      for (const match of sourceText.matchAll(/\bscomparsa\s+totale\s+L\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\b[\s\S]{0,320}?\btenda\s+da\s+sole\b/gi)) {
        const groupKey = `1|${Number(match[1])}|${Number(match[2])}|scomparsa-totale`;
        if (seenEmbeddedProductGroups.has(groupKey)) continue;
        seenEmbeddedProductGroups.add(groupKey);
        appendItems(1, Number(match[1]), Number(match[2]), explicitGtot ? parseItalianNumber(explicitGtot[1]) : null, "Tenda da sole scomparsa totale");
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
