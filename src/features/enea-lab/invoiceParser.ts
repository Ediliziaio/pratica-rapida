import type {
  EneaLabDocumentAnalysis,
  EneaLabDocumentResult,
  EneaLabScreeningItem,
} from "./types";

const MAX_SCREENING_QUANTITY = 50;

function parseItalianNumber(value: string): number | null {
  const normalized = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function truncateOneDecimal(value: number): number {
  return Math.floor((value + Number.EPSILON) * 10) / 10;
}

function toIsoDate(value: string): string | undefined {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getUTCFullYear() === Number(match[3])
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
  const match = text.match(
    /(?:nota\s+di\s+credito|fattura)\s+n\.?\s*([^\n]{1,40}?)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (!match) return {};
  return {
    documentNumber: match[1].trim(),
    documentDate: toIsoDate(match[2]),
  };
}

function extractDocumentTotal(text: string): number | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  for (const line of lines) {
    if (!/^totale(?!\s+(?:imponibile|iva|documento))/i.test(line)) continue;
    const values = [...line.matchAll(/([0-9][0-9.]*,[0-9]{2})/g)];
    const last = values.at(-1);
    if (last) return parseItalianNumber(last[1]);
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

export function parseScreeningInvoiceText(
  text: string,
  path = "documento.pdf",
): { result: EneaLabDocumentResult; items: EneaLabScreeningItem[] } {
  const documentType = /nota\s+di\s+credito|\bstorno\b/i.test(text)
    ? "credit_note"
    : /\bfattura\b/i.test(text)
      ? "invoice"
      : "unknown";
  const compact = text.replace(/\s+/g, " ");
  const pattern = /SCHERMATURA\s+SOLARE((?:(?!SCHERMATURA\s+SOLARE)[\s\S]){0,260}?)LARGHEZZA\s+(\d{2,5})\s*[X×]\s*(\d{2,5})\s+VALORE\s+G\s*TOT\s*([0-9]+(?:[,.][0-9]+)?)/gi;
  const items: EneaLabScreeningItem[] = [];
  let invalidExplicitQuantity = false;

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

      for (let index = 0; index < quantity; index += 1) {
        items.push({
          widthMm,
          heightMm,
          surfaceM2: truncateOneDecimal((widthMm * heightMm) / 1_000_000),
          gTot,
          description: cleanDescription(`Schermatura solare${match[1]}`),
          sourcePath: path,
        });
      }
    }
  }

  return {
    items,
    result: {
      path,
      status: invalidExplicitQuantity ? "failed" : "parsed",
      documentType,
      total: extractDocumentTotal(text),
      itemCount: items.length,
      ...(invalidExplicitQuantity
        ? { message: "Quantità schermatura esplicita non valida: controllo umano richiesto." }
        : {}),
      ...extractDocumentIdentity(text),
    },
  };
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
