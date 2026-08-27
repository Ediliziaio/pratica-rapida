import { createHash } from "node:crypto";
import { parseScreeningInvoiceText, stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";

const normalizeNumber = (value: string) => value.trim().replace(/[^a-z0-9/.-]/gi, "").toUpperCase();
const comparableNumber = (value: string) => normalizeNumber(value).replace(/\/20(\d{2})$/, "/$1");
const normalizeDate = (value: string) => {
  const [day, month, year] = value.split(/[./-]/u);
  return `${year}-${month}-${day}`;
};
interface InvoiceHeading { index: number; documentNumber: string; documentDate: string }

function invoiceHeadings(text: string): InvoiceHeading[] {
  const patterns = [
    /(?:^|[\f\n])\s*Fattura(?:\s+Accompagnatoria)?\s+n\.?\s*([^\s]+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/gi,
    /Numero\s+fattura\s+Data\s+fattura\s*\n\s*([A-Z0-9./-]+)\s+(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|\f)[\s\S]{0,460}?\n\s*(?:acconto\/anticipo\s+su\s+fattura|fattura)\s*\n(?:\s*cfisc(?:\s*\n|\s+)[A-Z0-9]+\s*\n)?\s*([A-Z0-9./-]+)\s+del\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|\f)[\s\S]{0,620}?\bFATTURA(?:\s+ACCOMPAGNATORIA)?\s+([A-Z0-9./-]+)\s*\n?\s*DATA\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|[\f\n])\s*Fattura\s*\n\s*Numero\s*:\s*([A-Z0-9./-]+)\s*\n\s*Data\s+(\d{2}[./-]\d{2}[./-]\d{4})/gi,
    // Fatture Ideal Sistem: il titolo pagina precede una testata verticale
    // "Tipo documento / Num. Doc. / Data Docum." e numero/data compaiono
    // subito dopo il valore FATTURA, senza la parola "del".
    /(?:^|\f)[\s\S]{0,900}?\bTipo\s+documento-?[\s\S]{0,320}?\bFATTURA\s*\n\s*([A-Z0-9./-]+)\s*\n\s*(\d{2}\/\d{2}\/\d{4})/gi,
  ];
  const found = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => ({
    index: match.index ?? 0,
    documentNumber: normalizeNumber(match[1]),
    documentDate: normalizeDate(match[2]),
  })));
  return found.sort((left, right) => left.index - right.index)
    .filter((heading, index, all) => !all.slice(0, index).some((candidate) => candidate.index === heading.index
      || (candidate.documentNumber === heading.documentNumber && candidate.documentDate === heading.documentDate)));
}
const signature = (value: ReturnType<typeof parseScreeningInvoiceText>["items"]) => value.map((item) => [
  item.description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(),
  item.widthMm, item.heightMm, item.gTot,
].join("|")).sort().join("||");
const itemSignatures = (value: ReturnType<typeof parseScreeningInvoiceText>["items"]) => value.map((item) => [
  item.description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(),
  item.widthMm, item.heightMm, item.gTot,
].join("|")).sort();
const technicalSubset = (subset: LocalInvoiceSegment, superset: LocalInvoiceSegment) => {
  const available = itemSignatures(superset.items);
  return itemSignatures(subset.items).every((item) => {
    const index = available.indexOf(item);
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
};
const technicalShapeSignatures = (segment: LocalInvoiceSegment) => segment.items.map((item) => [
  /(?:avvolgibil|tapparell)/i.test(item.description) ? "avvolgibile"
    : /persian/i.test(item.description) ? "persiana"
      : /zanzarier/i.test(item.description) ? "zanzariera"
        : /tend/i.test(item.description) ? "tenda" : item.description.toLowerCase().replace(/\s+/g, " ").trim(),
  item.widthMm, item.heightMm,
].join("|")).sort();
const technicalShapeSubset = (subset: LocalInvoiceSegment, superset: LocalInvoiceSegment) => {
  const available = technicalShapeSignatures(superset);
  return technicalShapeSignatures(subset).every((item) => {
    const index = available.indexOf(item); if (index < 0) return false;
    available.splice(index, 1); return true;
  });
};

export interface LocalInvoiceSegment {
  sourceId: string;
  parentDocumentKey: string;
  index: number;
  text: string;
  documentNumber: string | undefined;
  documentDate: string | undefined;
  total: number | null;
  result: ReturnType<typeof parseScreeningInvoiceText>["result"];
  items: ReturnType<typeof parseScreeningInvoiceText>["items"];
  extractionMode: "native_text" | "macos_vision_ocr";
  referencedInvoiceNumbers: string[];
  replacedInvoiceNumbers: string[];
  technicalSignature: string;
}

export function splitLocalInvoiceText(input: {
  documentKey: string;
  text: string;
  extractionMode: LocalInvoiceSegment["extractionMode"];
}): LocalInvoiceSegment[] {
  const text = stripHistoricalEneaAppendix(input.text);
  const headings = invoiceHeadings(text);
  const ranges = headings.length > 1
    ? headings.map((heading, index) => ({ start: heading.index, end: headings[index + 1]?.index ?? text.length, heading }))
    : [{ start: 0, end: text.length, heading: headings[0] }];
  return ranges.map(({ start, end, heading }, index) => {
    const segmentText = text.slice(start, end).trim();
    const headingNumber = heading?.documentNumber ?? "unknown";
    const headingDate = heading?.documentDate ?? "unknown";
    const suffix = createHash("sha256").update([headingNumber, headingDate, index + 1].join("|")).digest("hex").slice(0, 12);
    const sourceId = `${input.documentKey}:invoice:${suffix}`;
    const parsed = parseScreeningInvoiceText(segmentText, sourceId);
    const documentNumber = parsed.result.documentNumber ?? heading?.documentNumber;
    const referencedInvoiceMatches = [
      ...segmentText.matchAll(/ACCONTO[\s\S]{0,120}?(?:FATT(?:URA)?\.?|FT)\s+(?:N\.?\s*)?([A-Z0-9/.-]+)(?:\s+DEL\s+(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2}))?/gi),
      ...segmentText.matchAll(/(?:FATT(?:URA)?\.?|FT)\s*(?:D[’']?ACCONTO|ACCONTO)\s+(?:N(?:R|\.)?\.?\s*)?([A-Z0-9/.-]+)(?:\s+DEL\s+(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2}))?/gi),
    ];
    const referencedInvoiceNumbers = referencedInvoiceMatches
      .map((match) => {
        const normalized = normalizeNumber(match[1]);
        if (normalized.includes("/") || !match[4]) return comparableNumber(normalized);
        const year = match[4].length === 4 ? match[4].slice(-2) : match[4];
        return comparableNumber(`${normalized}/${year}`);
      // "Fattura acconto per fornitura" descrive la natura della fattura ma
      // non cita un'altra fattura: il vecchio parser catturava la parola PER
      // come numero e produceva un falso blocker di documento mancante.
      // Un riferimento fiscale deve contenere almeno una cifra.
      }).filter((value, position, all) => /\d/.test(value) && all.indexOf(value) === position);
    const replacedInvoiceNumbers = [...segmentText.matchAll(/ANNULLA\s+E\s+SOSTITUISCE\s+INTEGRALMENTE\s+LA\s+FATTURA\s+N\.?\s*([A-Z0-9/.-]+)/gi)]
      .map((match) => comparableNumber(match[1]))
      .filter((value, position, all) => value && all.indexOf(value) === position);
    return {
      sourceId,
      parentDocumentKey: input.documentKey,
      index,
      text: segmentText,
      documentNumber,
      documentDate: parsed.result.documentDate ?? heading?.documentDate,
      total: parsed.result.total,
      result: parsed.result,
      items: parsed.items,
      extractionMode: input.extractionMode,
      referencedInvoiceNumbers,
      replacedInvoiceNumbers,
      technicalSignature: signature(parsed.items),
    };
  });
}

const invoiceIdentity = (segment: LocalInvoiceSegment) => [normalizeNumber(segment.documentNumber ?? ""), segment.documentDate ?? "", segment.total ?? ""].join("|");

// I moduli tecnici di posa possono citare numero/data/importo della fattura
// senza essere essi stessi documenti fiscali. Restano fonti tecniche, ma non
// devono creare una seconda fattura incompleta nel gate economico.
const isNonFiscalTechnicalWorksheet = (segment: LocalInvoiceSegment): boolean => segment.total === null
  && /\b(?:N[°º]\s*ORDINE|ARRIVO|MERCE\s+FORNITORE|POSA\s+SQUADRA|AUTOSCALA)\b/i.test(segment.text)
  && !/\b(?:TOTALE\s+(?:DOCUMENTO|FATTURA|IMPONIBILE|IVA)|RIEPILOGO\s+IVA|NETTO\s+A\s+PAGARE)\b/i.test(segment.text);

export function reconcileLocalInvoiceSegments(segments: readonly LocalInvoiceSegment[]) {
  const byIdentity = new Map<string, LocalInvoiceSegment>();
  const discardedDuplicateSourceIds: string[] = [];
  for (const segment of segments) {
    if (segment.total === null && segments.some((candidate) => candidate !== segment
      && candidate.total !== null
      && candidate.parentDocumentKey === segment.parentDocumentKey
      && normalizeNumber(candidate.documentNumber ?? "") === normalizeNumber(segment.documentNumber ?? "")
      && candidate.documentDate === segment.documentDate)) {
      discardedDuplicateSourceIds.push(segment.sourceId);
      continue;
    }
    const key = invoiceIdentity(segment);
    const current = byIdentity.get(key);
    if (!current) { byIdentity.set(key, segment); continue; }
    const preferred = current.extractionMode === "native_text" ? current : segment.extractionMode === "native_text" ? segment : current;
    const discarded = preferred === current ? segment : current;
    byIdentity.set(key, preferred); discardedDuplicateSourceIds.push(discarded.sourceId);
  }
  const uniqueSegments = [...byIdentity.values()];
  const nonFiscalTechnicalSourceIds = uniqueSegments.filter(isNonFiscalTechnicalWorksheet).map((segment) => segment.sourceId);
  const uniqueFinancialSegments = uniqueSegments.filter((segment) => !isNonFiscalTechnicalWorksheet(segment));
  const replacedFinancialSourceIds = new Set<string>();
  const replacementPairs: Array<{ replacementSourceId: string; replacedSourceId: string }> = [];
  for (const replacement of uniqueFinancialSegments) {
    for (const replacedNumber of replacement.replacedInvoiceNumbers) {
      const exactMatches = uniqueFinancialSegments.filter((candidate) => candidate !== replacement
        && comparableNumber(candidate.documentNumber ?? "") === replacedNumber);
      const targetHasSeries = replacedNumber.includes("/");
      const baseNumberMatches = targetHasSeries ? [] : uniqueFinancialSegments.filter((candidate) => candidate !== replacement
        && comparableNumber(candidate.documentNumber ?? "").split("/")[0] === replacedNumber);
      // Una fattura sostitutiva puo citare soltanto il numero principale
      // (es. "fattura n. 20") mentre il documento fiscale espone "20/001".
      // Il match abbreviato e' ammesso soltanto se individua un solo documento:
      // in presenza di omonimie si resta fail-closed.
      const matches = exactMatches.length ? exactMatches : baseNumberMatches.length === 1 ? baseNumberMatches : [];
      for (const candidate of matches) {
        replacedFinancialSourceIds.add(candidate.sourceId);
        replacementPairs.push({ replacementSourceId: replacement.sourceId, replacedSourceId: candidate.sourceId });
      }
    }
  }
  const effectiveFinancialSegments = uniqueFinancialSegments.filter((segment) => !replacedFinancialSourceIds.has(segment.sourceId));
  const supersededTechnicalSourceIds = new Set<string>();
  for (const balance of effectiveFinancialSegments) {
    if (!balance.referencedInvoiceNumbers.length || !balance.technicalSignature) continue;
    for (const advance of effectiveFinancialSegments) {
      if (advance === balance || !advance.documentNumber) continue;
      if (balance.referencedInvoiceNumbers.includes(comparableNumber(advance.documentNumber))
        && (advance.technicalSignature === balance.technicalSignature || technicalSubset(advance, balance))) {
        supersededTechnicalSourceIds.add(advance.sourceId);
      }
    }
  }
  // Se acconto e saldo sono espliciti ma il saldo non cita il numero
  // dell'acconto, il saldo sostituisce soltanto le righe tecniche quando
  // famiglia, misure e cardinalita dell'acconto sono un sottoinsieme. Le due
  // fatture restano entrambe nel totale economico.
  for (const balance of effectiveFinancialSegments.filter((segment) => /\bfattura\s+saldo\b/i.test(segment.text))) {
    for (const advance of effectiveFinancialSegments.filter((segment) => segment !== balance && /\bfattura\s+acconto\b/i.test(segment.text))) {
      if (advance.documentDate && balance.documentDate && advance.documentDate > balance.documentDate) continue;
      if (advance.items.length > 0 && balance.items.length > 0 && technicalShapeSubset(advance, balance)) supersededTechnicalSourceIds.add(advance.sourceId);
    }
  }
  return {
    observedFinancialSegments: uniqueFinancialSegments,
    uniqueFinancialSegments: effectiveFinancialSegments,
    technicalSegments: uniqueSegments.filter((segment) => !supersededTechnicalSourceIds.has(segment.sourceId) && !replacedFinancialSourceIds.has(segment.sourceId)),
    discardedDuplicateSourceIds: [...new Set(discardedDuplicateSourceIds)].sort(),
    nonFiscalTechnicalSourceIds: [...new Set(nonFiscalTechnicalSourceIds)].sort(),
    supersededTechnicalSourceIds: [...supersededTechnicalSourceIds].sort(),
    replacedFinancialSourceIds: [...replacedFinancialSourceIds].sort(),
    replacementPairs: replacementPairs.sort((left, right) => `${left.replacementSourceId}|${left.replacedSourceId}`.localeCompare(`${right.replacementSourceId}|${right.replacedSourceId}`)),
  };
}
