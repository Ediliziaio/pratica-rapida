import { stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";
import type { FinancialDocumentEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import type { RinaldiDeductibleLineEvidence, RinaldiInvoiceLineEvidence } from "../../src/features/enea-shadow-crm/rinaldiFinancialPolicies";

const MONEY = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;
const SIGNED_MONEY = String.raw`[-−]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;
const SIGNED_UNIT_MONEY = String.raw`[-−]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2,5}`;
const money = (value: string) => {
  const normalized = value.trim().replace(/−/g, "-").replace(/\./g, "").replace(",", ".");
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
};
const amountFrom = (value: string) => value.match(new RegExp(`[-−]?\\s*€?\\s*(${MONEY})\\s*€?`, "i"))?.[1] ?? null;
const lastAmountFrom = (value: string) => [...value.matchAll(new RegExp(`(${MONEY})`, "gi"))].at(-1)?.[1] ?? null;
const amountAfterLabel = (text: string, label: RegExp, lookahead = 3) => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const index = lines.findIndex((line) => label.test(line));
  if (index < 0) return null;
  for (let offset = 0; offset <= lookahead && index + offset < lines.length; offset += 1) {
    const found = lastAmountFrom(lines[index + offset]);
    if (found) return money(found);
  }
  return null;
};
const currencyAmountAfterLabel = (text: string, label: RegExp, lookahead = 4) => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const index = lines.findIndex((line) => label.test(line));
  if (index < 0) return null;
  for (let offset = 0; offset <= lookahead && index + offset < lines.length; offset += 1) {
    const line = lines[index + offset];
    if (!/(?:€|\bEuro\b)/i.test(line)) continue;
    const found = lastAmountFrom(line);
    if (found) return money(found);
  }
  return null;
};

const reconciledFiscalTotals = (text: string, grossTotal: number | null) => {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const taxableIndex = lines.findIndex((line) => /^(?:totale\s+)?imponibile$/i.test(line));
  const vatIndex = lines.findIndex((line) => /^totale\s+(?:iva|imposta)\b/i.test(line));
  if (taxableIndex < 0 || vatIndex < 0) return null;
  const taxableAmount = (() => {
    for (let offset = 0; offset <= 1 && taxableIndex + offset < lines.length; offset += 1) {
      const found = lastAmountFrom(lines[taxableIndex + offset]);
      if (found) return money(found);
    }
    return null;
  })();
  if (taxableAmount === null) return null;
  const candidates = new Set<number>();
  for (let offset = 0; offset <= 4 && vatIndex + offset < lines.length; offset += 1) {
    for (const match of lines[vatIndex + offset].matchAll(new RegExp(`(${MONEY})`, "gi"))) {
      const candidate = money(match[1]);
      if (candidate !== null
        && Math.abs(Math.round((taxableAmount + candidate + Number.EPSILON) * 100) / 100 - grossTotal) <= 0.01) {
        candidates.add(candidate);
      }
    }
  }
  const [vatAmount] = [...candidates];
  return candidates.size === 1 && vatAmount !== undefined ? { taxableAmount, vatAmount } : null;
};

interface ScheduledDueGrossResult {
  amount: number | null;
  issue: "schedule_amount_missing" | null;
}

const scheduledDueGross = (text: string): ScheduledDueGrossResult => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const index = lines.findIndex((line) => /^(?:scadenze(?:\s+pagamenti)?|scadenziario)\b/i.test(line));
  if (index < 0) return { amount: null, issue: null };
  const amounts: number[] = [];
  let datedRows = 0;
  let missingAmount = false;
  for (let cursor = index + 1; cursor < Math.min(lines.length, index + 12); cursor += 1) {
    const line = lines[cursor];
    if (/^(?:copia\s+della\s+fattura|riepilogo\s+iva|note|powered\s+by)\b/i.test(line)) break;
    if (!/\b\d{2}[./-]\d{2}[./-]\d{4}\b/.test(line)) continue;
    datedRows += 1;
    const sameLine = lastAmountFrom(line.replace(/\b\d{2}[./-]\d{2}[./-]\d{4}\b/g, ""));
    let candidate = sameLine;
    for (let offset = 1; !candidate && offset <= 2 && cursor + offset < lines.length; offset += 1) {
      const following = lines[cursor + offset];
      if (/\b\d{2}[./-]\d{2}[./-]\d{4}\b/.test(following)
        || /^(?:copia\s+della\s+fattura|riepilogo\s+iva|note|powered\s+by)\b/i.test(following)) break;
      candidate = lastAmountFrom(following);
    }
    const parsed = candidate === null ? null : money(candidate);
    if (parsed === null) missingAmount = true;
    else amounts.push(parsed);
  }
  if (datedRows === 0) return { amount: null, issue: null };
  if (missingAmount || amounts.length !== datedRows) return { amount: null, issue: "schedule_amount_missing" };
  return {
    amount: Math.round((amounts.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100,
    issue: null,
  };
};

function taxAmounts(text: string, grossTotal: number | null) {
  const compactSummaryTail = text.match(/Riepilogo\s+totali([\s\S]{0,800})/iu)?.[1];
  const compactSummaryAmounts = compactSummaryTail?.split(/\r?\n/u)
    .map((line) => [...line.matchAll(new RegExp(`(${MONEY})`, "giu"))].map((match) => match[1]))
    .find((amounts) => amounts.length >= 7);
  if (compactSummaryAmounts) {
    const taxableAmount = money(compactSummaryAmounts[1]);
    const vatAmount = money(compactSummaryAmounts[3]);
    const grossTotal = money(compactSummaryAmounts[5]);
    if (taxableAmount !== null && vatAmount !== null && grossTotal !== null
      && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= 0.011) {
      return { taxableAmount, vatAmount };
    }
  }
  const verticalInvoiceTotal = text.match(new RegExp(
    `Totale\\s+fattura\\s*\\n\\s*(${MONEY})\\s*€?\\s*\\n\\s*(${MONEY})\\s*€?\\s*\\n\\s*(${MONEY})\\s*€?`,
    "i",
  ));
  if (verticalInvoiceTotal) {
    const taxableAmount = money(verticalInvoiceTotal[1]);
    const vatAmount = money(verticalInvoiceTotal[2]);
    const grossTotal = money(verticalInvoiceTotal[3]);
    if (taxableAmount !== null && vatAmount !== null && grossTotal !== null
      && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= 0.011) {
      return { taxableAmount, vatAmount };
    }
  }
  const grouped = text.match(new RegExp(`Tot\\.?\\s*imponibile\\s*\\n\\s*Tot\\.?\\s*Iva\\s*\\n\\s*€?\\s*(${MONEY})\\s*€?\\s*\\n\\s*€?\\s*(${MONEY})`, "i"));
  if (grouped) return { taxableAmount: money(grouped[1]), vatAmount: money(grouped[2]) };
  const sameLine = text.match(new RegExp(`Totale\\s+imponibile\\s+(${MONEY})[^\\n]*?Totale\\s+imposta\\s+(${MONEY})`, "i"));
  if (sameLine) return { taxableAmount: money(sameLine[1]), vatAmount: money(sameLine[2]) };
  const reconciled = reconciledFiscalTotals(text, grossTotal);
  if (reconciled) return reconciled;
  // Le intestazioni tabellari generiche (per esempio "Importo IVA") non
  // sono totali fiscali. I valori esplicitamente etichettati come totali
  // prevalgono anche quando sono stampati su una riga successiva.
  const vatSummary = text.match(new RegExp(`(?:^|\\n)\\s*€?\\s*(${MONEY})\\s+IVA\\s+\\d{1,2}(?:[,.]\\d+)?%\\s+€?\\s*(${MONEY})`, "i"));
  const embeddedTaxable = text.match(new RegExp(`\\bImponibile\\s*€?\\s*(${MONEY})`, "i"));
  const explicitTaxable = amountAfterLabel(text, /^totale\s+imponibile\b/i, 1)
    ?? (embeddedTaxable ? money(embeddedTaxable[1]) : null)
    ?? (vatSummary ? money(vatSummary[1]) : null);
  // Nei PDF Rinaldi la colonna OCR successiva a "Totale Iva" puo' ripetere
  // prima l'imponibile senza simbolo e solo dopo esporre "€ <IVA>". Il
  // valore monetario esplicitamente marcato prevale sul numero di colonna.
  const explicitVat = (vatSummary ? money(vatSummary[2]) : null)
    ?? currencyAmountAfterLabel(text, /^totale\s+iva\b/i, 4)
    ?? currencyAmountAfterLabel(text, /^totale\s+imposta\b/i, 4)
    ?? amountAfterLabel(text, /^totale\s+iva\b/i, 1)
    ?? amountAfterLabel(text, /^totale\s+imposta\b/i, 1);
  return {
    taxableAmount: explicitTaxable ?? amountAfterLabel(text, /^(?:tot(?:ale|\.)\s+)?imponibile\b/i, 2),
    vatAmount: explicitVat ?? amountAfterLabel(text, /^(?:(?:tot(?:ale|\.)|importo)\s+iva|totale\s+imposta|imposta(?:\s+\d+(?:[,.]\d+)?%)?)\b/i, 4),
  };
}

function guardedColumnarTaxAmounts(text: string, grossTotal: number | null) {
  if (grossTotal === null || !/\bNetto\s+merce\b/i.test(text)) return null;
  const block = text.match(/\bNetto\s+merce\b([\s\S]{0,360}?)\bSpese\s+Bolli\b/i)?.[1];
  if (!block) return null;
  const values = [...block.matchAll(new RegExp(`(${MONEY})`, "gi"))]
    .map((match) => money(match[1]))
    .filter((value): value is number => value !== null);
  const taxableAmount = values.at(-1) ?? null;
  if (taxableAmount === null || taxableAmount <= 0 || taxableAmount >= grossTotal) return null;
  const vatAmount = Math.round((grossTotal - taxableAmount + Number.EPSILON) * 100) / 100;
  const explicitVatPresent = [...text.matchAll(new RegExp(`(${MONEY})`, "gi"))]
    .map((match) => money(match[1]))
    .some((value) => value !== null && Math.abs(value - vatAmount) <= 0.01);
  return explicitVatPresent ? { taxableAmount, vatAmount } : null;
}

function zanzasolNetAmount(text: string, taxableAmount: number | null) {
  if (!/\bZANZASOL\b/i.test(text) || taxableAmount === null) return null;
  const table = text.match(/Articolo\s+Descrizione[\s\S]*?(?=Aliquote\s+IVA\b)/i)?.[0];
  if (!table || !/FORNITURA\s+TENDA\s+DA\s+SOLE/i.test(table)) return null;
  const amounts = [...table.matchAll(new RegExp(`^\\s*N\\s+(${MONEY})\\s*$`, "gim"))]
    .map((match) => money(match[1]))
    .filter((value): value is number => value !== null);
  if (!amounts.length) return null;
  const sum = Math.round((amounts.reduce((total, value) => total + value, 0) + Number.EPSILON) * 100) / 100;
  return Math.abs(sum - taxableAmount) <= 0.01 ? sum : null;
}

function rowNetAmount(text: string, taxableAmount: number | null) {
  const explicit = amountAfterLabel(text, /^(?:importo prodotti o servizi|subtotale|totale\s+(?:merce|fornitura|importi))\b/i, 1);
  if (explicit !== null) return explicit;

  // Il gestionale Zanzasol stampa "N <importo>" prima o dopo la relativa
  // descrizione. La somma e' utilizzabile come terza prova solo se copre la
  // tabella dell'intervento e coincide con l'imponibile esplicito.
  const zanzasol = zanzasolNetAmount(text, taxableAmount);
  if (zanzasol !== null) return zanzasol;

  const rows = text.split(/\r?\n/).flatMap((line) => {
    const normalized = line.replace(/\s+/g, " ").trim();
    const withVat = normalized.match(new RegExp(`\\b(?:NR|PZ|MQ)\\s+\\d+(?:[,.]\\d+)?\\s+${SIGNED_UNIT_MONEY}\\s+(${SIGNED_MONEY})\\s+\\d{1,2}\\s*$`, "i"));
    if (withVat) return [money(withVat[1])];
    const withoutVat = normalized.match(new RegExp(`\\bNR\\s+\\d+(?:[,.]\\d+)?\\s+${SIGNED_MONEY}\\s+(${SIGNED_MONEY})\\s*$`, "i"));
    return withoutVat ? [money(withoutVat[1])] : [];
  }).filter((value): value is number => value !== null);
  if (rows.length) return Math.round((rows.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;

  const advance = text.match(new RegExp(`Acconto su Preventivo[\\s\\S]{0,240}?€\\s*(${MONEY})`, "i"));
  if (advance) return money(advance[1]);

  const quoted = text.match(new RegExp(`\\bTotale\\s+\\d{1,2}\\s*\\n\\s*€\\s*(${MONEY})`, "i"));
  const deductedAdvance = text.match(new RegExp(`Acconto\\s*\\(Rif\\.[^\\n]{0,120}?\\)\\s*€\\s*[-−]\\s*(${MONEY})`, "i"));
  if (quoted && deductedAdvance) {
    const quote = money(quoted[1]); const deduction = money(deductedAdvance[1]);
    if (quote !== null && deduction !== null) return Math.round((quote - deduction + Number.EPSILON) * 100) / 100;
  }
  return null;
}

function rowGrossAmount(text: string, scheduledDue: ScheduledDueGrossResult) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const verticalInvoiceTotal = text.match(new RegExp(
    `Totale\\s+fattura\\s*\\n\\s*(${MONEY})\\s*€?\\s*\\n\\s*(${MONEY})\\s*€?\\s*\\n\\s*(${MONEY})\\s*€?`,
    "i",
  ));
  if (verticalInvoiceTotal) {
    const taxable = money(verticalInvoiceTotal[1]);
    const vat = money(verticalInvoiceTotal[2]);
    const gross = money(verticalInvoiceTotal[3]);
    if (taxable !== null && vat !== null && gross !== null
      && Math.abs(Math.round((taxable + vat + Number.EPSILON) * 100) / 100 - gross) <= 0.011) return gross;
  }
  const scheduled = text.split(/\r?\n/u)
    .filter((line) => /\bBonifico\s+\d{2}[./-]\d{2}[./-]\d{4}\b/iu.test(line))
    .map((line) => lastAmountFrom(line))
    .map((amount) => amount ? money(amount) : null)
    .filter((value): value is number => value !== null);
  if (scheduled.length) return Math.round((scheduled.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  const rows = text.split(/\r?\n/).flatMap((line) => {
    const normalized = line.replace(/\s+/g, " ").trim();
    const match = normalized.match(new RegExp(`${SIGNED_MONEY}\\s*€?\\s+\\d{1,2}%\\s+(${SIGNED_MONEY})\\s*€?\\s*$`, "i"));
    return match ? [money(match[1])] : [];
  }).filter((value): value is number => value !== null);
  if (rows.length) return Math.round((rows.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  // Il riepilogo per aliquota fornisce una terza prova indipendente: la
  // colonna IMPORTO LORDO viene sommata separatamente dalla terna fiscale.
  const summaryIndex = lines.findIndex((line) => /^RIEPILOGO\s+IVA\b.*\bIMPORTO\s+LORDO\b.*\bIMPOSTE\b/i.test(line));
  if (summaryIndex >= 0) {
    const grossByRate: number[] = [];
    for (let index = summaryIndex + 1; index < Math.min(lines.length, summaryIndex + 12); index += 1) {
      if (/^(?:totale\s+)?imponibile\b/i.test(lines[index])) break;
      const match = lines[index].match(new RegExp(`^\\d{1,2}(?:[,.]\\d+)?%\\s+(${MONEY})\\s*€?\\s+${MONEY}\\s*€?$`, "i"));
      if (!match) continue;
      const value = money(match[1]);
      if (value !== null) grossByRate.push(value);
    }
    if (grossByRate.length) return Math.round((grossByRate.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  }
  // Layout gestionali che separano etichetta e importo del pagamento:
  // PAGAMENTO FATTURA / ARROTONDAMENTO / 0 3675,00. L'importo pagato e'
  // una terza evidenza distinta dal totale documento e dalla terna IVA.
  const paid = amountAfterLabel(text, /^pagamento\s+fattura\b/i, 3);
  if (paid !== null) return paid;
  const totalToPay = currencyAmountAfterLabel(text, /^totale\s+a\s+pagare\b/i, 4);
  if (totalToPay !== null) return totalToPay;
  // Il piano scadenze espone il lordo dovuto come prova distinta dalla terna
  // imponibile+IVA. Le date intermedie non sono importi e vengono ignorate.
  const due = scheduledDue.amount ?? amountAfterLabel(text, /^(?:scadenze(?:\s+pagamenti)?|scadenziario)\b/i, 5);
  if (due !== null) return due;
  const totalDue = amountAfterLabel(text, /^totale\s+dovuto\b/i, 1);
  if (totalDue !== null) return totalDue;
  // Alcuni layout espongono la terza prova come netto/scadenza, distinta
  // dalla terna imponibile+IVA e dal campo totale documento.
  return amountAfterLabel(text, /^netto\s+a\s+pagare\b/i, 2);
}

function supplier(text: string, sourceId: string) {
  if (/\bRINALDI\s+(?:S\.?R\.?L\.?|LAB)\b/i.test(text)) return { supplierId: "rinaldi", supplierName: "Rinaldi" };
  return { supplierId: `local-${sourceId.slice(0, 16)}`, supplierName: null };
}

function deductibleLines(text: string, sourceId: string): RinaldiDeductibleLineEvidence[] {
  const lines = text.split(/\r?\n/);
  return lines.flatMap((line, index) => {
    if (!/totale\s+(?:da\s+portare\s+in\s+detrazione|massimo\s+detraibile|detraibile|spese\s+congrue\s+sostenute\s+in\s+base\s+ai\s+massimali\s+ammessi)/i.test(line)) return [];
    const window = lines.slice(index, index + 3).join(" "); const value = amountFrom(window);
    return [{ lineId: `${sourceId}:deductible:${index + 1}`, lineNumber: index + 1, text: line.trim(), amount: value ? money(value) : null, extractionConfidence: value ? "certain" as const : "uncertain" as const }];
  });
}

function guardedRinaldiMixedLines(text: string, sourceId: string): RinaldiInvoiceLineEvidence[] | undefined {
  const hasPergola = /\bpergola\b/i.test(text); const hasVepa = /\bVEPA\b|vetrat[ae]\s+panoramic/i.test(text);
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
 * gate economico. I tre riscontri sono: totale documento, imponibile+IVA e
 * ricostruzione delle righe/importi intervento. L'OCR resta fail-closed finché
 * non è convalidato da una seconda prova visiva persistita.
 */
export function extractLocalInvoiceFinancialEvidence(input: LocalInvoiceFinancialExtractionInput): FinancialDocumentEvidence {
  const text = stripHistoricalEneaAppendix(input.text);
  let { taxableAmount, vatAmount } = taxAmounts(text, input.grossTotal);
  if (input.grossTotal !== null && (taxableAmount === null || vatAmount === null
    || Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - input.grossTotal) > 0.01)) {
    const columnar = guardedColumnarTaxAmounts(text, input.grossTotal);
    if (columnar) ({ taxableAmount, vatAmount } = columnar);
  }
  const netFromRows = rowNetAmount(text, taxableAmount);
  const scheduledDue = scheduledDueGross(text);
  const grossFromRows = rowGrossAmount(text, scheduledDue);
  const interventionGrossAmount = grossFromRows ?? (netFromRows !== null && vatAmount !== null
    ? Math.round((netFromRows + vatAmount + Number.EPSILON) * 100) / 100 : null);
  const extractionIssues = interventionGrossAmount === null && scheduledDue.issue === "schedule_amount_missing"
    ? [{ code: "schedule_amount_missing" as const, reason: "Scadenza non leggibile, importo mancante" as const }]
    : [];
  const ocrTripleReconciled = input.extractionMode === "macos_vision_ocr"
    && taxableAmount !== null && vatAmount !== null && input.grossTotal !== null && interventionGrossAmount !== null
    && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - input.grossTotal) <= 0.01
    && Math.abs(interventionGrossAmount - input.grossTotal) <= 0.01;
  const detectedSupplier = supplier(text, input.sourceId);
  const explicitDeductibleLines = detectedSupplier.supplierId === "rinaldi" ? deductibleLines(text, input.sourceId) : [];
  const lineItems = detectedSupplier.supplierId === "rinaldi" ? guardedRinaldiMixedLines(text, input.sourceId) : undefined;
  const kind = /fattura\s+acconto|acconto\s+su\s+preventivo/i.test(text) ? "advance"
    : /fattura\s+saldo/i.test(text) ? "balance" : "invoice";
  return {
    sourceId: input.sourceId, ...detectedSupplier,
    documentNumber: input.documentNumber ?? "", documentDate: input.documentDate ?? "", kind,
    taxableAmount, vatAmount, grossTotal: input.grossTotal, referencedAdvanceIds: [], interventionGrossAmount,
    extractionConfidence: input.extractionMode === "native_text" || ocrTripleReconciled ? "certain" : "uncertain",
    extractionIssues,
    explicitDeductibleLines, lineItems,
    internalAdjustmentNote: /Acconto\s*\(Rif\./i.test(text) ? "Acconto interno sottratto nella fattura di saldo; non sommato come fonte separata." : null,
  };
}
