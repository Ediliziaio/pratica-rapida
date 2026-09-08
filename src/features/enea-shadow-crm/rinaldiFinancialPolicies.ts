import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export type RinaldiLineClassification = "pergola" | "vepa" | "other" | "ambiguous";

export interface RinaldiInvoiceLineEvidence {
  lineId: string;
  lineNumber?: string | number | null;
  text: string;
  grossAmount: number | null;
  classification: RinaldiLineClassification;
  extractionConfidence: "certain" | "uncertain";
}

export interface RinaldiDeductibleLineEvidence {
  lineId: string;
  lineNumber?: string | number | null;
  text: string;
  amount: number | null;
  extractionConfidence: "certain" | "uncertain";
}

export interface RinaldiPolicySource {
  sourceId: string;
  supplierId: string;
  supplierName?: string | null;
  documentNumber: string;
  grossTotal: number | null;
  explicitDeductibleLines?: readonly RinaldiDeductibleLineEvidence[];
  lineItems?: readonly RinaldiInvoiceLineEvidence[];
}

export interface RinaldiPolicyContext {
  mode: "test" | "production";
  scheme: "ecobonus" | "bonus_casa";
}

export interface RinaldiPolicyResult {
  effectiveEneaAmounts: Readonly<Record<string, number>>;
  blockers: readonly string[];
  auditNotes: readonly string[];
  appliedRuleIds: readonly string[];
  deferredVepaLineIds: readonly string[];
  bonusCasaDraftAllowed: boolean;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const validMoney = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const RINALDI_SUPPLIER_IDS = new Set(["rinaldi", "rinaldi-lab"]);
const RINALDI_SUPPLIER_NAMES = new Set(["rinaldi", "rinaldi lab"]);
const DEDUCTIBLE_LABELS = new Set([
  "totale da portare in detrazione",
  "totale massimo detraibile",
  "totale detraibile",
  "totale massimo da portare in detrazione",
  "totale spese congrue sostenute in base ai massimali ammessi",
  "spese congrue sostenute in base ai massimali ammessi",
]);

export function isUnambiguousRinaldiSupplier(source: Pick<RinaldiPolicySource, "supplierId" | "supplierName">) {
  const supplierId = normalize(source.supplierId);
  const supplierName = normalize(source.supplierName ?? "");
  return RINALDI_SUPPLIER_IDS.has(supplierId) || RINALDI_SUPPLIER_NAMES.has(supplierName);
}

function normalizedDeductibleLabel(text: string) {
  return normalize(text).replace(/(?: euro| eur)? \d+(?: \d+)*$/, "").trim();
}

function isExplicitDeductibleLabel(text: string) {
  return DEDUCTIBLE_LABELS.has(normalizedDeductibleLabel(text));
}

/**
 * Applica esclusivamente le due policy finanziarie Rinaldi autorizzate.
 * La segregazione VEPA TEST Ecobonus ha precedenza sul totale detraibile di fattura.
 */
export function applyRinaldiScopedFinancialRules(
  sources: readonly RinaldiPolicySource[],
  context: RinaldiPolicyContext,
): RinaldiPolicyResult {
  const effectiveEneaAmounts: Record<string, number> = {};
  const blockers: string[] = [];
  const auditNotes: string[] = [];
  const appliedRuleIds = new Set<string>();
  const deferredVepaLineIds: string[] = [];
  const rinaldiSources = sources.filter(isUnambiguousRinaldiSupplier);
  const rinaldiLines = rinaldiSources.flatMap((source) => source.lineItems ?? []);
  const vepaSeparationApplies = context.mode === "test" && context.scheme === "ecobonus"
    && rinaldiLines.some((line) => line.classification === "pergola")
    && rinaldiLines.some((line) => line.classification === "vepa");

  if (vepaSeparationApplies) {
    appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.rinaldiPergolaVepaTestEcobonus);
    for (const source of rinaldiSources) {
      const lines = source.lineItems;
      if (!lines?.length) {
        blockers.push(`rinaldi-pergola-vepa-attribuzione-ambigua:${source.sourceId}`);
        continue;
      }
      const ambiguous = lines.some((line) => line.classification === "ambiguous"
        || line.extractionConfidence !== "certain" || !validMoney(line.grossAmount));
      if (ambiguous) {
        blockers.push(`rinaldi-pergola-vepa-attribuzione-ambigua:${source.sourceId}`);
        continue;
      }
      const pergolaLines = lines.filter((line) => line.classification === "pergola");
      effectiveEneaAmounts[source.sourceId] = money(pergolaLines.reduce((sum, line) => sum + (line.grossAmount ?? 0), 0));
      for (const line of lines.filter((item) => item.classification === "vepa")) {
        deferredVepaLineIds.push(line.lineId);
        auditNotes.push([
          source.sourceId, `fattura=${source.documentNumber}`, `riga=${line.lineNumber ?? line.lineId}`,
          `testo=${line.text}`, `importo=${money(line.grossAmount ?? 0).toFixed(2)}`,
          "VEPA separata, Bonus Casa non ancora lavorato",
          `regola=${USER_AUTHORIZED_RULE_IDS.rinaldiPergolaVepaTestEcobonus}`,
        ].join("|"));
      }
    }
  }

  if (!vepaSeparationApplies) {
    const candidateEntries = rinaldiSources.flatMap((source) =>
      (source.explicitDeductibleLines ?? []).map((line) => ({ source, line })),
    );
    if (candidateEntries.length > 0) {
      const validEntries = candidateEntries.filter(({ line }) => line.extractionConfidence === "certain"
        && isExplicitDeductibleLabel(line.text) && validMoney(line.amount));
      const distinctAmounts = new Set(validEntries.map(({ line }) => money(line.amount ?? 0)));
      if (validEntries.length !== candidateEntries.length || distinctAmounts.size !== 1
        || rinaldiSources.some((source) => !validMoney(source.grossTotal))) {
        for (const source of new Set(candidateEntries.map((entry) => entry.source.sourceId))) {
          blockers.push(`rinaldi-totale-detraibile-ambiguo:${source}`);
        }
      } else {
        const [{ source: authoritativeSource, line }] = validEntries;
        const amount = money(line.amount ?? 0);
        // La cifra esplicita è il totale detraibile dell'intera pratica Rinaldi,
        // non un subtotale da sommare alle altre fatture dello stesso dossier.
        for (const source of rinaldiSources) effectiveEneaAmounts[source.sourceId] = 0;
        effectiveEneaAmounts[authoritativeSource.sourceId] = amount;
        appliedRuleIds.add(USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal);
        auditNotes.push([
          authoritativeSource.sourceId, `fattura=${authoritativeSource.documentNumber}`, `riga=${line.lineNumber ?? line.lineId}`,
          `testo=${line.text}`, `importo_pratica=${amount.toFixed(2)}`,
          `lordi_fatture=${money(rinaldiSources.reduce((sum, source) => sum + (source.grossTotal ?? 0), 0)).toFixed(2)}`,
          "scope=insieme_fatture_pratica_rinaldi",
          `regola=${USER_AUTHORIZED_RULE_IDS.rinaldiExplicitDeductibleTotal}`,
        ].join("|"));
      }
    }
  }

  return {
    effectiveEneaAmounts,
    blockers: [...new Set(blockers)],
    auditNotes,
    appliedRuleIds: [...appliedRuleIds],
    deferredVepaLineIds,
    bonusCasaDraftAllowed: !vepaSeparationApplies,
  };
}
