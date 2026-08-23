const MONEY = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;

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

/** Un singolo PDF bancario puo contenere piu ricevute, una per pagina. */
export function extractBankTransferEvidences(sourceId: string, text: string): BankTransferEvidence[] {
  if (!/(?:CONFERMA\s+ORDINE\s+DI\s+BONIFICO|BONIFICO\s+SEPA|BONIFICO\s+(?:INSTANT\s+)?AGEVOLAZION[EI]\s+FISC(?:AL[EI])?|DATI\s+RELATIVI\s+ALLE\s+DETRAZIONI\s+FISCALI|Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali|Dettaglio\s+movimento[\s\S]{0,120}?Bonifico\s+A\s+Debito)/i.test(text)) return [];
  const marker = /(?=Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali)/gi;
  const parts = /Presa\s+in\s+carico\s*-\s*Bonifico\s+per\s+Agevolazioni\s+Fiscali/i.test(text) ? text.split(marker).filter((part) => /Presa\s+in\s+carico/i.test(part)) : [text];
  return parts.flatMap((part, index) => {
    const numberedInvoice = part.match(/Fattura\s+Numero\s+([A-Z0-9.-]+)(?:\s+(FE))?/i)
      ?? part.match(/(?:Fattura|Ft)\s+([A-Z0-9.-]+)\s+(FE)\b/i);
    const invoiceReference = numberedInvoice ? `${numberedInvoice[1]}${numberedInvoice[2] ? "/FE" : ""}`
      : part.match(/fattura\s+n\.?\s*([A-Z0-9./-]+)/i)?.[1]
      ?? part.match(/Pag\.\s*ft\s*([A-Z0-9./-]+)/i)?.[1]
      ?? part.match(/FATTURA\s+(?:N\.?\s*)?([A-Z0-9./-]+)/i)?.[1]
      ?? null;
    const pairedAmounts = part.match(new RegExp(`Importo\\s*\\r?\\n\\s*Commissioni\\s*\\r?\\n\\s*(${MONEY})\\s*Euro\\s*\\r?\\n\\s*(${MONEY})\\s*Euro[\\s\\S]{0,80}?Totale\\s+operazione\\s*\\r?\\n\\s*(${MONEY})\\s*Euro`, "i"));
    const bankStatementAmount = part.match(new RegExp(`Dare:\\s*Avere:\\s*\\r?\\n\\s*(${MONEY})`, "i"))?.[1] ?? null;
    const principalAmount = pairedAmounts ? parseMoney(pairedAmounts[1])
      : amountAfterLabel(part, /^\s*Importo\b/i) ?? (bankStatementAmount ? parseMoney(bankStatementAmount) : null);
    const transactionReference = part.match(/(?:Cro|TRN)\s*:\s*([A-Z0-9]{10,})/i)?.[1]
      ?? part.match(/\bRif\s*=\s*([A-Z0-9]{10,})/i)?.[1]
      ?? null;
    // Un modulo bancario completamente vuoto non prova che esista un
    // bonifico. Lo si conserva fra le fonti, ma non deve generare un
    // movimento economico nullo che contamini la riconciliazione.
    if (principalAmount === null && invoiceReference === null && transactionReference === null) return [];
    return [{
      sourceId: parts.length > 1 ? `${sourceId}:transfer-${index + 1}` : sourceId,
      transactionReference,
      principalAmount,
      fees: pairedAmounts ? parseMoney(pairedAmounts[2]) : amountAfterLabel(part, /^\s*Commissioni\b/i),
      debitedTotal: pairedAmounts ? parseMoney(pairedAmounts[3]) : amountAfterLabel(part, /^\s*Totale(?:\s+operazione)?\b/i),
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
  const status = difference > 0.01 ? "principal_exceeds_invoices" as const
    : difference < -0.01 ? "principal_below_invoices" as const : "reconciled" as const;
  return { status, principalTotal, feesTotal, debitedTotal, difference, referenceStatus, missingInvoiceReferences, taxReliefTypes };
}
