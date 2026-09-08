import { stripHistoricalEneaAppendix } from "../../src/features/enea-lab/invoiceParser";
import { MONEY_TOLERANCE_EUR, type FinancialDocumentEvidence } from "../../src/features/enea-shadow-crm/financialReconciliation";
import type { RinaldiDeductibleLineEvidence, RinaldiInvoiceLineEvidence } from "../../src/features/enea-shadow-crm/rinaldiFinancialPolicies";

// Regola generale definitiva di Giuliano (2026-09-08, regressione Calvacchi):
// una riga di credito esplicita verso un acconto precedente e' il segnale
// che il totale finale stampato in fattura, non una ricostruzione dalle
// righe, e' l'unica prova autorevole. Esportata perche' anche il chiamante
// (crmLocalPreflight.ts) deve poter citare la regola nel proprio audit
// quando questo segnale determina il totale della pratica.
export function hasInternalAdvanceCreditLine(text: string): boolean {
  return /\bAcconto\s*(?:\(\s*Rif\.?[^\n)]{0,120}?\)|:\s*(?:RIF\.?\s*)?FATTURA\b)[^\n]{0,60}?[-−]\s*[0-9][0-9.]*,[0-9]{2}/i.test(text);
}

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
// Regola generale di Giuliano (Laurelli): un OCR puo' scrivere per errore un
// punto al posto della virgola nei decimali di un importo che gia' usa il
// punto come separatore delle migliaia (es. "3.759.40" invece di
// "3.759,40"). Il pattern e' inequivocabile solo quando compare piu' di un
// punto: l'ultimo gruppo di due cifre e' sempre il centesimo, mai un'altra
// migliaia. Usato soltanto come ripiego, dopo che il formato corretto con la
// virgola non e' stato trovato.
export const OCR_TYPO_DOUBLE_PERIOD_SCHEDULE_AMOUNT_RULE_ID = "user-2026-09-07-ocr-typo-double-period-schedule-amount-v1" as const;
const OCR_TYPO_DOUBLE_PERIOD_MONEY = /\b\d{1,3}(?:\.\d{3})+\.\d{2}\b/;
const lastAmountFromLenient = (value: string) => {
  const strict = lastAmountFrom(value);
  if (strict !== null) return strict;
  const match = value.match(OCR_TYPO_DOUBLE_PERIOD_MONEY);
  if (!match) return null;
  const parts = match[0].split(".");
  const cents = parts.pop();
  return `${parts.join(".")},${cents}`;
};
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

function reconciledGroupedFiscalSummary(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const taxableLabelIndexes = lines.flatMap((line, index) => /\bTOTALE\s+IMPONIBILE\b/i.test(line) ? [index] : []);
  for (const taxableLabelIndex of taxableLabelIndexes) {
    const vatLabelIndex = lines.findIndex((line, index) => index >= taxableLabelIndex
      && index <= taxableLabelIndex + 2 && /\bTOTALE\s+IVA\b/i.test(line));
    const netLabelIndex = lines.findIndex((line, index) => index >= taxableLabelIndex
      && index <= taxableLabelIndex + 4 && /\bNETTO\s+A\s+PAGARE\b/i.test(line));
    if (vatLabelIndex < 0 || netLabelIndex < 0) continue;

    for (let index = netLabelIndex + 1; index <= Math.min(lines.length - 1, netLabelIndex + 3); index += 1) {
      const values = [...lines[index].matchAll(new RegExp(`(${SIGNED_MONEY})`, "gi"))]
        .map((match) => money(match[1]))
        .filter((value): value is number => value !== null);
      if (values.length < 3) continue;
      const [taxableAmount, vatAmount, grossAmount] = values;
      const fiscalSum = Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100;
      if (Math.abs(fiscalSum - grossAmount) <= MONEY_TOLERANCE_EUR + Number.EPSILON
        && Math.abs(grossAmount - grossTotal) <= MONEY_TOLERANCE_EUR + Number.EPSILON) {
        return { taxableAmount, vatAmount, grossAmount };
      }
    }
  }
  return null;
}

function reconciledMultiRateColumnarTotals(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const taxableIndex = lines.findIndex((line) => /^IMPONIBILE\b/i.test(line)
    && [...line.matchAll(new RegExp(`(${MONEY})`, "gi"))].length >= 2);
  if (taxableIndex < 0) return null;
  const taxableValues = [...lines[taxableIndex].matchAll(new RegExp(`(${MONEY})`, "gi"))]
    .map((match) => money(match[1]))
    .filter((value): value is number => value !== null);
  const taxableAmount = Math.round((taxableValues.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  if (taxableAmount <= 0 || taxableAmount >= grossTotal) return null;

  const vatHeaderIndex = lines.findIndex((line, index) => index > taxableIndex
    && /\bAL\.?\s*IVA\b/i.test(line) && /\bIMPORTO\s+IVA\b/i.test(line));
  if (vatHeaderIndex < 0) return null;
  const vatBlock: number[] = [];
  for (let index = vatHeaderIndex + 1; index < Math.min(lines.length, vatHeaderIndex + 8); index += 1) {
    if (/^(?:BOLLI|SPESE\s+INCASSO|TOTALE\s+A\s+PAGARE)\b/i.test(lines[index])) break;
    vatBlock.push(...[...lines[index].matchAll(new RegExp(`(${MONEY})`, "gi"))]
      .map((match) => money(match[1]))
      .filter((value): value is number => value !== null));
  }
  const expectedVat = Math.round((grossTotal - taxableAmount + Number.EPSILON) * 100) / 100;
  const componentVatValues = vatBlock.filter((value) => value > 0
    && value <= expectedVat + MONEY_TOLERANCE_EUR
    && Math.abs(value - taxableAmount) > MONEY_TOLERANCE_EUR);
  const vatAmount = Math.round((componentVatValues.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  return componentVatValues.length > 0
    && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR
    ? { taxableAmount, vatAmount }
    : null;
}

function reconciledStaggeredRateTotals(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const start = lines.findIndex((line) => /^Imponibile$/i.test(line));
  const end = lines.findIndex((line) => /^Spese\s+Bolli$/i.test(line));
  if (start < 0 || end < 0 || start === end) return null;
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const components: Array<{ taxableAmount: number; vatAmount: number }> = [];
  for (let index = lower + 1; index < upper; index += 1) {
    // Vision puo' conservare il separatore verticale della tabella come | o
    // barra Unicode. Lo ammettiamo soltanto tra importo e aliquota, mentre la
    // riconciliazione matematica col lordo resta obbligatoria e univoca.
    const row = lines[index].match(new RegExp(`^(${MONEY})\\s*[|¦]?\\s*(\\d{1,2})(?:[,.]00)?$`, "i"));
    if (!row) continue;
    const taxableAmount = money(row[1]); const rate = Number(row[2]);
    if (taxableAmount === null || rate < 1 || rate > 30) continue;
    const expectedVat = Math.round((taxableAmount * rate / 100 + Number.EPSILON) * 100) / 100;
    const candidates = lines.slice(Math.max(lower + 1, index - 2), Math.min(upper, index + 3)).flatMap((line) => {
      const found = line.match(new RegExp(`^(${MONEY})$`, "i")); const value = found ? money(found[1]) : null;
      return value !== null && Math.abs(value - expectedVat) <= MONEY_TOLERANCE_EUR ? [value] : [];
    });
    if (candidates.length === 1) components.push({ taxableAmount, vatAmount: candidates[0] });
  }
  const unique = new Map(components.map((component) => [`${component.taxableAmount}|${component.vatAmount}`, component]));
  if (unique.size < 1) return null;
  const totals = [...unique.values()].reduce((sum, component) => ({
    taxableAmount: sum.taxableAmount + component.taxableAmount,
    vatAmount: sum.vatAmount + component.vatAmount,
  }), { taxableAmount: 0, vatAmount: 0 });
  totals.taxableAmount = Math.round((totals.taxableAmount + Number.EPSILON) * 100) / 100;
  totals.vatAmount = Math.round((totals.vatAmount + Number.EPSILON) * 100) / 100;
  return Math.abs(totals.taxableAmount + totals.vatAmount - grossTotal) <= MONEY_TOLERANCE_EUR ? totals : null;
}

function reconciledLabelAnchoredColumnarTotals(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const netIndex = lines.findIndex((line) => /^netto\s+merce\b/i.test(line));
  if (netIndex < 0) return null;
  const taxableCandidates = new Set<number>();
  for (let index = netIndex; index <= Math.min(lines.length - 1, netIndex + 6); index += 1) {
    for (const match of lines[index].matchAll(new RegExp(`(${MONEY})`, "gi"))) {
      const value = money(match[1]);
      if (value !== null && value > 0 && value < grossTotal) taxableCandidates.add(value);
    }
  }
  const totalVatIndex = lines.findIndex((line, index) => index > netIndex && /^(?:tot\.|totale\s+(?:iva|imposta))$/i.test(line));
  if (totalVatIndex < 0) return null;
  const vatCandidates = new Set<number>();
  for (let index = totalVatIndex; index <= Math.min(lines.length - 1, totalVatIndex + 2); index += 1) {
    for (const match of lines[index].matchAll(new RegExp(`(${MONEY})`, "gi"))) {
      const value = money(match[1]);
      if (value !== null && value >= 0 && value < grossTotal) vatCandidates.add(value);
    }
  }
  const matches = [...taxableCandidates].flatMap((taxableAmount) => [...vatCandidates].flatMap((vatAmount) =>
    Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR
      ? [{ taxableAmount, vatAmount }] : []));
  const unique = new Map(matches.map((item) => [`${item.taxableAmount}|${item.vatAmount}`, item]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function reconciledSdiPaDigitaleTotals(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const block = text.match(/RIEPILOGHI\s+IVA\s+E\s+TOTALI[\s\S]{0,900}?(?=IMPORTO\s+BOLLO|MODALIT[ÀA]\s+PAGAMENTO|$)/iu)?.[0];
  if (!block || !/TOTALE\s+IMPONIBILE\s+TOTALE\s+IMPOSTA/iu.test(block)) return null;
  const values = [...block.matchAll(new RegExp(`(${SIGNED_MONEY})`, "giu"))]
    .map((match) => money(match[1])).filter((value): value is number => value !== null);
  const rates = [...new Set(values.filter((value) => value > 0 && value <= 30))];
  const monetary = values.filter((value) => Math.abs(value) > 100);
  const pairs = monetary.flatMap((taxableAmount, taxableIndex) => rates.flatMap((rate) => monetary.flatMap((vatAmount, vatIndex) => {
    if (taxableIndex === vatIndex) return [];
    const expected = Math.round((taxableAmount * rate / 100 + Number.EPSILON) * 100) / 100;
    return Math.abs(expected - vatAmount) <= MONEY_TOLERANCE_EUR ? [{ taxableAmount, vatAmount, taxableIndex, vatIndex }] : [];
  })));
  const solutions: Array<{ taxableAmount: number; vatAmount: number }> = [];
  const visit = (index: number, used: Set<number>, taxableAmount: number, vatAmount: number) => {
    if (Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR && used.size > 0) {
      solutions.push({ taxableAmount: Math.round((taxableAmount + Number.EPSILON) * 100) / 100, vatAmount: Math.round((vatAmount + Number.EPSILON) * 100) / 100 });
    }
    for (let cursor = index; cursor < pairs.length; cursor += 1) {
      const pair = pairs[cursor];
      if (used.has(pair.taxableIndex) || used.has(pair.vatIndex)) continue;
      const next = new Set(used); next.add(pair.taxableIndex); next.add(pair.vatIndex);
      visit(cursor + 1, next, taxableAmount + pair.taxableAmount, vatAmount + pair.vatAmount);
    }
  };
  visit(0, new Set(), 0, 0);
  const unique = new Map(solutions.map((item) => [`${item.taxableAmount}|${item.vatAmount}`, item]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

const reconciledFiscalTotals = (text: string, grossTotal: number | null) => {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const taxableIndex = lines.findIndex((line) => /^(?:totale\s+)?imponibile$/i.test(line));
  const vatIndex = lines.findIndex((line) => /^totale\s+(?:iva|imposta)\b/i.test(line));
  if (taxableIndex < 0 || vatIndex < 0) return null;
  const boundedTaxableCandidates = new Set<number>();
  for (let index = taxableIndex; index < vatIndex; index += 1) {
    for (const match of lines[index].matchAll(new RegExp(`(${MONEY})`, "gi"))) {
      const value = money(match[1]); if (value !== null && value > 0 && value < grossTotal) boundedTaxableCandidates.add(value);
    }
  }
  const boundedVatCandidates = new Set<number>();
  for (let index = vatIndex; index <= Math.min(lines.length - 1, vatIndex + 3); index += 1) {
    for (const match of lines[index].matchAll(new RegExp(`(${MONEY})`, "gi"))) {
      const value = money(match[1]); if (value !== null && value >= 0 && value < grossTotal) boundedVatCandidates.add(value);
    }
  }
  const boundedPairs = [...boundedTaxableCandidates].flatMap((taxableAmount) => [...boundedVatCandidates].flatMap((vatAmount) =>
    Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR
      ? [{ taxableAmount, vatAmount }] : []));
  const uniqueBoundedPairs = new Map(boundedPairs.map((pair) => [`${pair.taxableAmount}|${pair.vatAmount}`, pair]));
  if (uniqueBoundedPairs.size === 1) return [...uniqueBoundedPairs.values()][0];
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
        && Math.abs(Math.round((taxableAmount + candidate + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR) {
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
  const scheduleIndexes = lines.flatMap((line, index) => /\b(?:scadenze(?:\s+pagamenti)?|scadenziario)\b/i.test(line) ? [index] : []);
  let observedMissingAmount = false;
  for (const index of scheduleIndexes) {
    const amounts: number[] = [];
    let datedRows = 0;
    let missingAmount = false;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 12); cursor += 1) {
      const line = lines[cursor];
      if (/^(?:copia\s+della\s+fattura|riepilogo\s+iva|note|powered\s+by)\b/i.test(line)) break;
      if (!/\b\d{2}[./-]\d{2}[./-](?:\d{4}|\d{2})\b/.test(line)) continue;
      datedRows += 1;
      const sameLine = lastAmountFromLenient(line.replace(/\b\d{2}[./-]\d{2}[./-](?:\d{4}|\d{2})\b/g, ""));
      let candidate = sameLine;
      for (let offset = 1; !candidate && offset <= 2 && cursor + offset < lines.length; offset += 1) {
        const following = lines[cursor + offset];
        if (/\b\d{2}[./-]\d{2}[./-](?:\d{4}|\d{2})\b/.test(following)
          || /^(?:copia\s+della\s+fattura|riepilogo\s+iva|note|powered\s+by)\b/i.test(following)) break;
        candidate = lastAmountFromLenient(following);
      }
      const parsed = candidate === null ? null : money(candidate);
      if (parsed === null) missingAmount = true;
      else amounts.push(parsed);
    }
    if (datedRows === 0) continue;
    if (!missingAmount && amounts.length === datedRows) {
      return {
        amount: Math.round((amounts.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100,
        issue: null,
      };
    }
    observedMissingAmount = true;
  }
  return { amount: null, issue: observedMissingAmount ? "schedule_amount_missing" : null };
};

function taxAmounts(text: string, grossTotal: number | null) {
  const sdiPaDigitale = reconciledSdiPaDigitaleTotals(text, grossTotal);
  if (sdiPaDigitale) return sdiPaDigitale;
  const labelAnchoredColumnar = reconciledLabelAnchoredColumnarTotals(text, grossTotal);
  if (labelAnchoredColumnar) return labelAnchoredColumnar;
  const groupedFiscalSummary = reconciledGroupedFiscalSummary(text, grossTotal);
  if (groupedFiscalSummary) {
    return { taxableAmount: groupedFiscalSummary.taxableAmount, vatAmount: groupedFiscalSummary.vatAmount };
  }
  const multiRateColumnar = reconciledMultiRateColumnarTotals(text, grossTotal);
  if (multiRateColumnar) return multiRateColumnar;
  const staggeredRateTotals = reconciledStaggeredRateTotals(text, grossTotal);
  if (staggeredRateTotals) return staggeredRateTotals;
  const inlineVatThenTaxable = text.match(new RegExp(
    `Totale\\s+imposta\\s+(${MONEY})\\s+Totale\\s+imponibile\\s*\\n\\s*(${MONEY})`,
    "i",
  ));
  if (inlineVatThenTaxable && grossTotal !== null) {
    const vatAmount = money(inlineVatThenTaxable[1]);
    const taxableAmount = money(inlineVatThenTaxable[2]);
    if (taxableAmount !== null && vatAmount !== null
      && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR + Number.EPSILON) {
      return { taxableAmount, vatAmount };
    }
  }
  const compactSummaryTail = text.match(/Riepilogo\s+totali([\s\S]{0,800})/iu)?.[1];
  const compactSummaryAmounts = compactSummaryTail?.split(/\r?\n/u)
    .map((line) => [...line.matchAll(new RegExp(`(${MONEY})`, "giu"))].map((match) => match[1]))
    .find((amounts) => amounts.length >= 7);
  if (compactSummaryAmounts) {
    const taxableAmount = money(compactSummaryAmounts[1]);
    const vatAmount = money(compactSummaryAmounts[3]);
    const grossTotal = money(compactSummaryAmounts[5]);
    if (taxableAmount !== null && vatAmount !== null && grossTotal !== null
      && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR + Number.EPSILON) {
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
      && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) <= MONEY_TOLERANCE_EUR + Number.EPSILON) {
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

function reconciledRotatedOcrFiscalPair(text: string, grossTotal: number | null) {
  if (grossTotal === null || !/APR_OCR_ORIENTATION:(?:0|90|180|270)/.test(text)
    || !/\bImponibile\b/i.test(text) || !/\bImporto\s+IVA\b/i.test(text)) return null;
  // Vision puo riconoscere il separatore decimale come punto su una singola
  // cella pur mantenendo il formato italiano sulle altre. L'ammissione del
  // punto resta confinata alla coppia fiscale, che deve riconciliare in modo
  // univoco col totale lordo e con le etichette Imponibile/Importo IVA.
  const ocrMoney = String.raw`(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.]\d{2})`;
  const values = [...text.matchAll(new RegExp(`(${ocrMoney})`, "gi"))]
    .map((match) => match[1].includes(",") ? money(match[1]) : Number(match[1]))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0 && value < grossTotal);
  const pairs = new Map<string, { taxableAmount: number; vatAmount: number }>();
  for (const taxableAmount of values) for (const vatAmount of values) {
    if (taxableAmount <= vatAmount || taxableAmount < grossTotal * 0.7 || vatAmount > grossTotal * 0.3) continue;
    if (Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - grossTotal) > MONEY_TOLERANCE_EUR) continue;
    pairs.set(`${taxableAmount}|${vatAmount}`, { taxableAmount, vatAmount });
  }
  return pairs.size === 1 ? [...pairs.values()][0] : null;
}

function explicitLabeledGrossConfirmation(text: string, grossTotal: number | null) {
  if (grossTotal === null) return null;
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const labels = lines.flatMap((line, index) => /^TOTALE\s+(?:A\s+PAGARE|DOCUMENTO)\b/i.test(line) ? [index] : []);
  const confirmations = new Set<number>();
  for (const index of labels) {
    for (let cursor = Math.max(0, index - 8); cursor <= Math.min(lines.length - 1, index + 8); cursor += 1) {
      if (!/(?:€|\bEuro\b)/i.test(lines[cursor])) continue;
      const found = lastAmountFrom(lines[cursor]);
      const value = found ? money(found) : null;
      if (value !== null && Math.abs(value - grossTotal) <= MONEY_TOLERANCE_EUR) confirmations.add(value);
    }
  }
  return confirmations.size === 1 ? grossTotal : null;
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
    .some((value) => value !== null && Math.abs(value - vatAmount) <= MONEY_TOLERANCE_EUR);
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
  return Math.abs(sum - taxableAmount) <= MONEY_TOLERANCE_EUR ? sum : null;
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
      && Math.abs(Math.round((taxable + vat + Number.EPSILON) * 100) / 100 - gross) <= MONEY_TOLERANCE_EUR + Number.EPSILON) return gross;
  }
  const combinedTotalDocument = amountAfterLabel(
    text,
    /^totale\s+a\s+pagare\b.*\btotale\s+documento\b/i,
    1,
  );
  if (combinedTotalDocument !== null) return combinedTotalDocument;
  const sdiPaymentAmount = amountAfterLabel(text, /^modalit[àa]\s+pagamento\s+dettagli\s+scadenze\s+importo\b/i, 3);
  if (sdiPaymentAmount !== null) return sdiPaymentAmount;
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
    if (!/(?:totale\s+(?:da\s+portare\s+in\s+detrazione|massimo\s+detraibile|detraibile|spese\s+congrue\s+sostenute\s+in\s+base\s+ai\s+massimali\s+ammessi)|spese\s+congrue\s+sostenute\s+in\s+base\s+ai\s+massimali\s+ammessi)/i.test(line)) return [];
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
  const fullZeroReversal = /\bA\s+Detrarre[\s\S]{0,140}?\bfattura\b/i.test(text)
    && /\bFattura\s+a\s+saldo\s+0,00\b/i.test(text)
    && /\bImponibile\s*€?\s*0,00\b/i.test(text)
    && /[-−]\s*[1-9][0-9.]*,[0-9]{2}/.test(text);
  const firstPageText = text.split(/\f/, 1)[0];
  const rotatedOcr = input.extractionMode === "macos_vision_ocr" && /APR_OCR_ORIENTATION:(?:0|90|180|270)/.test(firstPageText);
  const initialTaxAmounts = rotatedOcr
    ? reconciledRotatedOcrFiscalPair(text, input.grossTotal)
      ?? reconciledStaggeredRateTotals(text, input.grossTotal)
      ?? { taxableAmount: null, vatAmount: null }
    : taxAmounts(text, input.grossTotal);
  let { taxableAmount, vatAmount } = initialTaxAmounts;
  const authoritativeGrossTotal = fullZeroReversal ? 0 : input.grossTotal;
  if (fullZeroReversal) ({ taxableAmount, vatAmount } = { taxableAmount: 0, vatAmount: 0 });
  if (!rotatedOcr && authoritativeGrossTotal !== null && (taxableAmount === null || vatAmount === null
    || Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - authoritativeGrossTotal) > MONEY_TOLERANCE_EUR)) {
    const columnar = guardedColumnarTaxAmounts(text, authoritativeGrossTotal);
    if (columnar) ({ taxableAmount, vatAmount } = columnar);
  }
  const netFromRows = rowNetAmount(text, taxableAmount);
  const scheduledDue = scheduledDueGross(text);
  const grossFromRows = rowGrossAmount(text, scheduledDue);
  const labeledGross = explicitLabeledGrossConfirmation(text, authoritativeGrossTotal);
  // Regola generale di Giuliano (2026-09-08, regressione Calvacchi): quando
  // una fattura a saldo netta internamente un acconto precedente con una
  // riga di credito esplicita ("Acconto (Rif. Fattura N del D) ... -importo"
  // o "ACCONTO: FATTURA N. ... -importo"), il totale finale stampato in
  // fattura resta sempre l'unica prova autorevole: non si tenta mai una
  // ricostruzione indipendente sommando le righe (aliquote miste, sconti e
  // crediti interni rendono quella somma fragile e non e' comunque mai il
  // dato da verificare, per decisione esplicita dell'utente).
  const interventionGrossAmount = fullZeroReversal ? 0
    : hasInternalAdvanceCreditLine(text) && authoritativeGrossTotal !== null ? authoritativeGrossTotal
    : labeledGross ?? grossFromRows ?? (netFromRows !== null && vatAmount !== null
    ? Math.round((netFromRows + vatAmount + Number.EPSILON) * 100) / 100 : null);
  const extractionIssues = interventionGrossAmount === null && scheduledDue.issue === "schedule_amount_missing"
    ? [{ code: "schedule_amount_missing" as const, reason: "Scadenza non leggibile, importo mancante" as const }]
    : [];
  const ocrTripleReconciled = input.extractionMode === "macos_vision_ocr"
    && taxableAmount !== null && vatAmount !== null && authoritativeGrossTotal !== null && interventionGrossAmount !== null
    && Math.abs(Math.round((taxableAmount + vatAmount + Number.EPSILON) * 100) / 100 - authoritativeGrossTotal) <= MONEY_TOLERANCE_EUR
    && Math.abs(interventionGrossAmount - authoritativeGrossTotal) <= MONEY_TOLERANCE_EUR;
  const detectedSupplier = supplier(text, input.sourceId);
  const explicitDeductibleLines = detectedSupplier.supplierId === "rinaldi" ? deductibleLines(text, input.sourceId) : [];
  const lineItems = detectedSupplier.supplierId === "rinaldi" ? guardedRinaldiMixedLines(text, input.sourceId) : undefined;
  const kind = fullZeroReversal ? "non_economic" : /fattura\s+acconto|acconto\s+su\s+preventivo/i.test(text) ? "advance"
    : /fattura\s+saldo/i.test(text) ? "balance" : "invoice";
  return {
    sourceId: input.sourceId, ...detectedSupplier,
    documentNumber: input.documentNumber ?? "", documentDate: input.documentDate ?? "", kind,
    taxableAmount, vatAmount, grossTotal: authoritativeGrossTotal, referencedAdvanceIds: [], interventionGrossAmount,
    extractionConfidence: input.extractionMode === "native_text" || ocrTripleReconciled ? "certain" : "uncertain",
    extractionIssues,
    explicitDeductibleLines, lineItems,
    internalAdjustmentNote: fullZeroReversal ? "Fattura di puro storno integrale a zero esclusa dalla terna economica; fattura precedente conservata."
      : /Acconto\s*\(Rif\./i.test(text) ? "Acconto interno sottratto nella fattura di saldo; non sommato come fonte separata." : null,
  };
}
