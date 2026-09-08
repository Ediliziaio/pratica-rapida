import { createHash } from "node:crypto";
import { parseScreeningInvoiceText, stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";

export const EXPLICIT_ADVANCE_INVOICE_REFERENCE_MARKER_RULE_ID = "system-explicit-advance-invoice-reference-marker-v1" as const;
export const EXPLICIT_PERCENTAGE_CAUSAL_TECHNICAL_SUPERSESSION_RULE_ID = "system-explicit-percentage-causal-technical-supersession-v1" as const;
export const ROTATED_OCR_FISCAL_READING_ORDER_TOTAL_INVOICE_RULE_ID = "system-rotated-ocr-fiscal-reading-order-total-invoice-v2" as const;
export const NATIVE_OCR_FISCAL_DUPLICATE_AUTHORITY_RULE_ID = "system-native-ocr-fiscal-duplicate-authority-v1" as const;

const normalizeNumber = (value: string) => value.trim().replace(/[^a-z0-9/.-]/gi, "").toUpperCase();
const comparableNumber = (value: string) => normalizeNumber(value).replace(/\/20(\d{2})$/, "/$1");
const normalizeDate = (value: string) => {
  const [day, month, year] = value.split(/[./-]/u);
  return `${year}-${month}-${day}`;
};
interface InvoiceHeading { index: number; documentNumber: string; documentDate: string }

// Vision individua correttamente l'orientamento fisico di alcune pagine a
// 180 gradi, ma puo' restituire le righe dal fondo verso l'alto. Correggiamo
// l'ordine soltanto quando la pagina porta il marker persistito e dimostra
// un flusso fiscale invertito: intestazione propria dopo il totale documento.
// In tutti gli altri casi il testo resta byte-per-byte invariato.
export function normalizeRotatedFiscalReadingOrder(text: string): string {
  return text.split("\f").map((page) => {
    const lines = page.split(/\r?\n/);
    const markerIndex = lines.findIndex((line) => /^APR_OCR_ORIENTATION:180\s*$/i.test(line.trim()));
    if (markerIndex < 0) return page;
    const fiscalHeaderIndex = lines.findIndex((line) => /^(?:FATTURA(?:\s+(?:IMMEDIATA|ACCOMPAGNATORIA))?|NR\.\s*FATTURA[A-Z0-9./-]+)\s*$/i.test(line.trim()));
    const fiscalTotalIndex = lines.findIndex((line) => /^-?\s*TOTALE\s+(?:DOCUMENTO|FATTURA|A\s+PAGARE)\b/i.test(line.trim()));
    if (fiscalHeaderIndex < 0 || fiscalTotalIndex < 0 || fiscalHeaderIndex < fiscalTotalIndex) return page;
    const marker = lines[markerIndex];
    const body = lines.filter((_, index) => index !== markerIndex).reverse();
    return [marker, ...body].join("\n");
  }).join("\f");
}

function invoiceHeadings(text: string): InvoiceHeading[] {
  const patterns = [
    /(?:^|[\f\n])\s*Fattura(?:\s+Accompagnatoria)?\s+n\.?\s*([^\s]+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/gi,
    /Numero\s+fattura\s+Data\s+fattura\s*\n\s*([A-Z0-9./-]+)\s+(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|\f)[^\f]{0,460}?\n\s*(?:acconto\/anticipo\s+su\s+fattura|fattura)\s*\n(?:\s*cfisc(?:\s*\n|\s+)[A-Z0-9]+\s*\n)?\s*([A-Z0-9./-]+)\s+del\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|\f)[^\f]{0,620}?\bFATTURA(?:\s+ACCOMPAGNATORIA)?\s+([A-Z0-9./-]+)\s*\n?\s*DATA\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/gi,
    /(?:^|[\f\n])\s*Fattura\s*\n\s*Numero\s*:\s*([A-Z0-9./-]+)\s*\n\s*Data\s+(\d{2}[./-]\d{2}[./-]\d{4})/gi,
    /(?:^|[\f\n])\s*FATTURA\s*\n\s*nr\.\s*(FATTURA[A-Z0-9./-]+)\s+del\s+(\d{2}[./-]\d{2}[./-]\d{4})/gi,
    // Fatture Ideal Sistem: il titolo pagina precede una testata verticale
    // "Tipo documento / Num. Doc. / Data Docum." e numero/data compaiono
    // subito dopo il valore FATTURA, senza la parola "del".
    /(?:^|\f)[^\f]{0,900}?\bTipo\s+documento-?[^\f]{0,320}?\bFATTURA\s*\n\s*([A-Z0-9./-]+)\s*\n\s*(\d{2}\/\d{2}\/\d{4})/gi,
  ];
  const found = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => ({
    index: match.index ?? 0,
    documentNumber: normalizeNumber(match[1]),
    documentDate: normalizeDate(match[2]),
  })));
  const verticalDateBeforeNumber = [...text.matchAll(/(?:^|\f)[^\f]{0,240}?\bData\s+Docum\.?[^\f]{0,160}?(\d{2}[/-]\d{2}[/-]\d{4})\s*\n(?:[^\n]*\n){0,2}\s*FATTURA\s*\n\s*([A-Z0-9./-]+)/gi)]
    .map((match) => ({ index: match.index ?? 0, documentNumber: normalizeNumber(match[2]), documentDate: normalizeDate(match[1]) }));
  // Le scansioni ruotate possono essere lette in ordine visuale inverso. Una
  // pagina diventa un segmento fiscale solo se contiene testata completa e
  // totale esplicito; numero/data sono poi risolti dal parser fail-closed.
  const ocrReorderedPages = [...text.matchAll(/(?:^|\f)([^\f]*)/g)].flatMap((match) => {
    const page = match[1];
    if (!/\bTipo\s+documento\b/i.test(page) || !/\bNum\.\s*Doc\.?\b/i.test(page)
      || !/\bData\s+Docum\.?\b/i.test(page) || !/\bFATTURA\b/i.test(page)
      || !/\bTOTALE\s+(?:DOCUMENTO|A\s+PAGARE)\b/i.test(page)) return [];
    const parsed = parseScreeningInvoiceText(page, "ocr-reordered-heading").result;
    if (!parsed.documentNumber || !parsed.documentDate) return [];
    return [{ index: (match.index ?? 0) + match[0].indexOf(page), documentNumber: normalizeNumber(parsed.documentNumber), documentDate: parsed.documentDate }];
  });
  return [...found, ...verticalDateBeforeNumber, ...ocrReorderedPages].sort((left, right) => left.index - right.index)
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
  const text = stripHistoricalEneaAppendix(normalizeRotatedFiscalReadingOrder(input.text));
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
      // Il sostantivo "fattura" nella descrizione di un acconto e nelle
      // etichette del riepilogo non prova il richiamo a un altro documento.
      // Per questo verso sintattico accettiamo un riferimento soltanto con
      // un marcatore esplicito di numero fiscale (N./NR/NUMERO). Senza
      // questo marcatore obbligatorio, una riga come "fattura acconto
      // 1.500,00 €" - che descrive SE STESSA come acconto di quell'importo,
      // non cita un'altra fattura - farebbe leggere l'importo monetario
      // come se fosse il numero della fattura richiamata (regressione
      // Toscano: blocco fantasma "fattura di acconto non acquisita (1.500)"
      // mentre la vera fattura di acconto era gia' acquisita e corretta).
      ...segmentText.matchAll(/ACCONTO[\s\S]{0,120}?(?:FATT(?:URA)?\.?|FT)\s+(?:(?:N(?:R|°|\.)?\.?|NUMERO)\s*)([A-Z0-9/.-]+)(?:\s+DEL\s+(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2}))?/gi),
      ...segmentText.matchAll(/(?:FATT(?:URA)?\.?|FT)\s*(?:D[’']?ACCONTO|ACCONTO)\s+(?:N(?:R|\.)?\.?\s*)([A-Z0-9/.-]+)(?:\s+DEL\s+(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2}))?/gi),
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

const invoiceIdentity = (segment: LocalInvoiceSegment) => {
  const documentNumber = normalizeNumber(segment.documentNumber ?? "");
  const documentDate = segment.documentDate ?? "";
  // Una terna incompleta non prova mai che due documenti siano duplicati.
  // Finche il parser non ha identificato numero, data e totale, ogni sorgente
  // resta distinta e il gate economico la trattera fail-closed.
  if (!documentNumber || !documentDate || segment.total === null) return `unresolved|${segment.sourceId}`;
  return [documentNumber, documentDate, segment.total].join("|");
};

const fiscalEntityTokens = (text: string) => ({
  taxCodes: [...new Set(text.toUpperCase().match(/(?<![A-Z0-9])[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z](?![A-Z0-9])/g) ?? [])],
  vatNumbers: [...new Set(text.toUpperCase().match(/(?<![A-Z0-9])\d{11}(?![A-Z0-9])/g) ?? [])],
});

function isNativeOcrFiscalDuplicate(left: LocalInvoiceSegment, right: LocalInvoiceSegment): boolean {
  const leftEntities = fiscalEntityTokens(left.text); const rightEntities = fiscalEntityTokens(right.text);
  // Un'estrazione nativa e una scansione OCR della stessa pagina spesso
  // intercettano campi fiscali diversi (una il C.F. del cliente, l'altra
  // solo la P.IVA del fornitore, o viceversa) perche' l'OCR smarrisce righe
  // intere dell'intestazione. Bloccare solo quando le due estrazioni
  // offrono un CONFRONTO possibile (stessa categoria valorizzata su
  // entrambi i lati) e quel confronto e' in conflitto: due C.F. diversi, o
  // due P.IVA diverse, sono prova che si tratta di soggetti diversi. Se
  // nessuna categoria e' comparabile su entrambi i lati, il confronto
  // fiscale non e' dirimente. Questo conflitto blocca sempre, prima e
  // indipendentemente da qualunque altro segnale (anche numero+data).
  const bothHaveTaxCodes = leftEntities.taxCodes.length > 0 && rightEntities.taxCodes.length > 0;
  const bothHaveVatNumbers = leftEntities.vatNumbers.length > 0 && rightEntities.vatNumbers.length > 0;
  if (bothHaveTaxCodes && !leftEntities.taxCodes.some((value) => rightEntities.taxCodes.includes(value))) return false;
  if (bothHaveVatNumbers && !leftEntities.vatNumbers.some((value) => rightEntities.vatNumbers.includes(value))) return false;
  // Una firma tecnica comparabile su entrambi i lati (entrambe le estrazioni
  // hanno riconosciuto un prodotto) che discorda e' prova di un prodotto
  // diverso, indipendentemente da numero e data. Se un lato non ha
  // riconosciuto alcun prodotto (OCR troppo degradato), l'assenza di firma
  // non e' un conflitto: resta inconclusiva, non dirimente.
  const bothHaveTechnicalSignature = Boolean(left.technicalSignature) && Boolean(right.technicalSignature);
  if (bothHaveTechnicalSignature && left.technicalSignature !== right.technicalSignature) return false;

  // Regressione Tocchetti (2026-09-08, DUPLICATE_INVOICE_MATCHING_NUMBER_
  // AND_DATE_OVER_TOTAL_RULE_ID): numero E data fattura coincidenti, senza
  // alcun conflitto fiscale o di prodotto sopra, sono gia' prova sufficiente
  // che si tratta dello stesso documento fisico, anche quando entrambe le
  // copie hanno la STESSA modalita' di estrazione (due passaggi OCR della
  // stessa pagina, non un nativo+OCR) e leggono un totale diverso: il
  // totale di una copia con estrazione degradata non e' un secondo segnale
  // di conflitto, e' l'errore da scartare. Questo controllo precede il
  // vincolo di modalita' di estrazione diversa, che resta necessario solo
  // per il riscontro piu' debole (solo importo, sotto).
  const bothHaveNumberAndDate = Boolean(left.documentNumber && right.documentNumber && left.documentDate && right.documentDate);
  if (bothHaveNumberAndDate) {
    return comparableNumber(left.documentNumber!) === comparableNumber(right.documentNumber!) && left.documentDate === right.documentDate;
  }
  if (left.extractionMode === right.extractionMode) return false;
  // Una scansione OCR di una pagina illeggibile puo' non restituire affatto
  // numero o data di fattura (intestazione scomposta su righe sparse), non
  // soltanto un valore leggermente diverso. In quel caso lo stesso importo
  // totale, la stessa firma tecnica dei prodotti e gli stessi soggetti
  // fiscali (CF/P.IVA), gia' verificati sopra, sono prova sufficiente che si
  // tratta dello stesso documento scansionato due volte, non di due fatture
  // distinte.
  return left.total !== null && left.total === right.total;
}

// I moduli tecnici di posa possono citare numero/data/importo della fattura
// senza essere essi stessi documenti fiscali. Restano fonti tecniche, ma non
// devono creare una seconda fattura incompleta nel gate economico.
const isNonFiscalTechnicalWorksheet = (segment: LocalInvoiceSegment): boolean => segment.total === null
  && /\b(?:N[°º]\s*ORDINE|ARRIVO|MERCE\s+FORNITORE|POSA\s+SQUADRA|AUTOSCALA)\b/i.test(segment.text)
  && !/\b(?:TOTALE\s+(?:DOCUMENTO|FATTURA|IMPONIBILE|IVA)|RIEPILOGO\s+IVA|NETTO\s+A\s+PAGARE)\b/i.test(segment.text);

// Regressione Giuga/De Marinis/Tiraboschi (2026-09-08,
// NON_FISCAL_SUPPORTING_DOCUMENT_EXCLUSION_RULE_ID): una ricevuta di
// bonifico o una dichiarazione di aliquota IVA agevolata non sono fatture,
// anche se citano beneficiario, importo o aliquota applicata. Senza
// un'intestazione fattura reale (numero/data con "FATTURA"), il tentativo
// di trattarle come fattura genera un'identita' "sconosciuta" e blocca la
// riconciliazione economica al posto di essere semplicemente escluse come
// documenti di supporto non fiscali (stesso trattamento gia' riservato ai
// moduli tecnici di posa).
// Formati diversi (ricevuta di bonifico, esportazione movimenti di home
// banking, disposizione di bonifico) usano frasi diverse: nessuna di queste
// e' mai presente in una fattura di vendita reale, quindi ciascuna basta da
// sola come prova, senza richiedere che compaiano tutte insieme.
const BANK_TRANSFER_DOCUMENT_MARKERS = /\b(?:Ricevuta\s+bonifico|Codice\s+identificativo\s+dell['’]operazione|Disposizione\s+di\s+bonifico\s+effettuata|Dettaglio\s+(?:singolo\s+)?movimento|Desc\.\s+movimento|Sezione\s+(?:Ordinante|Beneficiario)|DATI\s+DI\s+PAGAMENTO\b[\s\S]{0,80}?\bTRN\b)\b/i;
const isNonFiscalBankTransferReceipt = (segment: LocalInvoiceSegment): boolean => BANK_TRANSFER_DOCUMENT_MARKERS.test(segment.text)
  && !/\bFATTURA\s+(?:DI\s+VENDIT[AI]|N[°º.]?\s*\d)/i.test(segment.text);
const isNonFiscalVatRateDeclaration = (segment: LocalInvoiceSegment): boolean => /\bDICHIARA\b/i.test(segment.text)
  && /\baliquota\s+I\.?\s*V\.?\s*A\.?\s+(?:nella\s+misura\s+)?agevolat[ao]\b/i.test(segment.text)
  && !/\bFATTURA\s+(?:DI\s+VENDIT[AI]|N[°º.]?\s*\d)/i.test(segment.text);
// Tessere sanitarie e documenti d'identita' scansionati insieme al resto del
// dossier non sono mai documenti fiscali, indipendentemente dal totale.
const isNonFiscalIdentityDocument = (segment: LocalInvoiceSegment): boolean => /\bTESSERA\s+SANITARIA\b|\bCARTA\s+DI\s+IDENTIT[AÀ]\b|\bIDENTITY\s+CARD\b|\bCARTA\s+REGIONALE\s+DEI\s+SERVIZI\b|\bTESSERA\s+EUROPEA\s+DI\s+ASSICURAZIONE\s+MALATTIA\b/i.test(segment.text)
  && !/\bFATTURA\s+(?:DI\s+VENDIT[AI]|N[°º.]?\s*\d)/i.test(segment.text);
const isNonFiscalSupportingDocument = (segment: LocalInvoiceSegment): boolean => isNonFiscalTechnicalWorksheet(segment)
  || isNonFiscalBankTransferReceipt(segment)
  || isNonFiscalVatRateDeclaration(segment)
  || isNonFiscalIdentityDocument(segment);

export function reconcileLocalInvoiceSegments(segments: readonly LocalInvoiceSegment[]) {
  const byIdentity = new Map<string, LocalInvoiceSegment>();
  const discardedDuplicateSourceIds: string[] = [];
  const discardedConflictingOcrDuplicateSourceIds: string[] = [];
  const discardedPartialScanDuplicateSourceIds: string[] = [];
  // Regressione Tuttolani (2026-09-07, USER_AUTHORIZED_RULE_IDS.partialScanSameInvoiceNumberDuplicateMerge):
  // la stessa fattura puo' essere caricata piu' volte come scansioni
  // parziali di FILE DIVERSI (una copia integrale, una con solo la pagina
  // del dettaglio prodotto, una con solo la pagina dei totali), non solo
  // come pagine dello stesso allegato. Se due documenti dichiarano lo
  // stesso numero e la stessa data fattura e questo segmento non ha un
  // proprio totale (quindi nessun dato economico in conflitto con quello
  // completo), va trattato come scansione parziale dello stesso documento
  // indipendentemente dal file di provenienza.
  for (const segment of segments) {
    if (segment.total === null && Boolean(segment.documentNumber) && segments.some((candidate) => candidate !== segment
      && candidate.total !== null
      && Boolean(candidate.documentNumber)
      && normalizeNumber(candidate.documentNumber ?? "") === normalizeNumber(segment.documentNumber ?? "")
      && candidate.documentDate === segment.documentDate)) {
      discardedDuplicateSourceIds.push(segment.sourceId);
      discardedPartialScanDuplicateSourceIds.push(segment.sourceId);
      continue;
    }
    const key = invoiceIdentity(segment);
    const current = byIdentity.get(key);
    if (!current) { byIdentity.set(key, segment); continue; }
    const preferred = current.extractionMode === "native_text" ? current : segment.extractionMode === "native_text" ? segment : current;
    const discarded = preferred === current ? segment : current;
    byIdentity.set(key, preferred); discardedDuplicateSourceIds.push(discarded.sourceId);
  }
  const identityDeduplicated = [...byIdentity.values()];
  const conflictingOcrDuplicates = new Set<string>();
  for (const segment of identityDeduplicated) {
    if (segment.extractionMode !== "macos_vision_ocr") continue;
    const nativeMatches = identityDeduplicated.filter((candidate) => candidate.extractionMode === "native_text"
      && isNativeOcrFiscalDuplicate(candidate, segment));
    // Il documento OCR viene ritirato soltanto con un unico PDF nativo
    // autorevole. Due candidati nativi compatibili restano ambigui e chiudono
    // il gate senza scegliere per posizione o ordine.
    if (nativeMatches.length !== 1) continue;
    conflictingOcrDuplicates.add(segment.sourceId);
    discardedDuplicateSourceIds.push(segment.sourceId);
    discardedConflictingOcrDuplicateSourceIds.push(segment.sourceId);
  }
  const uniqueSegments = identityDeduplicated.filter((segment) => !conflictingOcrDuplicates.has(segment.sourceId));
  const nonFiscalTechnicalSourceIds = uniqueSegments.filter(isNonFiscalSupportingDocument).map((segment) => segment.sourceId);
  const uniqueFinancialSegments = uniqueSegments.filter((segment) => !isNonFiscalSupportingDocument(segment));
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
  const percentageCausalSupersededTechnicalSourceIds = new Set<string>();
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
  const explicitBalanceCausal = (segment: LocalInvoiceSegment) => /\bfattura\s+(?:a\s+)?saldo\b/i.test(segment.text)
    || /\b(?:CAUSALE\s+DOCUMENTO|DATI\s+AGGIUNTIVI)\b[\s\S]{0,100}?\bSALDO(?:\s+\d{1,3}%?)?\b/i.test(segment.text);
  const explicitAdvanceCausal = (segment: LocalInvoiceSegment) => /\bfattura\s+(?:(?:di\s+)|(?:d[’']\s*))?acconto\b/i.test(segment.text)
    || /\b(?:CAUSALE\s+DOCUMENTO|DATI\s+AGGIUNTIVI)\b[\s\S]{0,100}?\bACCONTO(?:\s+\d{1,3}%?)?\b/i.test(segment.text);
  for (const balance of effectiveFinancialSegments.filter(explicitBalanceCausal)) {
    for (const advance of effectiveFinancialSegments.filter((segment) => segment !== balance && !explicitBalanceCausal(segment) && explicitAdvanceCausal(segment))) {
      if (advance.documentDate && balance.documentDate && advance.documentDate > balance.documentDate) continue;
      if (advance.items.length > 0 && balance.items.length > 0 && technicalShapeSubset(advance, balance)) {
        supersededTechnicalSourceIds.add(advance.sourceId);
        percentageCausalSupersededTechnicalSourceIds.add(advance.sourceId);
      }
    }
  }
  return {
    observedFinancialSegments: uniqueFinancialSegments,
    uniqueFinancialSegments: effectiveFinancialSegments,
    technicalSegments: uniqueSegments.filter((segment) => !supersededTechnicalSourceIds.has(segment.sourceId) && !replacedFinancialSourceIds.has(segment.sourceId)),
    discardedDuplicateSourceIds: [...new Set(discardedDuplicateSourceIds)].sort(),
    discardedConflictingOcrDuplicateSourceIds: [...new Set(discardedConflictingOcrDuplicateSourceIds)].sort(),
    discardedPartialScanDuplicateSourceIds: [...new Set(discardedPartialScanDuplicateSourceIds)].sort(),
    nonFiscalTechnicalSourceIds: [...new Set(nonFiscalTechnicalSourceIds)].sort(),
    supersededTechnicalSourceIds: [...supersededTechnicalSourceIds].sort(),
    percentageCausalSupersededTechnicalSourceIds: [...percentageCausalSupersededTechnicalSourceIds].sort(),
    replacedFinancialSourceIds: [...replacedFinancialSourceIds].sort(),
    replacementPairs: replacementPairs.sort((left, right) => `${left.replacementSourceId}|${left.replacedSourceId}`.localeCompare(`${right.replacementSourceId}|${right.replacedSourceId}`)),
  };
}
