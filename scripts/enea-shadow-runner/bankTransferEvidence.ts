const MONEY = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;
export const BANK_TRANSFER_MONEY_TOLERANCE_EUR = 0.05;

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
};

const amountAfterLabel = (text: string, label: RegExp) => {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!label.test(line)) continue;
    const window = lines.slice(index, index + 3).join(" ");
    const match = window.match(new RegExp(`(?:€|e)?\\s*-?\\s*(${MONEY})(?:\\s*(?:Euro|€))?`, "i"));
    if (match) return parseMoney(match[1]);
  }
  return null;
};

const amountsAfterLabel = (text: string, label: RegExp, followingLines = 3) => {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!label.test(line)) continue;
    return lines.slice(index + 1, index + 1 + followingLines).flatMap((candidate) =>
      [...candidate.matchAll(new RegExp(`(${MONEY})`, "gi"))]
        .map((match) => parseMoney(match[1])).filter((value): value is number => value !== null));
  }
  return [];
};

function reconciledTotalOperationBreakdown(text: string) {
  const fees = amountAfterLabel(text, /^\s*Commissioni\b/i);
  if (fees === null) return null;
  const amounts = amountsAfterLabel(text, /^\s*Totale\s+operazione\s*$/i, 4);
  const matches = amounts.flatMap((principalAmount, principalIndex) => amounts.flatMap((debitedTotal, debitedIndex) =>
    principalIndex !== debitedIndex
      && Math.abs(Math.round((principalAmount + fees + Number.EPSILON) * 100) / 100 - debitedTotal) <= BANK_TRANSFER_MONEY_TOLERANCE_EUR
      ? [{ principalAmount, fees, debitedTotal }] : []));
  const unique = new Map(matches.map((item) => [`${item.principalAmount}|${item.fees}|${item.debitedTotal}`, item]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function reconciledCreditDebitStatement(text: string) {
  if (!/^\s*BONIFICO\s+AGEVOLAZIONI\s+FISCALI\s*$/im.test(text)
    || !/TOT\.\s*A\s+VS\.\s+CRED\./i.test(text)
    || !/A\s+VS\.\s+CREDITO/i.test(text)
    || !/A\s+VS\.\s+DEBITO/i.test(text)) return null;
  const values = [...text.matchAll(new RegExp(`(${MONEY})`, "gi"))]
    .map((match) => parseMoney(match[1])).filter((value): value is number => value !== null && value > 0);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const repeated = [...counts].filter(([, count]) => count >= 2).map(([value]) => value);
  return repeated.length === 1 ? { principalAmount: repeated[0], fees: null, debitedTotal: null } : null;
}

function transactionReferenceAfterLabel(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const candidates = lines.flatMap((line, index) => /^(?:Cro|TRN)$/i.test(line)
    ? lines.slice(index + 1, index + 4).filter((value) => /^(?=[A-Z0-9]{20,}$)(?=.*\d)[A-Z0-9]+$/i.test(value)) : []);
  return new Set(candidates).size === 1 ? candidates[0] : null;
}

export interface BankTransferEvidence {
  sourceId: string;
  transactionReference: string | null;
  principalAmount: number | null;
  fees: number | null;
  debitedTotal: number | null;
  invoiceReference: string | null;
  taxReliefType: "energy_saving" | "building_renovation" | null;
  appliedRuleIds: string[];
}

const taxReliefType = (value: string): BankTransferEvidence["taxReliefType"] => {
  if (/Risparmio\s+energetico|Risp\.?\s*Energ\.?|L\.\s*296\/06/i.test(value)) return "energy_saving";
  if (/Ristrutturazione\s+edilizia|Ristr\.?\s*Edil\.?|Art\.\s*16-bis/i.test(value)) return "building_renovation";
  return null;
};

/** Classifica soltanto ricevute con intestazione bancaria esplicita. */
export function extractBankTransferEvidence(sourceId: string, text: string): BankTransferEvidence | null {
  return extractBankTransferEvidences(sourceId, text)[0] ?? null;
}

/**
 * Un singolo PDF bancario puo contenere piu ricevute, una per pagina.
 *
 * Correzione di Giuliano (2026-09-07, sospensione del controllo bonifici):
 * l'elenco di intestazioni riconosciute non copriva formati bancari reali
 * (Manso: "SERVIZIO PAGAMENTI/ORDINANTE" + "ABBIAMO RICEVUTO L'ORDINE DI
 * BONIFICO"; Mastrangelo: "OGGETTO: Ricevuta Pagamento [Bonifico]"; Coda:
 * "Dettaglio disposizione: Bonifico per detrazioni") che percio' venivano
 * classificati come fatture indipendenti invece che come ricevute di
 * pagamento. Estesa per riconoscere anche questi tre formati. Per Coda, la
 * segmentazione per fattura puo' separare l'intestazione "Dettaglio
 * disposizione" dal resto della stessa ricevuta: la coppia "A favore di
 * (P.iva o CF)" + "Tipologia fruitore della detrazione" (Banco BPM) resta
 * presente in ogni segmento della stessa ricevuta ed e' quindi il marcatore
 * usato per riconoscerla anche quando l'intestazione e' altrove.
 */
const BANK_TRANSFER_HEADER_MARKER = /(?:CONFERMA\s+ORDINE\s+DI\s+BONIFICO|BONIFICO\s+SEPA|BONIFICO\s+(?:INSTANT\s+)?AGEVOLAZION[EI]\s+FISC(?:AL[EI])?|DATI\s+RELATIVI\s+ALLE\s+DETRAZIONI\s+FISCALI|Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali|Dettaglio\s+movimento[\s\S]{0,120}?Bonifico\s+A\s+Debito|ABBIAMO\s+RICEVUTO\s+L['’]ORDINE\s+DI\s+BONIFICO|OGGETTO\s*:\s*Ricevuta\s+Pagamento(?:\s+Bonifico)?|Dettaglio\s+disposizione\s*:\s*Bonifico|A\s+favore\s+di\s*\(P\.iva\s+o\s+CF\)[\s\S]{0,400}?Tipologia\s+fruitore\s+della\s+detrazione)/i;

/**
 * Indice del primo marcatore di intestazione bancaria nel testo, o null se
 * assente. Usato per distinguere una fattura vera con una conferma di
 * bonifico accodata (la terna fiscale si risolve gia' dal testo PRIMA di
 * questo indice) da una ricevuta di bonifico che cita numero/data/importo di
 * una fattura nella propria causale (la terna dipenderebbe da testo a
 * partire da questo indice in poi: regressione Ronconi/controprova "Presa in
 * carico", 2026-09-08).
 */
export function firstBankTransferHeaderIndex(text: string): number | null {
  const match = BANK_TRANSFER_HEADER_MARKER.exec(text);
  return match ? match.index : null;
}

export function extractBankTransferEvidences(sourceId: string, text: string): BankTransferEvidence[] {
  if (!BANK_TRANSFER_HEADER_MARKER.test(text)) return [];
  const bankPage = /(?:Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali|^\s*BONIFICO\s+AGEVOLAZIONI\s+FISCALI\s*$)/im;
  const pages = text.split("\f").filter((page) => bankPage.test(page));
  const marker = /(?=^\s*(?:Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali|BONIFICO\s+AGEVOLAZIONI\s+FISCALI)\s*$)/gim;
  const splitParts = text.split(marker).filter((part) => bankPage.test(part));
  const parts = pages.length ? pages : splitParts.length ? splitParts : [text];
  return parts.flatMap((part, index) => {
    const numberedInvoice = part.match(/Fattura\s+Numero\s+([A-Z0-9./-]+)(?:\s+(FE))?/i)
      ?? part.match(/(?:Fattura|Ft)\s+([A-Z0-9./-]+)\s+(FE)\b/i);
    const invoiceReference = numberedInvoice ? `${numberedInvoice[1]}${numberedInvoice[2] ? "/FE" : ""}`
      : part.match(/fattura\s+n\.?\s*([A-Z0-9./-]+)/i)?.[1]
      ?? part.match(/Pag\.\s*ft\s*([A-Z0-9./-]+)/i)?.[1]
      ?? part.match(/FATTURA\s+(?:N\.?\s*)?([A-Z0-9./-]+)/i)?.[1]
      ?? null;
    const pairedAmounts = part.match(new RegExp(`Importo\\s*\\r?\\n\\s*Commissioni\\s*\\r?\\n\\s*(${MONEY})\\s*Euro\\s*\\r?\\n\\s*(${MONEY})\\s*Euro[\\s\\S]{0,80}?Totale\\s+operazione\\s*\\r?\\n\\s*(${MONEY})\\s*Euro`, "i"));
    const totalOperationBreakdown = pairedAmounts ? null : reconciledTotalOperationBreakdown(part);
    const creditDebitStatement = pairedAmounts || totalOperationBreakdown ? null : reconciledCreditDebitStatement(part);
    const bankStatementAmount = part.match(new RegExp(`Dare:\\s*Avere:\\s*\\r?\\n\\s*(${MONEY})`, "i"))?.[1] ?? null;
    const principalAmount = pairedAmounts ? parseMoney(pairedAmounts[1])
      : totalOperationBreakdown?.principalAmount ?? creditDebitStatement?.principalAmount
        ?? amountAfterLabel(part, /^\s*Importo\b/i) ?? (bankStatementAmount ? parseMoney(bankStatementAmount) : null);
    const transactionReference = part.match(/(?:Cro|TRN)\s*(?::|\r?\n)\s*([A-Z0-9]{10,})/i)?.[1]
      ?? part.match(/\bRif\s*=\s*([A-Z0-9]{10,})/i)?.[1]
      ?? transactionReferenceAfterLabel(part)
      ?? null;
    // Un modulo bancario completamente vuoto non prova che esista un
    // bonifico. Lo si conserva fra le fonti, ma non deve generare un
    // movimento economico nullo che contamini la riconciliazione.
    if (principalAmount === null && invoiceReference === null && transactionReference === null) return [];
    return [{
      sourceId: parts.length > 1 ? `${sourceId}:transfer-${index + 1}` : sourceId,
      transactionReference,
      principalAmount,
      fees: pairedAmounts ? parseMoney(pairedAmounts[2]) : totalOperationBreakdown?.fees
        ?? (creditDebitStatement ? null : amountAfterLabel(part, /^\s*Commissioni\b/i)),
      debitedTotal: pairedAmounts ? parseMoney(pairedAmounts[3]) : totalOperationBreakdown?.debitedTotal
        ?? (creditDebitStatement ? null : amountAfterLabel(part, /^\s*Totale(?:\s+operazione)?\b/i)),
      invoiceReference,
      taxReliefType: taxReliefType(part),
      appliedRuleIds: ["user-2026-08-16-invoice-total-over-bank-transfers", "user-2026-08-18-mandatory-bank-transfer-invoice-expense-cross-check", "core-economic-classification"],
    }];
  });
}

const invoiceNumber = (value: string | null) => value?.match(/\d+/)?.[0] ?? null;

export function reconcileBankTransfers(invoiceTotal: number | null, transfers: BankTransferEvidence[], expectedInvoiceReferences: readonly string[] = []) {
  if (!transfers.length) return { status: "not_provided" as const, principalTotal: null, feesTotal: null, debitedTotal: null, difference: null, referenceStatus: "not_provided" as const, missingInvoiceReferences: [] as string[], taxReliefTypes: [] as NonNullable<BankTransferEvidence["taxReliefType"]>[] };
  const principals = transfers.map((item) => item.principalAmount);
  const observedReferenceNumbers = new Set(transfers.map((item) => invoiceNumber(item.invoiceReference)).filter(Boolean));
  const missingInvoiceReferences = expectedInvoiceReferences.filter((reference) => !observedReferenceNumbers.has(invoiceNumber(reference)));
  const referenceStatus = !expectedInvoiceReferences.length ? "not_checked" as const
    : missingInvoiceReferences.length ? "incomplete" as const : "verified" as const;
  const taxReliefTypes = [...new Set(transfers.map((item) => item.taxReliefType).filter((value): value is NonNullable<typeof value> => value !== null))];
  if (invoiceTotal === null || principals.some((value) => value === null)) {
    return { status: "unverified" as const, principalTotal: null, feesTotal: null, debitedTotal: null, difference: null, referenceStatus, missingInvoiceReferences, taxReliefTypes };
  }
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const principalTotal = round(principals.reduce<number>((sum, value) => sum + (value ?? 0), 0));
  const feesTotal = round(transfers.reduce((sum, item) => sum + (item.fees ?? 0), 0));
  const debitedTotal = transfers.every((item) => item.debitedTotal !== null)
    ? round(transfers.reduce((sum, item) => sum + (item.debitedTotal ?? 0), 0)) : null;
  const difference = round(principalTotal - invoiceTotal);
  const status = difference > BANK_TRANSFER_MONEY_TOLERANCE_EUR ? "principal_exceeds_invoices" as const
    : difference < -BANK_TRANSFER_MONEY_TOLERANCE_EUR ? "principal_below_invoices" as const : "reconciled" as const;
  return { status, principalTotal, feesTotal, debitedTotal, difference, referenceStatus, missingInvoiceReferences, taxReliefTypes };
}
