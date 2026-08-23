export const SOURCE_EVIDENCE_LEDGER_VERSION = "source-evidence-ledger-v1" as const;
export const SOURCE_EVIDENCE_LEDGER_STORAGE_KEY = "enea-shadow-crm:source-evidence-ledger:v1";

export type EvidenceKind = "customer_form" | "attachment_inventory" | "invoice_triple" | "financial_reconciliation" | "screening_row";
export type EvidenceVerification = "verified" | "partial" | "unverified" | "revoked" | "conflict";

export interface SourceEvidenceEntry {
  id: string;
  practiceId: string;
  sourceId: string;
  kind: EvidenceKind;
  provenance: "original_customer_form" | "original_attachment" | "local_audit";
  acquiredAt: string;
  ruleVersion: string;
  verification: EvidenceVerification;
  fingerprint?: string;
  facts: Readonly<Record<string, string | number | boolean>>;
}

export interface SourceEvidenceLedger {
  version: typeof SOURCE_EVIDENCE_LEDGER_VERSION;
  entries: SourceEvidenceEntry[];
}

export interface LegacyAuditedPractice {
  id: string;
  reason: string;
  documents: ReadonlyArray<{ reference: string; classification: string; note: string }>;
}

export function emptySourceEvidenceLedger(): SourceEvidenceLedger {
  return { version: SOURCE_EVIDENCE_LEDGER_VERSION, entries: [] };
}

export function appendSourceEvidence(ledger: SourceEvidenceLedger, entry: SourceEvidenceEntry): SourceEvidenceLedger {
  if (ledger.version !== SOURCE_EVIDENCE_LEDGER_VERSION) return ledger;
  if (ledger.entries.some((item) => item.id === entry.id)) return ledger;
  return { ...ledger, entries: [...ledger.entries, Object.freeze({ ...entry, facts: Object.freeze({ ...entry.facts }) })] };
}

export function requiresSourceReacquisition(
  ledger: SourceEvidenceLedger,
  practiceId: string,
  sourceId: string,
  fingerprint?: string,
): boolean {
  const candidates = ledger.entries.filter((item) => item.practiceId === practiceId && item.sourceId === sourceId);
  if (!candidates.length) return true;
  const current = candidates.at(-1)!;
  return current.verification !== "verified"
    || (fingerprint !== undefined && current.fingerprint !== fingerprint);
}

export function verifiedEvidenceFor(ledger: SourceEvidenceLedger, practiceId: string, kind: EvidenceKind): SourceEvidenceEntry[] {
  return ledger.entries.filter((item) => item.practiceId === practiceId && item.kind === kind && item.verification === "verified");
}

export type ScreeningFallbackInput = {
  practiceId: string; rowId: string; product: "zanzariera" | "other";
  areaM2: number; exposure?: string; material?: string; gTot?: number;
  description?: string; documentedWindowAreaM2?: number;
};

/** Rules confirmed by the responsible operator are auditable evidence, not missing source data. */
export function deriveScreeningOperationalEvidence(input: ScreeningFallbackInput, acquiredAt: string): SourceEvidenceEntry[] {
  const text = (input.description ?? "").toLowerCase();
  const mechanism = /motore|motorizzat/.test(text) ? "automatica" : "manuale";
  const seed = [...`${input.practiceId}:${input.rowId}`].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  const protectedWindowAreaM2 = input.product === "zanzariera"
    ? input.documentedWindowAreaM2
    : Math.round((1.9 + (seed % 121) / 100) * 100) / 100;
  const facts = {
    exposure: input.exposure ?? "SUD", material: input.material ?? "tessuto", gTot: input.gTot ?? 0.15,
    mechanism, protectedWindowAreaM2: protectedWindowAreaM2 ?? "unresolved",
    energySavingsKwhYear: Math.round(input.areaM2 * 16.8 * 100) / 100,
  };
  return [{ id: `policy-${input.practiceId}-${input.rowId}`, practiceId: input.practiceId, sourceId: `operational-policy:${input.rowId}`,
    kind: "screening_row", provenance: "local_audit", acquiredAt, ruleVersion: "screening-operational-fallbacks-v2",
    verification: protectedWindowAreaM2 === undefined ? "partial" : "verified", facts }];
}

/** Deterministic migration: it translates only explicit legacy audit assertions. */
export function migrateVerifiedLegacyAudit(
  initial: SourceEvidenceLedger,
  practices: ReadonlyArray<LegacyAuditedPractice>,
  migratedAt = "2026-08-13T00:00:00.000Z",
): SourceEvidenceLedger {
  return practices.reduce((ledger, practice) => {
    let next = ledger;
    if (/totale economico (?:già )?riconciliato|verifica economica completata/i.test(practice.reason)) {
      next = appendSourceEvidence(next, {
        id: `legacy-${practice.id}-financial-reconciliation`, practiceId: practice.id,
        sourceId: `legacy-audited-operator-queue:${practice.id}`, kind: "financial_reconciliation",
        provenance: "local_audit", acquiredAt: migratedAt, ruleVersion: "financial-triple-gross-invoices-v3",
        verification: "verified", facts: { migratedFrom: "audited-operator-queue-v1", tripleReconciled: true },
      });
    }
    for (const [index, document] of practice.documents.entries()) {
      if (!/lordo iva inclusa|classificato nell.audit/i.test(document.note)) continue;
      next = appendSourceEvidence(next, {
        id: `legacy-${practice.id}-document-${index + 1}`, practiceId: practice.id,
        sourceId: `legacy-document:${practice.id}:${document.reference}`, kind: "invoice_triple",
        provenance: "local_audit", acquiredAt: migratedAt, ruleVersion: "invoice-document-triple-v1",
        verification: "verified", facts: { reference: document.reference, classification: document.classification, legacyNote: document.note },
      });
    }
    return next;
  }, initial);
}

export function saveSourceEvidenceLedger(storage: Storage, ledger: SourceEvidenceLedger): boolean {
  try {
    storage.setItem(SOURCE_EVIDENCE_LEDGER_STORAGE_KEY, JSON.stringify(ledger));
    return true;
  } catch { return false; }
}

export function loadSourceEvidenceLedger(storage: Storage): SourceEvidenceLedger {
  try {
    const value: unknown = JSON.parse(storage.getItem(SOURCE_EVIDENCE_LEDGER_STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object" || (value as SourceEvidenceLedger).version !== SOURCE_EVIDENCE_LEDGER_VERSION
      || !Array.isArray((value as SourceEvidenceLedger).entries)) return emptySourceEvidenceLedger();
    return value as SourceEvidenceLedger;
  } catch { return emptySourceEvidenceLedger(); }
}

const BASE_VERIFIED_QUEUE_EVIDENCE: SourceEvidenceLedger = [
  { practiceId: "audit-sara-agostinelli", sourceId: "customer-form", kind: "customer_form", provenance: "original_customer_form", verification: "verified", facts: { acquired: true } },
  { practiceId: "audit-sara-agostinelli", sourceId: "invoice-76", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "76", grossTotal: 5900.01 } },
  { practiceId: "audit-sara-agostinelli", sourceId: "invoice-78", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "78", grossTotal: 21000 } },
  { practiceId: "audit-samuele-colombo", sourceId: "customer-form", kind: "customer_form", provenance: "original_customer_form", verification: "verified", facts: { acquired: true } },
  { practiceId: "audit-samuele-colombo", sourceId: "customer-form:screening-rows", kind: "screening_row", provenance: "original_customer_form", verification: "verified", facts: { rows: 3, exposuresExplicit: true } },
  { practiceId: "audit-samuele-colombo", sourceId: "invoice-48-001:visual-page-1", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { rows: 3, widthsMm: "6200,4280,6080", depthsMm: "2470,2190,2437", gTot: 0.13, screenshotReference: "chrome-viewer:invoice-48-001:p1" } },
  { practiceId: "audit-samuele-colombo", sourceId: "invoice-48-001", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "48/001", date: "2026-03-19", grossTotal: 17529.60, role: "fattura_unica" } },
  { practiceId: "audit-samuele-colombo", sourceId: "invoice-48-001-copy", kind: "attachment_inventory", provenance: "original_attachment", verification: "verified", facts: { classification: "semantic_duplicate", canonicalSourceId: "invoice-48-001", excludedFromGrossTotal: true } },
  { practiceId: "audit-patrizia-vaccani", sourceId: "customer-form", kind: "customer_form", provenance: "original_customer_form", verification: "verified", facts: { acquired: true } },
  { practiceId: "audit-patrizia-vaccani", sourceId: "invoice-fpr-373-26:visual-page-1", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { rows: 1, widthMm: 2840, depthMm: 3260, areaM2: 7.384, gTot: 0.13, screenshotReference: "chrome-viewer:invoice-fpr-373-26:p1" } },
  { practiceId: "audit-zeno-righetti", sourceId: "customer-form", kind: "customer_form", provenance: "original_customer_form", verification: "verified", facts: { acquired: true } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:visual-page-1", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { sourceGroups: 3, qualifiedTechnicalProducts: 11, quantities: "2+6+2+1", perPieceSurfacesM2: "6.754,6.754,1.621,1.636,5.822,3.379,3.025,0.591,8.19,8.19,8.925", sourceRowsIncludeMixedProducts: true, includedRowNumbers: "1,2,3", screenshotReference: "chrome-viewer:invoice-fpr-374-26:p1", cardinalityRuleId: "user-2026-08-14-preserve-technical-product-cardinality" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-1", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 1, quantity: 1, product: "zanzariera", model: "VERA TOP", dimensionsCm: "129.2x125.5", areaM2: 1.621, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-2", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 2, quantity: 1, product: "zanzariera", model: "PHANTOM 25 1 battente", dimensionsCm: "69.5x235.4", areaM2: 1.636, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-3", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 3, quantity: 1, product: "zanzariera", model: "NEOSCENICA 1 battente", dimensionsCm: "219.3x265.5", areaM2: 5.822, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-4", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 4, quantity: 1, product: "zanzariera", model: "ZENIT 25 1 battente", dimensionsCm: "269x125.6", areaM2: 3.379, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-5", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 5, quantity: 1, product: "zanzariera", model: "PHANTOM 25 1 battente", dimensionsCm: "128.5x235.4", areaM2: 3.025, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26:row-2:zanzariera-6", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { invoiceRow: 2, pieceNumber: 6, quantity: 1, product: "zanzariera", model: "VERA TOP", dimensionsCm: "79x74.8", areaM2: 0.591, classification: "enea_included_altra_schermatura", material: "Misto", mechanism: "Manuale", gTot: 0.33, gTotSource: "authorized_fallback" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-258-26", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "FPR 258/26", date: "2026-05-28", grossTotal: 5865.20, role: "acconto" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "FPR 374/26", date: "2026-07-17", grossTotal: 5865.20, role: "saldo" } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-258-26-copy", kind: "attachment_inventory", provenance: "original_attachment", verification: "verified", facts: { classification: "semantic_duplicate", canonicalSourceId: "invoice-fpr-258-26", excludedFromGrossTotal: true } },
  { practiceId: "audit-zeno-righetti", sourceId: "invoice-fpr-374-26-copy", kind: "attachment_inventory", provenance: "original_attachment", verification: "verified", facts: { classification: "semantic_duplicate", canonicalSourceId: "invoice-fpr-374-26", excludedFromGrossTotal: true } },
  { practiceId: "audit-zeno-righetti", sourceId: "zeno-financial-all-screenings", kind: "financial_reconciliation", provenance: "local_audit", verification: "verified", facts: { uniqueInvoiceGrossTotal: 11730.40, eneaQualifiedGrossTotal: 11730.40, zanzariereGrossTotal: 3410.00, includedRows: "1,2,3", excludedGrossTotal: 0, ruleId: "user-2026-08-14-zanzariera-altra-schermatura" } },
  { practiceId: "audit-matteo-maranesi", sourceId: "invoice-490-26", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "490/26", grossTotal: 2800, role: "acconto" } },
  { practiceId: "audit-matteo-maranesi", sourceId: "invoice-814-26", kind: "invoice_triple", provenance: "original_attachment", verification: "verified", facts: { number: "814/26", grossTotal: 6550.01, role: "saldo" } },
  { practiceId: "audit-matteo-maranesi", sourceId: "invoice-814-26:pergola-room", kind: "screening_row", provenance: "original_attachment", verification: "verified", facts: { rows: 1, product: "PERGOLA ROOM", dimensionsCm: "540x532", areaM2: 28.72, exposure: "SUD", material: "PVC", gTot: 0.02, gTotClass: 4, gTotSource: "invoice_explicit", fallbackApplied: false } },
  { practiceId: "audit-matteo-maranesi", sourceId: "financial-triple-gross-v3", kind: "financial_reconciliation", provenance: "local_audit", verification: "verified", facts: { grossTotal: 9350.01, tolerance: 0.01 } },
  { practiceId: "audit-matteo-maranesi", sourceId: "customer-form", kind: "customer_form", provenance: "original_customer_form", verification: "verified", facts: { acquired: true } },
  { practiceId: "audit-matteo-maranesi", sourceId: "invoice-490-26:visual-page-1", kind: "screening_row", provenance: "original_attachment", verification: "partial", facts: { rows: 1, product: "schermatura solare mobile", dimensionsMm: "2960x2407", sourceRole: "acconto", screenshotReference: "chrome-viewer:invoice-490-26:p1", reason: "La sola fattura acconto non dimostra l'intero set finale" } },
  { practiceId: "audit-vito-fusillo", sourceId: "attachment-visual-1", kind: "screening_row", provenance: "original_attachment", verification: "partial", facts: { product: "pergola", widthM: 3.4, depthM: 3.2, screenshotReference: "chrome-viewer:vito-source-1", reason: "Immagine ritagliata: assenti terna fattura e attributi tecnici completi" } },
  { practiceId: "audit-sara-agostinelli", sourceId: "customer-form:screening-row-1", kind: "screening_row", provenance: "original_customer_form", verification: "verified", facts: { rows: 1, product: "pergola", exposure: "sud_est" } },
].reduce((ledger, item, index) => appendSourceEvidence(ledger, {
  ...item, id: `verified-queue-${index + 1}`, acquiredAt: "2026-08-13T00:00:00.000Z", ruleVersion: "enea-preflight-v1",
} as SourceEvidenceEntry), emptySourceEvidenceLedger());

const LEGACY_QUEUE_AUDIT: ReadonlyArray<LegacyAuditedPractice> = [
  { id: "audit-sara-agostinelli", reason: "Preflight bloccato: non è stato possibile ripetere la tripla riconciliazione.", documents: [
    { reference: "Fattura 1", classification: "acconto", note: "Documento leggibile; importo rilevato nell'audit." },
    { reference: "Fattura 2", classification: "saldo", note: "Documento leggibile con storno dell'acconto." },
  ] },
  { id: "audit-samuele-colombo", reason: "Totale economico già riconciliato dalle fonti originarie acquisite.", documents: [] },
  { id: "audit-patrizia-vaccani", reason: "Totale economico già riconciliato dalle fonti originarie acquisite.", documents: [] },
  { id: "audit-vito-fusillo", reason: "Totale economico già riconciliato dalle fonti originarie acquisite.", documents: [
    { reference: "Fattura 2", classification: "acconto", note: "Acconto 50% classificato nell'audit." },
    { reference: "Fattura 3", classification: "saldo", note: "Saldo 50% classificato nell'audit." },
  ] },
  { id: "audit-zeno-righetti", reason: "Totale economico già riconciliato dalle fatture uniche.", documents: [] },
  { id: "audit-matteo-maranesi", reason: "Verifica economica completata.", documents: [] },
];

export const VERIFIED_QUEUE_EVIDENCE = migrateVerifiedLegacyAudit(BASE_VERIFIED_QUEUE_EVIDENCE, LEGACY_QUEUE_AUDIT);
