import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";
import type { InfissiTechnicalEvidence, InfissiTechnicalEvidenceRow } from "./infissiTechnicalSources";
import { applyAprInfissiOriginalSourcePolicy } from "./infissiOriginalSourcePolicy";

export const APR_INFISSI_AUTOMATIC_DOCUMENT_EVIDENCE_VERSION = "apr-infissi-automatic-document-evidence-v5" as const;

export interface AprInfissiTextSource {
  sourceId: string;
  text: string;
  kind?: "invoice" | "third_party_certificate" | "additional" | "crm_internal_technical_document" | "crm_history" | "operator_history" | string;
  certificateScope?: "installed_windows" | "removed_windows" | null;
  practiceCustomerName?: string;
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
    selectedSourceBinding: AprInfissiTechnicalSourceBinding | null;
  }>;
}

export interface AprInfissiTechnicalCandidate {
  sourceId: string;
  sourceKind: string;
  parser: string;
  rows: readonly InfissiTechnicalEvidenceRow[];
  explicitUwCount: number;
  declaredPerformancePageCount: number | null;
  sourceBinding: AprInfissiTechnicalSourceBinding | null;
}

export interface AprInfissiTechnicalSourceBinding {
  status: "verified" | "not_applicable" | "unverified";
  customerMatched: boolean;
  orderOrJobReferencesPresent: boolean;
  productSignatureMatched: boolean;
  matchedInvoiceSourceIds: readonly string[];
  technicalReferences: readonly string[];
  invoiceReferences: readonly string[];
}

export interface AprInfissiTechnicalCandidateSet {
  candidates: readonly AprInfissiTechnicalCandidate[];
  excludedSources: ReadonlyArray<{ sourceId: string; kind: string; reason: string }>;
  appliedRuleIds: readonly string[];
}

const RULE_IDS = Object.freeze([
  USER_AUTHORIZED_RULE_IDS.infissiTechnicalSourceResolution,
  USER_AUTHORIZED_RULE_IDS.infissiTransmittanceFallback,
  USER_AUTHORIZED_RULE_IDS.technicalProductCardinality,
  USER_AUTHORIZED_RULE_IDS.crmInternalTechnicalDocumentUntrusted,
  USER_AUTHORIZED_RULE_IDS.testExNovoOriginalSourcesOnly,
  USER_AUTHORIZED_RULE_IDS.technicalDocumentPracticeBindingProductSignatureOnly,
  USER_AUTHORIZED_RULE_IDS.mixedInfissiScreeningDistinctInvoiceOrdersNotConflict,
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

function candidate(source: AprInfissiTextSource, parser: string, rows: InfissiTechnicalEvidenceRow[], explicitUwCount: number): AprInfissiTechnicalCandidate {
  return { sourceId: source.sourceId, sourceKind: source.kind ?? "unknown", parser, rows, explicitUwCount, declaredPerformancePageCount: declaredPerformancePageCount(source), sourceBinding: null };
}

function parseDimensionBlocks(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  const scopedText = /(?:serrament|infiss|finestr)/iu.test(source.text)
    ? source.text.split(/\n\s*(?:Misure\s+)?(?:Cassonetti|Chiusure\s+oscuranti|Zanzariere)\b/iu)[0]
    : source.text;
  // Alcune fatture ripetono l'unita' di misura su entrambi i lati del separatore
  // ("940 mm x 2003 mm" invece di "940 x 2003 mm"): l'unita' opzionale prima del
  // separatore non e' specifica di un fornitore, e' solo una variante di formato.
  const matches = [...scopedText.matchAll(/\b(\d{3,4})\s*(?:mm\s*)?[x×]\s*(\d{3,4})(?:\s*mm)?\b/giu)];
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
    // Alcune fatture indicano la quantita' come prefisso "N°<n>"/"N.<n>" davanti
    // a ciascuna misura, invece che con l'etichetta "Pezzi"/"Quantita'" a seguire.
    const precedingLine = scopedText.slice(Math.max(0, start - 40), start);
    const quantityPrefix = precedingLine.match(/\bN\s*[°.]?\s*(\d{1,3})\s*$/iu)?.[1];
    const quantity = quantityPrefix ? integer(quantityPrefix) : integer(block.match(/(?:Pezzi|Quantit[aà])\s*:?\s*(\d{1,3})/iu)?.[1]);
    const uw = decimal(block.match(/(?:\bUw\b\s*[:=]?|Trasmittanza\s+termica(?:\s+Uw)?(?:\s*\[[^\]]+\])?\s*[:=]?)\s*([0-9]+(?:[.,][0-9]+)?)/iu)?.[1]);
    if (uw) explicitUwCount += quantity;
    rows.push(row(source.sourceId, "dimension-block", rows.length, width, height, quantity, uw));
  }
  const normalizedRows = collapseRepeatedSequence(rows);
  return normalizedRows.length ? candidate(source, "dimension-block", normalizedRows,
    normalizedRows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0)) : null;
}

/**
 * Le fatture possono enumerare piu infissi identici come ripetizioni fisiche
 * `1 da L x H`. L'ordine e la ripetizione sono significativi e non vanno
 * compressi come duplicazione OCR.
 */
function parseInvoicePhysicalWindowRows(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  if (source.kind !== "invoice") return null;
  const start = source.text.search(/\b(?:infiss|serrament)[io]\b/iu);
  if (start < 0) return null;
  const scoped = source.text.slice(start).split(/\b(?:METODO\s+DI\s+PAGAMENTO|TOTALE\s+(?:FATTURA|DOCUMENTO))\b/iu)[0] ?? "";
  // Alcuni PDF/OCR uniscono la preposizione alla prima misura (`1 da1200 x 1555`).
  // La quantità deve comunque precedere `da`, così l'allentamento non trasforma
  // numeri generici o parole come `data` in righe fisiche Infissi.
  const rows = [...scoped.matchAll(/\b(\d{1,2})\s+da\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\b/giu)].flatMap((match, index) => {
    const quantity = integer(match[1]);
    const width = Number(match[2]);
    const height = Number(match[3]);
    return plausibleMm(width, height) ? [row(source.sourceId, "invoice-physical-row-order", index, width, height, quantity)] : [];
  });
  return rows.length ? candidate(source, "invoice-physical-row-order", rows, 0) : null;
}

/**
 * Formato Finestra Italia (DDT posizionale): ogni posizione riporta le
 * misure tra parentesi come "(L=2.235;A=1.435;)", con il punto usato come
 * separatore delle migliaia (2.235 = 2235 mm), non come decimale. La
 * stessa notazione compare identica anche per le persiane dello stesso
 * fornitore (regressione Codognato); qui si accettano soltanto le
 * posizioni introdotte da un termine della famiglia Infissi (Finestra,
 * Portafinestra, Porta), cosi' le persiane della stessa fattura restano
 * escluse e non vengono contate come infissi.
 */
function parseFinestraItaliaPositionalDimensions(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  if (source.kind !== "invoice") return null;
  const rows = [...source.text.matchAll(/(?<!persian[ae]\s)\b(?:Finestra|Portafinestra|Porta)\b(?:(?!\bFinestra\b|\bPortafinestra\b|\bPorta\b)[^()]){0,80}?\(\s*L\s*=\s*([0-9]{1,2}\.[0-9]{3}|[0-9]{3,4})\s*;\s*A\s*=\s*([0-9]{1,2}\.[0-9]{3}|[0-9]{3,4})\s*;?\s*\)/giu)]
    .flatMap((match, index) => {
      const width = Number(match[1].replace(".", ""));
      const height = Number(match[2].replace(".", ""));
      return plausibleMm(width, height) ? [row(source.sourceId, "finestra-italia-positional-dimensions", index, width, height, 1)] : [];
    });
  return rows.length ? candidate(source, "finestra-italia-positional-dimensions", rows, 0) : null;
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

function parseWidthHeightBlocks(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  const blocks = [...source.text.matchAll(/Larghezz\w*\s+L\s*(\d{3,4})\s*mm[\s\S]{0,120}?Altezza\s+H\s*=\s*(\d{3,4})\s*mm[\s\S]{0,900}?(?:\bUw\b\s*=\s*){1,2}([0-9]+(?:[.,][0-9]+)?)\s*W\/m/giu)];
  const rows = blocks.flatMap((match, index) => {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const uw = decimal(match[3]);
    return plausibleMm(width, height) && uw ? [row(source.sourceId, "width-height-block", index, width, height, 1, uw)] : [];
  });
  return rows.length ? candidate(source, "width-height-block", rows, rows.length) : null;
}

/**
 * Le dichiarazioni del produttore Internorm espongono una tabella posizionale
 * con una riga fisica per posizione e ripetono L/H e Uw dentro lo stesso
 * blocco. Il parser accetta il layout soltanto se tutte le posizioni hanno una
 * quantita intera, una sola coppia L/H coerente e un solo Uw esplicito.
 */
function parseProducerPositionTable(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  if (!/DICHIARAZIONE\s+DEL\s+PRODUTTORE/iu.test(source.text)
    || !/caratteristiche\s+dei\s+nuovi\s+serramenti/iu.test(source.text)
    || !/Pos\.\s+Quantit[aàá]\s+Descrizione\s+Valore\s+Uw/iu.test(source.text)) return null;
  const headings = [...source.text.matchAll(/^\s*(\d{2,4})\s+([0-9]+(?:[.,][0-9]+)?)\s+Pezzi\s+[^\n]+$/gimu)];
  if (headings.length === 0) return null;
  const rows: InfissiTechnicalEvidenceRow[] = [];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? source.text.length;
    const block = source.text.slice(start, end);
    const quantityValue = Number.parseFloat((heading[2] ?? "").replace(",", "."));
    if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > 100) return null;
    const dimensionPairs = [...block.matchAll(/Largh\.?\s*:?\s*([0-9]{3,4}|[0-9]\.[0-9]{3})\s*,?\s*Alt\.?\s*:?\s*([0-9]{3,4}|[0-9]\.[0-9]{3})/giu)]
      .map((match) => [Number((match[1] ?? "").replace(".", "")), Number((match[2] ?? "").replace(".", ""))] as const)
      .filter(([width, height]) => plausibleMm(width, height));
    const uniqueDimensions = [...new Map(dimensionPairs.map((pair) => [pair.join("x"), pair])).values()];
    const uwValues = [...block.matchAll(/Uw\s*\(calcolato[^\n]*\)\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*W\/m/giu)]
      .map((match) => decimal(match[1]))
      .filter((value): value is number => value !== undefined && value <= 6.5);
    const uniqueUw = [...new Set(uwValues)];
    if (uniqueDimensions.length !== 1 || uniqueUw.length !== 1) return null;
    rows.push(row(source.sourceId, "producer-position-table", index, uniqueDimensions[0]![0], uniqueDimensions[0]![1], quantityValue, uniqueUw[0]));
  }
  return candidate(source, "producer-position-table", rows, rows.reduce((sum, item) => sum + item.quantity, 0));
}

/**
 * Le DoP posizionali possono stampare la prestazione come
 * `Trasmittanza termica (Uw) 1.2`. Sono accettate soltanto posizioni con
 * intestazione, quantita, una misura `da L x H` e un solo Uw nello stesso
 * blocco; accessori dichiarati esplicitamente a 0 x 0 non diventano infissi.
 */
function parseFormalDopPositionBlocks(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  if (source.kind !== "third_party_certificate"
    || source.certificateScope !== "installed_windows"
    || !/Dichiarazione\s+di\s+prestazione\s*\(DoP\)/iu.test(source.text)) return null;
  // Il testo nativo precede gli allegati OCR diagnostici. Mescolare le due
  // rappresentazioni duplicherebbe le posizioni e perderebbe i confini pagina.
  const authoritativeText = source.text.split("\f")
    .map((page) => page.split(/\nAPR_VISUAL_OCR:/u)[0] ?? page)
    .join("\n");
  const headings = [...authoritativeText.matchAll(/^\s*Pos\.\s*(\d{1,3})\s+Q\.t[aà]\s*(\d{1,3})\b.*$/gimu)];
  if (headings.length === 0) return null;
  const rows: InfissiTechnicalEvidenceRow[] = [];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? authoritativeText.length;
    const block = authoritativeText.slice(start, end);
    const quantity = Number.parseInt(heading[2] ?? "", 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
    const rawDimensions = [...block.matchAll(/\bda\s+([0-9]{1,4})\s*[x×]\s*([0-9]{1,4})\s*mm\b/giu)]
      .map((match) => [Number(match[1]), Number(match[2])] as const);
    const zeroAccessory = rawDimensions.some(([width, height]) => width === 0 && height === 0)
      && /\b(?:coprifilo|accessorio|profilo)\b/iu.test(block);
    if (zeroAccessory) continue;
    if (!/(?:finestr|porta[\s-]?finestr|serrament)/iu.test(block)) return null;
    const dimensions = rawDimensions.filter(([width, height]) => plausibleMm(width, height));
    const uniqueDimensions = [...new Map(dimensions.map((pair) => [pair.join("x"), pair])).values()];
    const uwValues = [...block.matchAll(/Trasmittanza\s+termica\s*\(\s*Uw\s*\)\s*([0-9]+(?:[.,][0-9]+)?)/giu)]
      .map((match) => decimal(match[1]))
      .filter((value): value is number => value !== undefined && value <= 6.5);
    const uniqueUw = [...new Set(uwValues)];
    if (uniqueDimensions.length !== 1 || uniqueUw.length !== 1) return null;
    rows.push(row(source.sourceId, "formal-dop-position-block", rows.length, uniqueDimensions[0]![0], uniqueDimensions[0]![1], quantity, uniqueUw[0]));
  }
  return rows.length ? candidate(source, "formal-dop-position-block", rows, rows.reduce((sum, item) => sum + item.quantity, 0)) : null;
}

/**
 * Alcune dichiarazioni di conformita energetica descrivono un'unica tipologia
 * nella testata e dichiarano il relativo Uw nel corpo. La testata e accettata
 * solo quando esiste una sola riga prodotto completa; piu riferimenti, campi
 * mancanti o piu valori Uw distinti mantengono l'estrazione fail-closed.
 */
function parseSingleProductEnergyDeclaration(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
  if (source.kind !== "third_party_certificate"
    || source.certificateScope !== "installed_windows"
    || !/Dichiarazione\s+di\s+conformit[aà]\s+energetica/iu.test(source.text)) return null;
  const productRows = [...source.text.matchAll(/Rif\.\s*tipologia\s*:\s*[^\n;]+?Modello\s*:\s*[^\n;,]+,\s*(?:Porta)?finestr[^\n;,]*,\s*dimensioni\s*:\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\s*,\s*pezzi\s*:\s*(\d{1,3})\s*;/giu)];
  if (productRows.length !== 1) return null;
  const width = Number(productRows[0]![1]);
  const height = Number(productRows[0]![2]);
  const quantity = Number.parseInt(productRows[0]![3] ?? "", 10);
  if (!plausibleMm(width, height) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  const uwValues = [...source.text.matchAll(/trasmittanza\s+termica\s+complessiva\s+dei\s+serramenti[\s\S]{0,420}?corrisponde\s+a\s*([0-9]+(?:[.,][0-9]+)?)\s*W\/m/giu)]
    .map((match) => decimal(match[1]))
    .filter((value): value is number => value !== undefined && value <= 6.5);
  const uniqueUw = [...new Set(uwValues)];
  if (uniqueUw.length !== 1) return null;
  return candidate(source, "single-product-energy-declaration", [row(source.sourceId, "single-product-energy-declaration", 0, width, height, quantity, uniqueUw[0])], quantity);
}

function parsePerformancePages(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
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
  return rows.length ? candidate(source, "performance-page", rows, rows.filter((item) => item.thermalTransmittanceWm2K).length) : null;
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
function parsePerformanceDiagramPages(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
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
  return rows.length ? candidate(source, "performance-diagram-page", rows,
    rows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0)) : null;
}

/**
 * I preventivi di produzione possono descrivere lo stesso infisso su tre
 * schede consecutive: serramento fisico, cassonetto e vetro/pannello. Solo la
 * scheda del serramento e' una riga ENEA. Le dimensioni dei riempimenti, delle
 * luci e dei cassonetti non devono quindi diventare prodotti autonomi.
 */
function parseProductAssemblyPages(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
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
  return rows.length ? candidate(source, "product-assembly-page", rows,
    rows.reduce((sum, item) => sum + (item.thermalTransmittanceWm2K ? item.quantity : 0), 0)) : null;
}

function parseThermalTable(source: AprInfissiTextSource): AprInfissiTechnicalCandidate | null {
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
  return normalizedRows.length ? candidate(source, "thermal-table", normalizedRows, normalizedRows.reduce((sum, item) => sum + item.quantity, 0)) : null;
}

function physicalCount(candidate: AprInfissiTechnicalCandidate): number {
  return candidate.rows.reduce((sum, item) => sum + item.quantity, 0);
}

function signature(candidate: AprInfissiTechnicalCandidate): string {
  return candidate.rows.flatMap((item) => Array.from({ length: item.quantity }, () => `${item.widthM}x${item.heightM}`)).sort().join("|");
}

function declaredPerformancePageCount(source: AprInfissiTextSource): number | null {
  const pageIds = [...source.text.matchAll(/(?:WEB|ZM)\/[A-Z0-9/.-]+\s*-\s*(\d{3})/giu)]
    .map((match) => match[1]);
  return pageIds.length ? new Set(pageIds).size : null;
}

function collapseRepeatedStringSequence(values: readonly string[]): string[] {
  for (let period = 1; period <= Math.floor(values.length / 2); period += 1) {
    if (values.length % period === 0 && values.every((value, index) => value === values[index % period])) return values.slice(0, period);
  }
  return [...values];
}

function invoiceProductSignature(source: AprInfissiTextSource, candidates: readonly AprInfissiTechnicalCandidate[]): string | null {
  const parsed = candidates.filter((candidate) => candidate.sourceId === source.sourceId).map(signature);
  const inline = [...source.text.matchAll(/(?:\bn\.?\s*(\d{1,3})\s+)?[^\n]{0,100}?\bL\s*(\d{3,4})\s*[x×]\s*H\s*(\d{3,4})\b/giu)].flatMap((match) => {
    const quantity = integer(match[1]);
    const width = Number(match[2]);
    const height = Number(match[3]);
    return plausibleMm(width, height) ? Array.from({ length: quantity }, () => `${width / 1000}x${height / 1000}`) : [];
  });
  const direct = collapseRepeatedStringSequence(inline).sort().join("|");
  const signatures = [...new Set([...parsed, direct].filter(Boolean))];
  return signatures.length === 1 ? signatures[0]! : direct || null;
}

function bindTechnicalCandidate(
  candidateValue: AprInfissiTechnicalCandidate,
  sources: readonly AprInfissiTextSource[],
  invoiceSources: readonly AprInfissiTextSource[],
  invoiceBindings: readonly Readonly<{ source: AprInfissiTextSource; productSignature: string }>[],
): AprInfissiTechnicalCandidate {
  if (candidateValue.sourceKind === "invoice") {
    // mixedInfissiScreeningDistinctInvoiceOrdersNotConflict: il collegamento pratica-documento
    // verifica solo un documento tecnico di terzi contro le fatture, mai due fatture tra loro.
    // Infissi e Persiane fatturati separatamente con numeri d'ordine diversi restano quindi
    // sempre "not_applicable" qui, senza alcun controllo di coerenza d'ordine tra fatture.
    return { ...candidateValue, sourceBinding: { status: "not_applicable", customerMatched: true, orderOrJobReferencesPresent: true, productSignatureMatched: true, matchedInvoiceSourceIds: [candidateValue.sourceId], technicalReferences: [], invoiceReferences: [] } };
  }
  // Regola generale di Giuliano (2026-09-07): un certificato tecnico del
  // produttore (DoP, dichiarazione di conformita') riporta per costruzione
  // il nome del costruttore, non quello del rivenditore ne' del cliente
  // finale, e spesso un riferimento di fornitura interno del costruttore che
  // non compare mai sulla fattura del rivenditore al cliente: e' la norma su
  // questo tipo di documento, non un'anomalia. Cercare una corrispondenza
  // per nome cliente o per numero d'ordine/commessa fallisce quindi sempre
  // per costruzione e non prova nulla: un certificato allegato dal
  // rivenditore a una pratica e' considerato valido per quella pratica di
  // default. L'unico segnale residuo di un vero conflitto documentale resta
  // una misura ESPLICITA e diversa dichiarata direttamente in fattura (mai
  // un nome o un riferimento d'ordine assente, che sono la norma).
  const matchingInvoices = invoiceBindings.filter((invoiceBinding) => invoiceBinding.productSignature === signature(candidateValue));
  const conflictingInvoiceSignature = invoiceBindings.length > 0 && matchingInvoices.length === 0;
  const matchedInvoiceSourceIds = [...new Set(matchingInvoices.map((item) => item.source.sourceId))].sort();
  const verified = !conflictingInvoiceSignature;
  return {
    ...candidateValue,
    sourceBinding: {
      status: verified ? "verified" : "unverified",
      customerMatched: true,
      orderOrJobReferencesPresent: true,
      productSignatureMatched: !conflictingInvoiceSignature,
      matchedInvoiceSourceIds,
      technicalReferences: [],
      invoiceReferences: [],
    },
  };
}

export function extractAprInfissiAutomaticTechnicalEvidence(
  sources: readonly AprInfissiTextSource[],
  options: Readonly<{ requirePracticeBinding?: boolean; confirmedPracticeBinding?: { sourceId: string; evidenceId: string } }> = {},
): AprInfissiAutomaticEvidence {
  return resolveAprInfissiTechnicalCandidates(observeAprInfissiTechnicalCandidates(sources), options);
}

export function observeAprInfissiTechnicalCandidates(sources: readonly AprInfissiTextSource[]): AprInfissiTechnicalCandidateSet {
  const sourcePolicy = applyAprInfissiOriginalSourcePolicy(sources);
  const removedWindowCertificates = sourcePolicy.trusted.filter((source) => source.kind === "third_party_certificate" && source.certificateScope === "removed_windows");
  const trustedSources = sourcePolicy.trusted.filter((source) => !removedWindowCertificates.includes(source));
  const rawCandidates = trustedSources.flatMap((source) => [
    parseInvoicePhysicalWindowRows(source),
    parseFinestraItaliaPositionalDimensions(source),
    parseProductAssemblyPages(source),
    parseDimensionBlocks(source),
    parseWidthHeightBlocks(source),
    parseProducerPositionTable(source),
    parseFormalDopPositionBlocks(source),
    parseSingleProductEnergyDeclaration(source),
    parsePerformanceDiagramPages(source),
    parsePerformancePages(source),
    parseThermalTable(source),
  ].filter((item): item is AprInfissiTechnicalCandidate => Boolean(item)));
  const sourcesWithAssemblyParser = new Set(rawCandidates
    .filter((candidate) => candidate.parser === "product-assembly-page")
    .map((candidate) => candidate.sourceId));
  const sourcesWithPerformanceDiagramParser = new Set(rawCandidates
    .filter((candidate) => candidate.parser === "performance-diagram-page")
    .map((candidate) => candidate.sourceId));
  const strongParsers = new Set(["width-height-block", "producer-position-table", "formal-dop-position-block", "single-product-energy-declaration", "performance-diagram-page", "performance-page", "thermal-table"]);
  const sourcesWithStrongParser = new Set(rawCandidates.filter((candidate) => strongParsers.has(candidate.parser)).map((candidate) => candidate.sourceId));
  const filteredCandidates = rawCandidates.filter((candidate) =>
    (!sourcesWithAssemblyParser.has(candidate.sourceId) || candidate.parser === "product-assembly-page")
    && (!sourcesWithPerformanceDiagramParser.has(candidate.sourceId) || candidate.parser === "performance-diagram-page")
    && !(candidate.parser === "dimension-block" && sourcesWithStrongParser.has(candidate.sourceId))
    && (candidate.explicitUwCount > 0 || candidate.sourceKind === "invoice"),
  );
  const invoiceCandidates = filteredCandidates.filter((candidate) => candidate.sourceKind === "invoice");
  const invoiceSources = trustedSources.filter((source) => source.kind === "invoice");
  const invoiceBindings = invoiceSources.flatMap((source) => {
    const productSignature = invoiceProductSignature(source, invoiceCandidates);
    return productSignature ? [{ source, productSignature }] : [];
  });
  const candidates = filteredCandidates.map((candidate) => bindTechnicalCandidate(candidate, trustedSources, invoiceSources, invoiceBindings));
  return Object.freeze({
    candidates: Object.freeze(candidates.map((item) => Object.freeze({ ...item, rows: Object.freeze(item.rows.map((row) => Object.freeze({ ...row }))) }))),
    excludedSources: Object.freeze([
      ...sourcePolicy.excluded,
      ...removedWindowCertificates.map((source) => Object.freeze({ sourceId: source.sourceId, kind: source.kind ?? "unclassified", reason: "removed_window_certificate_not_installed_product_source" })),
    ]),
    appliedRuleIds: RULE_IDS,
  });
}

export function resolveAprInfissiTechnicalCandidates(
  observation: AprInfissiTechnicalCandidateSet,
  options: Readonly<{ requirePracticeBinding?: boolean; confirmedPracticeBinding?: { sourceId: string; evidenceId: string } }> = {},
): AprInfissiAutomaticEvidence {
  const candidates = [...observation.candidates];
  const groups = new Map<string, AprInfissiTechnicalCandidate[]>();
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
  const declaredPageCount = selected?.declaredPerformancePageCount ?? null;
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
  const operatorConfirmedSelectedBinding = Boolean(selected
    && options.confirmedPracticeBinding?.sourceId === selected.sourceId
    && options.confirmedPracticeBinding.evidenceId.trim());
  const unverifiedTechnicalSourceBinding = Boolean(options.requirePracticeBinding && selected
    && selected.sourceKind !== "invoice"
    && selected.sourceBinding?.status !== "verified"
    && !operatorConfirmedSelectedBinding);
  const blockers = !selected
    ? ["infissi_dimensions_and_cardinality_missing"]
    : incompletePerformanceCardinality
      ? ["infissi_performance_page_cardinality_mismatch"]
      : conflictingTop || unresolvedInvoiceTechnicalConflict ? ["infissi_automatic_source_conflict"]
        : unverifiedTechnicalSourceBinding ? ["infissi_technical_document_practice_binding_unverified"] : [];
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
      excludedSources: observation.excludedSources,
      appliedRuleIds: observation.appliedRuleIds,
      selectedSourceBinding: selected?.sourceBinding ?? null,
    }),
  });
}
