import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import type { InfissiTechnicalEvidence, InfissiTechnicalEvidenceRow } from "./infissiTechnicalSources";
import { applyAprInfissiOriginalSourcePolicy } from "./infissiOriginalSourcePolicy";

export const APR_INFISSI_AUTOMATIC_DOCUMENT_EVIDENCE_VERSION = "apr-infissi-automatic-document-evidence-v3" as const;

export interface AprInfissiTextSource {
  sourceId: string;
  text: string;
  kind?: "invoice" | "third_party_certificate" | "additional" | "crm_internal_technical_document" | "crm_history" | "operator_history" | string;
  certificateScope?: "installed_windows" | "removed_windows" | null;
}

export interface AprInfissiAutomaticEvidence {
  version: typeof APR_INFISSI_AUTOMATIC_DOCUMENT_EVIDENCE_VERSION;
  status: "ready" | "operator_required";
  evidence: InfissiTechnicalEvidence | null;
  blockers: readonly string[];
  audit: Readonly<{
    selectedSourceId: string | null;
    selectedParser: string | null;
    candidateCounts: ReadonlyArray<{ sourceId: string; parser: string; rowCount: number }>;
    excludedSources: ReadonlyArray<{ sourceId: string; kind: string; reason: string }>;
    appliedRuleIds: readonly string[];
  }>;
}

interface Candidate {
  sourceId: string;
  sourceKind: string;
  parser: string;
  rows: InfissiTechnicalEvidenceRow[];
  explicitUwCount: number;
}

const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
  USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
  USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
  USER_AUTHORIZED_RULE_IDS.testExNovoOriginalSourcesOnly,
] as const);

function decimal(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function integer(value: string | undefined, fallback = 1): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function plausibleMm(width: number, height: number): boolean {
  return width >= 250 && width <= 6000 && height >= 250 && height <= 6000;
}

function row(sourceId: string, parser: string, index: number, widthMm: number, heightMm: number, quantity: number, uw?: number): InfissiTechnicalEvidenceRow {
  return {
    lineId: `${sourceId}:${parser}:${index + 1}`,
    quantity,
    widthM: widthMm / 1000,
    heightM: heightMm / 1000,
    thermalTransmittanceWm2K: uw,
    measurementKind: "documented_unspecified",
  };
}

function parseDimensionBlocks(source: AprInfissiTextSource): Candidate | null {
  const scopedText = /(?:serrament|infiss|finestr)/iu.test(source.text)
    ? source.text.split(/\n\s*(?:Cassonetti|Chiusure\s+oscuranti|Zanzariere)\b/iu)[0]
    : source.text;
  const matches = [...scopedText.matchAll(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})(?:\s*mm)?\b/giu)];
  const rows: InfissiTechnicalEvidenceRow[] = [];
  let explicitUwCount = 0;
  for (const [index, match] of matches.entries()) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!plausibleMm(width, height)) continue;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? Math.min(scopedText.length, start + 700);
    const block = scopedText.slice(start, Math.min(end, start + 700));
    const productContext = scopedText.slice(Math.max(0, start - 260), Math.min(scopedText.length, start + 220));
    if (!/(?:finestr|portafinestr|serrament|infiss|dimensioni\s+L\s*[x×]\s*H)/iu.test(productContext) && !/\bUw\b|trasmittanza\s+termica/iu.test(block)) continue;
    const quantity = integer(block.match(/(?:Pezzi|Quantit[aà])\s*:?\s*(\d{1,3})/iu)?.[1]);
    const uw = decimal(block.match(/(?:\bUw\b\s*[:=]?|Trasmittanza\s+termica(?:\s+Uw)?(?:\s*\[[^\]]+\])?\s*[:=]?)\s*([0-9]+(?:[.,][0-9]+)?)/iu)?.[1]);
    if (uw) explicitUwCount += quantity;
    rows.push(row(source.sourceId, "dimension-block", rows.length, width, height, quantity, uw));
  }
  const normalizedRows = collapseRepeatedSequence(rows);
  return normalizedRows.length ? {
    sourceId: source.sourceId,
    sourceKind: source.kind ?? "unknown",
    parser: "dimension-block",
    rows: normalizedRows,
    explicitUwCount: normalizedRows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0),
  } : null;
}

/**
 * Le fatture possono enumerare piu infissi identici come ripetizioni fisiche
 * `1 da L x H`. L'ordine e la ripetizione sono significativi e non vanno
 * compressi come duplicazione OCR.
 */
function parseInvoicePhysicalWindowRows(source: AprInfissiTextSource): Candidate | null {
  if (source.kind !== "invoice") return null;
  const start = source.text.search(/\b(?:infiss|serrament)[io]\b/iu);
  if (start < 0) return null;
  const scoped = source.text.slice(start).split(/\b(?:METODO\s+DI\s+PAGAMENTO|TOTALE\s+(?:FATTURA|DOCUMENTO))\b/iu)[0] ?? "";
  const rows = [...scoped.matchAll(/\b(\d{1,2})\s+da\s+(\d{3,4})\s*[x×]\s*(\d{3,4})\b/giu)].flatMap((match, index) => {
    const quantity = integer(match[1]);
    const width = Number(match[2]);
    const height = Number(match[3]);
    return plausibleMm(width, height) ? [row(source.sourceId, "invoice-physical-row-order", index, width, height, quantity)] : [];
  });
  return rows.length ? { sourceId: source.sourceId, sourceKind: "invoice", parser: "invoice-physical-row-order", rows, explicitUwCount: 0 } : null;
}

function repeatedRowKey(item: InfissiTechnicalEvidenceRow): string {
  return [item.quantity, item.widthM, item.heightM, item.thermalTransmittanceWm2K ?? "fallback"].join(":");
}

function collapseRepeatedSequence(rows: readonly InfissiTechnicalEvidenceRow[]): InfissiTechnicalEvidenceRow[] {
  if (rows.length < 2) return [...rows];
  const keys = rows.map(repeatedRowKey);
  for (let period = 1; period <= Math.floor(rows.length / 2); period += 1) {
    if (rows.length % period !== 0) continue;
    if (keys.every((key, index) => key === keys[index % period])) return rows.slice(0, period).map((item, index) => ({ ...item, lineId: item.lineId.replace(/:\d+$/u, `:${index + 1}`) }));
  }
  return [...rows];
}

function parseWidthHeightBlocks(source: AprInfissiTextSource): Candidate | null {
  const blocks = [...source.text.matchAll(/Larghezz\w*\s+L\s*(\d{3,4})\s*mm[\s\S]{0,120}?Altezza\s+H\s*=\s*(\d{3,4})\s*mm[\s\S]{0,900}?(?:\bUw\b\s*=\s*){1,2}([0-9]+(?:[.,][0-9]+)?)\s*W\/m/giu)];
  const rows = blocks.flatMap((match, index) => {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const uw = decimal(match[3]);
    return plausibleMm(width, height) && uw ? [row(source.sourceId, "width-height-block", index, width, height, 1, uw)] : [];
  });
  return rows.length ? { sourceId: source.sourceId, sourceKind: source.kind ?? "unknown", parser: "width-height-block", rows, explicitUwCount: rows.length } : null;
}

function parsePerformancePages(source: AprInfissiTextSource): Candidate | null {
  const headings = [...source.text.matchAll(/(?:WEB|ZM)\/[A-Z0-9/.-]+\s*-\s*(\d{3})/giu)];
  const rows: InfissiTechnicalEvidenceRow[] = [];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? source.text.length;
    const block = source.text.slice(start, end);
    const dimensionMatches = [...block.matchAll(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/giu)]
      .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
      .filter(({ width, height }) => plausibleMm(width, height));
    const dimensions = dimensionMatches.find(({ width, height }) => width !== height);
    if (!dimensions) continue;
    const quantity = integer(block.match(/Quantit[aà]\s*:?\s*(\d{1,3})/iu)?.[1]);
    const uw = decimal(block.match(/Trasmittanza\s+termica\s+U[wd](?:\s*\[[^\]]+\])?\s*([0-9]+(?:[.,][0-9]+)?)/iu)?.[1]);
    rows.push(row(source.sourceId, "performance-page", rows.length, dimensions.width, dimensions.height, quantity, uw));
  }
  return rows.length ? { sourceId: source.sourceId, sourceKind: source.kind ?? "unknown", parser: "performance-page", rows, explicitUwCount: rows.filter((item) => item.thermalTransmittanceWm2K).length } : null;
}

/**
 * Le dichiarazioni di prestazione Eko-Okna espongono le dimensioni esterne
 * attorno al disegno del serramento. Il testo PDF nativo non conserva quelle
 * etichette e l'OCR dell'intera pagina puo confonderle con le misure del vetro.
 * L'estrattore locale aggiunge quindi tre letture del solo diagramma (normale e
 * ruotata nei due versi). Ogni pagina fisica e identificata dal suffisso WEB e
 * produce esattamente una riga, anche se lo stesso identificativo compare nei
 * diversi blocchi OCR della pagina.
 */
function parsePerformanceDiagramPages(source: AprInfissiTextSource): Candidate | null {
  if (!source.text.includes("APR_DIAGRAM_OCR:")) return null;
  const rows: InfissiTechnicalEvidenceRow[] = [];
  const seenPageIds = new Set<string>();
  for (const page of source.text.split(/\f/gu)) {
    const pageId = page.match(/(?:WEB|ZM)\/[A-Z0-9/.-]+\s*-\s*(\d{3})/iu)?.[1];
    if (!pageId || seenPageIds.has(pageId)) continue;
    seenPageIds.add(pageId);
    const normalDiagram = page.match(/APR_DIAGRAM_OCR:\s*([\s\S]*?)(?=APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:|$)/u)?.[1] ?? "";
    const normalNumbers = [...normalDiagram.matchAll(/^\s*(\d{3,4})\s*$/gmu)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 250 && value <= 6000);
    const documentedPairs = [...normalDiagram.matchAll(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/giu)]
      .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
      .filter(({ width, height }) => plausibleMm(width, height));
    if (normalNumbers.length < 2 && documentedPairs.length === 0) continue;
    const widthCandidates = normalNumbers.slice(0, 2);
    const width = widthCandidates.length
      ? Math.max(...widthCandidates)
      : documentedPairs[0]!.width;
    const allDiagramText = page.slice(page.indexOf("APR_DIAGRAM_OCR:"));
    const allNumbers = [...allDiagramText.matchAll(/^\s*(\d{3,4})[|\-]?\s*$/gmu)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 250 && value <= 6000);
    const heightCandidates = allNumbers.filter((value) => !widthCandidates.includes(value));
    // La quota esterna verticale e' preferita. Se l'OCR focalizzato non la
    // separa, la misura L x H stampata sulla stessa pagina resta una misura
    // originaria documentata e puo' essere usata in base alla policy Infissi
    // gia' autorizzata, senza inventare una dimensione o perdere la pagina.
    const height = heightCandidates.length
      ? Math.max(...heightCandidates)
      : documentedPairs[0]?.height;
    if (!height || !plausibleMm(width, height)) continue;
    const quantity = integer(page.match(/Quantit[aà]\s*:?\s*(\d{1,3})/iu)?.[1]);
    const uw = decimal(page.match(/Trasmittanza\s+termica\s+U[wd](?:\s*\[[^\]]+\])?\s*([0-9]+(?:[.,][0-9]+)?)/iu)?.[1]);
    rows.push(row(source.sourceId, "performance-diagram-page", rows.length, width, height, quantity, uw));
  }
  return rows.length ? {
    sourceId: source.sourceId,
    sourceKind: source.kind ?? "unknown",
    parser: "performance-diagram-page",
    rows,
    explicitUwCount: rows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0),
  } : null;
}

/**
 * I preventivi di produzione possono descrivere lo stesso infisso su tre
 * schede consecutive: serramento fisico, cassonetto e vetro/pannello. Solo la
 * scheda del serramento e' una riga ENEA. Le dimensioni dei riempimenti, delle
 * luci e dei cassonetti non devono quindi diventare prodotti autonomi.
 */
function parseProductAssemblyPages(source: AprInfissiTextSource): Candidate | null {
  const headings = [...source.text.matchAll(/^(Porta|Finestra)\s+(\d{3})\s+Quantit[aà]:\s*(\d{1,3})([^\n]*)$/gimu)];
  const rows: InfissiTechnicalEvidenceRow[] = [];
  for (const [index, heading] of headings.entries()) {
    const headingTail = heading[4] ?? "";
    const end = headings[index + 1]?.index ?? source.text.length;
    const block = source.text.slice(heading.index ?? 0, end);
    if (/Sistema:\s*(?:Cassonetto|Glass\s*\/\s*Panel)\b/iu.test(headingTail)) continue;
    const drawing = block.split(/\b(?:Messaggio|Vista interna)\b/iu)[0] ?? block;
    const standaloneDimensions = [...drawing.matchAll(/^\s*(\d{3,4})\s*$/gmu)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 250 && value <= 6000);
    const width = standaloneDimensions[0];
    const height = standaloneDimensions.length ? Math.max(...standaloneDimensions) : undefined;
    if (!width || !height || !plausibleMm(width, height)) continue;
    const quantity = integer(heading[3]);
    const uw = decimal(block.match(/(?:Coefficiente\s+termico(?:\s+Peso)?\s+)?Uw\s*=\s*([0-9]+(?:[.,][0-9]+)?)/iu)?.[1]);
    rows.push(row(source.sourceId, "product-assembly-page", rows.length, width, height, quantity, uw));
  }
  return rows.length ? {
    sourceId: source.sourceId,
    sourceKind: source.kind ?? "unknown",
    parser: "product-assembly-page",
    rows,
    explicitUwCount: rows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0),
  } : null;
}

function parseThermalTable(source: AprInfissiTextSource): Candidate | null {
  const rows: InfissiTechnicalEvidenceRow[] = [];
  const matches = [...source.text.matchAll(/(?:^|\n)\s*(\d{1,3})\s*\n\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\s*\n\s*([0-9]+(?:[.,][0-9]+)?)(?=\s|$)/gimu)];
  for (const match of matches) {
    const quantity = integer(match[1]);
    const width = Number(match[2]);
    const height = Number(match[3]);
    const uw = decimal(match[4]);
    if (!plausibleMm(width, height) || !uw || uw > 6.5) continue;
    const context = source.text.slice(Math.max(0, (match.index ?? 0) - 500), (match.index ?? 0) + match[0].length + 80);
    if (!/\bUw\b|trasmittanza|serrament|finestr/iu.test(context)) continue;
    rows.push(row(source.sourceId, "thermal-table", rows.length, width, height, quantity, uw));
  }
  const normalizedRows = collapseRepeatedSequence(rows);
  return normalizedRows.length ? { sourceId: source.sourceId, sourceKind: source.kind ?? "unknown", parser: "thermal-table", rows: normalizedRows, explicitUwCount: normalizedRows.reduce((sum, item) => sum + item.quantity, 0) } : null;
}

function physicalCount(candidate: Candidate): number {
  return candidate.rows.reduce((sum, item) => sum + item.quantity, 0);
}

function signature(candidate: Candidate): string {
  return candidate.rows.flatMap((item) => Array.from({ length: item.quantity }, () => `${item.widthM}x${item.heightM}`)).sort().join("|");
}

function declaredPerformancePageCount(source: AprInfissiTextSource): number | null {
  const pageIds = [...source.text.matchAll(/(?:WEB|ZM)\/[A-Z0-9/.-]+\s*-\s*(\d{3})/giu)]
    .map((match) => match[1]);
  return pageIds.length ? new Set(pageIds).size : null;
}

export function extractAprInfissiAutomaticTechnicalEvidence(sources: readonly AprInfissiTextSource[]): AprInfissiAutomaticEvidence {
  const sourcePolicy = applyAprInfissiOriginalSourcePolicy(sources);
  const removedWindowCertificates = sourcePolicy.trusted.filter((source) => source.kind === "third_party_certificate" && source.certificateScope === "removed_windows");
  const trustedSources = sourcePolicy.trusted.filter((source) => !removedWindowCertificates.includes(source));
  const rawCandidates = trustedSources.flatMap((source) => [
    parseInvoicePhysicalWindowRows(source),
    parseProductAssemblyPages(source),
    parseDimensionBlocks(source),
    parseWidthHeightBlocks(source),
    parsePerformanceDiagramPages(source),
    parsePerformancePages(source),
    parseThermalTable(source),
  ].filter((candidate): candidate is Candidate => Boolean(candidate)));
  const sourcesWithAssemblyParser = new Set(rawCandidates
    .filter((candidate) => candidate.parser === "product-assembly-page")
    .map((candidate) => candidate.sourceId));
  const sourcesWithPerformanceDiagramParser = new Set(rawCandidates
    .filter((candidate) => candidate.parser === "performance-diagram-page")
    .map((candidate) => candidate.sourceId));
  const strongParsers = new Set(["width-height-block", "performance-diagram-page", "performance-page", "thermal-table"]);
  const sourcesWithStrongParser = new Set(rawCandidates.filter((candidate) => strongParsers.has(candidate.parser)).map((candidate) => candidate.sourceId));
  const candidates = rawCandidates.filter((candidate) =>
    (!sourcesWithAssemblyParser.has(candidate.sourceId) || candidate.parser === "product-assembly-page")
    && (!sourcesWithPerformanceDiagramParser.has(candidate.sourceId) || candidate.parser === "performance-diagram-page")
    && !(candidate.parser === "dimension-block" && sourcesWithStrongParser.has(candidate.sourceId))
    && (candidate.explicitUwCount > 0 || candidate.sourceKind === "invoice"),
  );
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) groups.set(signature(candidate), [...(groups.get(signature(candidate)) ?? []), candidate]);
  const rankedGroups = [...groups.entries()].sort((left, right) =>
    right[1].length - left[1].length
    || Math.max(...right[1].map((candidate) => candidate.explicitUwCount)) - Math.max(...left[1].map((candidate) => candidate.explicitUwCount))
    || physicalCount(right[1][0]) - physicalCount(left[1][0])
    || left[0].localeCompare(right[0]),
  );
  const winningGroup = rankedGroups[0]?.[1] ?? [];
  const selected = [...winningGroup].sort((left, right) =>
    right.explicitUwCount - left.explicitUwCount
    || left.sourceId.localeCompare(right.sourceId)
    || left.parser.localeCompare(right.parser),
  )[0] ?? null;
  const selectedSource = selected ? trustedSources.find((source) => source.sourceId === selected.sourceId) : undefined;
  const declaredPageCount = selectedSource ? declaredPerformancePageCount(selectedSource) : null;
  const incompletePerformanceCardinality = Boolean(selected
    && declaredPageCount !== null
    && physicalCount(selected) !== declaredPageCount);
  const conflictingTop = Boolean(rankedGroups[1]
    && rankedGroups[1][1].length === winningGroup.length
    && Math.max(...rankedGroups[1][1].map((candidate) => candidate.explicitUwCount)) === Math.max(...winningGroup.map((candidate) => candidate.explicitUwCount))
    && physicalCount(rankedGroups[1][1][0]) === physicalCount(winningGroup[0]));
  const unresolvedInvoiceTechnicalConflict = Boolean(selected
    && rankedGroups.slice(1).some(([, group]) =>
      group.some((candidate) => candidate.sourceKind === "invoice")
      && winningGroup.some((candidate) => candidate.sourceKind !== "invoice")
      && group.length >= winningGroup.length,
    ));
  const blockers = !selected
    ? ["infissi_dimensions_and_cardinality_missing"]
    : incompletePerformanceCardinality
      ? ["infissi_performance_page_cardinality_mismatch"]
      : conflictingTop || unresolvedInvoiceTechnicalConflict ? ["infissi_automatic_source_conflict"] : [];
  return Object.freeze({
    version: APR_INFISSI_AUTOMATIC_DOCUMENT_EVIDENCE_VERSION,
    status: blockers.length === 0 ? "ready" : "operator_required",
    evidence: selected && blockers.length === 0 ? {
      kind: selected.sourceKind === "invoice" ? "invoice" as const : "technical_document" as const,
      sourceIds: Object.freeze([selected.sourceId]),
      rows: Object.freeze(selected.rows),
    } : null,
    blockers: Object.freeze(blockers),
    audit: Object.freeze({
      selectedSourceId: selected?.sourceId ?? null,
      selectedParser: selected?.parser ?? null,
      candidateCounts: Object.freeze(candidates.map((candidate) => ({ sourceId: candidate.sourceId, parser: candidate.parser, rowCount: physicalCount(candidate) }))),
      excludedSources: Object.freeze([
        ...sourcePolicy.excluded,
        ...removedWindowCertificates.map((source) => Object.freeze({ sourceId: source.sourceId, kind: source.kind ?? "unclassified", reason: "removed_window_certificate_not_installed_product_source" })),
      ]),
      appliedRuleIds: RULE_IDS,
    }),
  });
}
