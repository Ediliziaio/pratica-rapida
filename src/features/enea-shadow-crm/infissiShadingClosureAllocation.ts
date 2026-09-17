import { parseScreeningInvoiceText } from "../enea-lab/invoiceParser";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

export const APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION = "apr-infissi-shading-closure-allocation-v8" as const;

export interface AprInfissiInvoiceTextSource { sourceId: string; text: string }

export interface AprInfissiShadingClosureAllocation {
  version: typeof APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION;
  mode: "portal_order_partial" | "invoice_first_window_zanzariera" | "invoice_all" | "invoice_mention_all" | "invoice_none" | "technical_explicit_none" | "unresolved";
  flags: readonly boolean[];
  documentedClosureCount: number;
  sourceIds: readonly string[];
  blocker: string | null;
  audit: Readonly<{
    physicalWindowCount: number;
    documentedClosureCount: number;
    invoiceEvidenceComplete: boolean;
    technicalRowSourceKind: "invoice" | "technical_document" | null;
    invoiceDocumentSignatures: readonly string[];
    explicitNoScreenCount: number;
    explicitNoScreenSourceIds: readonly string[];
    invoiceClosureMentionSourceIds: readonly string[];
    invoiceZanzarieraMentionSourceIds: readonly string[];
    singleZanzarieraFirstWindowSourceIds: readonly string[];
    ignoredFormAlsoInstalledClosures: boolean | null;
    appliedRuleIds: readonly string[];
  }>;
}

const closureDescription = /\b(?:avvolgibil[ei]|tapparell[ae]|persian[ae]|scur[io]|zanzarier[ae]|chiusur[ae]\s+oscurant[ei])\b/iu;
const zanzarieraMention = /\bzanzarier[ae]\b/iu;
// Nel testo estratto dai PDF nativi l'etichetta "Schermatura" e il valore
// possono finire su righe/colonne separate. La frase autonoma "Senza schermo"
// resta una dichiarazione tecnica esplicita; la copertura deve comunque essere
// esattamente pari alla cardinalita' fisica degli infissi.
const explicitNoScreen = /\bSenza\s+schermo\b/giu;
// Una riga nomina una chiusura senza esserne prova quando è modulistica, quando
// è la ragione sociale del fornitore ("LM TENDE DA SOLE E ZANZARIERE S.R.L."),
// oppure quando la chiusura è ipotetica, consigliata, sostituita da altro o
// affidata a terzi ("eventuale zanzariera ... a cura del fabbro"). In tutti
// questi casi la fattura non riporta una chiusura fornita: vale il silenzio.
const closureBoilerplate = /\b(?:DA\s+COMPILARE|NOTA|anche\s+se\s+si\s+sono\s+fornite\s+solo|tipo\s+d['’]?impianto|installazione\s+di\s+chiusura|chiusura\s+oscurante\s+pertinente)\b/iu;
const closureNonEvidentialContext = /(?:\b(?:s\.?\s*r\.?\s*l|s\.?\s*p\.?\s*a|s\.?\s*n\.?\s*c|s\.?\s*a\.?\s*s)\b\.?|\ba\s+cura\s+d(?:el|ella|ei|elle|i)\b|\bsi\s+consiglia\b|\beventual[ei]\b|\banzich[eéè])/iu;

function lineReportsSuppliedClosure(line: string) {
  return closureDescription.test(line)
    && !closureBoilerplate.test(line)
    && !closureNonEvidentialContext.test(line);
}

function closureEvidenceLines(source: AprInfissiInvoiceTextSource) {
  return source.text.split(/\r?\n/u).filter(lineReportsSuppliedClosure);
}

function countExplicitNoScreenStatements(sources: readonly AprInfissiInvoiceTextSource[]) {
  const sourceCounts = sources.map((source) => ({
    sourceId: source.sourceId,
    count: Array.from(source.text.matchAll(explicitNoScreen)).length,
  })).filter((item) => item.count > 0);
  return {
    count: sourceCounts.reduce((sum, item) => sum + item.count, 0),
    sourceIds: sourceCounts.map((item) => item.sourceId),
  };
}

function sourceHasActualClosureMention(source: AprInfissiInvoiceTextSource) {
  return closureEvidenceLines(source).length > 0;
}

function sourceHasActualZanzarieraMention(source: AprInfissiInvoiceTextSource) {
  return closureEvidenceLines(source).some((line) => zanzarieraMention.test(line));
}

function sourceHasUnambiguousSingleZanzarieraOnly(source: AprInfissiInvoiceTextSource) {
  const closureLines = closureEvidenceLines(source);
  if (closureLines.some((line) => /\b(?:avvolgibil[ei]|tapparell[ae]|persian[ae]|scur[io]|chiusur[ae]\s+oscurant[ei])\b/iu.test(line))) return false;
  const parsedZanzariere = parseScreeningInvoiceText(source.text, source.sourceId).items
    .filter((item) => /\bzanzarier[ae]\b/iu.test(item.description));
  if (parsedZanzariere.length > 0) return parsedZanzariere.length === 1;
  if (closureLines.length !== 1 || !/\bzanzariera\b/iu.test(closureLines[0]) || /\bzanzariere\b/iu.test(closureLines[0])) return false;
  const explicitQuantity = closureLines[0].match(/(?:\bN[.°º]?\s*|\bquantit[aà]\s*[:=]?\s*)(\d{1,2})\b/iu)?.[1];
  return explicitQuantity === undefined || Number(explicitQuantity) === 1;
}

/**
 * Alcuni fornitori scrivono la quantita dopo la descrizione, una riga per tipo
 * di chiusura ("Installazione zanzariera 7 pzz", "Installazione tapparella 7
 * pzz"). Le chiusure ENEA sono un flag per infisso, non un inventario: tipi
 * diversi sulle stesse finestre non si sommano, vale la quantita massima.
 */
function quantityAfterDescription(source: AprInfissiInvoiceTextSource) {
  const quantities = closureEvidenceLines(source).flatMap((line) => {
    const match = line.match(/\b(?:avvolgibil[ei]|tapparell[ae]|persian[ae]|scur[io]|zanzarier[ae]|chiusur[ae]\s+oscurant[ei])\b[^0-9\n]{0,40}?(\d{1,2})\s*(?:pz{1,2}|pezz[io])\b/iu);
    return match ? [Number(match[1])] : [];
  });
  return quantities.length ? Math.max(...quantities) : 0;
}

function closureInventory(source: AprInfissiInvoiceTextSource) {
  const parsedRows = parseScreeningInvoiceText(source.text, source.sourceId).items.filter((item) => closureDescription.test(item.description));
  const normalized = source.text.replace(/\s+/gu, " ");
  const start = normalized.search(closureDescription);
  const scoped = start < 0 ? "" : normalized.slice(start).split(/\b(?:infiss|serrament)[io]\b/iu)[0] ?? "";
  const physicalRows = [...scoped.matchAll(/\bN[.°º]?\s*(\d{1,2})\s+da\s+([0-9]+(?:[,.][0-9]+)?)\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)/giu)];
  const explicitGroup = scoped.match(/\bN[.°º]?\s*(\d{1,2})\s+(?:avvolgibil[ei]|tapparell[ae]|persian[ae]|zanzarier[ae]|scur[io]|chiusur[ae]\s+oscurant[ei])\b/iu);
  const explicitGroupBeforeDescription = normalized.match(/\bN[.°º]?\s*(\d{1,2})\s+(?:avvolgibil[ei]|tapparell[ae]|persian[ae]|zanzarier[ae]|scur[io]|chiusur[ae]\s+oscurant[ei])\b/iu);
  const count = physicalRows.length
    ? physicalRows.reduce((sum, match) => sum + Number(match[1]), 0)
    : explicitGroup ? Number(explicitGroup[1])
      : explicitGroupBeforeDescription ? Number(explicitGroupBeforeDescription[1])
        : quantityAfterDescription(source) || parsedRows.length;
  const signature = physicalRows.length
    ? physicalRows.flatMap((match) => Array.from({ length: Number(match[1]) }, () => `${match[2]}x${match[3]}`)).sort().join("|")
    : parsedRows.map((item) => `${item.widthMm}x${item.heightMm}`).sort().join("|");
  return { count, signature };
}

/** Deduplica acconto/saldo soltanto quando ripetono lo stesso elenco tecnico. */
export function countDocumentedShadingClosures(invoiceSources: readonly AprInfissiInvoiceTextSource[]) {
  const unique = new Map<string, { count: number; sourceIds: string[] }>();
  for (const source of invoiceSources) {
    const inventory = closureInventory(source);
    if (!inventory.count) continue;
    const signature = inventory.signature || `count:${inventory.count}`;
    const current = unique.get(signature);
    if (current) current.sourceIds.push(source.sourceId);
    else unique.set(signature, { count: inventory.count, sourceIds: [source.sourceId] });
  }
  return {
    count: [...unique.values()].reduce((sum, item) => sum + item.count, 0),
    sourceIds: [...new Set([...unique.values()].flatMap((item) => item.sourceIds))],
    signatures: [...unique.keys()],
  };
}

export function resolveAprInfissiShadingClosureAllocation(input: {
  physicalWindowCount: number;
  invoiceSources: readonly AprInfissiInvoiceTextSource[];
  technicalEvidenceSources?: readonly AprInfissiInvoiceTextSource[];
  technicalRowSourceKind: "invoice" | "technical_document" | null;
  formAlsoInstalledClosures?: boolean;
  /**
   * Vero soltanto quando l'inventario di acquisizione prova che tutte le
   * fatture originarie sono state scaricate e analizzate. La confidenza del
   * totale e la riconciliazione economica non partecipano a questa prova.
   * Il silenzio di un fascicolo incompleto non vale mai come prova negativa.
   */
  invoiceEvidenceComplete: boolean;
}): AprInfissiShadingClosureAllocation {
  if (!Number.isInteger(input.physicalWindowCount) || input.physicalWindowCount < 1) throw new Error("infissi_physical_window_count_invalid");
  const documented = countDocumentedShadingClosures(input.invoiceSources);
  const explicitNegative = countExplicitNoScreenStatements(input.technicalEvidenceSources ?? []);
  const invoiceClosureMentionSourceIds = input.invoiceSources
    .filter(sourceHasActualClosureMention)
    .map((source) => source.sourceId);
  const invoiceZanzarieraMentionSourceIds = input.invoiceSources
    .filter(sourceHasActualZanzarieraMention)
    .map((source) => source.sourceId);
  const singleZanzarieraFirstWindowSourceIds = input.invoiceSources
    .filter(sourceHasUnambiguousSingleZanzarieraOnly)
    .map((source) => source.sourceId);
  const partial = documented.count > 0 && documented.count < input.physicalWindowCount;
  const excessive = documented.count > input.physicalWindowCount;
  const invoiceSilence = input.invoiceEvidenceComplete
    && documented.count === 0
    && invoiceClosureMentionSourceIds.length === 0;
  const technicalExplicitNone = invoiceSilence && explicitNegative.count === input.physicalWindowCount;
  const invoiceAllByCount = input.invoiceEvidenceComplete && documented.count === input.physicalWindowCount;
  // Una sola zanzariera documentata ma priva di associazione posizionale va
  // sulla prima finestra del payload ENEA. Piu in generale, M chiusure su N
  // infissi sono flag sui primi M infissi nell'ordine del payload: le chiusure
  // non hanno campi dimensionali ENEA e non si tenta mai un'associazione per
  // somiglianza di misura.
  // La stessa unica zanzariera compare spesso sia sull'acconto sia sul saldo:
  // conta la chiusura una volta sola, purche' ogni fonte che la nomina sia
  // una fonte a zanzariera singola. Se anche una sola fonte nomina altro, la
  // pratica resta non risolta.
  const invoiceFirstWindowBySingleZanzariera = input.invoiceEvidenceComplete
    && documented.count <= 1
    && singleZanzarieraFirstWindowSourceIds.length > 0
    && singleZanzarieraFirstWindowSourceIds.length === invoiceClosureMentionSourceIds.length;
  // Regola generale di Giuliano (2026-09-14, Nicla Biagioni): se i documenti
  // nominano le chiusure — zanzariere, tapparelle, persiane — ma nessuno ne
  // scrive il numero, le chiusure sono tante quanti gli infissi. «Cambio tot
  // finestre, metto le zanzariere sulle finestre che ho cambiato»: e' il caso
  // tipico, e chiedere «quante?» a documenti muti produceva sempre la stessa
  // risposta. Vale solo con menzione reale e nessuna quantita' in nessun
  // documento; un numero scritto vince sempre (Cigognetti 7/7, Giuga 1).
  // Se pero' un documento tecnico dichiara esplicitamente "senza schermo",
  // i documenti si contraddicono e la regola non si applica: resta la domanda.
  const invoiceMentionWithoutCount = input.invoiceEvidenceComplete
    && documented.count === 0
    && invoiceClosureMentionSourceIds.length > 0
    && explicitNegative.count === 0
    && !invoiceFirstWindowBySingleZanzariera;
  const mode = !input.invoiceEvidenceComplete || excessive ? "unresolved"
    : invoiceFirstWindowBySingleZanzariera ? "invoice_first_window_zanzariera"
    : partial ? "portal_order_partial"
    : invoiceAllByCount ? "invoice_all"
    : invoiceMentionWithoutCount ? "invoice_mention_all"
    : technicalExplicitNone ? "technical_explicit_none"
    : invoiceSilence ? "invoice_none"
    : "unresolved";
  const flags = mode === "portal_order_partial"
    ? Array.from({ length: input.physicalWindowCount }, (_, index) => index < documented.count)
    : mode === "invoice_first_window_zanzariera"
      ? Array.from({ length: input.physicalWindowCount }, (_, index) => index === 0)
    : mode === "invoice_all" || mode === "invoice_mention_all" ? Array.from({ length: input.physicalWindowCount }, () => true)
    : mode === "invoice_none" || mode === "technical_explicit_none"
      ? Array.from({ length: input.physicalWindowCount }, () => false) : [];
  const sourceIds = mode === "invoice_none" || mode === "technical_explicit_none"
    ? input.invoiceSources.map((source) => source.sourceId)
    : mode === "invoice_first_window_zanzariera"
      ? singleZanzarieraFirstWindowSourceIds
      : mode === "invoice_mention_all"
        ? invoiceClosureMentionSourceIds
        : documented.sourceIds;
  const appliedRuleIds = [
    USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures,
    USER_AUTHORIZED_RULE_IDS.infissiClosureMentionNotSuppliedEvidence,
    ...(documented.count > 0 || mode === "invoice_first_window_zanzariera" ? [USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable] : []),
    ...(mode === "technical_explicit_none" ? [USER_AUTHORIZED_RULE_IDS.infissiExplicitNoScreenNegativeClosureEvidence] : []),
    ...(mode === "invoice_mention_all" ? [USER_AUTHORIZED_RULE_IDS.closureMentionWithoutCountEqualsWindows, USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable] : []),
    ...(mode === "invoice_first_window_zanzariera" ? [USER_AUTHORIZED_RULE_IDS.zanzarieraInfissiInstallationContext, USER_AUTHORIZED_RULE_IDS.zanzarieraFirstWindowAllocation] : []),
  ];
  return Object.freeze({
    version: APR_INFISSI_SHADING_CLOSURE_ALLOCATION_VERSION,
    mode,
    flags: Object.freeze(flags),
    documentedClosureCount: mode === "invoice_first_window_zanzariera" ? 1 : mode === "invoice_mention_all" ? input.physicalWindowCount : documented.count,
    sourceIds: Object.freeze(sourceIds),
    blocker: !input.invoiceEvidenceComplete
      ? "infissi_invoice_evidence_incomplete_for_shading_closure_resolution"
      : excessive
        ? "infissi_shading_closure_count_exceeds_physical_windows"
        : mode === "unresolved" ? "infissi_shading_closures_form_answer_missing_or_ambiguous" : null,
    audit: Object.freeze({
      physicalWindowCount: input.physicalWindowCount,
      documentedClosureCount: documented.count,
      invoiceEvidenceComplete: input.invoiceEvidenceComplete,
      technicalRowSourceKind: input.technicalRowSourceKind,
      invoiceDocumentSignatures: Object.freeze(documented.signatures),
      explicitNoScreenCount: explicitNegative.count,
      explicitNoScreenSourceIds: Object.freeze(explicitNegative.sourceIds),
      invoiceClosureMentionSourceIds: Object.freeze(invoiceClosureMentionSourceIds),
      invoiceZanzarieraMentionSourceIds: Object.freeze(invoiceZanzarieraMentionSourceIds),
      singleZanzarieraFirstWindowSourceIds: Object.freeze(singleZanzarieraFirstWindowSourceIds),
      ignoredFormAlsoInstalledClosures: typeof input.formAlsoInstalledClosures === "boolean" ? input.formAlsoInstalledClosures : null,
      appliedRuleIds: Object.freeze(appliedRuleIds),
    }),
  });
}
