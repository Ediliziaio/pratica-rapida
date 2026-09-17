import { stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";
import { MONEY_TOLERANCE_EUR, type FinancialDocumentEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import type { RinaldiDeductibleLineEvidence, RinaldiInvoiceLineEvidence } from "../../src/features/enea-shadow-crm/rinaldiFinancialPolicies";

const MONEY = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;
const money = (value: string) => {
  const normalized = value.trim().replace(/−/g, "-").replace(/\./g, "").replace(",", ".");
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
};
const amountFrom = (value: string) => value.match(new RegExp(`[-−]?\\s*€?\\s*(${MONEY})\\s*€?`, "i"))?.[1] ?? null;
const lastAmountFrom = (value: string) => [...value.matchAll(new RegExp(`(${MONEY})`, "gi"))].at(-1)?.[1] ?? null;

/**
 * Per l'OCR il totale gia estratto dal parser e' ammesso soltanto se il
 * documento mostra una vera etichetta di totale finale. Nessuna cifra
 * intermedia viene letta per confermarlo o ricostruirlo.
 */
function explicitLabeledGrossConfirmation(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const labels = lines.flatMap((line, index) => /^(?:TOTALE\s+(?:A\s+PAGARE|DOCUMENTO|FATTURA|DOVUTO)|NETTO\s+A\s+PAGARE)\b/i.test(line) ? [index] : []);
  const confirmations = new Set<number>();
  for (const index of labels) {
    // Etichetta e importo sulla stessa riga sono gia un ancoraggio esplicito;
    // il simbolo valuta puo essere perso dall'OCR senza rendere ambiguo il
    // significato della cifra.
    const sameLine = lastAmountFrom(lines[index]);
    const sameLineValue = sameLine ? money(sameLine) : null;
    if (sameLineValue !== null && Math.abs(sameLineValue - grossTotal) <= MONEY_TOLERANCE_EUR) {
      confirmations.add(sameLineValue);
      continue;
    }
    for (let cursor = Math.max(0, index - 8); cursor <= Math.min(lines.length - 1, index + 8); cursor += 1) {
      if (!/(?:€|\bEUR(?:O)?\b)/i.test(lines[cursor])) continue;
      const found = lastAmountFrom(lines[cursor]);
      const value = found ? money(found) : null;
      if (value !== null && Math.abs(value - grossTotal) <= MONEY_TOLERANCE_EUR) confirmations.add(value);
    }
  }
  return confirmations.size === 1 ? grossTotal : null;
}

function supplier(text: string, sourceId: string) {
  if (/\bRINALDI\s+(?:S\.?R\.?L\.?|LAB)\b/i.test(text)) return { supplierId: "rinaldi", supplierName: "Rinaldi" };
  return { supplierId: `local-${sourceId.slice(0, 16)}`, supplierName: null };
}

// La cifra Rinaldi esplicitamente etichettata come spesa ammessa ENEA non e'
// un imponibile/IVA o un controllo di quadratura: e' una fonte autoritativa
// separata gia decisa da Giuliano. In sua assenza resta il totale fattura.
function deductibleLines(text: string, sourceId: string): RinaldiDeductibleLineEvidence[] {
  const lines = text.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    if (!/(?:totale\s+(?:da\s+portare\s+in\s+detrazione|massimo\s+detraibile|detraibile|spese\s+congrue\s+sostenute\s+in\s+base\s+ai\s+massimali\s+ammessi)|spese\s+congrue\s+sostenute\s+in\s+base\s+ai\s+massimali\s+ammessi)/i.test(line)) return [];
    const window = lines.slice(index, index + 3).join(" ");
    const value = amountFrom(window);
    return [{ lineId: `${sourceId}:deductible:${index + 1}`, lineNumber: index + 1, text: line.trim(), amount: value ? money(value) : null, extractionConfidence: value ? "certain" as const : "uncertain" as const }];
  });
}

function guardedRinaldiMixedLines(text: string, sourceId: string): RinaldiInvoiceLineEvidence[] | undefined {
  const hasPergola = /\bpergola\b/i.test(text);
  const hasVepa = /\bVEPA\b|vetrat[ae]\s+panoramic/i.test(text);
  if (!hasPergola || !hasVepa) return undefined;
  return [
    { lineId: `${sourceId}:pergola-unresolved`, text: "Pergola rilevata; importo riga da riconciliare", grossAmount: null, classification: "pergola", extractionConfidence: "uncertain" },
    { lineId: `${sourceId}:vepa-unresolved`, text: "VEPA rilevata; importo riga da riconciliare", grossAmount: null, classification: "vepa", extractionConfidence: "uncertain" },
  ];
}

export interface LocalInvoiceFinancialExtractionInput {
  sourceId: string;
  text: string;
  extractionMode: "native_text" | "macos_vision_ocr";
  documentNumber: string | undefined;
  documentDate: string | undefined;
  grossTotal: number | null;
}

/**
 * Converte esclusivamente evidenze presenti nel PDF originario in un input del
 * gate economico. Per decisione generale di Giuliano (11/09/2026) l'unico dato
 * monetario fiscale letto e il totale finale stampato: imponibile, IVA,
 * aliquote, scadenziari e somme di riga non vengono acquisiti ne possono
 * bloccare. Per l'OCR resta obbligatorio che il totale sia ancorato a una vera
 * etichetta finale del documento; la certezza non viene mai fabbricata
 * riconciliandolo con cifre intermedie.
 */
export function extractLocalInvoiceFinancialEvidence(input: LocalInvoiceFinancialExtractionInput): FinancialDocumentEvidence {
  const text = stripHistoricalEneaAppendix(input.text);
  const fullZeroReversal = /\bA\s+Detrarre[\s\S]{0,140}?\bfattura\b/i.test(text)
    && /\bFattura\s+a\s+saldo\s+0,00\b/i.test(text)
    && /[-−]\s*[1-9][0-9.]*,[0-9]{2}/.test(text);
  const authoritativeGrossTotal = fullZeroReversal ? 0 : input.grossTotal;
  const ocrFinalTotalLabelConfirmed = input.extractionMode === "macos_vision_ocr"
    && explicitLabeledGrossConfirmation(text, authoritativeGrossTotal) !== null;
  const detectedSupplier = supplier(text, input.sourceId);
  const explicitDeductibleLines = detectedSupplier.supplierId === "rinaldi" ? deductibleLines(text, input.sourceId) : [];
  const lineItems = detectedSupplier.supplierId === "rinaldi" ? guardedRinaldiMixedLines(text, input.sourceId) : undefined;
  const kind = fullZeroReversal ? "non_economic" : /fattura\s+acconto|acconto\s+su\s+preventivo/i.test(text) ? "advance"
    : /fattura\s+saldo/i.test(text) ? "balance" : "invoice";
  return {
    sourceId: input.sourceId,
    ...detectedSupplier,
    documentNumber: input.documentNumber ?? "",
    documentDate: input.documentDate ?? "",
    kind,
    taxableAmount: null,
    vatAmount: null,
    grossTotal: authoritativeGrossTotal,
    referencedAdvanceIds: [],
    interventionGrossAmount: authoritativeGrossTotal,
    extractionConfidence: authoritativeGrossTotal !== null
      && (input.extractionMode === "native_text" || ocrFinalTotalLabelConfirmed) ? "certain" : "uncertain",
    extractionIssues: [],
    explicitDeductibleLines,
    lineItems,
    internalAdjustmentNote: fullZeroReversal
      ? "Fattura di puro storno integrale a zero esclusa dalla somma dei totali finali; fattura precedente conservata."
      : null,
  };
}
