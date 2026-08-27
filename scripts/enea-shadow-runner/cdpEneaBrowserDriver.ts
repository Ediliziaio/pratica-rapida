import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EneaPortalRuntimeField, EneaPortalWorkflowStep } from "../../src/features/enea-lab/portalScript";
import type { AprEneaBrowserDriver, AprEneaDraftEvidence, AprEneaDraftPackage, AprEneaDriverEvidence, AprEneaPageSaveProbeEvidence, AprEneaSessionEvidence } from "./aprEneaBrowserWorker";
import { CdpPageClient, PersistentAprChromeRuntime, type CdpTargetInfo } from "./cdpClient";
import { infissiRowPersistenceSurfaceOutcome } from "./infissiUncertainSavePolicy";

const VERSION = "apr-cdp-enea-driver-v1" as const;
const PAGE_DIAGNOSTIC_CONTRACT_REVISION = "autocomplete-structure-v2" as const;

/** Confronta importi/decimali indipendentemente dal formato UI italiano. */
export function portalNumberValue(value: unknown): number | null {
  const compact = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (!/[0-9]/.test(compact)) return null;
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  let canonical = compact;
  if (comma >= 0 && dot >= 0) canonical = comma > dot ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  else if (comma >= 0) canonical = compact.replace(",", ".");
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Ordina la riconciliazione degli autocomplete ENEA in modo che un eventuale
 * remount causato dalla residenza sia seguito dalla verifica del luogo di
 * nascita, senza toccare campi gia concordanti.
 */
export function autocompleteRecoveryOrder(fields: EneaPortalRuntimeField[], mismatchedPortalIds: string[]) {
  return fields
    .filter((field) => field.control === "autocomplete" && mismatchedPortalIds.includes(field.portalId))
    .sort((left, right) => Number(right.portalId.includes("residenza")) - Number(left.portalId.includes("residenza")));
}

/** Query progressive: il prefisso serve solo a ottenere la lista ENEA; la
 * selezione resta ammessa esclusivamente su una voce completa equivalente. */
export function autocompleteSearchQueries(value: string) {
  const full = value.replace(/\bS\.(?=\s*\p{L})/giu, "San ").replace(/\s+/g, " ").trim();
  const apostropheVariant = full.replace(/\b(d|l|dell|all|nell|sull)\s+(?=\p{L})/giu, "$1'");
  const firstToken = full.split(" ")[0] ?? "";
  return [...new Set([
    full,
    ...(apostropheVariant !== full ? [apostropheVariant] : []),
    ...(firstToken.length >= 4 && firstToken !== full ? [firstToken] : []),
  ])];
}

function normalizeGeneratorLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

/** Traduce soltanto il selettore UI; il vettore energetico resta separato. */
export function eneaGeneratorActivationLabels(sourceLabel: string): string[] {
  const normalized = normalizeGeneratorLabel(sourceLabel);
  if (normalized === "energia elettrica" || normalized === "caldaia a gpl") return [sourceLabel, "Altro"];
  return [sourceLabel];
}

export function classifyPersistedPageFieldsReadOnly(fields: Array<{ control: string; actual: string; matches: boolean; disabled: boolean }>): AprEneaPageSaveProbeEvidence["outcome"] {
  const matched = fields.filter((field) => field.matches).length;
  if (fields.length > 0 && matched === fields.length) return "saved";
  const meaningfulFields = fields.filter((field) => field.control !== "button" && !field.disabled);
  // Un controllo assente non dimostra che il valore server sia vuoto: puo'
  // significare che la superficie React non ha ancora finito di caricarsi.
  // Solo controlli realmente presenti e vuoti possono provare not_saved.
  const blankTokens = new Set(["", "-"]);
  const allMeaningfulFieldsBlank = meaningfulFields.length > 0 && meaningfulFields.every((field) => blankTokens.has(field.actual.trim().toLocaleLowerCase("it")));
  if (allMeaningfulFieldsBlank) return "not_saved";
  // Alcuni form ENEA nascono con uno o due select di default gia' coincidenti
  // (per esempio Italia), mentre tutti i dati identificativi restano vuoti.
  // Una GET canonica con almeno tre campi attesi non coincidenti, tutti vuoti,
  // e al massimo due sole coincidenze di default prova che il Salva non ha
  // persistito.  Qualunque valore non vuoto discordante resta inconclusivo.
  const nonMatching = meaningfulFields.filter((field) => !field.matches);
  const portalDefaultTokens = new Set(["italia"]);
  const blankNonMatching = nonMatching.filter((field) => blankTokens.has(field.actual.trim().toLocaleLowerCase("it")));
  const onlyDefaultsMatch = nonMatching.length >= 3
    && nonMatching.length / meaningfulFields.length >= 0.6
    && blankNonMatching.length >= 3
    && nonMatching.every((field) => {
      const token = field.actual.trim().toLocaleLowerCase("it");
      return blankTokens.has(token) || portalDefaultTokens.has(token);
    })
    && meaningfulFields.length - nonMatching.length <= 2;
  return onlyDefaultsMatch ? "not_saved" : "inconclusive";
}

interface DriverState {
  version: typeof VERSION;
  revision: number;
  identity: string;
  activeTargetId: string | null;
  pendingCreate: { packageFingerprint: string; customerKey: string; beforeDraftIds: string[]; startedAt: string; wizardSubmitAttemptCount: 0 | 1; wizardSubmitAttemptedAt: string | null; wizardContractFingerprint: string | null } | null;
  creationSurface: { observedAt: string; customerKey: string; url: string; forms: Array<{ id: string; method: string; path: string }>; controls: Array<{ tag: string; type: string; id: string; name: string; label: string; options: string[] }>; actions: Array<{ tag: string; type: string; label: string; path: string }>; evidenceId: string } | null;
  mappings: Array<{ packageFingerprint: string; customerKey: string; draftId: string; url: string; mappedAt: string }>;
  contract: { observedAt: string; ready: boolean; operationalUrl: string | null; createCandidateCount: number; createCandidateFingerprints: string[]; forbiddenCandidateCount: number; navigationCandidates: Array<{ tag: string; label: string; path: string }>; evidenceId: string } | null;
  pageDiagnostic: ({ observedAt: string; customerKey: string; draftId: string; pageId: string; contractRevision?: string; fields: Array<{ portalId: string; control: string; expected: string; actual: string; matches: boolean; tag: string; disabled: boolean; options: Array<{ value: string; text: string }> }>; surface: { forms: Array<{ id: string; method: string; action: string }>; controls: Array<{ id: string; name: string; tag: string; type: string; value: string; text: string; label: string; checked: boolean; disabled: boolean; required: boolean; options: Array<{ value: string; text: string }> }>; text: string; autocompleteStructures?: unknown[]; scripts?: string[] }; evidenceId: string }) | null;
  pageDiagnostics: Array<{ observedAt: string; customerKey: string; draftId: string; pageId: string; contractRevision?: string; fields: Array<{ portalId: string; control: string; expected: string; actual: string; matches: boolean; tag: string; disabled: boolean; options: Array<{ value: string; text: string }> }>; surface?: { forms: Array<{ id: string; method: string; action: string }>; controls: Array<{ id: string; name: string; tag: string; type: string; value: string; text: string; label: string; checked: boolean; disabled: boolean; required: boolean; options: Array<{ value: string; text: string }> }>; text: string; autocompleteStructures?: unknown[]; scripts?: string[] }; evidenceId: string }>;
  pagePreparationDiagnostic: unknown | null;
  pageSaveDiagnostics: unknown[];
  calculationModalContractDiagnostic: unknown | null;
  calculationNetworkDiagnostic: unknown | null;
  events: Array<{ revision: number; at: string; action: string; evidenceId: string; url: string; targetId: string | null; customerKey: string | null; draftId: string | null; pageId: string | null; domSha256: string; appliedRuleIds: string[] }>;
}

type PortalContractInventory = { url: string; createCandidates: Array<{ tag: string; text: string; href: string }>; forbiddenCandidates: Array<{ tag: string; text: string }>; navigationCandidates: Array<{ tag: string; label: string; path: string }> };

export interface CdpEneaBrowserDriverOptions {
  allowedOrigin?: string;
  dashboardUrl?: string;
  createActionLabels?: string[];
  allowOpenInitialPage?: boolean;
}

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function sha256(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it"); }
function normalizeAutocompleteLabel(value: string) { return normalize(value).replace(/[.'’]/g, " ").replace(/\bs\b/g, "san").replace(/\s+/g, " ").trim(); }
function autocompleteLabelsMatch(actual: string, expected: string) {
  const observed = normalizeAutocompleteLabel(actual); const wanted = normalizeAutocompleteLabel(expected);
  return observed === wanted || observed.startsWith(`${wanted} (`) || wanted.startsWith(`${observed} (`);
}
function draftIdFromUrl(url: string) { return new URL(url).pathname.match(/\/(\d{4,})(?:\/)?$/)?.[1] ?? null; }
function safeUrl(url: string, allowedOrigin: string) { const parsed = new URL(url); if (parsed.origin !== allowedOrigin) throw new Error("apr_cdp_enea_origin_rejected"); return parsed.toString(); }

/**
 * Raccoglie le bozze gia assegnate dalle altre coorti persistenti. Ogni coorte
 * conserva un driver separato, ma il portale ENEA e' condiviso: una scoperta
 * dalla dashboard non puo quindi considerare "nuova" una bozza gia posseduta
 * da un'altra coorte. Fuori dalla directory canonica `cohorts` il controllo e'
 * volutamente vuoto, cosi fixture e installazioni isolate non condividono stato.
 */
export function siblingCohortOwnedDraftIds(rootDirectory: string): Set<string> {
  const resolvedRoot = path.resolve(rootDirectory);
  const cohortsDirectory = path.dirname(resolvedRoot);
  if (path.basename(cohortsDirectory) !== "cohorts" || !existsSync(cohortsDirectory)) return new Set();
  const owned = new Set<string>();
  for (const entry of readdirSync(cohortsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const siblingRoot = path.join(cohortsDirectory, entry.name);
    if (siblingRoot === resolvedRoot) continue;
    const sources = [
      path.join(siblingRoot, "enea-browser-worker", "cdp-driver.json"),
      path.join(siblingRoot, "enea-draft-execution", "checkpoint.json"),
    ];
    for (const source of sources) {
      if (!existsSync(source)) continue;
      try {
        const value = JSON.parse(readFileSync(source, "utf8")) as { mappings?: Array<{ draftId?: unknown }>; items?: Array<{ draftId?: unknown }> };
        for (const candidate of [...(value.mappings ?? []), ...(value.items ?? [])]) {
          const draftId = typeof candidate.draftId === "string" ? candidate.draftId : "";
          if (/^\d{4,}$/.test(draftId)) owned.add(draftId);
        }
      } catch {
        // Non possiamo provare che la bozza sia libera se una fonte di
        // ownership esistente e' illeggibile: la scoperta resta fail-closed.
        throw new Error("apr_cdp_sibling_draft_ownership_checkpoint_invalid");
      }
    }
  }
  return owned;
}

export interface CalculationAllocationTableResult {
  matched: boolean;
  reason: string;
  interventionRow: string[] | null;
  observed50: number | null;
  observed36: number | null;
  observedTotal: number | null;
}

export function classifyInfissiFinalIntegrity(input: {
  visibleRowCount: number;
  paginationText: string[];
  expectedCount: number;
  observedCost: number | null;
  expectedCost: number;
}) {
  const paginationTotals = input.paginationText
    .flatMap((text) => [...text.matchAll(/(?:di|of)\s*(\d+)/gi)].map((match) => Number(match[1])))
    .filter(Number.isFinite);
  const rowCount = paginationTotals.length > 0 ? Math.max(...paginationTotals) : input.visibleRowCount;
  const cardinalityMatched = rowCount === input.expectedCount;
  const costMatched = input.observedCost !== null && Math.abs(input.observedCost - input.expectedCost) < 0.01;
  return { ...input, rowCount, cardinalityMatched, costMatched, matched: cardinalityMatched && costMatched };
}

const tableNumber = (value: string) => {
  const compact = value.replace(/[^0-9,.-]/g, "");
  if (!/[0-9]/.test(compact)) return 0;
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Il modal ENEA accetta e persiste gli importi con la virgola decimale italiana. */
export function italianCalculationInput(value: string) {
  const parsed = tableNumber(value);
  if (parsed === null || parsed < 0) throw new Error("apr_cdp_enea_calculation_allocation_value_invalid");
  return parsed.toFixed(2).replace(".", ",");
}

/** Classifica la tabella server senza riaprire il modal e senza emettere mutazioni. */
export function classifyCalculationAllocationTable(
  headers: string[],
  rows: string[][],
  allocation: NonNullable<EneaPortalWorkflowStep["expenseAllocation"]>,
): CalculationAllocationTableResult {
  const normalizedHeaders = headers.map(normalize);
  const index50 = normalizedHeaders.findIndex((value) => value.includes("2025-2026") && value.includes("50%"));
  const index36 = normalizedHeaders.findIndex((value) => value.includes("2025-2026") && value.includes("36%"));
  const totalIndex = normalizedHeaders.findIndex((value) => /^totali?(?:\s|\[|$)/.test(value));
  const candidates = rows.filter((row) => normalize(row[0] ?? "").includes(normalize(allocation.interventionLabel)));
  if (index50 < 0 || index36 < 0 || totalIndex < 0) return { matched: false, reason: "calculation-allocation-columns-not-found", interventionRow: candidates[0] ?? null, observed50: null, observed36: null, observedTotal: null };
  if (candidates.length !== 1) return { matched: false, reason: `calculation-allocation-row-count-${candidates.length}`, interventionRow: candidates[0] ?? null, observed50: null, observed36: null, observedTotal: null };
  const row = candidates[0];
  const observed50 = tableNumber(row[index50] ?? "");
  const observed36 = tableNumber(row[index36] ?? "");
  const observedTotal = tableNumber(row[totalIndex] ?? "");
  const expected = tableNumber(allocation.value);
  const matched = expected !== null && observed50 === 0 && observed36 !== null && observedTotal !== null
    && Math.abs(observed36 - expected) < 0.01 && Math.abs(observedTotal - expected) < 0.01;
  return { matched, reason: matched ? "calculation-allocation-36-percent-verified" : "calculation-allocation-values-mismatch", interventionRow: row, observed50, observed36, observedTotal };
}

export function matchingScreeningRowIndexes(rows: string[][], fields: EneaPortalRuntimeField[]) {
  const normalizeValue = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  const numberValue = (value: unknown) => {
    const compact = String(value ?? "").replace(/[^0-9,.-]/g, "");
    if (!/[0-9]/.test(compact)) return null;
    const parsed = Number(compact.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const columns: Record<string, number> = { "id-tipo": 0, "id-inst": 1, "id-sup_s": 2, "id-sup_f": 3, "id-rsup": 4, "id-esp": 5, "id-calc": 6, "id-gtot": 7, "id-mat": 8, "id-mec": 9 };
  const expectedType = fields.find((field) => field.portalId === "id-tipo")?.value ?? "";
  return rows.flatMap((row, rowIndex) => {
    const offset = normalizeValue(row[0]) !== normalizeValue(expectedType) && normalizeValue(row[1]) === normalizeValue(expectedType) ? 1 : 0;
    const matches = fields.every((field) => {
      const base = columns[field.portalId];
      if (base === undefined) return false;
      const actual = row[base + offset] ?? "";
      const expectedNumber = numberValue(field.value);
      const actualNumber = numberValue(actual);
      if (expectedNumber !== null && actualNumber !== null) {
        // Il riepilogo ENEA visualizza la superficie della schermatura con
        // due decimali anche quando APR ha inviato il valore documentato con
        // maggiore precisione. Il confronto resta rigoroso sugli altri campi
        // numerici (gTot e superficie finestra protetta).
        const tolerance = field.portalId === "id-sup_s" ? 0.0051 : 0.001;
        return Math.abs(expectedNumber - actualNumber) < tolerance;
      }
      const observed = normalizeValue(actual);
      const wanted = normalizeValue(field.value);
      return observed === wanted || observed.includes(wanted) || wanted.includes(observed);
    });
    return matches ? [rowIndex] : [];
  });
}

export interface FinalScreeningIntegrityResult {
  matched: boolean;
  reason: string;
  expectedRowCount: number;
  observedRowCount: number;
  matchedRowIndexes: number[];
  missingExpectedIndexes: number[];
  expectedCost: number | null;
  observedCost: number | null;
}

/**
 * Verifica fail-closed il riepilogo server finale. Ogni prodotto fisico deve
 * occupare una riga distinta: anche due prodotti identici consumano due righe
 * diverse. Il totale viene confrontato numericamente, non come stringa
 * formattata (1250,00 e 1250 sono lo stesso importo).
 */
export function classifyFinalScreeningIntegrity(
  rows: string[][],
  screeningSteps: Array<{ fields: EneaPortalRuntimeField[] }>,
  expectedCostValue: string,
  observedCostValue: string,
): FinalScreeningIntegrityResult {
  const used = new Set<number>();
  const matchedRowIndexes: number[] = [];
  const missingExpectedIndexes: number[] = [];
  screeningSteps.forEach((step, expectedIndex) => {
    const rowIndex = matchingScreeningRowIndexes(rows, step.fields).find((candidate) => !used.has(candidate));
    if (rowIndex === undefined) missingExpectedIndexes.push(expectedIndex);
    else { used.add(rowIndex); matchedRowIndexes.push(rowIndex); }
  });
  const expectedCost = tableNumber(expectedCostValue);
  const observedCost = tableNumber(observedCostValue);
  const cardinalityMatches = rows.length === screeningSteps.length
    && matchedRowIndexes.length === screeningSteps.length
    && used.size === rows.length;
  const costMatches = expectedCost !== null && observedCost !== null
    && Math.round(expectedCost * 100) === Math.round(observedCost * 100);
  const matched = cardinalityMatches && costMatches;
  const reason = !cardinalityMatches
    ? "final-screening-cardinality-or-fields-mismatch"
    : !costMatches ? "final-screening-cost-mismatch" : "final-screening-cardinality-and-cost-verified";
  return { matched, reason, expectedRowCount: screeningSteps.length, observedRowCount: rows.length, matchedRowIndexes, missingExpectedIndexes, expectedCost, observedCost };
}

export function classifyCoBeneficiaryRows(rows: string[][], taxCode: string) {
  const normalizeCf = (value: string) => value.replace(/\s+/g, "").toUpperCase();
  const expected = normalizeCf(taxCode);
  const fiscalCodes = rows.flatMap((row) => row.flatMap((cell) => cell.match(/\b[A-Z0-9]{16}\b/gi) ?? []).map(normalizeCf));
  const matchingCount = fiscalCodes.filter((candidate) => candidate === expected).length;
  const conflictingFiscalCodes = [...new Set(fiscalCodes.filter((candidate) => candidate !== expected))];
  if (matchingCount === 1 && conflictingFiscalCodes.length === 0) return { status: "present" as const, matchingCount, conflictingFiscalCodes };
  if (matchingCount > 1 || conflictingFiscalCodes.length > 0) return { status: "conflict" as const, matchingCount, conflictingFiscalCodes };
  return { status: "missing" as const, matchingCount: 0, conflictingFiscalCodes: [] as string[] };
}

type PageFieldMatchResult = { compiled: string[]; missing: string[]; mismatched: string[] };

/**
 * Rilegge il DOM con richieste CDP brevi e indipendenti. Una singola
 * Runtime.evaluate asincrona puo' sopravvivere al remount React della pagina
 * ENEA e scadere anche quando la risposta server e' gia' arrivata.
 */
export async function pollPersistedPageFieldsReadOnly(
  read: () => Promise<PageFieldMatchResult>,
  expectedFieldCount: number,
  options: { attempts?: number; intervalMs?: number; wait?: (milliseconds: number) => Promise<void> } = {},
) {
  const attempts = options.attempts ?? 120;
  const intervalMs = options.intervalMs ?? 250;
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let result = await read();
  for (let attempt = 1; attempt < attempts && (result.missing.length > 0 || result.mismatched.length > 0 || result.compiled.length !== expectedFieldCount); attempt += 1) {
    await wait(intervalMs);
    result = await read();
  }
  return result;
}

type DriverEvent = DriverState["events"][number];

export function findCompleteDraftServerEvidence(input: {
  events: DriverEvent[];
  customerKey: string;
  draftId: string;
  pageIds: string[];
  allowedOrigin?: string;
}) {
  const origin = input.allowedOrigin ?? "https://bonusfiscali.enea.it";
  const events = input.events.filter((event) => event.customerKey === input.customerKey && event.draftId === input.draftId);
  const validEvent = (event: DriverEvent) => {
    try {
      const parsed = new URL(event.url);
      return parsed.origin === origin
        && parsed.pathname.endsWith(`/${input.draftId}`)
        && event.domSha256.length === 64
        && event.appliedRuleIds.length > 0
        && !/(?:anteprima|invia|submit|ricevuta|email|elimina|cancella|errore|error)/i.test(parsed.pathname);
    } catch { return false; }
  };
  for (const pageId of input.pageIds) {
    const save = [...events].reverse().find((event) => event.pageId === pageId && event.action === "save_page_once" && validEvent(event));
    if (!save) return null;
    const allowedVerificationActions = pageId.startsWith("screening:")
      ? ["verify_screening_staged_page_state", "verify_screening_post_save_failed_readonly_diagnostic", "verify_infissi_row_staged_page_state"]
      : /Generatore/.test(pageId)
        ? ["verify_generator_staged_page_state"]
        : ["verify_page_saved_server_redirect", "verify_page_saved_readonly"];
    const verified = [...events].reverse().find((event) => event.pageId === pageId && event.revision > save.revision && allowedVerificationActions.includes(event.action) && validEvent(event));
    if (!verified) return null;
  }
  const final = [...events].reverse().find((event) => event.pageId === "page:Calcolo costi e detrazioni"
    && event.action === "verify_page_saved_server_redirect"
    && validEvent(event)
    && new URL(event.url).pathname === `/pratica/ecobonus/2026/riepilogo/${input.draftId}`);
  return final ?? null;
}

/**
 * Riconosce una pagina HTTPS esterna al portale nel profilo Chrome dedicato APR.
 * Durante il redirect SPID il target ENEA cambia origine: non va interpretato
 * come una scheda ENEA mancante, altrimenti il worker ne aprirebbe una nuova.
 */
export function findExternalAuthenticationTarget(targets: CdpTargetInfo[], allowedOrigin: string) {
  const hasAllowedPortalTarget = targets.some((candidate) => {
    if (candidate.type !== "page" || !candidate.webSocketDebuggerUrl) return false;
    try { return new URL(candidate.url).origin === allowedOrigin; }
    catch { return false; }
  });
  // Nel profilo APR può essere aperta anche la scheda CRM read-only. Una
  // qualsiasi pagina HTTPS esterna non è quindi, da sola, prova di un redirect
  // SPID. Il viaggio di autenticazione è in corso soltanto quando la scheda ENEA
  // ha realmente lasciato il dominio consentito e non esiste più alcun target
  // controllabile del portale.
  if (hasAllowedPortalTarget) return null;
  return targets.find((candidate) => {
    if (candidate.type !== "page" || !candidate.webSocketDebuggerUrl) return false;
    try {
      const parsed = new URL(candidate.url);
      return parsed.protocol === "https:" && parsed.origin !== allowedOrigin;
    } catch { return false; }
  }) ?? null;
}

export class CdpEneaBrowserDriver implements AprEneaBrowserDriver {
  readonly kind = "cdp_chrome" as const;
  readonly identity: string;
  readonly checkpointPath: string;
  readonly allowedOrigin: string;
  readonly dashboardUrl: string;
  readonly createActionLabels: string[];
  readonly allowOpenInitialPage: boolean;

  constructor(readonly rootDirectory: string, readonly runtime: PersistentAprChromeRuntime, options: CdpEneaBrowserDriverOptions = {}) {
    this.allowedOrigin = new URL(options.allowedOrigin ?? "https://bonusfiscali.enea.it").origin;
    this.dashboardUrl = safeUrl(options.dashboardUrl ?? `${this.allowedOrigin}/`, this.allowedOrigin);
    this.createActionLabels = options.createActionLabels ?? ["Nuova pratica", "Ecobonus", "Schermature solari"];
    this.allowOpenInitialPage = options.allowOpenInitialPage ?? true;
    this.identity = `apr-chrome-profile:${runtime.profileFingerprint}`;
    this.checkpointPath = path.join(path.resolve(rootDirectory), "enea-browser-worker", "cdp-driver.json");
    if (!existsSync(this.checkpointPath)) this.write({ version: VERSION, revision: 0, identity: this.identity, activeTargetId: null, pendingCreate: null, creationSurface: null, mappings: [], contract: null, pageDiagnostic: null, pageDiagnostics: [], pagePreparationDiagnostic: null, pageSaveDiagnostics: [], calculationModalContractDiagnostic: null, calculationNetworkDiagnostic: null, events: [] });
  }

  private load(): DriverState {
    const value = JSON.parse(readFileSync(this.checkpointPath, "utf8")) as DriverState;
    value.contract ??= null;
    value.creationSurface ??= null;
    value.pageDiagnostic ??= null;
    value.pageDiagnostics ??= value.pageDiagnostic ? [value.pageDiagnostic] : [];
    value.pagePreparationDiagnostic ??= null;
    value.pageSaveDiagnostics ??= [];
    value.calculationModalContractDiagnostic ??= null;
    value.calculationNetworkDiagnostic ??= null;
    if (value.pendingCreate) { value.pendingCreate.wizardSubmitAttemptCount ??= 0; value.pendingCreate.wizardSubmitAttemptedAt ??= null; value.pendingCreate.wizardContractFingerprint ??= null; }
    if (value.contract) { value.contract.navigationCandidates ??= []; value.contract.operationalUrl ??= null; }
    if (value.version !== VERSION || value.identity !== this.identity || new Set(value.mappings.map((mapping) => mapping.packageFingerprint)).size !== value.mappings.length) throw new Error("apr_cdp_enea_driver_checkpoint_invalid");
    return value;
  }
  private write(state: DriverState) { atomicWrite(this.checkpointPath, `${JSON.stringify(state, null, 2)}\n`); return state; }

  private async target() {
    const state = this.load();
    const targets = await this.runtime.targets();
    let target = targets.find((candidate) => candidate.id === state.activeTargetId && candidate.type === "page" && candidate.webSocketDebuggerUrl) ?? null;
    if (!target) target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && (() => { try { return new URL(candidate.url).origin === this.allowedOrigin; } catch { return false; } })()) ?? null;
    if (!target && this.allowOpenInitialPage) target = await this.runtime.openPage(this.dashboardUrl);
    if (!target) throw new Error("apr_cdp_enea_target_not_found");
    this.runtime.closePageClientsExcept(target.id);
    if (target.id !== state.activeTargetId) { state.revision += 1; state.activeTargetId = target.id; this.write(state); }
    return target;
  }

  private async client() { const target = await this.target(); return { target, client: await this.runtime.pageClient(target) }; }

  private async ensureAllowedLocation(client: CdpPageClient) {
    const currentUrl = await client.evaluate<string>("location.href");
    try {
      safeUrl(currentUrl, this.allowedOrigin);
      return;
    } catch (error) {
      if (!this.allowOpenInitialPage) throw error;
    }
    await client.navigate(this.dashboardUrl);
    safeUrl(await client.evaluate<string>("location.href"), this.allowedOrigin);
  }

  private async allowedPageTargets() {
    const allTargets = await this.runtime.targets();
    const targets = allTargets.filter((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && (() => { try { return new URL(candidate.url).origin === this.allowedOrigin; } catch { return false; } })());
    if (targets.length > 0) return targets;
    if (findExternalAuthenticationTarget(allTargets, this.allowedOrigin)) throw new Error("apr_cdp_enea_external_login_in_progress");
    if (!this.allowOpenInitialPage) throw new Error("apr_cdp_enea_target_not_found");
    return [await this.runtime.openPage(this.dashboardUrl)];
  }

  async inspectExternalAuthenticationJourneyReadOnly() {
    const target = findExternalAuthenticationTarget(await this.runtime.targets(), this.allowedOrigin);
    if (!target) return { inProgress: false, evidenceId: null } as const;
    const origin = new URL(target.url).origin;
    return {
      inProgress: true,
      evidenceId: `external-auth-${sha256({ targetId: target.id, origin }).slice(0, 20)}`,
    } as const;
  }

  private selectTarget(targetId: string) {
    this.runtime.closePageClientsExcept(targetId);
    const state = this.load();
    if (state.activeTargetId !== targetId) { state.revision += 1; state.activeTargetId = targetId; this.write(state); }
  }

  private async capture(action: string, target: CdpTargetInfo, client: CdpPageClient, input: { customerKey?: string | null; draftId?: string | null; pageId?: string | null; appliedRuleIds?: string[] } = {}) {
    const snapshot = await client.evaluate<{ url: string; title: string; readyState: string; markers: string[]; text: string }>(`(()=>({url:location.href,title:document.title,readyState:document.readyState,markers:[...document.querySelectorAll('[id]')].slice(0,250).map(node=>node.id).filter(Boolean).sort(),text:(document.body?.innerText||"").slice(0,4000)}))()`);
    safeUrl(snapshot.url, this.allowedOrigin);
    const state = this.load(); state.revision += 1;
    const domSha256 = sha256(snapshot);
    const evidenceId = `cdp-server-${state.revision}-${domSha256.slice(0, 20)}`;
    state.events.push({ revision: state.revision, at: new Date().toISOString(), action, evidenceId, url: snapshot.url, targetId: target.id, customerKey: input.customerKey ?? null, draftId: input.draftId ?? null, pageId: input.pageId ?? null, domSha256, appliedRuleIds: [...new Set(["authorized-27-enea-session-readonly-keepalive", "system-atomic-checkpoint-resume", "system-single-active-practice", ...(input.appliedRuleIds ?? [])])] });
    if (state.events.length > 2_000) {
      // Le prove associate a una pratica sono parte del checkpoint durevole e
      // non possono essere eliminate dai keepalive periodici. Compattiamo solo
      // gli eventi globali senza customerKey, mantenendo tutte le catene
      // create/save/verify necessarie alla verifica finale dopo giorni di uptime.
      const durableCaseEvents = state.events.filter((event) => event.customerKey !== null);
      const recentGlobalEvents = state.events.filter((event) => event.customerKey === null).slice(-500);
      state.events = [...durableCaseEvents, ...recentGlobalEvents].sort((left, right) => left.revision - right.revision);
    }
    this.write(state);
    return { evidenceId, observedAt: new Date().toISOString(), url: snapshot.url };
  }

  private async waitForStable(client: CdpPageClient, previousUrl?: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const state = await client.evaluate<{ ready: string; url: string }>(`({ready:document.readyState,url:location.href})`);
      if ((state.ready === "interactive" || state.ready === "complete") && (!previousUrl || state.url !== previousUrl || attempt > 10)) return state.url;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("apr_cdp_enea_dom_stability_timeout");
  }

  private async collectDraftIds(client: CdpPageClient) {
    return client.evaluate<string[]>(`(()=>[...new Set([...document.querySelectorAll('a[href]')].map(a=>{try{return new URL(a.href,location.href).pathname.match(/\\/(\\d{4,})(?:\\/)?$/)?.[1]||null}catch{return null}}).filter(Boolean))])()`);
  }

  async verifySession(): Promise<AprEneaSessionEvidence> {
    let retainedTargetId: string | null = null;
    try {
      const activeTargetId = this.load().activeTargetId;
      const targets = await this.allowedPageTargets();
      const orderedTargets = [...targets].sort((left, right) => Number(right.id === activeTargetId) - Number(left.id === activeTargetId));
      let target = orderedTargets[0]!;
      let client = await this.runtime.pageClient(target);
      for (const candidate of orderedTargets) {
        const candidateClient = candidate.id === target.id ? client : await this.runtime.pageClient(candidate);
        await this.ensureAllowedLocation(candidateClient);
        const domAuthenticated = await candidateClient.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const pageText=normalize(document.body?.innerText||"");const controls=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')];const exitControl=controls.some(node=>normalize(node.textContent||node.value)==="esci");const createCapability=[...document.querySelectorAll('a[href]')].some(a=>{try{return new URL(a.href,location.href).origin===location.origin&&new URL(a.href,location.href).pathname==="/pratica/ecobonus/2026/nuova"}catch{return false}});return Boolean(document.querySelector('[data-apr-authenticated="true"],[data-user-authenticated="true"]'))||Boolean(document.querySelector('a[href*="logout" i],form[action*="logout" i],button[name*="logout" i]'))||exitControl||createCapability||(/(utente connesso|connesso come|profilo utente)/.test(pageText)&&Boolean(document.querySelector('[class*="user" i],[id*="user" i],[class*="profile" i],[id*="profile" i]')) )})()`);
        if (domAuthenticated) { target = candidate; client = candidateClient; break; }
      }
      await this.ensureAllowedLocation(client);
      this.selectTarget(target.id);
    let result = await client.evaluate<{ authenticated: boolean; explicitLogin: boolean; url: string }>(`(async()=>{
      const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");
      const pageText=normalize(document.body?.innerText||"");
      const explicitAuthenticatedMarker=Boolean(document.querySelector('[data-apr-authenticated="true"],[data-user-authenticated="true"]'));
      const logoutControl=Boolean(document.querySelector('a[href*="logout" i],form[action*="logout" i],button[name*="logout" i]'));
      const controls=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')];
      const exitControl=controls.some(node=>normalize(node.textContent||node.value).trim().replace(/\\s+/g," ")==="esci");
      const createCapability=[...document.querySelectorAll('a[href]')].some(a=>{try{return new URL(a.href,location.href).origin===location.origin&&new URL(a.href,location.href).pathname==="/pratica/ecobonus/2026/nuova"}catch{return false}});
      const connectedIdentity=/(utente connesso|connesso come|profilo utente)/.test(pageText)&&Boolean(document.querySelector('[class*="user" i],[id*="user" i],[class*="profile" i],[id*="profile" i]'));
      const userCue=explicitAuthenticatedMarker||logoutControl||exitControl||createCapability||connectedIdentity;
      const explicitLogin=Boolean(document.querySelector('[data-apr-logged-out="true"],form[action*="login"],a[href*="login"],a[href*="openid"],a[href*="spid"]'))&&/(accedi|login|entra con spid|autenticati)/.test(pageText);
      let serverCue=false,serverLogin=false;
      for(const path of ["/","/dashboard"]){
        try{
          const response=await fetch(location.origin+path,{method:"GET",credentials:"include",cache:"no-store",redirect:"follow"});
          const raw=(await response.text()).slice(0,30000);
          const text=normalize(raw);
          const responseUrl=new URL(response.url,location.origin);
          const sameOrigin=responseUrl.origin===location.origin;
          const identityCue=/href=["'][^"']*logout/i.test(raw)||/action=["'][^"']*logout/i.test(raw)||/(utente connesso|connesso come)/.test(text);
          const dashboardCapability=path==="/dashboard"&&sameOrigin&&responseUrl.pathname.startsWith("/dashboard")&&(/\\/pratica\\/ecobonus\\/2026\\/nuova/i.test(raw)||/(inserisci nuova scheda descrittiva|nuova pratica ecobonus)/.test(text));
          serverCue=serverCue||(response.ok&&sameOrigin&&(identityCue||dashboardCapability));
          serverLogin=serverLogin||(/(entra con spid|accedi|autenticati)/.test(text)&&/(login|openid|spid)/.test(response.url+" "+text));
        }catch{}
      }
      return {authenticated:userCue||serverCue,explicitLogin:!userCue&&!serverCue&&(explicitLogin||serverLogin),url:location.href};
    })()`);
    let evidenceAction = "verify_session_dom_server_get";
    if (!result.authenticated && !result.explicitLogin) {
      const dashboardUrl = safeUrl(`${this.allowedOrigin}/dashboard`, this.allowedOrigin);
      const previousUrl = await client.evaluate<string>("location.href");
      if (previousUrl !== dashboardUrl) {
        await client.navigate(dashboardUrl);
        await this.waitForStable(client, previousUrl);
        evidenceAction = "verify_session_dashboard_navigation_readonly_get";
      }
      for (let attempt = 0; attempt < 25; attempt += 1) {
        result = await client.evaluate<{ authenticated: boolean; explicitLogin: boolean; url: string }>(`(()=>{
          const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");
          const text=normalize(document.body?.innerText||"");
          const exitControl=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')].some(node=>normalize(node.textContent||node.value).trim().replace(/\\s+/g," ")==="esci");
          const authenticated=Boolean(document.querySelector('[data-apr-authenticated="true"],[data-user-authenticated="true"],a[href*="logout" i],form[action*="logout" i],button[name*="logout" i]'))||exitControl||(/(utente connesso|connesso come|profilo utente)/.test(text)&&Boolean(document.querySelector('[class*="user" i],[id*="user" i],[class*="profile" i],[id*="profile" i]')))||Boolean([...document.querySelectorAll('a[href]')].some(a=>{try{return new URL(a.href,location.href).origin===location.origin&&new URL(a.href,location.href).pathname==="/pratica/ecobonus/2026/nuova"}catch{return false}}));
          const publicAccessGateway=location.pathname==="/"&&[...document.querySelectorAll('a[href]')].some(a=>{try{const url=new URL(a.href,location.href);return url.origin===location.origin&&url.pathname==="/dashboard"&&/(area riservata|accedi|entra)/.test(normalize(a.textContent))}catch{return false}});
          const explicitLogin=!authenticated&&((Boolean(document.querySelector('[data-apr-logged-out="true"],form[action*="login"],a[href*="login"],a[href*="openid"],a[href*="spid"]'))&&/(accedi|login|entra con spid|autenticati)/.test(text))||publicAccessGateway);
          return {authenticated,explicitLogin,url:location.href};
        })()`);
        if (result.authenticated || result.explicitLogin) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
      const evidence = await this.capture(evidenceAction, target, client);
      retainedTargetId = target.id;
      return { ...evidence, authenticated: result.authenticated, serverLogoutProven: result.explicitLogin && !result.authenticated };
    } catch (error) {
      // La scheda puo lasciare il dominio ENEA tra l'inventario iniziale dei
      // target e la cattura conclusiva durante il redirect SPID. Convertiamo
      // il rifiuto di origine soltanto se una seconda lettura indipendente dei
      // target conferma che il viaggio di autenticazione esterno e' davvero in
      // corso. Origini estranee con un target ENEA ancora disponibile restano
      // invece un errore fail-closed.
      if (error instanceof Error && error.message === "apr_cdp_enea_origin_rejected") {
        const authenticationJourney = await this.inspectExternalAuthenticationJourneyReadOnly();
        if (authenticationJourney.inProgress) throw new Error("apr_cdp_enea_external_login_in_progress");
      }
      throw error;
    } finally {
      if (retainedTargetId) this.runtime.closePageClientsExcept(retainedTargetId);
      else this.runtime.closeAllPageClients();
    }
  }

  async inspectPortalContractReadOnly() {
    let retainedTargetId: string | null = null;
    try {
      const activeTargetId = this.load().activeTargetId;
      const targets = await this.allowedPageTargets();
      const orderedTargets = [...targets].sort((left, right) => Number(right.id === activeTargetId) - Number(left.id === activeTargetId));
      let target = orderedTargets[0]!;
      let client = await this.runtime.pageClient(target);
      let inventory: PortalContractInventory | null = null;
      const inventoryExpression = `(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const nodes=[...document.querySelectorAll('a[href],button,input[type="button"],input[type="submit"]')];const createLabels=["nuova pratica","inserisci pratica","nuova dichiarazione","crea pratica"];const ecobonus2026Path="/pratica/ecobonus/2026/nuova";const forbidden=/anteprima|invia|submit|ricevuta|email|comunicazione|salva|elimina|cancella|logout|esci/;const mapped=nodes.map(node=>{const label=normalize(node.textContent||node.value).slice(0,120);let path="";try{const parsed=node.href?new URL(node.href,location.href):null;if(parsed&&parsed.origin===location.origin)path=parsed.pathname}catch{}return {tag:node.tagName.toLowerCase(),text:label,href:node.href||"",label,path}});return {url:location.href,createCandidates:mapped.filter(item=>createLabels.some(label=>item.text===label||item.text.startsWith(label+" "))||(item.path===ecobonus2026Path&&item.text.startsWith("inserisci nuova scheda descrittiva ecobonus"))),forbiddenCandidates:mapped.filter(item=>forbidden.test(item.text)),navigationCandidates:mapped.filter(item=>item.label&&item.path&&!forbidden.test(item.label)).slice(0,80).map(({tag,label,path})=>({tag,label,path}))}})()`;
      for (const candidate of orderedTargets) {
        const candidateClient = candidate.id === target.id ? client : await this.runtime.pageClient(candidate);
        let candidateInventory = await candidateClient.evaluate<PortalContractInventory>(inventoryExpression);
      const safeDashboard = candidateInventory.navigationCandidates.find((item) => item.path === "/dashboard" && /^(area riservata|dashboard|cruscotto|accedi)$/.test(item.label));
      if (candidateInventory.createCandidates.length === 0 && safeDashboard && new URL(candidateInventory.url).pathname !== safeDashboard.path) {
        await candidateClient.navigate(`${this.allowedOrigin}${safeDashboard.path}`);
        await this.waitForStable(candidateClient);
        candidateInventory = await candidateClient.evaluate<PortalContractInventory>(inventoryExpression);
        await this.capture("navigate_dashboard_readonly_get", candidate, candidateClient);
      }
        if (!inventory || candidateInventory.createCandidates.length > 0) { target = candidate; client = candidateClient; inventory = candidateInventory; }
        if (candidateInventory.createCandidates.length > 0) break;
      }
      if (!inventory) throw new Error("apr_cdp_enea_contract_inventory_missing");
      this.selectTarget(target.id);
      safeUrl(inventory.url, this.allowedOrigin);
      const evidence = await this.capture("inspect_portal_contract_readonly", target, client);
      const createCandidateFingerprints = inventory.createCandidates.map((candidate) => sha256({ tag: candidate.tag, text: candidate.text, hrefOrigin: candidate.href ? new URL(candidate.href, inventory.url).origin : null })).sort();
      const ready = createCandidateFingerprints.length >= 1;
      const state = this.load(); state.revision += 1; state.contract = { observedAt: new Date().toISOString(), ready, operationalUrl: ready ? safeUrl(inventory.url, this.allowedOrigin) : null, createCandidateCount: createCandidateFingerprints.length, createCandidateFingerprints, forbiddenCandidateCount: inventory.forbiddenCandidates.length, navigationCandidates: inventory.navigationCandidates, evidenceId: evidence.evidenceId }; this.write(state);
      retainedTargetId = target.id;
      return state.contract;
    } finally {
      if (retainedTargetId) this.runtime.closePageClientsExcept(retainedTargetId);
      else this.runtime.closeAllPageClients();
    }
  }

  async verifyDraftIdsAbsentReadOnly(draftIds: string[]) {
    if (draftIds.length < 1 || new Set(draftIds).size !== draftIds.length || draftIds.some((id) => !/^\d{4,}$/.test(id))) throw new Error("apr_cdp_repeat_draft_ids_invalid");
    const { target, client } = await this.client();
    if (await client.evaluate<string>("location.href") !== this.dashboardUrl) {
      await client.navigate(this.dashboardUrl);
      await this.waitForStable(client);
    }
    const observed = new Set(await this.collectDraftIds(client));
    const presentDraftIds = draftIds.filter((id) => observed.has(id)).sort();
    const evidence = await this.capture("verify_repeat_draft_absence_server_get", target, client);
    return { ...evidence, requestedDraftIds: [...draftIds].sort(), presentDraftIds, allAbsent: presentDraftIds.length === 0 };
  }

  retireDeletedDraftMappingAfterVerifiedAbsence(
    customerKey: string,
    draftId: string,
    proof: { evidenceId: string; observedAt: string; url: string; requestedDraftIds: string[]; presentDraftIds: string[]; allAbsent: boolean },
  ) {
    if (!customerKey.trim()
      || !/^\d{4,}$/.test(draftId)
      || !proof.allAbsent
      || !proof.requestedDraftIds.includes(draftId)
      || proof.presentDraftIds.includes(draftId)) throw new Error("apr_cdp_enea_deleted_mapping_absence_proof_invalid");
    const state = this.load();
    const proofEvent = state.events.find((event) => event.evidenceId === proof.evidenceId
      && event.action === "verify_repeat_draft_absence_server_get"
      && event.url === proof.url);
    if (!proofEvent) throw new Error("apr_cdp_enea_deleted_mapping_server_evidence_missing");
    const mapping = state.mappings.find((candidate) => candidate.customerKey === customerKey && candidate.draftId === draftId);
    if (!mapping) return { evidenceId: proof.evidenceId, observedAt: proof.observedAt, url: proof.url, retired: false };
    const conflicting = state.mappings.find((candidate) => candidate.draftId === draftId && candidate !== mapping);
    if (conflicting) throw new Error("apr_cdp_enea_deleted_mapping_owner_conflict");

    state.revision += 1;
    state.mappings = state.mappings.filter((candidate) => candidate !== mapping);
    const evidenceId = `cdp-local-${state.revision}-${sha256({ customerKey, draftId, serverEvidenceId: proof.evidenceId }).slice(0, 20)}`;
    state.events.push({
      revision: state.revision,
      at: new Date().toISOString(),
      action: "retire_deleted_draft_mapping_after_server_absence",
      evidenceId,
      url: proof.url,
      targetId: proofEvent.targetId,
      customerKey,
      draftId,
      pageId: null,
      domSha256: proofEvent.domSha256,
      appliedRuleIds: [...new Set([...proofEvent.appliedRuleIds, "system-fail-closed-no-duplicate-draft", "system-atomic-checkpoint-resume"])],
    });
    this.write(state);
    return { evidenceId, observedAt: proof.observedAt, url: proof.url, retired: true };
  }

  async inspectPendingCreationSurfaceReadOnly() {
    const pending = this.load().pendingCreate;
    if (!pending) return null;
    const { target, client } = await this.client();
    const creationUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/nuova`;
    if (await client.evaluate<string>("location.href") !== creationUrl) await client.navigate(creationUrl);
    const inventoryExpression = `(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").slice(0,160);const path=value=>{try{const parsed=new URL(value||"",location.href);return parsed.origin===location.origin?parsed.pathname:""}catch{return ""}};const labelFor=node=>{const direct=node.labels?.[0]?.textContent||node.getAttribute("aria-label")||node.getAttribute("placeholder")||node.textContent||node.value||"";return normalize(direct)};return {url:location.href,forms:[...document.forms].slice(0,20).map(form=>({id:form.id||"",method:(form.method||"get").toLowerCase(),path:path(form.action)})),controls:[...document.querySelectorAll('input,select,textarea,button')].slice(0,120).map(node=>({tag:node.tagName.toLowerCase(),type:(node.type||"").toLowerCase(),id:node.id||"",name:node.name||"",label:labelFor(node),options:node instanceof HTMLSelectElement?[...node.options].slice(0,40).map(option=>normalize(option.textContent||option.value)):[]})),actions:[...document.querySelectorAll('a[href],button,input[type="button"],input[type="submit"]')].slice(0,120).map(node=>({tag:node.tagName.toLowerCase(),type:(node.type||"").toLowerCase(),label:labelFor(node),path:path(node.href||"")}))}})()`;
    let inventory = await client.evaluate<{ url: string; forms: Array<{ id: string; method: string; path: string }>; controls: Array<{ tag: string; type: string; id: string; name: string; label: string; options: string[] }>; actions: Array<{ tag: string; type: string; label: string; path: string }> }>(inventoryExpression);
    for (let attempt = 0; attempt < 75 && inventory.forms.length + inventory.controls.length + inventory.actions.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      inventory = await client.evaluate<typeof inventory>(inventoryExpression);
    }
    safeUrl(inventory.url, this.allowedOrigin);
    const evidence = await this.capture("inspect_pending_creation_surface_readonly", target, client, { customerKey: pending.customerKey });
    const state = this.load(); state.revision += 1; state.creationSurface = { observedAt: new Date().toISOString(), customerKey: pending.customerKey, ...inventory, evidenceId: evidence.evidenceId }; this.write(state);
    return state.creationSurface;
  }

  async discoverExistingDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence | null> {
    const state = this.load();
    const mapped = state.mappings.find((mapping) => mapping.packageFingerprint === draftPackage.packageFingerprint);
    if (mapped) {
      const { target, client } = await this.client();
      const evidence = await this.capture("discover_mapped_draft_readonly", target, client, { customerKey: draftPackage.customerKey, draftId: mapped.draftId });
      return { ...evidence, draftId: mapped.draftId, url: mapped.url };
    }
    if (state.pendingCreate?.packageFingerprint !== draftPackage.packageFingerprint) return null;
    const targets = await this.runtime.targets();
    const alreadyMappedDraftIds = new Set(state.mappings.map((mapping) => mapping.draftId));
    const siblingOwnedDraftIds = siblingCohortOwnedDraftIds(this.rootDirectory);
    const candidates = targets.flatMap((target) => {
      try { const id = new URL(target.url).origin === this.allowedOrigin ? draftIdFromUrl(target.url) : null; return id && !state.pendingCreate!.beforeDraftIds.includes(id) && !alreadyMappedDraftIds.has(id) && !siblingOwnedDraftIds.has(id) ? [{ target, id }] : []; } catch { return []; }
    });
    let discovered = candidates;
    if (discovered.length !== 1 && state.pendingCreate.wizardSubmitAttemptCount === 1) {
      const { target, client } = await this.client();
      if (await client.evaluate<string>("location.href") !== this.dashboardUrl) {
        await client.navigate(this.dashboardUrl);
        await this.waitForStable(client);
      }
      const dashboardCandidates = await client.evaluate<Array<{ id: string; url: string }>>(`(()=>Array.from(document.querySelectorAll('a[href]')).flatMap(a=>{try{const url=new URL(a.href,location.href),parts=url.pathname.split('/').filter(Boolean),id=parts[parts.length-1];return url.origin===location.origin&&/^[0-9]{4,}$/.test(id)?[{id,url:url.href}]:[]}catch{return []}}))()`);
      const unseen = dashboardCandidates.filter((candidate) => !state.pendingCreate!.beforeDraftIds.includes(candidate.id) && !alreadyMappedDraftIds.has(candidate.id) && !siblingOwnedDraftIds.has(candidate.id));
      if (unseen.length === 1) discovered = [{ target: { ...target, url: unseen[0].url }, id: unseen[0].id }];
    }
    if (discovered.length !== 1) return null;
    const [{ target, id }] = discovered;
    // Seconda lettura immediatamente prima della registrazione: evita che una
    // coorte sequenziale accetti una bozza assegnata nel frattempo dalla
    // coorte precedente.
    if (siblingCohortOwnedDraftIds(this.rootDirectory).has(id)) return null;
    const client = await this.runtime.pageClient(target);
    if (await client.evaluate<string>("location.href") !== target.url) { await client.navigate(target.url); await this.waitForStable(client); }
    const evidence = await this.capture("discover_pending_draft_readonly", target, client, { customerKey: draftPackage.customerKey, draftId: id });
    this.runtime.closePageClientsExcept(target.id);
    const next = this.load(); next.revision += 1; next.activeTargetId = target.id; next.mappings.push({ packageFingerprint: draftPackage.packageFingerprint, customerKey: draftPackage.customerKey, draftId: id, url: evidence.url, mappedAt: new Date().toISOString() }); next.pendingCreate = null; this.write(next);
    return { ...evidence, draftId: id };
  }

  async rebindLegacyMappingReadOnly(draftPackage: AprEneaDraftPackage, draftId: string) {
    const state = this.load();
    const current = state.mappings.find((mapping) => mapping.customerKey === draftPackage.customerKey && mapping.draftId === draftId);
    const packageOwner = state.mappings.find((mapping) => mapping.packageFingerprint === draftPackage.packageFingerprint);
    if (!current || (packageOwner && packageOwner !== current)) throw new Error("apr_cdp_enea_legacy_mapping_rebind_invalid");
    const canonicalUrl = safeUrl(current.url, this.allowedOrigin);
    if (draftIdFromUrl(canonicalUrl) !== draftId) throw new Error("apr_cdp_enea_legacy_mapping_url_invalid");
    const { target, client } = await this.client();
    if (await client.evaluate<string>("location.href") !== canonicalUrl) await client.navigate(canonicalUrl);
    await this.waitForStable(client);
    const observedUrl = await client.evaluate<string>("location.href");
    if (draftIdFromUrl(observedUrl) !== draftId) throw new Error("apr_cdp_enea_legacy_mapping_server_mismatch");
    const evidence = await this.capture("rebind_legacy_mapping_readonly", target, client, { customerKey: draftPackage.customerKey, draftId });
    const next = this.load();
    const mapping = next.mappings.find((candidate) => candidate.customerKey === draftPackage.customerKey && candidate.draftId === draftId);
    const conflictingPackage = next.mappings.find((candidate) => candidate.packageFingerprint === draftPackage.packageFingerprint && candidate !== mapping);
    if (!mapping || conflictingPackage) throw new Error("apr_cdp_enea_legacy_mapping_rebind_race");
    if (mapping.packageFingerprint !== draftPackage.packageFingerprint || mapping.url !== evidence.url) {
      next.revision += 1;
      mapping.packageFingerprint = draftPackage.packageFingerprint;
      mapping.url = evidence.url;
      mapping.mappedAt = evidence.observedAt;
      this.write(next);
    }
    return evidence;
  }

  discardConflictingDiscoveredMapping(customerKey: string, draftId: string) {
    const state = this.load();
    const mapping = state.mappings.find((candidate) => candidate.customerKey === customerKey && candidate.draftId === draftId);
    const owner = state.mappings.find((candidate) => candidate.customerKey !== customerKey && candidate.draftId === draftId);
    const discovery = [...state.events].reverse().find((event) => event.action === "discover_pending_draft_readonly" && event.customerKey === customerKey && event.draftId === draftId);
    const created = state.events.some((event) => event.action === "create_draft_once" && event.customerKey === customerKey && event.draftId === draftId);
    if (!mapping || !owner || !discovery || created) throw new Error("apr_cdp_enea_conflicting_discovery_recovery_invalid");
    state.revision += 1;
    const observedAt = new Date().toISOString();
    const evidenceId = `cdp-local-${state.revision}-${discovery.domSha256.slice(0, 20)}`;
    state.mappings = state.mappings.filter((candidate) => candidate !== mapping);
    state.pendingCreate = null;
    state.events.push({ revision: state.revision, at: observedAt, action: "discard_conflicting_discovery_mapping", evidenceId, url: discovery.url, targetId: discovery.targetId, customerKey, draftId, pageId: null, domSha256: discovery.domSha256, appliedRuleIds: ["authorized-19-test-stop-at-saved-draft", "system-atomic-checkpoint-resume", "system-single-active-practice"] });
    this.write(state);
    return { evidenceId, observedAt, url: discovery.url };
  }

  async createDraft(draftPackage: AprEneaDraftPackage): Promise<AprEneaDraftEvidence> {
    const { target, client } = await this.client();
    if (new URL(await client.evaluate<string>("location.href")).origin !== this.allowedOrigin) throw new Error("apr_cdp_enea_origin_rejected");
    const operationalUrl = this.load().contract?.ready ? this.load().contract?.operationalUrl ?? this.dashboardUrl : this.dashboardUrl;
    let state = this.load();
    if (state.pendingCreate && state.pendingCreate.packageFingerprint !== draftPackage.packageFingerprint) throw new Error("apr_cdp_enea_other_create_intent_pending");
    if (state.pendingCreate?.packageFingerprint === draftPackage.packageFingerprint && state.pendingCreate.wizardSubmitAttemptCount === 1) throw new Error("apr_cdp_enea_wizard_submit_already_attempted");
    if (!state.pendingCreate) {
      if (await client.evaluate<string>("location.href") !== operationalUrl) await client.navigate(operationalUrl);
      const targetDraftIds = (await this.runtime.targets()).flatMap((candidate) => { try { const id = new URL(candidate.url).origin === this.allowedOrigin ? draftIdFromUrl(candidate.url) : null; return id ? [id] : []; } catch { return []; } });
      const beforeDraftIds = [...new Set([...(await this.collectDraftIds(client)), ...state.mappings.map((mapping) => mapping.draftId), ...targetDraftIds])];
      state.revision += 1;
      state.pendingCreate = { packageFingerprint: draftPackage.packageFingerprint, customerKey: draftPackage.customerKey, beforeDraftIds, startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 0, wizardSubmitAttemptedAt: null, wizardContractFingerprint: null };
      this.write(state);
      const beforeEcobonusCreateUrl = await client.evaluate<string>("location.href");
      const ecobonusCreateClicked = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wantedPath="/pratica/ecobonus/2026/nuova";const element=[...document.querySelectorAll('a[href]')].find(node=>{const parsed=new URL(node.href,location.href);return parsed.origin===location.origin&&parsed.pathname===wantedPath&&normalize(node.textContent).startsWith("inserisci nuova scheda descrittiva ecobonus")});if(!element)return false;element.click();return true})()`);
      if (ecobonusCreateClicked) await this.waitForStable(client, beforeEcobonusCreateUrl);
    } else if (state.pendingCreate.wizardSubmitAttemptCount === 0 && new URL(await client.evaluate<string>("location.href")).pathname !== "/pratica/ecobonus/2026/nuova") {
      await client.navigate(`${this.allowedOrigin}/pratica/ecobonus/2026/nuova`);
    }

    let currentUrl = await client.evaluate<string>("location.href");
    if (!draftIdFromUrl(currentUrl) && new URL(currentUrl).pathname === "/pratica/ecobonus/2026/nuova") {
      state = this.load();
      if (state.pendingCreate?.wizardSubmitAttemptCount === 1) throw new Error("apr_cdp_enea_wizard_submit_already_attempted");
      const wizard = await client.evaluate<{ roleReady: boolean; roleLabel: string; typeReady: boolean; typeLabel: string; createReady: boolean; createLabel: string }>(`(async()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const waitFor=async predicate=>{for(let attempt=0;attempt<30;attempt+=1){if(predicate())return true;await wait(100)}return false};const controlsReady=await waitFor(()=>Boolean(document.getElementById("id-role-intermediario")&&document.getElementById("id-tipo-pf")));const role=document.getElementById("id-role-intermediario");const type=document.getElementById("id-tipo-pf");if(!controlsReady||!role||!type)return {roleReady:false,roleLabel:normalize(role?.textContent),typeReady:false,typeLabel:normalize(type?.textContent),createReady:false,createLabel:""};role.click();const roleReady=await waitFor(()=>normalize(role.textContent)==="intermediario"&&!role.disabled);const typeReady=await waitFor(()=>!type.disabled);if(typeReady){type.click()}const findCreate=()=>[...document.querySelectorAll('button[type="submit"],input[type="submit"]')].find(node=>normalize(node.textContent||node.value)==="crea scheda descrittiva");const createReady=await waitFor(()=>{const create=findCreate();return Boolean(create&&!create.disabled)});const create=findCreate();return {roleReady,roleLabel:normalize(role.textContent),typeReady,typeLabel:normalize(type.textContent),createReady,createLabel:normalize(create?.textContent||create?.value)}})()`);
      if (!wizard.roleReady || !wizard.typeReady || !wizard.createReady) throw new Error(`apr_cdp_enea_creation_wizard_contract_invalid:${sha256(wizard).slice(0, 16)}:role=${wizard.roleReady}:type=${wizard.typeReady}:create=${wizard.createReady}`);
      state = this.load();
      if (!state.pendingCreate || state.pendingCreate.packageFingerprint !== draftPackage.packageFingerprint || state.pendingCreate.wizardSubmitAttemptCount !== 0) throw new Error("apr_cdp_enea_creation_wizard_intent_invalid");
      state.revision += 1; state.pendingCreate.wizardSubmitAttemptCount = 1; state.pendingCreate.wizardSubmitAttemptedAt = new Date().toISOString(); state.pendingCreate.wizardContractFingerprint = sha256(wizard); this.write(state);
      const beforeWizardSubmitUrl = await client.evaluate<string>("location.href");
      const submitted = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const create=[...document.querySelectorAll('button[type="submit"],input[type="submit"]')].find(node=>normalize(node.textContent||node.value)==="crea scheda descrittiva");if(!create||create.disabled)return false;create.click();return true})()`);
      if (!submitted) throw new Error("apr_cdp_enea_creation_wizard_submit_not_available");
      await this.waitForStable(client, beforeWizardSubmitUrl);
      currentUrl = await client.evaluate<string>("location.href");
    }
    for (const label of this.createActionLabels) {
      if (draftIdFromUrl(currentUrl)) break;
      const beforeUrl = await client.evaluate<string>("location.href");
      const clicked = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wanted=${JSON.stringify(normalize(label))};const candidates=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')];const element=candidates.find(node=>normalize(node.textContent||node.value)===wanted);if(!element)return false;if(/anteprima|invia|submit|ricevuta|email/.test(wanted))throw new Error("forbidden-action");element.click();return true})()`);
      if (!clicked) continue;
      await this.waitForStable(client, beforeUrl);
      currentUrl = await client.evaluate<string>("location.href");
      const currentId = draftIdFromUrl(currentUrl);
      if (currentId) break;
    }
    const url = safeUrl(currentUrl, this.allowedOrigin);
    const draftId = draftIdFromUrl(url);
    if (!draftId) throw new Error("apr_cdp_enea_create_result_not_identifiable");
    const evidence = await this.capture("create_draft_once", target, client, { customerKey: draftPackage.customerKey, draftId });
    const next = this.load(); next.revision += 1; next.mappings.push({ packageFingerprint: draftPackage.packageFingerprint, customerKey: draftPackage.customerKey, draftId, url, mappedAt: new Date().toISOString() }); next.pendingCreate = null; this.write(next);
    return { ...evidence, draftId, url };
  }

  private stepFor(draftPackage: AprEneaDraftPackage, pageId: string) {
    if (pageId.startsWith("screening:")) return draftPackage.workflow.screeningSteps[Number(pageId.slice(10)) - 1] ?? null;
    return draftPackage.workflow.steps.find((step) => `page:${step.pageName}` === pageId) ?? null;
  }

  private async calculationAllocationTable(client: CdpPageClient, allocation: NonNullable<EneaPortalWorkflowStep["expenseAllocation"]>) {
    const tables = await client.evaluate<Array<{ headers: string[]; rows: string[][] }>>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");return [...document.querySelectorAll("table")].map(table=>({headers:[...table.querySelectorAll("thead th")].map(cell=>clean(cell.textContent)),rows:[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent))).filter(row=>row.length>0)}))})()`);
    const classified = tables.map((table) => classifyCalculationAllocationTable(table.headers, table.rows, allocation));
    return classified.find((item) => item.matched) ?? classified.find((item) => item.interventionRow) ?? { matched: false, reason: "calculation-allocation-table-not-found", interventionRow: null, observed50: null, observed36: null, observedTotal: null };
  }

  private async openCalculationAllocation(client: CdpPageClient, draftId: string, step: EneaPortalWorkflowStep) {
    const allocation = step.expenseAllocation;
    if (!allocation || allocation.rate !== 36 || allocation.appliedRuleIds.length === 0) throw new Error("apr_cdp_enea_calculation_allocation_contract_invalid");
    const targetUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/calcolo/${draftId}`;
    if (await client.evaluate<string>("location.href") !== targetUrl) {
      await client.navigate(targetUrl);
      await this.waitForStable(client);
    }
    const opened = await client.evaluate<boolean>(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const wanted=${JSON.stringify(normalize(allocation.interventionLabel))};for(let attempt=0;attempt<100;attempt+=1){const rows=[...document.querySelectorAll("table tbody tr")].filter(row=>normalize(row.querySelector("td")?.textContent).includes(wanted));if(rows.length===1){const controls=[...rows[0].querySelectorAll('button,input[type="button"]')].filter(control=>!control.disabled);if(controls.length===1){const label=normalize(controls[0].textContent||controls[0].value||controls[0].title||controls[0].getAttribute("aria-label")||"");if(/salva|anteprima|invia|submit|ricevuta|email|elimina|cancella/.test(label))throw new Error("forbidden-action");controls[0].click();return true}if(controls.length>1)return false}if(rows.length>1)return false;await wait(100)}return false})()`, true, 20_000);
    if (!opened) {
      const diagnostic = await client.evaluate<{ url: string; body: string; rows: string[]; controls: string[] }>(`(()=>({url:location.href,body:String(document.body?.innerText||"").trim().replace(/\\s+/g," ").slice(0,1000),rows:[...document.querySelectorAll("table tbody tr")].map(row=>String(row.textContent||"").trim().replace(/\\s+/g," ")),controls:[...document.querySelectorAll('button,input[type="button"]')].map(node=>String(node.textContent||node.value||node.title||"").trim())}))()`);
      throw new Error(`apr_cdp_enea_calculation_allocation_edit_not_unique:${JSON.stringify(diagnostic)}`);
    }
    // In questa fase la lettura deve restare priva di effetti. In precedenza
    // APR impostava element.value prima della digitazione reale: sui campi
    // controllati React questo poteva aggiornare il value-tracker senza
    // aggiornare lo stato applicativo, facendo apparire corretto il DOM ma
    // inviando ancora zero al Salva.
    const prepared = await client.evaluate<{ ready: boolean; inputId: string; actual: string; derived50: number | null; saveCount: number }>(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const compact=String(value??"").replace(/[^0-9,.-]/g,"");if(!compact)return 0;const parsed=Number(compact.includes(",")?compact.replace(/\\./g,"").replace(",","."):compact);return Number.isFinite(parsed)?parsed:null};const expected=number(${JSON.stringify(allocation.value)});for(let attempt=0;attempt<100;attempt+=1){const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")});if(inputs.length===1){const input=inputs[0];const scope=input.closest('form,[role="dialog"],.modal-content')||input.parentElement?.parentElement?.parentElement;const text=clean(scope?.textContent);const fiftyMatch=text.match(/Spese congrue sostenute nel 2025-2026\\s*\\(aliquota 50%\\)\\s*([0-9.,]+)\\s*€/i);const derived50=fiftyMatch?number(fiftyMatch[1]):null;const current36=number(input.value);const saves=[...(scope?.querySelectorAll('button,input[type="submit"],input[type="button"]')||[])].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);const balanced=expected!==null&&current36!==null&&derived50!==null&&Math.abs(current36+derived50-expected)<0.01;return {ready:balanced&&saves.length===1,inputId:input.id||"",actual:String(input.value??""),derived50,saveCount:saves.length}}await wait(100)}return {ready:false,inputId:"",actual:"",derived50:null,saveCount:0}})()`, true, 20_000);
    if (!prepared.ready) throw new Error(`apr_cdp_enea_calculation_allocation_prepare_failed:${prepared.inputId}:${prepared.actual}:${prepared.derived50}:${prepared.saveCount}`);
    const localizedExpected = italianCalculationInput(allocation.value);
    const focused = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")});if(inputs.length!==1)return false;inputs[0].focus();inputs[0].select();return true})()`);
    if (!focused) throw new Error("apr_cdp_enea_calculation_allocation_input_not_unique");
    // Svuota e riscrive con eventi utente reali. Il passaggio intermedio vuoto
    // e' intenzionale: forza React a osservare un cambio effettivo anche quando
    // un precedente tentativo aveva lasciato nel DOM lo stesso testo atteso.
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await client.send("Input.insertText", { text: localizedExpected });
    // Sul portale reale la digitazione CDP emette un input attendibile e React
    // aggiorna gia' il proprio stato. Richiamare di nuovo manualmente onChange
    // poteva attraversare due volte il wrapper React/Formik e lasciare il DOM
    // ottimistico diverso dal payload del submit. Il bridge manuale resta solo
    // come fallback per fixture o widget che non hanno osservato l'evento reale.
    const reactAlreadyMatches = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").trim().replace(/\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const compact=String(value??"").replace(/[^0-9,.-]/g,"");if(!compact)return null;const parsed=Number(compact.includes(",")?compact.replace(/\./g,"").replace(",", "."):compact);return Number.isFinite(parsed)?parsed:null};const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")});if(inputs.length!==1)return false;const input=inputs[0];const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const propsValue=propsKey?input[propsKey]?.value:undefined;return propsValue!==undefined&&number(propsValue)!==null&&Math.abs(number(propsValue)-number(${JSON.stringify(allocation.value)}))<0.01})()`);
    if (!reactAlreadyMatches) await client.evaluate(`(()=>{const clean=value=>String(value??"").trim().replace(/\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it");const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")});if(inputs.length!==1)return false;const input=inputs[0];const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const handler=propsKey&&input[propsKey]?.onChange;if(typeof handler!=="function")return false;const event={type:"change",target:input,currentTarget:input,nativeEvent:new Event("change"),preventDefault(){},stopPropagation(){},isDefaultPrevented(){return false},isPropagationStopped(){return false},persist(){}};handler(event);return true})()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const userInputVerified = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const compact=String(value??"").replace(/[^0-9,.-]/g,"");if(!compact)return null;const parsed=Number(compact.includes(",")?compact.replace(/\\./g,"").replace(",","."):compact);return Number.isFinite(parsed)?parsed:null};const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")});if(inputs.length!==1||String(inputs[0].value)!==${JSON.stringify(localizedExpected)})return false;const input=inputs[0];const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const propsValue=propsKey?input[propsKey]?.value:undefined;const reactMatches=propsValue===undefined||(number(propsValue)!==null&&Math.abs(number(propsValue)-number(${JSON.stringify(allocation.value)}))<0.01);const scope=input.closest('form,[role="dialog"],.modal-content')||input.parentElement?.parentElement?.parentElement;const fiftyMatch=clean(scope?.textContent).match(/Spese congrue sostenute nel 2025-2026\\s*\\(aliquota 50%\\)\\s*([0-9.,]+)\\s*€/i);const derived50=fiftyMatch?number(fiftyMatch[1]):null;return reactMatches&&derived50===0})()`);
    if (!userInputVerified) throw new Error("apr_cdp_enea_calculation_allocation_user_input_not_verified");
  }

  private async openPage(client: CdpPageClient, draftId: string, pageId: string, step: EneaPortalWorkflowStep, module?: AprEneaDraftPackage["module"]) {
    if (step.expenseAllocation) {
      await this.openCalculationAllocation(client, draftId, step);
      return;
    }
    const waitForMarkers = () => client.evaluate<boolean>(`(async()=>{const ids=${JSON.stringify(step.markerIds)};const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));for(let attempt=0;attempt<150;attempt+=1){if(ids.every(id=>document.getElementById(id)))return true;await wait(100)}return false})()`, true, 20_000);
    const markersPresent = await client.evaluate<boolean>(`(()=>${JSON.stringify(step.markerIds)}.every(id=>document.getElementById(id)))()`);
    if (markersPresent) return;
    // ENEA can expose the route before React has mounted its controls. On the
    // direct route, wait for those controls instead of searching for a link to
    // the page that is already being rendered.
    const directRoute = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Serramenti e infissi", "serramenti"], ["page:Calcolo costi e detrazioni", "calcolo"]]).get(pageId) ?? null;
    const currentRoute = new URL(await client.evaluate<string>("location.href")).pathname;
    if (!step.activationLabel && !pageId.startsWith("screening:") && directRoute && currentRoute === `/pratica/ecobonus/2026/${directRoute}/${draftId}`) {
      if (await waitForMarkers()) return;
      throw new Error(`apr_cdp_enea_page_markers_missing:${pageId}`);
    }
    if (!step.activationLabel && !pageId.startsWith("screening:") && directRoute) {
      await client.navigate(`${this.allowedOrigin}/pratica/ecobonus/2026/${directRoute}/${draftId}`);
      await this.waitForStable(client);
      if (await waitForMarkers()) return;
      throw new Error(`apr_cdp_enea_page_markers_missing:${pageId}`);
    }
    if (pageId.startsWith("screening:")) {
      const infissi = module === "infissi";
      const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${infissi ? "serramenti" : "schermature"}/${draftId}`;
      if (await client.evaluate<string>("location.href") !== hostUrl) { await client.navigate(hostUrl); await this.waitForStable(client); }
      const opened = await client.evaluate<boolean>(`(async()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));for(let attempt=0;attempt<150;attempt+=1){const candidates=[...document.querySelectorAll('button,input[type="button"]')].filter(node=>!node.disabled&&normalize(node.textContent||node.value)==="aggiungi");if(candidates.length===1){const label=normalize(candidates[0].textContent||candidates[0].value);if(/salva|anteprima|invia|submit|ricevuta|email|elimina|cancella/.test(label))throw new Error("forbidden-action");candidates[0].click();return true}if(candidates.length>1)return false;await wait(100)}return false})()`, true, 20_000);
      if (!opened) throw new Error(`apr_cdp_enea_${infissi ? "infissi" : "screening"}_add_not_unique:${pageId}`);
      if (!await waitForMarkers()) throw new Error(`apr_cdp_enea_${infissi ? "infissi" : "screening"}_markers_missing:${pageId}`);
      return;
    }
    if (step.hostRoute && !step.activationLabel) {
      await client.navigate(`${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`);
      await this.waitForStable(client);
      if (!await waitForMarkers()) throw new Error(`apr_cdp_enea_page_markers_missing:${pageId}`);
      return;
    }
    if (step.hostRoute && step.activationLabel) {
      const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`;
      if (await client.evaluate<string>("location.href") !== hostUrl) { await client.navigate(hostUrl); await this.waitForStable(client); }
      // Poll from Node with short CDP evaluations. A single long async
      // Runtime.evaluate can outlive a React remount and time out even when the
      // generator row becomes available. Each probe is read-only until the one
      // unequivocal row/control pair is found; that control is clicked once.
      const activationLabels = eneaGeneratorActivationLabels(step.activationLabel);
      const activateOnce = () => client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wanted=${JSON.stringify(activationLabels)}.map(normalize);const row=[...document.querySelectorAll('tr')].find(candidate=>{const first=normalize(candidate.querySelector("th,td")?.textContent);return wanted.some(label=>first===label||first.includes(label)||label.includes(first))});if(!row)return false;const controls=[...row.querySelectorAll('button,input[type="button"]')].filter(control=>!control.disabled);const control=controls.find(candidate=>/inserisci|aggiungi|modifica|edit/i.test(candidate.title||candidate.getAttribute("aria-label")||candidate.textContent||""))||controls[0];if(!control)return false;control.click();return true})()`);
      let activated = false;
      for (let attempt = 0; attempt < 120 && !activated; attempt += 1) {
        activated = await activateOnce();
        if (!activated) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      let markersReady = false;
      for (let attempt = 0; attempt < 120 && !markersReady; attempt += 1) {
        markersReady = await client.evaluate<boolean>(`(()=>${JSON.stringify(step.markerIds)}.every(id=>document.getElementById(id)))()`);
        if (!markersReady) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!activated || !markersReady) throw new Error(`apr_cdp_enea_generator_activation_failed:${pageId}`);
      return;
    }
    const beforeUrl = await client.evaluate<string>("location.href");
    const opened = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const pageId=${JSON.stringify(pageId)};const pageName=${JSON.stringify(normalize(step.pageName))};const draftId=${JSON.stringify(draftId)};const screeningIndex=pageId.startsWith("screening:")?Number(pageId.slice(10)):null;const exact=document.querySelector('[data-apr-page-id="'+CSS.escape(pageId)+'"],[data-apr-screening-index="'+screeningIndex+'"]');const links=[...document.querySelectorAll('a[href],button')];const element=exact||links.find(node=>{const text=normalize(node.textContent||node.value);const href=node.href||"";return (text===pageName||text.includes(pageName))&&(!href||href.includes(draftId))});if(!element)return false;element.click();return true})()`);
    if (!opened) throw new Error(`apr_cdp_enea_page_navigation_not_found:${pageId}`);
    await this.waitForStable(client, beforeUrl);
    const matches = await waitForMarkers();
    if (!matches) throw new Error(`apr_cdp_enea_page_markers_missing:${pageId}`);
  }

  private async fillAndRead(client: CdpPageClient, fields: EneaPortalRuntimeField[]) {
    return client.evaluate<{ compiled: string[]; missing: string[]; mismatched: string[] }>(`(async()=>{const fields=${JSON.stringify(fields)};const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const setValue=(element,value)=>{const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;if(setter)setter.call(element,value);else element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}))};const result={compiled:[],missing:[],mismatched:[]};for(const field of fields){const element=document.getElementById(field.portalId);if(!element){result.missing.push(field.portalId);continue}let verified=true;if(field.control==="select"){const wanted=normalize(field.value);const option=[...element.options].find(option=>(field.selectValue&&option.value===field.selectValue)||normalize(option.value)===wanted||normalize(option.text)===wanted);if(!option){result.mismatched.push(field.portalId);continue}const selectedValue=option.value;setValue(element,selectedValue);verified=false;for(let attempt=0;attempt<15;attempt+=1){const selected=element.options[element.selectedIndex];if(selected&&((field.selectValue&&selected.value===field.selectValue)||selected.value===selectedValue||normalize(selected.text)===wanted)){verified=true;break}await wait(100)}}else if(field.control==="button"){if(element.disabled){result.mismatched.push(field.portalId);continue}element.click()}else if(field.control==="autocomplete"){setValue(element,field.value);element.dispatchEvent(new KeyboardEvent("keyup",{key:field.value.slice(-1),bubbles:true}));await wait(250);const option=[...document.querySelectorAll('[role="option"],.ui-autocomplete li,.autocomplete-item')].find(item=>normalize(item.textContent).startsWith(normalize(field.value)));if(option)option.querySelector('a,button')?.click()||option.click();await wait(100);verified=normalize(element.value)===normalize(field.value)||normalize(element.value).startsWith(normalize(field.value)+" (")}else{setValue(element,field.value);verified=normalize(element.value??"")===normalize(field.value)}if(!verified){result.mismatched.push(field.portalId);continue}result.compiled.push(field.portalId)}return result})()`);
  }

  private async fillAndReadStable(client: CdpPageClient, fields: EneaPortalRuntimeField[]) {
    return client.evaluate<{ compiled: string[]; missing: string[]; mismatched: string[]; autocompleteDiagnostics: unknown[]; fieldDiagnostics: unknown[] }>(`(async()=>{
      const fields=${JSON.stringify(fields)};
      const orderedFields=[...fields].sort((left,right)=>Number(left.portalId==="id-dpr412")-Number(right.portalId==="id-dpr412"));
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");
      const numberValue=${portalNumberValue.toString()};
      const setValue=(element,value)=>{
        const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;
        if(setter)setter.call(element,value);else element.value=value;
        const propsKey=Object.keys(element).find(key=>key.startsWith("__reactProps$"));
        const handler=propsKey&&element[propsKey]?.onChange;
        if(typeof handler==="function")handler({type:"change",target:element,currentTarget:element,nativeEvent:new Event("change"),preventDefault(){},stopPropagation(){},isDefaultPrevented(){return false},isPropagationStopped(){return false},persist(){}});
        element.dispatchEvent(new Event("input",{bubbles:true}));
        element.dispatchEvent(new Event("change",{bubbles:true}));
      };
      const clickedButtons=new Set();
      const autocompleteKey=value=>normalize(value).replace(/[.'’]/g," ").replace(/\bs\b/g,"san").replace(/\s+/g," ").trim();
      const matchesField=field=>{
        const element=document.getElementById(field.portalId);
        if(!element)return false;
        if(field.control==="button")return clickedButtons.has(field.portalId)||element.getAttribute("aria-pressed")==="true"||element.getAttribute("data-selected")==="true"||element.classList.contains("active")||element.classList.contains("selected");
        if(field.control==="checkbox")return element instanceof HTMLInputElement&&element.type==="checkbox"&&element.checked===(field.value==="true");
        if(field.portalId==="id-impianto_centralizzato"&&["S","N"].includes(field.selectValue)&&element.disabled&&element.value===""&&["253","254"].includes(document.getElementById("id-immobile")?.value)&&document.getElementById("id-unita")?.value==="1")return true;
        if(field.control==="select"&&field.selectValue&&element.value===field.selectValue)return true;
        const actual=field.control==="select"?(element.options[element.selectedIndex]?.text||element.value):element.value;
        const observed=normalize(actual),wanted=normalize(field.value),observedNumber=numberValue(actual),wantedNumber=numberValue(field.value);
        if(field.control==="autocomplete"){const nationId=field.portalId.includes("nascita")?"id-nazione_nascita":field.portalId.includes("residenza")?"id-nazione_residenza":field.portalId==="id-comune"?null:null;const italy=nationId?document.getElementById(nationId)?.value==="ita":field.portalId.startsWith("id-comune");const selected=autocompleteKey(actual).startsWith(autocompleteKey(field.value)+" (")||autocompleteKey(field.value).startsWith(autocompleteKey(actual)+" (");return element.dataset.aprAutocompleteSelected==="true"&&element.getAttribute("aria-invalid")!=="true"&&(italy?selected:(autocompleteKey(actual)===autocompleteKey(field.value)||selected));}
        return observed===wanted||(observedNumber!==null&&wantedNumber!==null&&Math.abs(observedNumber-wantedNumber)<0.001);
      };
      const setField=async field=>{
        let element=document.getElementById(field.portalId);
        if(!element)return false;
        let verified=true;
        if(field.control==="select"){
          const wanted=normalize(field.value);
          let selectedValue=null;
          verified=false;
          for(let attempt=0;attempt<25;attempt+=1){
            element=document.getElementById(field.portalId);
            if(element instanceof HTMLSelectElement&&!element.disabled){
              const option=[...element.options].find(option=>(field.selectValue&&option.value===field.selectValue)||normalize(option.value)===wanted||normalize(option.text)===wanted);
              if(option){selectedValue=option.value;element.focus();for(const candidate of element.options)candidate.selected=candidate===option;setValue(element,selectedValue);element.dispatchEvent(new InputEvent("input",{inputType:"insertReplacementText",bubbles:true}));element.dispatchEvent(new Event("blur",{bubbles:true}));break}
            }
            await wait(100);
          }
          if(selectedValue!==null){
            for(let attempt=0;attempt<25;attempt+=1){
              element=document.getElementById(field.portalId);
              if(element instanceof HTMLSelectElement){
                const selected=element.options[element.selectedIndex];
                if(selected&&((field.selectValue&&selected.value===field.selectValue)||selected.value===selectedValue||normalize(selected.text)===wanted)){verified=true;break}
              }
              await wait(100);
            }
            if(verified){await wait(500);element=document.getElementById(field.portalId);const selected=element instanceof HTMLSelectElement?element.options[element.selectedIndex]:null;verified=Boolean(selected&&((field.selectValue&&selected.value===field.selectValue)||selected.value===selectedValue||normalize(selected.text)===wanted))}
          }
        }else if(field.control==="button"){
          if(element.disabled)return false;
          element.click();
          clickedButtons.add(field.portalId);
          await wait(300);
        }else if(field.control==="checkbox"){
          if(!(element instanceof HTMLInputElement)||element.type!=="checkbox")return false;
          const wanted=field.value==="true";
          if(element.checked!==wanted){element.click();await wait(150)}
          verified=element.checked===wanted;
        }else if(field.control==="autocomplete"){
          // Gli autocomplete ENEA richiedono input e selezione attendibili.
          // Sono gestiti fuori da Runtime.evaluate tramite CDP fisico.
          verified=false;
        }else{
          const numericValue=element instanceof HTMLInputElement&&element.type==="number"?numberValue(field.value):null;
          setValue(element,numericValue===null?field.value:String(numericValue));
          const observedNumber=numberValue(element.value),wantedNumber=numberValue(field.value);
          verified=normalize(element.value??"")===normalize(field.value)||(observedNumber!==null&&wantedNumber!==null&&Math.abs(observedNumber-wantedNumber)<0.001);
          // I form ENEA condividono spesso un unico oggetto di stato React fra
          // molti input. Se APR richiama tutti gli onChange nello stesso task,
          // ogni handler puo partire dalla stessa closure e l'ultimo campo
          // sovrascrive gli aggiornamenti precedenti: il DOM resta pieno ma il
          // payload React inviato da Salva e' vuoto. Lascia quindi completare il
          // render dopo ciascun campo prima di acquisire il nodo successivo.
          // Non e' una nuova azione portale: avviene interamente prima
          // dell'unico Salva gia' protetto dal checkpoint persistente.
          if(verified)await wait(150);
        }
        return verified;
      };
      for(let pass=0;pass<4;pass+=1){
        for(const field of orderedFields){
          if(matchesField(field))continue;
          await setField(field);
        }
        await wait(750);
        const missing=fields.filter(field=>!document.getElementById(field.portalId)).map(field=>field.portalId);
        const mismatched=fields.filter(field=>document.getElementById(field.portalId)&&!matchesField(field)).map(field=>field.portalId);
        if(missing.length===0&&mismatched.length===0)return {compiled:fields.map(field=>field.portalId),missing:[],mismatched:[],autocompleteDiagnostics:[],fieldDiagnostics:[]};
      }
      const missing=fields.filter(field=>!document.getElementById(field.portalId)).map(field=>field.portalId);
      const mismatched=fields.filter(field=>document.getElementById(field.portalId)&&!matchesField(field)).map(field=>field.portalId);
      const autocompleteDiagnostics=fields.filter(field=>field.control==="autocomplete").map(field=>{const element=document.getElementById(field.portalId);const wanted=normalize(field.value);const candidates=[...document.querySelectorAll('body *')].filter(node=>{const text=normalize(node.textContent);const style=getComputedStyle(node);return text&&text.length<240&&(text.startsWith(wanted)||text.includes(wanted))&&style.display!=="none"&&style.visibility!=="hidden"}).slice(0,80).map(node=>({tag:node.tagName.toLowerCase(),id:node.id||"",className:String(node.className||""),text:String(node.textContent||"").trim().replace(/\s+/g," ").slice(0,240),outerHtml:String(node.outerHTML||"").slice(0,1000)}));return {portalId:field.portalId,expected:field.value,actual:String(element?.value??""),parentHtml:String(element?.parentElement?.outerHTML||"").slice(0,3000),candidates}});
      const fieldDiagnostics=mismatched.map(portalId=>{const field=fields.find(candidate=>candidate.portalId===portalId);const element=document.getElementById(portalId);const actual=element instanceof HTMLSelectElement?(element.options[element.selectedIndex]?.text||element.value):element?.value;return {portalId,control:field?.control,expected:field?.value,selectValue:field?.selectValue??null,actual:String(actual??""),rawValue:String(element?.value??""),disabled:Boolean(element?.disabled),outerHtml:String(element?.parentElement?.outerHTML||element?.outerHTML||"").slice(0,3000)}});
      return {compiled:fields.filter(field=>!missing.includes(field.portalId)&&!mismatched.includes(field.portalId)).map(field=>field.portalId),missing,mismatched,autocompleteDiagnostics,fieldDiagnostics};
    })()`, true, 60_000);
  }

  private async selectAutocompleteWithPhysicalInput(client: CdpPageClient, field: EneaPortalRuntimeField) {
    if (field.control !== "autocomplete") return false;
    const pointFor = (expression: string) => client.evaluate<{ x: number; y: number } | null>(expression);
    const clickPoint = async (point: { x: number; y: number }, clickCount = 1) => {
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount });
    };
    const clearAndType = async (point: { x: number; y: number }, text: string) => {
      await clickPoint(point, 3);
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 4, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 4, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      for (const character of Array.from(text)) {
        const code = character === " " ? "Space" : /^[a-z]$/i.test(character) ? `Key${character.toUpperCase()}` : "Unidentified";
        const virtualKeyCode = character === " " ? 32 : character.toUpperCase().codePointAt(0) ?? 0;
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: character, code, text: character, unmodifiedText: character, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: character, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode });
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    };
    const inputPoint = await pointFor(`(()=>{const element=document.getElementById(${JSON.stringify(field.portalId)});if(!(element instanceof HTMLInputElement)||element.disabled)return null;element.scrollIntoView({block:"center",inline:"center"});const rect=element.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
    if (!inputPoint) return false;
    // Il widget ENEA ascolta la sequenza fisica keydown/keyup, non soltanto
    // l'evento `input`. Espandiamo "S." in "San" solo come chiave di ricerca;
    // il valore finale resta sempre quello scelto dalla lista del portale.
    const [searchText, ...fallbackSearchTexts] = autocompleteSearchQueries(field.value);
    // Sul portale reale l'input Comune ha una lente che apre il selettore
    // autorevole. Preferirlo evita il falso positivo in cui il testo digitato
    // coincide col Comune ma React non ha memorizzato l'oggetto selezionato e
    // lo respinge soltanto al submit.
    const authoritativeSearchIconPoint = await pointFor(`(()=>{const input=document.getElementById(${JSON.stringify(field.portalId)});const icon=input?.parentElement?.querySelector('.input-group-text,button,[role="button"]');if(!(icon instanceof HTMLElement))return null;icon.scrollIntoView({block:"center",inline:"center"});const rect=icon.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
    if (authoritativeSearchIconPoint) {
      await clickPoint(authoritativeSearchIconPoint);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const dialogSearchPoint = await pointFor(`(()=>{const visible=node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const scope=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content')].filter(visible).at(-1);if(!scope)return null;const inputs=[...scope.querySelectorAll('input:not([type="hidden"])')].filter(input=>!input.disabled);const input=inputs.find(candidate=>/comune|cerca|ricerca/i.test([candidate.id,candidate.name,candidate.placeholder,candidate.getAttribute("aria-label")].filter(Boolean).join(" ")))||inputs[0];if(!(input instanceof HTMLInputElement))return null;input.scrollIntoView({block:"center",inline:"center"});const rect=input.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
      if (dialogSearchPoint) {
        await clearAndType(dialogSearchPoint, searchText);
        await new Promise((resolve) => setTimeout(resolve, 350));
        const dialogSearchButtonPoint = await pointFor(`(()=>{const visible=node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const scope=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content')].filter(visible).at(-1);if(!scope)return null;const normalize=value=>String(value||"").trim().toLocaleLowerCase("it");const button=[...scope.querySelectorAll('button,input[type="button"],input[type="submit"],[role="button"]')].find(node=>/^(cerca|ricerca|trova)$/.test(normalize(node.textContent||node.value||node.getAttribute("aria-label")))&&!node.disabled);if(!button)return null;const rect=button.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
        if (dialogSearchButtonPoint) await clickPoint(dialogSearchButtonPoint);
        let modalOptionPoint: { x: number; y: number } | null = null;
        for (let attempt = 0; attempt < 60 && !modalOptionPoint; attempt += 1) {
          modalOptionPoint = await pointFor(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")});const nodes=[...document.querySelectorAll('[role="dialog"] tr,.modal tr,[role="dialog"] li,.modal li,[role="dialog"] [role="option"],.modal [role="option"]')].filter(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect(),value=clean(node.textContent);const labelMatches=value===wanted||value.startsWith(wanted+" (")||value.startsWith(wanted+" ");return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0&&labelMatches&&(!qualifier||value.includes("("+qualifier+")"))});if(nodes.length===0)return null;nodes.sort((a,b)=>String(a.textContent).length-String(b.textContent).length);const clickable=nodes[0].querySelector('button,a,[role="button"]')||nodes[0];const rect=clickable.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
          if (!modalOptionPoint) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (modalOptionPoint) {
          await clickPoint(modalOptionPoint);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const selected = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const element=document.getElementById(${JSON.stringify(field.portalId)});if(!(element instanceof HTMLInputElement)||element.getAttribute("aria-invalid")==="true")return false;const actual=clean(element.value),wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")}),selected=(actual.startsWith(wanted+" (")||wanted.startsWith(actual+" ("))&&(!qualifier||actual.includes("("+qualifier+")"));if(selected)element.dataset.aprAutocompleteSelected="true";return selected})()`);
          if (selected) return true;
        }
      }
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    }
    await clearAndType(inputPoint, searchText);
    const candidatePoint = () => client.evaluate<{ x: number; y: number } | null>(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")});const selectors='[role="option"],[role="menuitem"],[role="listbox"] li,.ui-autocomplete li,.ui-menu-item,.easy-autocomplete-container li,.autocomplete-item,.dropdown-menu li,.dropdown-item,.tt-suggestion,.select2-results__option,datalist option,[role="dialog"] tr,.modal tr,[role="dialog"] li,.modal li';const nodes=[...document.querySelectorAll(selectors)].filter(node=>{const style=getComputedStyle(node);const rect=node.getBoundingClientRect();const value=clean(node.textContent||node.value);const labelMatches=value===wanted||value.startsWith(wanted+" (")||value.startsWith(wanted+" ")||wanted.startsWith(value+" (");return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0&&labelMatches&&(!qualifier||value.includes("("+qualifier+")"))});if(nodes.length===0)return null;nodes.sort((left,right)=>String(left.textContent||left.value).length-String(right.textContent||right.value).length);const node=nodes[0];const clickable=node.querySelector?.('button,a,[role="button"]')||node;if(clickable instanceof HTMLOptionElement)return null;const rect=clickable.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
    let optionPoint: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 30 && !optionPoint; attempt += 1) {
      optionPoint = await candidatePoint();
      if (!optionPoint) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Il componente ENEA e' un autocomplete React controllato: se gli eventi
    // fisici sono filtrati dal bridge del browser, richiamiamo il suo stesso
    // onChange pubblico per far partire la GET /geo/comuni; la selezione finale
    // resta comunque un vero clic sull'opzione restituita dal portale.
    if (!optionPoint) {
      await client.evaluate<boolean>(`(()=>{const input=document.getElementById(${JSON.stringify(field.portalId)});if(!(input instanceof HTMLInputElement))return false;const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const onChange=propsKey&&input[propsKey]?.onChange;if(typeof onChange!=="function")return false;onChange({target:{value:${JSON.stringify(searchText)},name:input.name},currentTarget:input,type:"change",preventDefault(){},stopPropagation(){},persist(){}});return true})()`);
      for (let attempt = 0; attempt < 60 && !optionPoint; attempt += 1) {
        optionPoint = await candidatePoint();
        if (!optionPoint) await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    // Alcuni dossier riportano la grafia del Comune senza apostrofo
    // ("Castel d aiano"). La ricerca esatta del portale puo non produrre
    // risultati; in tal caso interroga con il solo prefisso significativo e
    // accetta comunque soltanto l'unica voce completa semanticamente uguale
    // dopo la normalizzazione della punteggiatura.
    for (const fallbackSearchText of fallbackSearchTexts) {
      if (optionPoint) break;
      await clearAndType(inputPoint, fallbackSearchText);
      await client.evaluate<boolean>(`(()=>{const input=document.getElementById(${JSON.stringify(field.portalId)});if(!(input instanceof HTMLInputElement))return false;const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const onChange=propsKey&&input[propsKey]?.onChange;if(typeof onChange!=="function")return false;onChange({target:{value:${JSON.stringify(fallbackSearchText)},name:input.name},currentTarget:input,type:"change",preventDefault(){},stopPropagation(){},persist(){}});return true})()`);
      for (let attempt = 0; attempt < 60 && !optionPoint; attempt += 1) {
        optionPoint = await candidatePoint();
        if (!optionPoint) await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    // Il componente ufficiale ENEA non conserva il testo del Comune nel
    // modello del form: la voce della GET /geo/comuni consegna al parent il
    // relativo codice ISTAT. Se il menu React non viene esposto nel DOM CDP,
    // replica esattamente quel contratto pubblico usando una sola GET
    // autorevole e il callback onChange del componente, senza salvare la
    // pagina. Fail-closed: il nome esatto (e la provincia, quando disponibile)
    // deve produrre una sola voce attiva; in caso contrario APR non valorizza
    // il campo.
    // Esegui il contratto ISTAT anche quando una voce grafica e' visibile.
    // Sul portale reale il clic puo' aggiornare soltanto il testo dell'input
    // senza consegnare al form il codice ISTAT: in quel caso il campo appare
    // valido ma fallisce alla verifica. La GET esatta e il callback pubblico
    // del componente sono quindi la fonte autorevole primaria; il clic resta
    // un fallback quando il contratto non e' risolvibile in modo univoco.
    {
      const authoritativeCodeDelivered = await client.evaluate<boolean>(`(async()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const input=document.getElementById(${JSON.stringify(field.portalId)});if(!(input instanceof HTMLInputElement))return false;input.dataset.aprAutocompleteAuthoritativeStage="started";const wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")}),queries=${JSON.stringify([searchText, ...fallbackSearchTexts])},api=String(window.ENV?.REACT_APP_API||location.origin+"/api").replace(/\\/$/,"");let rows=[],responseCodes=[];try{for(const query of queries){const response=await fetch(api+"/geo/comuni?search="+encodeURIComponent(query),{method:"GET",credentials:"include",headers:{accept:"application/json"}});responseCodes.push(response.status);if(!response.ok)continue;const payload=await response.json();if(Array.isArray(payload?.result))rows.push(...payload.result)}}catch{input.dataset.aprAutocompleteAuthoritativeStage="fetch-failed";return false}input.dataset.aprAutocompleteAuthoritativeStage="responses-"+responseCodes.join("-");const uniqueRows=[...new Map(rows.map(row=>[String(row?.codice_istat||""),row])).values()];const matches=uniqueRows.filter(row=>{const names=[row?.nome,row?.nome_alt].filter(Boolean).map(clean);return row?.cessato!==true&&names.includes(wanted)&&(!qualifier||clean(row?.sigla_pro)===qualifier)&&/^[0-9]{6}$/.test(String(row?.codice_istat||""))});input.dataset.aprAutocompleteAuthoritativeStage="matches-"+matches.length;if(matches.length!==1)return false;const fiberKey=Object.keys(input).find(key=>key.startsWith("__reactFiber$"));let fiber=fiberKey?input[fiberKey]:null,callback=null;for(let depth=0;fiber&&depth<40;depth+=1,fiber=fiber.return){const props=fiber.memoizedProps;if(props&&typeof props.autocompleteFunction==="function"&&typeof props.resolveFunction==="function"&&typeof props.onChange==="function"){callback=props.onChange;input.dataset.aprAutocompleteAuthoritativeDepth=String(depth);break}}if(typeof callback!=="function"){input.dataset.aprAutocompleteAuthoritativeStage=fiberKey?"callback-missing":"fiber-missing";return false}input.dataset.aprAutocompleteAuthoritativeStage="callback-found";callback({target:{name:input.name,value:String(matches[0].codice_istat)},currentTarget:input,type:"change",preventDefault(){},stopPropagation(){},persist(){}});input.dataset.aprAutocompleteAuthoritativeStage="callback-delivered";return true})()`);
      if (authoritativeCodeDelivered) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        const selected = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const input=document.getElementById(${JSON.stringify(field.portalId)});if(!(input instanceof HTMLInputElement)||input.getAttribute("aria-invalid")==="true")return false;const actual=clean(input.value),wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")}),selected=(actual.startsWith(wanted+" (")||wanted.startsWith(actual+" ("))&&(!qualifier||actual.includes("("+qualifier+")"));if(selected)input.dataset.aprAutocompleteSelected="true";return selected})()`);
        if (selected) return true;
      }
    }
    // Nel portale reale il Comune e' affiancato da una lente. Quando la
    // digitazione non espone direttamente una lista, la lente apre la
    // superficie di ricerca obbligatoria: APR deve usarla, mai lasciare il
    // Comune come testo libero.
    if (!optionPoint) {
      const searchIconPoint = await pointFor(`(()=>{const input=document.getElementById(${JSON.stringify(field.portalId)});const icon=input?.parentElement?.querySelector('.input-group-text,button,[role="button"]');if(!(icon instanceof HTMLElement))return null;icon.scrollIntoView({block:"center",inline:"center"});const rect=icon.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
      if (searchIconPoint) {
        await clickPoint(searchIconPoint);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const dialogSearchPoint = await pointFor(`(()=>{const scopes=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content')].filter(node=>{const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0});const scope=scopes.at(-1);if(!scope)return null;const inputs=[...scope.querySelectorAll('input:not([type="hidden"])')].filter(input=>!input.disabled);if(inputs.length===0)return null;const input=inputs.find(candidate=>/comune|cerca|ricerca/i.test([candidate.id,candidate.name,candidate.placeholder,candidate.getAttribute("aria-label")].filter(Boolean).join(" ")))||inputs[0];input.scrollIntoView({block:"center",inline:"center"});const rect=input.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
        if (dialogSearchPoint) {
          await clearAndType(dialogSearchPoint, searchText);
          await new Promise((resolve) => setTimeout(resolve, 350));
          const dialogSearchButtonPoint = await pointFor(`(()=>{const scopes=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content')].filter(node=>{const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0});const scope=scopes.at(-1);if(!scope)return null;const normalize=value=>String(value||"").trim().toLocaleLowerCase("it");const button=[...scope.querySelectorAll('button,input[type="button"],input[type="submit"],[role="button"]')].find(node=>/^(cerca|ricerca|trova)$/.test(normalize(node.textContent||node.value||node.getAttribute("aria-label")))&&!node.disabled);if(!button)return null;const rect=button.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
          if (dialogSearchButtonPoint) await clickPoint(dialogSearchButtonPoint);
        }
        for (let attempt = 0; attempt < 60 && !optionPoint; attempt += 1) {
          optionPoint = await candidatePoint();
          if (!optionPoint) await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
    if (!optionPoint && field.autocompleteQualifier) {
      // Alcuni widget React non espongono l'opzione nel DOM accessibile ma
      // mantengono la lista attiva sulla tastiera. La provincia documentata
      // rende sicura la prova ArrowDown+Enter: il risultato viene accettato
      // soltanto se il widget restituisce Comune + sigla esatti.
      await clickPoint(inputPoint);
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (!optionPoint && !field.autocompleteQualifier) return false;
    if (optionPoint) { await clickPoint(optionPoint); await new Promise((resolve) => setTimeout(resolve, 500)); }
    const verifySelected = () => client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const element=document.getElementById(${JSON.stringify(field.portalId)});if(!(element instanceof HTMLInputElement)||element.getAttribute("aria-invalid")==="true")return false;const actual=clean(element.value),wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")});const nationId=${JSON.stringify(field.portalId.includes("nascita") ? "id-nazione_nascita" : field.portalId.includes("residenza") ? "id-nazione_residenza" : null)};const italy=nationId?document.getElementById(nationId)?.value==="ita":${JSON.stringify(field.portalId.startsWith("id-comune"))};const selected=(actual.startsWith(wanted+" (")||wanted.startsWith(actual+" ("))&&(!qualifier||actual.includes("("+qualifier+")"));const matches=italy?selected:(actual===wanted||selected);if(matches)element.dataset.aprAutocompleteSelected="true";return matches})()`);
    if (await verifySelected()) return true;
    // Due menu Comune possono rimanere aperti contemporaneamente e occupare
    // lo stesso punto dello schermo. In quel caso il clic CDP attendibile puo
    // raggiungere l'opzione dell'altro campo anche se il nodo scelto era
    // corretto. Il menu e' gia stato popolato dalla GET autorevole ENEA: usa
    // come fallback il click React dell'unico pulsante il cui testo coincide
    // col Comune atteso. Questo aggiorna il valore ISTAT nel form padre e non
    // emette alcun salvataggio o altra mutazione server.
    const reactOptionDelivered = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");const wanted=clean(${JSON.stringify(field.value)}),qualifier=clean(${JSON.stringify(field.autocompleteQualifier ?? "")});const visible=node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const matches=node=>{const value=clean(node.textContent||node.value);const labelMatches=value===wanted||value.startsWith(wanted+" (")||value.startsWith(wanted+" ")||wanted.startsWith(value+" (");return labelMatches&&(!qualifier||value.includes("("+qualifier+")"))};const candidates=[...document.querySelectorAll('button[role="menuitem"].dropdown-item,[role="option"],.ui-autocomplete li,.easy-autocomplete-container li')].filter(node=>visible(node)&&matches(node));if(candidates.length!==1)return false;const candidate=candidates[0];if(!(candidate instanceof HTMLElement))return false;candidate.click();return true})()`);
    if (!reactOptionDelivered) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return verifySelected();
  }

  private async selectWithKeyboard(client: CdpPageClient, field: EneaPortalRuntimeField) {
    if (field.control !== "select") return false;
    const selection = await client.evaluate<{ found: boolean; optionIndex: number }>(`(()=>{const element=document.getElementById(${JSON.stringify(field.portalId)});if(!(element instanceof HTMLSelectElement)||element.disabled)return {found:false,optionIndex:-1};const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wanted=${JSON.stringify(field.value)};const selectValue=${JSON.stringify(field.selectValue ?? null)};const option=[...element.options].find(candidate=>(selectValue&&candidate.value===selectValue)||normalize(candidate.value)===normalize(wanted)||normalize(candidate.text)===normalize(wanted));if(!option)return {found:false,optionIndex:-1};element.focus();return {found:true,optionIndex:option.index}})()`);
    if (!selection.found) return false;
    const dispatch = (type: "keyDown" | "keyUp", key: string, code: string, virtualKeyCode: number) => client.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode });
    await dispatch("keyDown", "Home", "Home", 36); await dispatch("keyUp", "Home", "Home", 36);
    for (let index = 0; index < selection.optionIndex; index += 1) { await dispatch("keyDown", "ArrowDown", "ArrowDown", 40); await dispatch("keyUp", "ArrowDown", "ArrowDown", 40); }
    await dispatch("keyDown", "Enter", "Enter", 13); await dispatch("keyUp", "Enter", "Enter", 13);
    await client.evaluate(`(()=>{const element=document.getElementById(${JSON.stringify(field.portalId)});if(!(element instanceof HTMLSelectElement))return false;const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const wanted=${JSON.stringify(field.value)};const selectValue=${JSON.stringify(field.selectValue ?? null)};const option=[...element.options].find(candidate=>(selectValue&&candidate.value===selectValue)||normalize(candidate.value)===normalize(wanted)||normalize(candidate.text)===normalize(wanted));if(!option)return false;for(const candidate of element.options)candidate.selected=candidate===option;const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;if(setter)setter.call(element,option.value);else element.value=option.value;const propsKey=Object.keys(element).find(key=>key.startsWith("__reactProps$"));const handler=propsKey&&element[propsKey]?.onChange;if(typeof handler==="function")handler({type:"change",target:element,currentTarget:element,nativeEvent:new Event("change"),preventDefault(){},stopPropagation(){},isDefaultPrevented(){return false},isPropagationStopped(){return false},persist(){}});element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));return true})()`);
    await new Promise((resolve) => setTimeout(resolve, 750));
    return true;
  }

  private async markPersistedAutocompleteMatches(client: CdpPageClient, fields: EneaPortalRuntimeField[]) {
    const autocompleteFields = fields.filter((field) => field.control === "autocomplete");
    if (autocompleteFields.length === 0) return;
    await client.evaluate(`(()=>{const clean=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it").replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").trim().replace(/\\s+/g," ");for(const field of ${JSON.stringify(autocompleteFields)}){const element=document.getElementById(field.portalId);if(!(element instanceof HTMLInputElement)||element.getAttribute("aria-invalid")==="true")continue;const actual=clean(element.value),wanted=clean(field.value),nationId=field.portalId.includes("nascita")?"id-nazione_nascita":field.portalId.includes("residenza")?"id-nazione_residenza":null,italy=nationId?document.getElementById(nationId)?.value==="ita":field.portalId.startsWith("id-comune"),selected=actual.startsWith(wanted+" (")||wanted.startsWith(actual+" (");if(italy?selected:(actual===wanted||selected))element.dataset.aprAutocompleteSelected="true"}})()`);
  }

  private async readFieldMatches(client: CdpPageClient, fields: EneaPortalRuntimeField[]) {
    return client.evaluate<{ compiled: string[]; missing: string[]; mismatched: string[]; autocompleteDiagnostics: unknown[]; fieldDiagnostics: unknown[] }>(`(()=>{const fields=${JSON.stringify(fields)};const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const autocompleteKey=value=>normalize(value).replace(/[.'’]/g," ").replace(/\\bs\\b/g,"san").replace(/\\s+/g," ").trim();const number=value=>{const parsed=Number(String(value??"").replace(/[^0-9,.-]/g,"").replace(",","."));return Number.isFinite(parsed)?parsed:null};const missing=[],mismatched=[],compiled=[];for(const field of fields){const element=document.getElementById(field.portalId);if(!element){missing.push(field.portalId);continue}let matches;if(field.control==="button")matches=!element.disabled;else if(field.control==="checkbox")matches=element instanceof HTMLInputElement&&element.type==="checkbox"&&element.checked===(field.value==="true");else if(field.portalId==="id-impianto_centralizzato"&&["S","N"].includes(field.selectValue)&&element.disabled&&element.value===""&&["253","254"].includes(document.getElementById("id-immobile")?.value)&&document.getElementById("id-unita")?.value==="1")matches=true;else if(field.control==="select"&&field.selectValue)matches=element.value===field.selectValue;else{const actual=field.control==="select"?(element.options[element.selectedIndex]?.text||element.value):element.value;const observed=normalize(actual),wanted=normalize(field.value),actualNumber=number(actual),wantedNumber=number(field.value);if(field.control==="autocomplete"){const nationId=field.portalId.includes("nascita")?"id-nazione_nascita":field.portalId.includes("residenza")?"id-nazione_residenza":null,italy=nationId?document.getElementById(nationId)?.value==="ita":field.portalId.startsWith("id-comune"),selected=autocompleteKey(actual).startsWith(autocompleteKey(field.value)+" (")||autocompleteKey(field.value).startsWith(autocompleteKey(actual)+" (");matches=element.dataset.aprAutocompleteSelected==="true"&&element.getAttribute("aria-invalid")!=="true"&&(italy?selected:(autocompleteKey(actual)===autocompleteKey(field.value)||selected))}else matches=observed===wanted||(actualNumber!==null&&wantedNumber!==null&&Math.abs(actualNumber-wantedNumber)<0.001)}if(matches)compiled.push(field.portalId);else mismatched.push(field.portalId)}return {compiled,missing,mismatched,autocompleteDiagnostics:[],fieldDiagnostics:[]}})()`);
  }

  private async ensureCoBeneficiary(target: CdpTargetInfo, client: CdpPageClient, draftPackage: AprEneaDraftPackage, draftId: string, pageId: string, step: EneaPortalWorkflowStep) {
    const person = step.coBeneficiary;
    if (!person) return null;
    const readRows = () => client.evaluate<string[][]>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");return [...document.querySelectorAll("table")].filter(table=>{const header=clean(table.querySelector("thead")?.textContent||table.querySelector("tr")?.textContent);return /nome/i.test(header)&&/cognome/i.test(header)&&/codice fiscale/i.test(header)}).flatMap(table=>[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("th,td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.some(cell=>/[A-Z0-9]{16}/i.test(cell))))})()`);
    let classification = classifyCoBeneficiaryRows(await readRows(), person.taxCode);
    if (classification.status === "present") return this.capture("co_beneficiary_already_present_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    if (classification.status === "conflict") throw new Error(`apr_cdp_enea_co_beneficiary_conflict:${classification.conflictingFiscalCodes.join(",") || "duplicate"}`);

    const opened = await client.evaluate<{ ready: boolean; reason: string }>(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const normalize=value=>String(value??"").trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const add=[...document.querySelectorAll('button,input[type="button"],a')].filter(node=>normalize(node.textContent||node.value)==="aggiungi persona fisica"&&!node.disabled);if(add.length!==1)return {ready:false,reason:"add-person-control-count-"+add.length};add[0].click();for(let attempt=0;attempt<80;attempt+=1){const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],.modal-title')].find(node=>normalize(node.textContent)==="altro beneficiario (persona fisica)");const scope=heading?.closest('[role="dialog"],.modal-content,.modal-dialog,form')||heading?.parentElement?.parentElement;if(scope)return {ready:true,reason:"ready"};await wait(100)}return {ready:false,reason:"person-dialog-not-found"}})()`, true, 20_000);
    if (!opened.ready) throw new Error(`apr_cdp_enea_co_beneficiary_prepare_failed:${opened.reason}`);

    const assignments = [
      { portalId: "id-nome", label: "Nome", value: person.name },
      { portalId: "id-cognome", label: "Cognome", value: person.surname },
      { portalId: "id-codice_fiscale", label: "Codice fiscale", value: person.taxCode },
    ];
    // ENEA duplica gli stessi id del beneficiario principale dentro il modale.
    // Ogni lookup resta quindi confinato al dialogo e viene rifatto dopo ogni
    // evento React, così un remount non può deviare la digitazione su un altro
    // campo o sull'anagrafica principale.
    for (const assignment of assignments) {
      const input = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const normalize=value=>String(value??"").trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],.modal-title')].find(node=>normalize(node.textContent)==="altro beneficiario (persona fisica)");const scope=heading?.closest('[role="dialog"],.modal-content,.modal-dialog,form')||heading?.parentElement?.parentElement;if(!scope)return null;const portalId=${JSON.stringify(assignment.portalId)},labelText=${JSON.stringify(assignment.label)};const byId=[...scope.querySelectorAll("input")].find(node=>node.id===portalId);const label=[...scope.querySelectorAll("label")].find(node=>normalize(node.textContent).replace("*","").trim()===normalize(labelText));const byLabel=label&&((label.htmlFor&&[...scope.querySelectorAll("input")].find(node=>node.id===label.htmlFor))||label.querySelector("input")||label.parentElement?.querySelector("input"));const field=byId||byLabel;if(!(field instanceof HTMLInputElement))return null;field.scrollIntoView({block:"center",inline:"center"});const rect=field.getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
      if (!input) throw new Error(`apr_cdp_enea_co_beneficiary_trusted_input_not_available:${assignment.portalId}`);
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: input.x, y: input.y });
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: input.x, y: input.y, button: "left", clickCount: 3 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: input.x, y: input.y, button: "left", clickCount: 3 });
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await client.send("Input.insertText", { text: assignment.value });
      await client.evaluate(`(()=>{const normalize=value=>String(value??"").trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],.modal-title')].find(node=>normalize(node.textContent)==="altro beneficiario (persona fisica)");const scope=heading?.closest('[role="dialog"],.modal-content,.modal-dialog,form')||heading?.parentElement?.parentElement;if(!scope)return false;const input=[...scope.querySelectorAll("input")].find(node=>node.id===${JSON.stringify(assignment.portalId)});if(!(input instanceof HTMLInputElement))return false;const value=${JSON.stringify(assignment.value)};const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;if(setter&&input.value!==value)setter.call(input,value);const propsKey=Object.keys(input).find(key=>key.startsWith("__reactProps$"));const handler=propsKey&&input[propsKey]?.onChange;if(typeof handler==="function")handler({type:"change",target:input,currentTarget:input,nativeEvent:new Event("change"),preventDefault(){},stopPropagation(){},isDefaultPrevented(){return false},isPropagationStopped(){return false},persist(){}});return true})()`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const trustedSavePoint = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const clean=value=>String(value??"").trim();const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const person=${JSON.stringify(person)};const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],.modal-title')].find(node=>normalize(node.textContent)==="altro beneficiario (persona fisica)");const scope=heading?.closest('[role="dialog"],.modal-content,.modal-dialog,form')||heading?.parentElement?.parentElement;if(!scope)return null;const values=[person.name,person.surname,person.taxCode].map(normalize);const inputs=[...scope.querySelectorAll("input")].filter(input=>input.type!=="hidden");if(inputs.length<3||!values.every(value=>inputs.some(input=>normalize(input.value)===value&&input.validity.valid&&input.getAttribute("aria-invalid")!=="true")))return null;const saves=[...scope.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(saves.length!==1)return null;saves[0].scrollIntoView({block:"center",inline:"center"});const rect=saves[0].getBoundingClientRect();return rect.width>0&&rect.height>0?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null})()`);
    if (!trustedSavePoint) {
      const diagnostic = await client.evaluate(`(()=>{const clean=value=>String(value??"").trim();const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],.modal-title')].find(node=>normalize(node.textContent)==="altro beneficiario (persona fisica)");const scope=heading?.closest('[role="dialog"],.modal-content,.modal-dialog,form')||heading?.parentElement?.parentElement;return {heading:clean(heading?.textContent),scopeFound:Boolean(scope),fields:scope?[...scope.querySelectorAll("input")].map(input=>({id:input.id||"",name:input.name||"",type:input.type,value:String(input.value??""),disabled:input.disabled,valid:input.validity.valid,ariaInvalid:input.getAttribute("aria-invalid"),reactProps:Object.keys(input).filter(key=>key.startsWith("__reactProps$")).map(key=>Object.keys(input[key]||{}))})):[],saves:scope?[...scope.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva").map(node=>({tag:node.tagName.toLowerCase(),disabled:Boolean(node.disabled),text:clean(node.textContent||node.value)})):[],alerts:[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].map(node=>clean(node.textContent)).filter(Boolean).slice(0,40)}})()`);
      const evidence = await this.capture("co_beneficiary_trusted_input_not_verified_diagnostic", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "co-beneficiary-trusted-input-v4", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, diagnostic }; this.write(state);
      throw new Error("apr_cdp_enea_co_beneficiary_trusted_input_not_verified");
    }
    await this.capture("co_beneficiary_save_intent", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    // Il modale "Altro beneficiario" ignora in alcuni casi element.click().
    // Usa quindi l'unico controllo gia' validato sopra con un vero evento
    // pointer/mouse CDP. L'intento e' persistito prima del click e non viene
    // mai ripetuto alla cieca.
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: trustedSavePoint.x, y: trustedSavePoint.y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: trustedSavePoint.x, y: trustedSavePoint.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: trustedSavePoint.x, y: trustedSavePoint.y, button: "left", clickCount: 1 });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      classification = classifyCoBeneficiaryRows(await readRows(), person.taxCode);
      if (classification.status === "present") return this.capture("co_beneficiary_saved_verified", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      if (classification.status === "conflict") throw new Error(`apr_cdp_enea_co_beneficiary_conflict_after_save:${classification.conflictingFiscalCodes.join(",") || "duplicate"}`);
    }
    const diagnostic = await client.evaluate(`(()=>{const clean=value=>String(value??"").trim();return {dialogOpen:Boolean(document.querySelector('[role="dialog"],.modal-content,.modal-dialog')),fields:[...document.querySelectorAll('[role="dialog"] input,.modal-content input,.modal-dialog input')].map(input=>({id:input.id||"",name:input.name||"",value:String(input.value??""),ariaInvalid:input.getAttribute("aria-invalid"),valid:input.validity.valid})),alerts:[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].map(node=>clean(node.textContent)).filter(Boolean).slice(0,40)}})()`);
    const evidence = await this.capture("co_beneficiary_save_unverified_diagnostic", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "co-beneficiary-trusted-input-v2", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, diagnostic }; this.write(state);
    throw new Error("apr_cdp_enea_co_beneficiary_save_unverified");
  }

  async preparePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence> {
    const step = this.stepFor(draftPackage, pageId); if (!step) throw new Error(`apr_cdp_enea_page_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId); if (!mapping) throw new Error("apr_cdp_enea_mapping_missing");
    const { target, client } = await this.client();
    if (draftIdFromUrl(await client.evaluate<string>("location.href")) !== draftId) await client.navigate(mapping.url);
    try {
      await this.openPage(client, draftId, pageId, step, draftPackage.module);
    } catch (error) {
      if (draftPackage.module === "infissi" && /serrament|infiss/i.test(step.pageName)) {
        const surface = await client.evaluate(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const labelFor=node=>{const id=node.id||"";const direct=id?document.querySelector('label[for="'+CSS.escape(id)+'"]'):null;return clean(direct?.textContent||node.closest("label")?.textContent||node.parentElement?.textContent||"").slice(0,300)};const add=[...document.querySelectorAll('button,input[type="button"],a')].filter(node=>normalize(node.textContent||node.value)==="aggiungi"&&!node.disabled);let addOpened=false;if(add.length===1){add[0].click();for(let attempt=0;attempt<50;attempt+=1){await wait(100);if(document.querySelector('[role="dialog"],.modal-content,.modal-dialog')){addOpened=true;break}}}const scope=document.querySelector('[role="dialog"],.modal-content,.modal-dialog')||document;return {url:location.href,title:document.title,body:clean(document.body?.innerText).slice(0,5000),addControlCount:add.length,addOpened,controls:[...scope.querySelectorAll("input,select,textarea,button")].map(node=>({tag:node.tagName.toLowerCase(),id:node.id||"",name:node.getAttribute("name")||"",type:node.getAttribute("type")||"",label:labelFor(node),value:String(node.value??"").slice(0,200),options:node instanceof HTMLSelectElement?[...node.options].map(option=>({value:option.value,text:clean(option.text)})).slice(0,80):[]})).filter(item=>item.id||item.name||/salva|annulla/i.test(item.label)).slice(0,250),links:[...document.querySelectorAll("a[href]")].map(node=>({text:clean(node.textContent),href:node.href})).filter(item=>/serrament|infiss|chiusur|calcolo/i.test(item.text+" "+item.href)).slice(0,80)}})()`, true, 15_000);
        const evidence = await this.capture("inspect_infissi_contract_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
        const state = this.load();
        state.revision += 1;
        state.pagePreparationDiagnostic = { kind: "infissi-technical-contract-discovery-v2", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, surface, originalError: error instanceof Error ? error.message : String(error) };
        this.write(state);
        throw new Error(`apr_cdp_enea_infissi_contract_discovered:${evidence.evidenceId}`);
      }
      throw error;
    }
    if (step.expenseAllocation) {
      return this.capture("prepare_calculation_allocation_36_percent", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    }
    // Un GET di una pagina gia' salvata ricrea i controlli autocomplete senza
    // il marcatore effimero impostato da APR durante il clic iniziale. Se il
    // valore server e' semanticamente quello atteso (es. "Milano (MI)" per
    // "Milano"), riconoscilo prima della compilazione: un campo disabilitato e
    // gia' persistito non deve essere riaperto ne' riscritto mentre correggiamo
    // un altro campo della stessa pagina.
    await this.markPersistedAutocompleteMatches(client, step.fields);
    let result = await this.fillAndReadStable(client, step.fields);
    const autocompleteMismatch = result.mismatched.some((portalId) => step.fields.some((field) => field.portalId === portalId && field.control === "autocomplete"));
    // La selezione del Comune di residenza puo rimontare il componente React
    // del Comune di nascita. Il testo resta visibile, ma l'oggetto Comune/ISTAT
    // non e piu associato e il portale lo respingerebbe al Salva. Esegui quindi
    // al massimo due passate client-side, selezionando prima la residenza e
    // riconciliando poi soltanto gli autocomplete ancora discordanti. Ogni
    // passata resta pre-Salva e usa esclusivamente la ricerca GET del portale.
    for (let pass = 0; pass < 2; pass += 1) {
      const pendingAutocompleteFields = autocompleteRecoveryOrder(step.fields, result.mismatched);
      if (pendingAutocompleteFields.length === 0) break;
      for (const field of pendingAutocompleteFields) await this.selectAutocompleteWithPhysicalInput(client, field);
      // Se il remount conserva l'etichetta autorevole completa di provincia,
      // ricrea soltanto il marcatore effimero APR: l'oggetto Comune e gia nel
      // modello React e non va selezionato/cliccato una seconda volta.
      await this.markPersistedAutocompleteMatches(client, pendingAutocompleteFields);
      result = await this.readFieldMatches(client, step.fields);
    }
    if (autocompleteMismatch) {
      // La selezione di Comune/Provincia puo' azzerare civico, CAP o altri
      // campi dipendenti. Riconcilia soltanto normali input/testi rimasti
      // discordanti: ripremere qui pulsanti o select React gia' gestiti puo'
      // rimontare il form ENEA e cancellare i Comuni appena scelti.
      const dependentFields = step.fields.filter((field) => result.mismatched.includes(field.portalId) && !["autocomplete", "button", "select"].includes(field.control));
      if (dependentFields.length) {
        await this.fillAndReadStable(client, dependentFields);
        result = await this.readFieldMatches(client, step.fields);
      }
    }
    const selectMismatch = result.mismatched.some((portalId) => step.fields.some((field) => field.portalId === portalId && field.control === "select"));
    for (const field of step.fields.filter((candidate) => candidate.control === "select" && result.mismatched.includes(candidate.portalId))) await this.selectWithKeyboard(client, field);
    if (selectMismatch) {
      result = await this.readFieldMatches(client, step.fields);
      if (result.missing.length || result.mismatched.length) result = await this.fillAndReadStable(client, step.fields);
    }
    if (result.missing.length || result.mismatched.length || result.compiled.length !== step.fields.length) {
      const liveAutocompleteDiagnostics = await client.evaluate(`(()=>{const visible=node=>{if(!(node instanceof HTMLElement))return false;const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const controls=${JSON.stringify(step.fields.filter((field) => field.control === "autocomplete").map((field) => ({ portalId: field.portalId, expected: field.value, qualifier: field.autocompleteQualifier ?? null })))}.map(field=>{const input=document.getElementById(field.portalId);const fiberKey=input&&Object.keys(input).find(key=>key.startsWith("__reactFiber$"));let fiber=fiberKey?input[fiberKey]:null;const fiberChain=[];for(let depth=0;fiber&&depth<20;depth+=1,fiber=fiber.return){const props=fiber.memoizedProps||{};fiberChain.push({depth,tag:typeof fiber.type==="string"?fiber.type:typeof fiber.type==="function"?(fiber.type.name||"function"):String(fiber.tag),propKeys:Object.keys(props).filter(key=>["name","value","onChange","autocompleteFunction","resolveFunction"].includes(key)),propTypes:{onChange:typeof props.onChange,autocompleteFunction:typeof props.autocompleteFunction,resolveFunction:typeof props.resolveFunction}})}return {...field,actual:String(input?.value??""),ariaInvalid:input?.getAttribute("aria-invalid")??null,authoritativeStage:input?.dataset.aprAutocompleteAuthoritativeStage??null,authoritativeDepth:input?.dataset.aprAutocompleteAuthoritativeDepth??null,fiberChain,parentHtml:String(input?.parentElement?.outerHTML||"").slice(0,3000)}});const surfaces=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content,[role="listbox"],.dropdown-menu,.ui-autocomplete')].filter(visible).map(node=>({tag:node.tagName.toLowerCase(),id:node.id||"",className:String(node.className||""),text:String(node.textContent||"").trim().replace(/\s+/g," ").slice(0,1200),html:String(node.outerHTML||"").slice(0,5000)})).slice(0,20);return {controls,surfaces}})()`);
      const evidence = await this.capture("prepare_page_failed_readonly_diagnostic", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "autocomplete-portal-selection-v48", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, missing: result.missing, mismatched: result.mismatched, autocompleteDiagnostics: result.autocompleteDiagnostics, liveAutocompleteDiagnostics, fieldDiagnostics: result.fieldDiagnostics ?? [] }; this.write(state);
      throw new Error(`apr_cdp_enea_field_verification_failed:${[...result.missing, ...result.mismatched].join(",")}`);
    }
    await this.ensureCoBeneficiary(target, client, draftPackage, draftId, pageId, step);
    const saveControl = await client.evaluate<{ ready: boolean; candidateCount: number; disabled: boolean; formValid: boolean; invalidControls: string[] }>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const marker=(${JSON.stringify(step.markerIds)}).map(id=>document.getElementById(id)).find(Boolean);const form=marker?.closest("form")||document.querySelector("form");if(!form)return {ready:false,candidateCount:0,disabled:false,formValid:false,invalidControls:["<form-missing>"]};const candidates=[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva");const control=candidates.length===1?candidates[0]:null;const disabled=Boolean(control?.disabled);const invalidControls=[...form.querySelectorAll("input,select,textarea")].filter(node=>!node.disabled&&!node.validity.valid).map(node=>node.id||node.name||"<unnamed>");const formValid=invalidControls.length===0;return {ready:Boolean(control)&&!disabled&&formValid,candidateCount:candidates.length,disabled,formValid,invalidControls}})()`);
    if (!saveControl.ready) {
      const evidence = await this.capture("prepare_page_save_control_not_ready", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "save-control-readiness-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...saveControl }; this.write(state);
      throw new Error(`apr_cdp_enea_save_control_not_ready:${pageId}:count=${saveControl.candidateCount}:disabled=${saveControl.disabled}:form_valid=${saveControl.formValid}:invalid=${saveControl.invalidControls.join(",")}`);
    }
    return this.capture("prepare_allowlisted_page", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
  }

  async savePage(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence> {
    const step = this.stepFor(draftPackage, pageId); if (!step) throw new Error(`apr_cdp_enea_page_not_allowlisted:${pageId}`);
    const { target, client } = await this.client();
    if (step.expenseAllocation) {
      const allocation = step.expenseAllocation;
      type MutationTrace = { requestId: string; method: string; url: string; postData: string; status: number | null; responseMimeType: string; failed: string; finished: boolean; responseBody: string };
      const mutationTraces = new Map<string, MutationTrace>();
      await client.send("Network.enable");
      const offRequest = client.onEvent<{ requestId: string; request: { method: string; url: string; postData?: string } }>("Network.requestWillBeSent", ({ requestId, request }) => {
        let sameOrigin = false; try { sameOrigin = new URL(request.url).origin === this.allowedOrigin; } catch { /* URL non HTTP */ }
        if (sameOrigin && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) mutationTraces.set(requestId, { requestId, method: request.method.toUpperCase(), url: request.url, postData: request.postData ?? "", status: null, responseMimeType: "", failed: "", finished: false, responseBody: "" });
      });
      const offResponse = client.onEvent<{ requestId: string; response: { status: number; mimeType?: string } }>("Network.responseReceived", ({ requestId, response }) => {
        const trace = mutationTraces.get(requestId); if (trace) { trace.status = response.status; trace.responseMimeType = response.mimeType ?? ""; }
      });
      const offFinished = client.onEvent<{ requestId: string }>("Network.loadingFinished", ({ requestId }) => { const trace = mutationTraces.get(requestId); if (trace) trace.finished = true; });
      const offFailed = client.onEvent<{ requestId: string; errorText?: string }>("Network.loadingFailed", ({ requestId, errorText }) => { const trace = mutationTraces.get(requestId); if (trace) trace.failed = errorText ?? "network_failed"; });
      const clickPoint = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const number=value=>{const compact=String(value??"").replace(/[^0-9,.-]/g,"");if(!compact)return 0;const parsed=Number(compact.includes(",")?compact.replace(/\\./g,"").replace(",","."):compact);return Number.isFinite(parsed)?parsed:null};const expected=${JSON.stringify(allocation.value)};const inputs=[...document.querySelectorAll('input:not([type="hidden"])')].filter(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")&&number(input.value)!==null&&Math.abs(number(input.value)-number(expected))<0.01});if(inputs.length!==1)return null;const input=inputs[0];const scope=input.closest('form,[role="dialog"],.modal-content')||input.parentElement?.parentElement?.parentElement;if(!scope)return null;const candidates=[...scope.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(candidates.length!==1||[...scope.querySelectorAll("input,select,textarea")].some(node=>!node.disabled&&!node.validity.valid))return null;const rect=candidates[0].getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
      if (!clickPoint) throw new Error(`apr_cdp_enea_unique_enabled_save_button_not_found:${pageId}`);
      // Il click CDP reale produce focusout/blur e gli eventi pointer/mouse che
      // il modale ENEA usa per consolidare lo stato React prima del Salva.
      await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clickPoint.x, y: clickPoint.y });
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickPoint.x, y: clickPoint.y, button: "left", clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickPoint.x, y: clickPoint.y, button: "left", clickCount: 1 });
      // Il Salva del modale e asincrono e non cambia route. Ricaricare subito
      // la GET canonica puo interrompere la richiesta ancora in volo. Aspetta
      // quindi la chiusura del modale e la tabella aggiornata, senza navigare.
      let allocationCommitted = false;
      for (let attempt = 0; attempt < 150 && !allocationCommitted; attempt += 1) {
        const modalOpen = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");return [...document.querySelectorAll('input:not([type="hidden"])')].some(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return context.includes("2025-2026")&&context.includes("36%")})})()`);
        const table = await this.calculationAllocationTable(client, allocation);
        allocationCommitted = !modalOpen && table.matched;
        if (!allocationCommitted) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!allocationCommitted) {
        await this.capture("save_calculation_allocation_commit_not_observed", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
        throw new Error(`apr_cdp_enea_calculation_allocation_commit_not_observed:${pageId}`);
      }
      // La tabella React puo' aggiornarsi in modo ottimistico prima che la
      // richiesta asincrona sia conclusa. Una GET immediata cancellava talvolta
      // la richiesta ancora in volo. Mantiene la route ferma, poi ricontrolla la
      // stessa tabella prima di consentire la successiva prova server canonica.
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      const settledAllocation = await this.calculationAllocationTable(client, allocation);
      if (!settledAllocation.matched) {
        await this.capture("save_calculation_allocation_settle_failed", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
        throw new Error(`apr_cdp_enea_calculation_allocation_settle_failed:${pageId}`);
      }
      for (let attempt = 0; attempt < 40 && [...mutationTraces.values()].some((trace) => !trace.finished && !trace.failed); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      for (const trace of mutationTraces.values()) if (trace.finished && trace.status !== null) {
        try { trace.responseBody = (await client.send<{ body: string }>("Network.getResponseBody", { requestId: trace.requestId })).body.slice(0, 2_000); } catch { trace.responseBody = "<unavailable>"; }
      }
      offRequest(); offResponse(); offFinished(); offFailed();
      const sanitized = [...mutationTraces.values()].map((trace) => {
        const relevantFields: Record<string, string> = {};
        try {
          const parsed = JSON.parse(trace.postData) as Record<string, unknown>;
          for (const [key, value] of Object.entries(parsed)) if (/costo|spes|2025|2024|36|50/i.test(key) && ["string", "number", "boolean"].includes(typeof value)) relevantFields[key] = String(value);
        } catch {
          for (const [key, value] of new URLSearchParams(trace.postData)) if (/costo|spes|2025|2024|36|50/i.test(key)) relevantFields[key] = value;
        }
        return { method: trace.method, url: trace.url, postDataSha256: createHash("sha256").update(trace.postData).digest("hex"), postDataLength: trace.postData.length, relevantFields, status: trace.status, responseMimeType: trace.responseMimeType, failed: trace.failed, finished: trace.finished, responseBody: trace.responseBody };
      });
      const networkState = this.load(); networkState.revision += 1; networkState.calculationNetworkDiagnostic = { kind: "calculation-allocation-network-v10", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, traces: sanitized }; this.write(networkState);
      return this.capture("save_page_once", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    }
    if (pageId.startsWith("screening:")) {
      const reactContractExpression = `(()=>{const fields=${JSON.stringify(step.fields)};const normalize=value=>String(value??"").trim().replace(",",".");return fields.every(field=>{const element=document.getElementById(field.portalId);if(!element)return false;const propsKey=Object.keys(element).find(key=>key.startsWith("__reactProps$"));const props=propsKey?element[propsKey]:null;if(field.control==="checkbox"){const expected=field.value==="true";return element instanceof HTMLInputElement&&element.checked===expected&&(!props||props.checked===undefined||Boolean(props.checked)===expected)}const expected=String(field.selectValue??field.value);return normalize(element.value)===normalize(expected)&&(!props||props.value===undefined||normalize(props.value)===normalize(expected))})})()`;
      let reactContractReady = false;
      for (let attempt = 0; attempt < 5 && !reactContractReady; attempt += 1) {
        reactContractReady = await client.evaluate<boolean>(reactContractExpression);
        if (!reactContractReady) {
          const reconciled = await this.fillAndReadStable(client, step.fields);
          if (reconciled.missing.length || reconciled.mismatched.length || reconciled.compiled.length !== step.fields.length) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!reactContractReady) throw new Error(`apr_cdp_enea_screening_react_contract_not_ready:${pageId}`);
    }
    // Re-read every expected value immediately before the irreversible click.
    // This catches a late React remount that may have erased a field after the
    // preparation checkpoint but before Save.
    let preSaveFields = await this.readFieldMatches(client, step.fields);
    if (preSaveFields.missing.length || preSaveFields.mismatched.length || preSaveFields.compiled.length !== step.fields.length) {
      // Some ENEA pages remount their React-controlled form after preparation.
      // Reconcile the same allowlisted values immediately before the unique Save
      // control is invoked.  This is still pre-click and therefore consumes no
      // portal mutation attempt; the values are re-read again below.
      preSaveFields = await this.fillAndReadStable(client, step.fields);
      for (const field of step.fields.filter((candidate) => candidate.control === "autocomplete" && preSaveFields.mismatched.includes(candidate.portalId))) {
        await this.selectAutocompleteWithPhysicalInput(client, field);
      }
      await this.fillAndReadStable(client, step.fields);
      for (const field of step.fields.filter((candidate) => candidate.control === "select" && preSaveFields.mismatched.includes(candidate.portalId))) {
        await this.selectWithKeyboard(client, field);
      }
      preSaveFields = await this.readFieldMatches(client, step.fields);
    }
    if (preSaveFields.missing.length || preSaveFields.mismatched.length || preSaveFields.compiled.length !== step.fields.length) {
      throw new Error(`apr_cdp_enea_pre_save_field_contract_not_ready:${[...preSaveFields.missing, ...preSaveFields.mismatched].join(",")}`);
    }
    // ENEA gestisce il form con React e ignora in alcuni casi requestSubmit() o
    // element.click() sintetici pur lasciando i valori visibili nel DOM. Dopo
    // avere verificato campi, validita' e unicita' del solo pulsante Salva,
    // emetti un singolo clic attendibile tramite il canale Input di Chrome.
    const saveScrolled = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const form=(${JSON.stringify(step.markerIds)}).map(id=>document.getElementById(id)).find(Boolean)?.closest('form')||document.querySelector('form');if(!(form instanceof HTMLFormElement))return false;const candidates=[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(candidates.length!==1||[...form.querySelectorAll("input,select,textarea")].some(node=>!node.disabled&&!node.validity.valid))return false;const label=normalize(candidates[0].textContent||candidates[0].value);if(/anteprima|invia|submit|ricevuta|email/.test(label))throw new Error("forbidden-action");candidates[0].scrollIntoView({block:"center",inline:"center",behavior:"instant"});return true})()`);
    if (!saveScrolled) throw new Error(`apr_cdp_enea_save_not_triggered:${pageId}`);
    // scrollIntoView puo essere soggetto a CSS smooth scrolling. Misura il
    // bersaglio in un secondo tick e accetta il punto solo se elementFromPoint
    // ricade davvero sul controllo Salva (o su un suo figlio).
    await new Promise((resolve) => setTimeout(resolve, 250));
    const savePoint = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const form=(${JSON.stringify(step.markerIds)}).map(id=>document.getElementById(id)).find(Boolean)?.closest('form')||document.querySelector('form');if(!(form instanceof HTMLFormElement))return null;const candidates=[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(candidates.length!==1)return null;const rect=candidates[0].getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;const x=rect.left+rect.width/2,y=rect.top+rect.height/2;const hit=document.elementFromPoint(x,y);return hit&&(hit===candidates[0]||candidates[0].contains(hit))?{x,y}:null})()`);
    if (!savePoint) throw new Error(`apr_cdp_enea_save_not_triggered:${pageId}`);
    type StandardMutationTrace = { requestId: string; method: string; url: string; postData: string; status: number | null; responseMimeType: string; failed: string; finished: boolean };
    const mutationTraces = new Map<string, StandardMutationTrace>();
    await client.send("Network.enable");
    const offRequest = client.onEvent<{ requestId: string; request: { method: string; url: string; postData?: string } }>("Network.requestWillBeSent", ({ requestId, request }) => {
      let sameOrigin = false; try { sameOrigin = new URL(request.url).origin === this.allowedOrigin; } catch { /* URL non HTTP */ }
      if (sameOrigin && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) mutationTraces.set(requestId, { requestId, method: request.method.toUpperCase(), url: request.url, postData: request.postData ?? "", status: null, responseMimeType: "", failed: "", finished: false });
    });
    const offResponse = client.onEvent<{ requestId: string; response: { status: number; mimeType?: string } }>("Network.responseReceived", ({ requestId, response }) => {
      const trace = mutationTraces.get(requestId); if (trace) { trace.status = response.status; trace.responseMimeType = response.mimeType ?? ""; }
    });
    const offFinished = client.onEvent<{ requestId: string }>("Network.loadingFinished", ({ requestId }) => { const trace = mutationTraces.get(requestId); if (trace) trace.finished = true; });
    const offFailed = client.onEvent<{ requestId: string; errorText?: string }>("Network.loadingFailed", ({ requestId, errorText }) => { const trace = mutationTraces.get(requestId); if (trace) trace.failed = errorText ?? "network_failed"; });
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: savePoint.x, y: savePoint.y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: savePoint.x, y: savePoint.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: savePoint.x, y: savePoint.y, button: "left", clickCount: 1 });
    // Do not run one long Runtime.evaluate across a React navigation. It can be
    // invalidated by the new execution context and previously produced a false
    // timeout. Give the request a bounded window; the worker immediately follows
    // with the canonical read-only GET verification before marking the page saved.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (mutationTraces.size > 0 && [...mutationTraces.values()].every((trace) => trace.finished || Boolean(trace.failed))) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Chrome can occasionally acknowledge the physical pointer sequence while
    // the React button receives no click at all (no request, no navigation and
    // the same form remains mounted).  In that strictly observable pre-mutation
    // state, deliver the *same* Save intent once through a trusted keyboard
    // activation.  This is not a second portal save attempt: the first delivery
    // produced no request and therefore could not have mutated server state.
    // Keeping this inside the already journaled save intent prevents a new
    // checkpoint attempt and makes the fallback auditable in the diagnostic.
    let deliveryFallback: "none" | "trusted_enter_after_no_mutation" | "trusted_enter_then_react_click_after_no_mutation" = "none";
    if (mutationTraces.size === 0) {
      const stillOnSourceForm = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const form=(${JSON.stringify(step.markerIds)}).map(id=>document.getElementById(id)).find(Boolean)?.closest('form')||document.querySelector('form');if(!(form instanceof HTMLFormElement))return false;const candidates=[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(candidates.length!==1)return false;const invalid=[...form.querySelectorAll("input,select,textarea")].some(node=>!node.disabled&&(!node.validity.valid||node.getAttribute("aria-invalid")==="true"));if(invalid)return false;candidates[0].focus({preventScroll:true});return document.activeElement===candidates[0]})()`);
      if (stillOnSourceForm) {
        deliveryFallback = "trusted_enter_after_no_mutation";
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (mutationTraces.size > 0 && [...mutationTraces.values()].every((trace) => trace.finished || Boolean(trace.failed))) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (mutationTraces.size === 0) {
          const reactClickDelivered = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const form=(${JSON.stringify(step.markerIds)}).map(id=>document.getElementById(id)).find(Boolean)?.closest('form')||document.querySelector('form');if(!(form instanceof HTMLFormElement))return false;const candidates=[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva"&&!node.disabled);if(candidates.length!==1)return false;const invalid=[...form.querySelectorAll("input,select,textarea")].some(node=>!node.disabled&&(!node.validity.valid||node.getAttribute("aria-invalid")==="true"));if(invalid)return false;candidates[0].click();return true})()`);
          if (reactClickDelivered) {
            deliveryFallback = "trusted_enter_then_react_click_after_no_mutation";
            for (let attempt = 0; attempt < 50; attempt += 1) {
              if (mutationTraces.size > 0 && [...mutationTraces.values()].every((trace) => trace.finished || Boolean(trace.failed))) break;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
        }
      }
    }
    const postClick = await client.evaluate<{ urlPath: string; invalidControlIds: string[]; alerts: string[]; modalOpen: boolean; markerFields: Array<{ id: string; value: string; checked: boolean; valid: boolean; ariaInvalid: string | null; reactValue: string | null; reactChecked: boolean | null }>; tables: Array<{ headers: string[]; rows: string[][] }>; saveButtons: Array<{ label: string; disabled: boolean }> }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const markerIds=${JSON.stringify(step.markerIds)};const markerFields=markerIds.map(id=>document.getElementById(id)).filter(Boolean).map(node=>{const propsKey=Object.keys(node).find(key=>key.startsWith("__reactProps$"));const props=propsKey?node[propsKey]:null;return {id:node.id,value:String(node.value??""),checked:Boolean(node.checked),valid:Boolean(node.validity?.valid??true),ariaInvalid:node.getAttribute("aria-invalid"),reactValue:props?.value===undefined?null:String(props.value),reactChecked:props?.checked===undefined?null:Boolean(props.checked)}});const modalOpen=markerFields.length>0;const tables=[...document.querySelectorAll("table")].map(table=>({headers:[...table.querySelectorAll("th")].map(cell=>clean(cell.textContent)),rows:[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent)))}));const saveButtons=[...document.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>clean(node.textContent||node.value).toLocaleLowerCase("it")==="salva").map(node=>({label:clean(node.textContent||node.value),disabled:Boolean(node.disabled)}));return {urlPath:location.pathname,invalidControlIds:[...document.querySelectorAll('input,select,textarea')].filter(node=>!node.disabled&&(!node.validity.valid||node.getAttribute('aria-invalid')==='true')).map(node=>node.id||node.name||'<unnamed>').slice(0,50),alerts:[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].map(node=>clean(node.textContent)).filter(Boolean).slice(0,40),modalOpen,markerFields,tables,saveButtons}})()`);
    offRequest(); offResponse(); offFinished(); offFailed();
    const saveEvidence = await this.capture("save_page_once", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const traces = [...mutationTraces.values()].map((trace) => {
      let urlPath = "<invalid>"; try { urlPath = new URL(trace.url).pathname; } catch { /* URL non HTTP */ }
      const fieldNames = (() => {
        try { return Object.keys(JSON.parse(trace.postData) as Record<string, unknown>).sort(); }
        catch { return [...new URLSearchParams(trace.postData).keys()].sort(); }
      })();
      return { method: trace.method, urlPath, postDataSha256: createHash("sha256").update(trace.postData).digest("hex"), postDataLength: trace.postData.length, fieldNames, status: trace.status, responseMimeType: trace.responseMimeType, failed: trace.failed, finished: trace.finished };
    });
    const diagnosticState = this.load(); diagnosticState.revision += 1; const saveDiagnostic = { kind: "standard-page-save-network-v3", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: saveEvidence.evidenceId, deliveryFallback, traces, postClick }; diagnosticState.pagePreparationDiagnostic = saveDiagnostic; diagnosticState.pageSaveDiagnostics = [...diagnosticState.pageSaveDiagnostics, saveDiagnostic].slice(-200); this.write(diagnosticState);
    return saveEvidence;
  }

  async verifyPageSaved(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null> {
    const step = this.stepFor(draftPackage, pageId); if (!step) return null;
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId); if (!mapping) return null;
    const { target, client } = await this.client();
    if (step.expenseAllocation) {
      const url = `${this.allowedOrigin}/pratica/ecobonus/2026/calcolo/${draftId}`;
      await client.navigate(url);
      await this.waitForStable(client);
      let result = await this.calculationAllocationTable(client, step.expenseAllocation);
      for (let attempt = 0; attempt < 100 && !result.matched; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        result = await this.calculationAllocationTable(client, step.expenseAllocation);
      }
      if (!result.matched) {
        const evidence = await this.capture("verify_calculation_allocation_failed_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
        const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "calculation-allocation-36-percent-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...result }; this.write(state);
        return null;
      }
      return this.capture("verify_page_saved_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    }
    if (pageId.startsWith("screening:")) {
      const infissi = draftPackage.module === "infissi";
      const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${infissi ? "serramenti" : "schermature"}/${draftId}`;
      if (await client.evaluate<string>("location.href") !== hostUrl) { await client.navigate(hostUrl); await this.waitForStable(client); }
      if (infissi) {
        const expectedRows = draftPackage.workflow.screeningSteps.slice(0, Number(pageId.slice("screening:".length))).map((candidate) => candidate.fields);
        const inspectInfissiRow = () => client.evaluate<{ matched: boolean; rowCount: number; visibleRowCount: number; paginationTotal: number | null; matchingVisibleRows: number; expectedOccurrence: number; rows: string[][]; paginationText: string[] }>(`(()=>{const fields=${JSON.stringify(step.fields)};const expectedRows=${JSON.stringify(expectedRows)};const ordinal=${Number(pageId.slice(10))};const clean=value=>String(value??"").trim().replace(/\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const parsed=Number(String(value??"").replace(/[^0-9,.-]/g,"").replace(",","."));return Number.isFinite(parsed)?parsed:null};const columns={"id-f_pre":0,"id-v_pre":1,"id-u_pre":2,"id-sup":3,"id-f_post":4,"id-v_post":5,"id-u_post":6,"id-conf":7,"id-osc":8};const sameExpected=(left,right)=>left.length===right.length&&left.every(field=>{const other=right.find(candidate=>candidate.portalId===field.portalId);return Boolean(other)&&field.control===other.control&&String(field.selectValue??field.value)===String(other.selectValue??other.value)});const rowMatches=(row,wanted)=>Boolean(row)&&wanted.every(field=>{const column=columns[field.portalId];if(column===undefined)return false;const actual=row[column]??"";if(field.control==="checkbox"){const expected=field.value==="true";return expected?/^(si|sì|true|1|x)$/i.test(actual):/^(no|false|0|-|)$/i.test(actual)}const actualNumber=number(actual),expectedNumber=number(field.value);if(actualNumber!==null&&expectedNumber!==null)return Math.abs(actualNumber-expectedNumber)<0.011;return normalize(actual)===normalize(field.value)||normalize(actual).includes(normalize(field.value))||normalize(field.value).includes(normalize(actual))});const tables=[...document.querySelectorAll("table")];const table=tables.find(candidate=>[...candidate.querySelectorAll("tr")].some(row=>row.querySelectorAll("td").length>=9))||null;const rows=(table?[...table.querySelectorAll("tr")]:[]).map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.length>=9);const scope=table?.closest('.dataTables_wrapper,[class*="table" i]')||table?.parentElement||document;const paginationNodes=[...scope.querySelectorAll('.dataTables_info,[id$="_info"],[class*="pagin" i],[aria-label*="pagina" i],[aria-label*="page" i],.MuiTablePagination-root')];const paginationText=[...new Set(paginationNodes.map(node=>clean(node.textContent||node.getAttribute("aria-label"))).filter(Boolean))];const totals=paginationText.flatMap(text=>[...text.matchAll(/(?:di|of)\s*(\d+)/gi)].map(match=>Number(match[1]))).filter(Number.isFinite);const paginationTotal=totals.length?Math.max(...totals):null;const matchingVisibleRows=rows.filter(row=>rowMatches(row,fields)).length;const expectedOccurrence=expectedRows.filter(row=>sameExpected(row,fields)).length;const total=paginationTotal??rows.length;const matched=total>=ordinal&&(matchingVisibleRows>=expectedOccurrence||paginationTotal!==null);return {matched,rowCount:total,visibleRowCount:rows.length,paginationTotal,matchingVisibleRows,expectedOccurrence,rows,paginationText}})()`);
        let result = await inspectInfissiRow();
        for (let attempt = 0; attempt < 120 && !result.matched; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          result = await inspectInfissiRow();
        }
        if (!result.matched) {
          const evidence = await this.capture("verify_infissi_row_failed_readonly_diagnostic", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
          const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "infissi-row-post-save-readonly-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...result }; this.write(state);
          return null;
        }
        return this.capture("verify_infissi_row_staged_page_state", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      }
      const inspect = () => client.evaluate<{ staged: boolean; rowCount: number; rows: string[][]; modalOpen: boolean; saveControls: Array<{ label: string; disabled: boolean }>; invalidControls: string[]; alerts: string[]; text: string }>(`(()=>{const fields=${JSON.stringify(step.fields)};const index=${Number(pageId.slice(10)) - 1};const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const parsed=Number(String(value??"").replace(/[^0-9,.-]/g,"").replace(",","."));return Number.isFinite(parsed)?parsed:null};const baseColumns={"id-tipo":0,"id-inst":1,"id-sup_s":2,"id-sup_f":3,"id-rsup":4,"id-esp":5,"id-calc":6,"id-gtot":7,"id-mat":8,"id-mec":9};const rowNodes=[...document.querySelectorAll("tr")].filter(row=>row.querySelectorAll("td").length>=10);const rows=rowNodes.map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent)));const row=rows[index];const expectedType=fields.find(field=>field.portalId==="id-tipo")?.value??"";const offset=row&&normalize(row[0])!==normalize(expectedType)&&normalize(row[1])===normalize(expectedType)?1:0;const staged=Boolean(row)&&fields.every(field=>{const base=baseColumns[field.portalId];if(base===undefined)return false;const actual=row[base+offset]??"",wanted=field.value;const wantedNumber=number(wanted),actualNumber=number(actual);if(wantedNumber!==null&&actualNumber!==null)return Math.abs(wantedNumber-actualNumber)<0.001;return normalize(actual)===normalize(wanted)||normalize(actual).includes(normalize(wanted))||normalize(wanted).includes(normalize(actual))});const modalOpen=fields.some(field=>Boolean(document.getElementById(field.portalId)));const form=fields.map(field=>document.getElementById(field.portalId)).find(Boolean)?.closest("form")||null;const saveControls=form?[...form.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva").map(node=>({label:clean(node.textContent||node.value),disabled:Boolean(node.disabled)})):[];const invalidControls=form?[...form.querySelectorAll("input,select,textarea")].filter(node=>!node.disabled&&!node.validity.valid).map(node=>node.id||node.name||"<unnamed>"):[];const alerts=[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].map(node=>clean(node.textContent)).filter(Boolean).slice(0,40);return {staged,rowCount:rows.length,rows,modalOpen,saveControls,invalidControls,alerts,text:clean(document.body?.innerText).slice(-4000)}})()`);
      let result = await inspect();
      for (let attempt = 0; attempt < 120 && !result.staged; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        result = await inspect();
      }
      if (!result.staged) {
        const evidence = await this.capture("verify_screening_post_save_failed_readonly_diagnostic", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
        const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "screening-post-save-readonly-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...result }; this.write(state);
        return null;
      }
      return this.capture("verify_screening_staged_page_state", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    }
    if (step.hostRoute && step.activationLabel) {
      const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`;
      if (await client.evaluate<string>("location.href") !== hostUrl) { await client.navigate(hostUrl); await this.waitForStable(client); }
      const activationLabels = eneaGeneratorActivationLabels(step.activationLabel);
      const staged = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const numbers=value=>[...String(value??"").matchAll(/-?\\d+(?:[.,]\\d+)?/g)].map(match=>Number(match[0].replace(",","."))).filter(Number.isFinite);const current=new URL(location.href);if(current.pathname!==${JSON.stringify(`/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`)})return false;const wanted=${JSON.stringify(activationLabels)}.map(normalize);const row=[...document.querySelectorAll("tr")].find(candidate=>{const first=normalize(candidate.querySelector("th,td")?.textContent);return wanted.some(label=>first===label||first.includes(label)||label.includes(first))});if(!row)return false;const remaining=numbers([...row.querySelectorAll("th,td")].map(cell=>cell.textContent||"").join(" | "));const expected=${JSON.stringify(step.fields)};return expected.every(field=>{const expectedNumbers=numbers(field.value);if(expectedNumbers.length===0)return normalize(row.textContent).includes(normalize(field.value));return expectedNumbers.every(value=>{const index=remaining.findIndex(candidate=>Math.abs(candidate-value)<0.001);if(index<0)return false;remaining.splice(index,1);return true})})})()`);
      if (staged) return this.capture("verify_generator_staged_page_state", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      // Dopo un Salva incerto il generatore annidato non viene riaperto: la
      // tabella caricata con GET è l'unica prova ammessa.
      return null;
    }
    const currentUrl = safeUrl(await client.evaluate<string>("location.href"), this.allowedOrigin);
    const parsedCurrentUrl = new URL(currentUrl);
    const currentRoute = parsedCurrentUrl.pathname.match(new RegExp(`^/pratica/ecobonus/2026/([^/]+)/${draftId}$`))?.[1] ?? null;
    const sourceRouteByPage = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Serramenti e infissi", "serramenti"], ["page:Calcolo costi e detrazioni", "calcolo"]]);
    const sourceRoute = sourceRouteByPage.get(pageId) ?? null;
    if (currentRoute && sourceRoute && currentRoute !== sourceRoute && !/(?:anteprima|invia|submit|ricevuta|email|elimina|cancella|errore|error)/i.test(currentRoute)) {
      return this.capture("verify_page_saved_server_redirect", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    }
    await client.navigate(step.hostRoute ? `${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}` : mapping.url);
    try { await this.openPage(client, draftId, pageId, step, draftPackage.module); } catch { return null; }
    // The GET response can mount the form before React hydrates saved values.
    // Poll from Node with short, independent read-only evaluations: a remount
    // cannot strand one Runtime.evaluate until timeout and no second Save is
    // emitted while waiting.
    const persistedFields = await pollPersistedPageFieldsReadOnly(
      async () => { await this.markPersistedAutocompleteMatches(client, step.fields); return this.readFieldMatches(client, step.fields); },
      step.fields.length,
    );
    if (persistedFields.missing.length || persistedFields.mismatched.length || persistedFields.compiled.length !== step.fields.length) return null;
    if (step.coBeneficiary) {
      const rows = await client.evaluate<string[][]>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");return [...document.querySelectorAll("table")].filter(table=>{const header=clean(table.querySelector("thead")?.textContent||table.querySelector("tr")?.textContent);return /nome/i.test(header)&&/cognome/i.test(header)&&/codice fiscale/i.test(header)}).flatMap(table=>[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("th,td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.some(cell=>/[A-Z0-9]{16}/i.test(cell))))})()`);
      if (classifyCoBeneficiaryRows(rows, step.coBeneficiary.taxCode).status !== "present") return null;
    }
    return this.capture("verify_page_saved_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
  }

  async verifyNestedPageSavedCanonicalReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaDriverEvidence | null> {
    if (!pageId.startsWith("screening:") && !/Generatore/.test(pageId)) throw new Error(`apr_cdp_enea_nested_canonical_verification_not_allowlisted:${pageId}`);
    const { client } = await this.client();
    const route = pageId.startsWith("screening:")
      ? draftPackage.module === "infissi" ? "serramenti" : "schermature"
      : "impianto_esistente";
    await client.navigate(`${this.allowedOrigin}/pratica/ecobonus/2026/${route}/${draftId}`);
    await this.waitForStable(client);
    return this.verifyPageSaved(draftPackage, draftId, pageId);
  }

  async inspectPersistedPageValuesReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId); if (!step) throw new Error(`apr_cdp_enea_page_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId); if (!mapping) throw new Error("apr_cdp_enea_mapping_missing");
    const { target, client } = await this.client();
    if (draftPackage.module === "infissi" && pageId.startsWith("screening:")) {
      const url = `${this.allowedOrigin}/pratica/ecobonus/2026/serramenti/${draftId}`;
      await client.navigate(url);
      await this.waitForStable(client);
      type InfissiRowRead = { fields: Array<{ portalId: string; control: string; expected: string; actual: string; matches: boolean; tag: string; disabled: boolean; options: Array<{ value: string; text: string }> }>; rowCount: number; surfaceReady: boolean };
      const read = () => client.evaluate<InfissiRowRead>(`(()=>{const expected=${JSON.stringify(step.fields)};const index=${Number(pageId.slice(10)) - 1};const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const number=value=>{const parsed=Number(String(value??"").replace(/[^0-9,.-]/g,"").replace(",","."));return Number.isFinite(parsed)?parsed:null};const columns={"id-f_pre":0,"id-v_pre":1,"id-u_pre":2,"id-sup":3,"id-f_post":4,"id-v_post":5,"id-u_post":6,"id-conf":7,"id-osc":8};const rows=[...document.querySelectorAll("tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.length>=9);const row=rows[index];const fields=expected.map(field=>{const column=columns[field.portalId];const actual=row&&column!==undefined?row[column]:"<missing>";let matches=false;if(actual!=="<missing>"){if(field.control==="checkbox"){const wanted=field.value==="true";matches=wanted?/^(si|sì|true|1|x)$/i.test(actual):/^(no|false|0|-|)$/i.test(actual)}else{const a=number(actual),w=number(field.value);matches=a!==null&&w!==null?Math.abs(a-w)<0.011:normalize(actual)===normalize(field.value)||normalize(actual).includes(normalize(field.value))||normalize(field.value).includes(normalize(actual))}}return {portalId:field.portalId,control:field.control,expected:field.value,actual,matches,tag:"table-cell",disabled:false,options:[]}});return {fields,rowCount:rows.length,surfaceReady:Boolean(document.querySelector("table"))&&/serramenti|infissi/i.test(document.body?.innerText||"")}})()`);
      let result = await read();
      const ordinal = Number(pageId.slice("screening:".length));
      for (let attempt = 0; attempt < 120 && (!result.surfaceReady || result.rowCount < ordinal - 1); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        result = await read();
      }
      const rowOutcome = infissiRowPersistenceSurfaceOutcome(pageId, result.rowCount, result.surfaceReady);
      const fields = rowOutcome === "absent"
        ? result.fields.map((field) => field.actual === "<missing>" ? { ...field, actual: "", tag: "table-row-absent" } : field)
        : result.fields;
      const surface = { forms: [], controls: [], text: `Serramenti e infissi: riga ${ordinal}; righe server=${result.rowCount}; superficie=${result.surfaceReady}; esito=${rowOutcome}.` };
      const evidence = await this.capture("inspect_persisted_infissi_row_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      const state = this.load(); state.revision += 1; state.pageDiagnostic = { observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, contractRevision: "infissi-row-table-v1", fields, surface, evidenceId: evidence.evidenceId }; state.pageDiagnostics = state.pageDiagnostics.filter((item) => !(item.customerKey === draftPackage.customerKey && item.draftId === draftId && item.pageId === pageId)); state.pageDiagnostics.push(state.pageDiagnostic); this.write(state);
      return state.pageDiagnostic;
    }
    if (step.expenseAllocation) {
      const diagnosticUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/calcolo/${draftId}`;
      await client.navigate(diagnosticUrl);
      await this.waitForStable(client);
      let allocation = await this.calculationAllocationTable(client, step.expenseAllocation);
      // document.readyState non implica che la tabella React abbia concluso la
      // propria GET.  La vecchia lettura classificava tre celle <missing> come
      // prova di mancata persistenza e poteva autorizzare un retry spurio.
      for (let attempt = 0; attempt < 120 && !allocation.interventionRow; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        allocation = await this.calculationAllocationTable(client, step.expenseAllocation);
      }
      const expected = step.expenseAllocation.value;
      const fields = [
        { portalId: "semantic:calculation:2025-2026:50", control: "input", expected: "0", actual: String(allocation.observed50 ?? "<missing>"), matches: allocation.observed50 === 0, tag: "table-cell", disabled: false, options: [] },
        { portalId: "semantic:calculation:2025-2026:36", control: "input", expected, actual: String(allocation.observed36 ?? "<missing>"), matches: allocation.observed36 !== null && tableNumber(expected) !== null && Math.abs(allocation.observed36 - tableNumber(expected)!) < 0.01, tag: "table-cell", disabled: false, options: [] },
        { portalId: "semantic:calculation:total", control: "input", expected, actual: String(allocation.observedTotal ?? "<missing>"), matches: allocation.observedTotal !== null && tableNumber(expected) !== null && Math.abs(allocation.observedTotal - tableNumber(expected)!) < 0.01, tag: "table-cell", disabled: false, options: [] },
      ];
      const surface = { forms: [], controls: [], text: `Allocazione 36%: ${allocation.reason}; riga=${allocation.interventionRow?.join(" | ") ?? "assente"}` };
      const evidence = await this.capture("inspect_persisted_page_values_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
      const state = this.load(); state.revision += 1; state.pageDiagnostic = { observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, contractRevision: "calculation-allocation-36-percent-v1", fields, surface, evidenceId: evidence.evidenceId }; state.pageDiagnostics = state.pageDiagnostics.filter((item) => !(item.customerKey === draftPackage.customerKey && item.draftId === draftId && item.pageId === pageId)); state.pageDiagnostics.push(state.pageDiagnostic); this.write(state);
      return state.pageDiagnostic;
    }
    const sourceRouteByPage = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Serramenti e infissi", "serramenti"], ["page:Calcolo costi e detrazioni", "calcolo"]]);
    const sourceRoute = step.hostRoute ?? sourceRouteByPage.get(pageId);
    const diagnosticUrl = sourceRoute ? `${this.allowedOrigin}/pratica/ecobonus/2026/${sourceRoute}/${draftId}` : mapping.url;
    await client.navigate(diagnosticUrl);
    await this.waitForStable(client);
    const directMarkersPresent = await client.evaluate<boolean>(`(async()=>{const ids=${JSON.stringify(step.markerIds)};const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));for(let attempt=0;attempt<150;attempt+=1){if(ids.every(id=>document.getElementById(id)))return true;await wait(100)}return false})()`, true, 20_000);
    if (!directMarkersPresent) await this.openPage(client, draftId, pageId, step, draftPackage.module);
    const fields = await client.evaluate<Array<{ portalId: string; control: string; expected: string; actual: string; matches: boolean; tag: string; disabled: boolean; options: Array<{ value: string; text: string }> }>>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");return ${JSON.stringify(step.fields)}.map(field=>{const element=document.getElementById(field.portalId);if(!element)return {portalId:field.portalId,control:field.control,expected:field.value,actual:"<missing>",matches:false,tag:"missing",disabled:false,options:[]};const tag=element.tagName.toLocaleLowerCase("it"),disabled=Boolean(element.disabled),options=element instanceof HTMLSelectElement?[...element.options].map(option=>({value:String(option.value??""),text:String(option.text??"")})):[];if(field.control==="button")return {portalId:field.portalId,control:field.control,expected:field.value,actual:disabled?"disabled":"enabled",matches:!disabled,tag,disabled,options};const actual=field.control==="select"?(element.options[element.selectedIndex]?.text||element.value):element.value;const observed=normalize(actual),wanted=normalize(field.value),matches=(field.control==="select"&&field.selectValue&&element.value===field.selectValue)||observed===wanted||(field.control==="autocomplete"&&observed.startsWith(wanted+" ("));return {portalId:field.portalId,control:field.control,expected:field.value,actual:String(actual??""),matches:Boolean(matches),tag,disabled,options}})})()`);
    if (step.coBeneficiary) {
      const rows = await client.evaluate<string[][]>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");return [...document.querySelectorAll("table")].filter(table=>{const header=clean(table.querySelector("thead")?.textContent||table.querySelector("tr")?.textContent);return /nome/i.test(header)&&/cognome/i.test(header)&&/codice fiscale/i.test(header)}).flatMap(table=>[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("th,td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.some(cell=>/[A-Z0-9]{16}/i.test(cell))))})()`);
      const coBeneficiary = classifyCoBeneficiaryRows(rows, step.coBeneficiary.taxCode);
      fields.push({ portalId: "semantic:beneficiary:co-beneficiary-tax-code", control: "input", expected: step.coBeneficiary.taxCode, actual: coBeneficiary.status === "present" ? step.coBeneficiary.taxCode : coBeneficiary.conflictingFiscalCodes.join(","), matches: coBeneficiary.status === "present", tag: coBeneficiary.status === "present" ? "table-row" : "table-row-absent", disabled: false, options: [] });
    }
    for (const field of fields.filter((item) => item.control === "autocomplete")) field.matches = autocompleteLabelsMatch(field.actual, field.expected);
    const surface = await client.evaluate<{ forms: Array<{ id: string; method: string; action: string }>; controls: Array<{ id: string; name: string; tag: string; type: string; value: string; text: string; label: string; checked: boolean; disabled: boolean; required: boolean; options: Array<{ value: string; text: string }> }>; text: string }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const controls=[...document.querySelectorAll('input,select,textarea,button')].slice(0,200).map(element=>({id:element.id||"",name:element.name||"",tag:element.tagName.toLowerCase(),type:String(element.type||"").toLowerCase(),value:String(element.value??""),text:clean(element.textContent),label:clean(element.labels?.[0]?.textContent||element.getAttribute('aria-label')||element.getAttribute('placeholder')),checked:Boolean(element.checked),disabled:Boolean(element.disabled),required:Boolean(element.required),options:element instanceof HTMLSelectElement?[...element.options].map(option=>({value:String(option.value??""),text:clean(option.text)})):[]}));return {forms:[...document.forms].slice(0,20).map(form=>({id:form.id||"",method:(form.method||"get").toLowerCase(),action:form.action||""})),controls,text:(document.body?.innerText||"").slice(0,6000)}})()`);
    const autocompleteStructure = await client.evaluate<{ autocompleteStructures: unknown[]; scripts: string[] }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const ids=${JSON.stringify(step.fields.filter((field) => field.control === "autocomplete").map((field) => field.portalId))};return {autocompleteStructures:ids.map(portalId=>{const element=document.getElementById(portalId);const parent=element?.parentElement;const scope=parent?.parentElement||parent;return {portalId,elementClass:String(element?.className||""),parentHtml:String(parent?.outerHTML||"").slice(0,4000),siblingHtml:String(element?.nextElementSibling?.outerHTML||"").slice(0,4000),listCandidates:[...(scope?.querySelectorAll('ul,li,[role="listbox"],[role="option"],[class*="auto" i],[id*="auto" i]')||[])].slice(0,80).map(node=>({tag:node.tagName.toLowerCase(),id:node.id||"",className:String(node.className||""),text:clean(node.textContent).slice(0,300)}))}}),scripts:[...document.scripts].map(script=>script.src||clean(script.textContent).slice(0,500)).filter(Boolean).slice(0,100)}})()`);
    Object.assign(surface, autocompleteStructure);
    const evidence = await this.capture("inspect_persisted_page_values_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pageDiagnostic = { observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, contractRevision: PAGE_DIAGNOSTIC_CONTRACT_REVISION, fields, surface, evidenceId: evidence.evidenceId }; state.pageDiagnostics = state.pageDiagnostics.filter((item) => !(item.customerKey === draftPackage.customerKey && item.draftId === draftId && item.pageId === pageId)); state.pageDiagnostics.push(state.pageDiagnostic); this.write(state);
    return state.pageDiagnostic;
  }

  async inspectPreparedStandardPageSaveControlReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (!step || step.expenseAllocation || pageId.startsWith("screening:")) throw new Error(`apr_cdp_enea_standard_save_diagnostic_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId);
    if (!mapping) throw new Error(`apr_cdp_enea_mapping_missing:${draftId}`);
    const { target, client } = await this.client();
    const diagnostic = await client.evaluate<{
      urlPath: string;
      fieldCount: number;
      fields: Array<{ portalId: string; domMatches: boolean; reactValuePresent: boolean; reactMatches: boolean; trackerMatches: boolean; valid: boolean; ariaInvalid: boolean }>;
      form: { present: boolean; method: string; actionPath: string; reactPropKeys: string[]; hasReactSubmit: boolean };
      saves: Array<{ tag: string; type: string; disabled: boolean; visible: boolean; insideExpectedForm: boolean; pointHitsControl: boolean; hitTag: string; hitId: string; reactPropKeys: string[]; hasReactClick: boolean }>;
    }>(`(()=>{
      const expected=${JSON.stringify(step.fields)};
      const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");
      const props=node=>{const key=Object.keys(node||{}).find(item=>item.startsWith("__reactProps$"));return key?node[key]:null};
      const firstMarker=expected.map(field=>document.getElementById(field.portalId)).find(Boolean);
      const form=firstMarker?.closest("form")||document.querySelector("form");
      const fields=expected.map(field=>{const element=document.getElementById(field.portalId);const react=props(element);const actual=field.control==="select"&&element instanceof HTMLSelectElement?(element.options[element.selectedIndex]?.text||element.value):element?.value;const wanted=field.control==="select"&&field.selectValue?field.selectValue:field.value;const domMatches=field.control==="select"&&field.selectValue?element?.value===field.selectValue:normalize(actual)===normalize(field.value)||(field.control==="autocomplete"&&normalize(actual).startsWith(normalize(field.value)+" ("));const reactValuePresent=Boolean(react&&Object.prototype.hasOwnProperty.call(react,"value"));const reactMatches=!reactValuePresent||normalize(react.value)===normalize(wanted)||normalize(react.value)===normalize(field.value);const tracker=element?._valueTracker?.getValue?.();return {portalId:field.portalId,domMatches:Boolean(domMatches),reactValuePresent,reactMatches:Boolean(reactMatches),trackerMatches:tracker===undefined||normalize(tracker)===normalize(element?.value),valid:Boolean(element?.validity?.valid??false),ariaInvalid:element?.getAttribute("aria-invalid")==="true"}});
      const saveNodes=[...document.querySelectorAll('button,input[type="submit"],input[type="button"]')].filter(node=>normalize(node.textContent||node.value)==="salva");
      const saves=saveNodes.map(node=>{const rect=node.getBoundingClientRect();const x=rect.left+rect.width/2,y=rect.top+rect.height/2;const hit=rect.width>0&&rect.height>0?document.elementFromPoint(x,y):null;const react=props(node);return {tag:node.tagName.toLocaleLowerCase(),type:String(node.type||""),disabled:Boolean(node.disabled),visible:rect.width>0&&rect.height>0,insideExpectedForm:Boolean(form&&form.contains(node)),pointHitsControl:Boolean(hit&&(hit===node||node.contains(hit))),hitTag:hit?.tagName?.toLocaleLowerCase()||"",hitId:hit?.id||"",reactPropKeys:react?Object.keys(react).sort():[],hasReactClick:typeof react?.onClick==="function"}});
      const formProps=props(form);let actionPath="";try{actionPath=form?new URL(form.action,location.href).pathname:""}catch{/* invalid action */}
      return {urlPath:location.pathname,fieldCount:fields.length,fields,form:{present:Boolean(form),method:String(form?.method||"").toUpperCase(),actionPath,reactPropKeys:formProps?Object.keys(formProps).sort():[],hasReactSubmit:typeof formProps?.onSubmit==="function"},saves};
    })()`);
    const evidence = await this.capture("inspect_standard_page_save_control_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "standard-page-save-control-readonly-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...diagnostic }; this.write(state);
    return state.pagePreparationDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string };
  }

  async probePageSaveReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string): Promise<AprEneaPageSaveProbeEvidence[]> {
    const before = this.load();
    const saveEvent = [...before.events].reverse().find((event) => event.action === "save_page_once" && event.customerKey === draftPackage.customerKey && event.draftId === draftId && event.pageId === pageId) ?? null;
    const sourceRoute = new Map<string, string>([["page:Beneficiario", "beneficiario"], ["page:Anagrafica Beneficiario", "beneficiario"], ["page:Immobile", "immobile"], ["page:Intervento", "intervento"], ["page:Impianto termico esistente", "impianto_esistente"], ["page:Schermature solari", "schermature"], ["page:Calcolo costi e detrazioni", "calcolo"]]).get(pageId) ?? null;
    const observedRoute = saveEvent ? new URL(saveEvent.url).pathname.match(new RegExp(`^/pratica/ecobonus/2026/([^/]+)/${draftId}$`))?.[1] ?? null : null;
    const redirectSaved = Boolean(saveEvent && sourceRoute && observedRoute && observedRoute !== sourceRoute && !/(?:anteprima|invia|submit|ricevuta|email|elimina|cancella|errore|error)/i.test(observedRoute));
    const diagnostic = await this.inspectPersistedPageValuesReadOnly(draftPackage, draftId, pageId);
    const matched = diagnostic.fields.filter((field) => field.matches).length;
    const persistedOutcome = classifyPersistedPageFieldsReadOnly(diagnostic.fields);
    const modificationMatch = diagnostic.surface?.text.match(/Ultima modifica:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+(CEST|CET)/i) ?? null;
    const modificationAt = modificationMatch ? Date.parse(`${modificationMatch[1]}T${modificationMatch[2].padStart(8, "0")}${modificationMatch[3].toUpperCase() === "CEST" ? "+02:00" : "+01:00"}`) : Number.NaN;
    const saveAt = saveEvent ? Date.parse(saveEvent.at) : Number.NaN;
    const metadataSaved = Number.isFinite(modificationAt) && Number.isFinite(saveAt) && modificationAt >= saveAt - 2_000;
    const { target, client } = await this.client();
    const metadataEvidence = await this.capture("probe_page_save_server_metadata_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    return [
      { method: "server_redirect", outcome: redirectSaved ? "saved" : "inconclusive", reason: redirectSaved ? "Il server ha avanzato a una route allowlist della stessa bozza." : "Nessun redirect server conclusivo osservato.", evidenceId: saveEvent?.evidenceId ?? metadataEvidence.evidenceId, observedAt: saveEvent?.at ?? metadataEvidence.observedAt, url: saveEvent?.url ?? metadataEvidence.url },
      { method: "persisted_fields_get", outcome: persistedOutcome, reason: persistedOutcome === "saved" ? "Tutti i campi attesi coincidono nella GET canonica." : persistedOutcome === "not_saved" ? "Tutti i campi significativi risultano vuoti o assenti nella GET canonica." : `${matched}/${diagnostic.fields.length} campi coincidono: prova non conclusiva.`, evidenceId: diagnostic.evidenceId, observedAt: diagnostic.observedAt, url: metadataEvidence.url },
      { method: "server_metadata_get", outcome: metadataSaved ? "saved" : "inconclusive", reason: metadataSaved ? "Il metadato server Ultima modifica è successivo all'intento Salva." : "Metadato server assente o non successivo all'intento Salva.", evidenceId: metadataEvidence.evidenceId, observedAt: metadataEvidence.observedAt, url: metadataEvidence.url },
    ];
  }

  async inspectScreeningSummaryReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    if (!pageId.startsWith("screening:") || !this.stepFor(draftPackage, pageId)) throw new Error(`apr_cdp_enea_screening_diagnostic_not_allowlisted:${pageId}`);
    const session = await this.verifySession();
    const { target, client } = await this.client();
    const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${draftPackage.module === "infissi" ? "serramenti" : "schermature"}/${draftId}`;
    // A previous long Runtime.evaluate can leave the tab on the expected URL
    // while React's root is still empty.  Always issue one harmless GET for
    // this diagnostic, then wait only for the already-loaded summary DOM.
    // This never reopens the modal and never emits Save/preview/submit.
    await client.navigate(hostUrl);
    await this.waitForStable(client);
    const readSummary = () => client.evaluate<{ url: string; headers: string[]; rows: string[][]; costValue: string; bodyText: string; loading: boolean; surfaceReady: boolean; filters: Array<{ label: string; value: string }> }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const bodyText=clean(document.body?.innerText).slice(-5000);const actionLabels=[...document.querySelectorAll("button,input[type='button'],input[type='submit']")].map(node=>clean(node.textContent||node.value).toLocaleLowerCase("it"));const filterNodes=[...new Set([...document.querySelectorAll('input[type="search"],.dataTables_filter input,[aria-label*="cerca" i],[aria-label*="search" i]')])];return {url:location.href,headers:[...document.querySelectorAll("th")].map(cell=>clean(cell.textContent)),rows:[...document.querySelectorAll("tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent))).filter(cells=>cells.length>0),costValue:String(document.getElementById("id-costo")?.value??""),bodyText,loading:/caricamento(?:\\.\\.\\.)?/i.test(bodyText),surfaceReady:Boolean(document.querySelector("table,form"))||actionLabels.some(label=>label==="aggiungi"||label==="salva"),filters:filterNodes.map(node=>({label:clean(node.getAttribute("aria-label")||node.name||node.id),value:String(node.value??"")}))}})()`);
    let summary = await readSummary();
    // Poll from Node with short, independent Runtime.evaluate calls.  A single
    // long async expression previously collided with the CDP command timeout
    // while ENEA was still fetching the summary API.
    for (let attempt = 0; attempt < 120 && (summary.loading || !summary.surfaceReady); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      summary = await readSummary();
    }
    const evidence = await this.capture("inspect_screening_summary_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const normalizedHeaders = summary.headers.map((header) => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it"));
    const expectedHeadersPresent = draftPackage.module === "infissi"
      ? normalizedHeaders.some((header) => /infiss|trasmitt|superficie|chiusur/.test(header))
      : normalizedHeaders.some((header) => /tipo|schermatur/.test(header)) && normalizedHeaders.some((header) => /superficie|gtot|esposizion/.test(header));
    const substantiveRows = summary.rows.filter((row) => !(row.length === 1 && /nessun elemento/i.test(row[0] ?? "")));
    const durableDiagnostic = {
      kind: "screening-summary-readonly-v4",
      observedAt: new Date().toISOString(),
      customerKey: draftPackage.customerKey,
      draftId,
      pageId,
      evidenceId: evidence.evidenceId,
      ...summary,
      allowlistedOrigin: (() => { try { return new URL(summary.url).origin === this.allowedOrigin; } catch { return false; } })(),
      authenticated: session.authenticated && !session.serverLogoutProven,
      sessionEvidenceId: session.evidenceId,
      expectedHeadersPresent,
      filtersClear: summary.filters.every((filter) => filter.value.trim() === ""),
      emptyMarkerVisible: /nessun elemento/i.test(summary.bodyText) || summary.rows.some((row) => row.length === 1 && /nessun elemento/i.test(row[0] ?? "")),
      rowCount: substantiveRows.length,
    };
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = durableDiagnostic; state.pageSaveDiagnostics = [...state.pageSaveDiagnostics, durableDiagnostic].slice(-200); this.write(state);
    return state.pagePreparationDiagnostic as typeof durableDiagnostic;
  }

  async inspectInfissiRowFailureSurfaceReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    if (draftPackage.module !== "infissi" || !pageId.startsWith("screening:") || !this.stepFor(draftPackage, pageId)) throw new Error(`apr_cdp_enea_infissi_failure_diagnostic_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId);
    if (!mapping) throw new Error(`apr_cdp_enea_mapping_missing:${draftId}`);
    const { target, client } = await this.client();
    const expectedPath = `/pratica/ecobonus/2026/serramenti/${draftId}`;
    const currentPath = await client.evaluate<string>("location.pathname");
    if (currentPath !== expectedPath) { await client.navigate(`${this.allowedOrigin}${expectedPath}`); await this.waitForStable(client); }
    const diagnostic = await client.evaluate<{
      url: string;
      bodyText: string;
      tables: Array<{ headers: string[]; rows: string[][] }>;
      dialogs: Array<{ text: string; markerIds: string[]; invalidControls: string[]; buttons: Array<{ label: string; disabled: boolean }> }>;
      pagination: Array<{ tag: string; text: string; disabled: boolean; current: boolean }>;
      alerts: string[];
    }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const visible=node=>{if(!(node instanceof HTMLElement))return false;const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const tables=[...document.querySelectorAll("table")].map(table=>({headers:[...table.querySelectorAll("th")].map(cell=>clean(cell.textContent)),rows:[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent)))}));const dialogs=[...document.querySelectorAll('[role="dialog"],.modal,.modal-content')].filter(visible).map(dialog=>({text:clean(dialog.textContent).slice(0,5000),markerIds:${JSON.stringify(this.stepFor(draftPackage, pageId)!.markerIds)}.filter(id=>dialog.querySelector('#'+CSS.escape(id))),invalidControls:[...dialog.querySelectorAll("input,select,textarea")].filter(node=>!node.disabled&&(!node.validity.valid||node.getAttribute("aria-invalid")==="true")).map(node=>node.id||node.name||"<unnamed>"),buttons:[...dialog.querySelectorAll('button,input[type="button"],input[type="submit"]')].map(node=>({label:clean(node.textContent||node.value),disabled:Boolean(node.disabled)}))}));const pagination=[...document.querySelectorAll('[class*="pagin" i] button,[class*="pagin" i] a,[aria-label*="pagina" i],[aria-label*="page" i]')].filter(visible).map(node=>({tag:node.tagName.toLowerCase(),text:clean(node.textContent||node.getAttribute("aria-label")),disabled:Boolean(node.disabled||node.getAttribute("aria-disabled")==="true"),current:Boolean(node.getAttribute("aria-current"))}));const alerts=[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].filter(visible).map(node=>clean(node.textContent)).filter(Boolean).slice(0,50);return {url:location.href,bodyText:clean(document.body?.innerText).slice(-10000),tables,dialogs,pagination,alerts}})()`);
    const evidence = await this.capture("inspect_infissi_row_failure_surface_readonly_v3", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "infissi-row-failure-surface-readonly-v3", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...diagnostic }; this.write(state);
    return state.pagePreparationDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string };
  }

  async inspectPreparedStandardPageWithoutSave(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (!step || pageId.startsWith("screening:") || step.expenseAllocation || /Generatore/.test(pageId)) throw new Error(`apr_cdp_enea_standard_page_diagnostic_not_allowlisted:${pageId}`);
    await this.preparePage(draftPackage, draftId, pageId);
    const { target, client } = await this.client();
    const diagnostic = await client.evaluate<{
      urlPath: string;
      fields: Array<{ id: string; control: string; expected: string; value: string; checked: boolean; matches: boolean; valid: boolean; ariaInvalid: string | null; validationMessage: string; reactValue: string | null; reactChecked: boolean | null }>;
      invalidControlIds: string[];
      saveControls: Array<{ label: string; disabled: boolean; reactOnClick: boolean }>;
      alerts: string[];
      tables: Array<{ headers: string[]; rows: string[][] }>;
    }>(`(()=>{const expected=${JSON.stringify(step.fields)};const clean=value=>String(value??"").trim().replace(/\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it");const props=node=>{const key=Object.keys(node||{}).find(item=>item.startsWith("__reactProps$"));return key?node[key]:null};const first=expected.map(field=>document.getElementById(field.portalId)).find(Boolean);const form=first?.closest("form")||document.querySelector("form");const fields=expected.map(field=>{const node=document.getElementById(field.portalId);if(!node)return {id:field.portalId,control:field.control,expected:field.value,value:"<missing>",checked:false,matches:false,valid:false,ariaInvalid:null,validationMessage:"controllo assente",reactValue:null,reactChecked:null};const react=props(node),value=String(node.value??""),checked=Boolean(node.checked);const matches=field.control==="button"?!node.disabled:field.control==="checkbox"?checked===(field.value==="true"):(field.control==="select"&&field.selectValue?value===field.selectValue:normalize(value)===normalize(field.value)||(field.control==="autocomplete"&&normalize(value).startsWith(normalize(field.value)+" (")));return {id:node.id,control:field.control,expected:field.value,value,checked,matches:Boolean(matches),valid:Boolean(node.validity?.valid??true),ariaInvalid:node.getAttribute("aria-invalid"),validationMessage:String(node.validationMessage??""),reactValue:react?.value===undefined?null:String(react.value),reactChecked:typeof react?.checked==="boolean"?react.checked:null}});const invalidControlIds=[...(form?.querySelectorAll("input,select,textarea")??[])].filter(node=>!node.disabled&&(!node.validity.valid||node.getAttribute("aria-invalid")==="true")).map(node=>node.id||node.name||"<unnamed>");const saveControls=[...(form?.querySelectorAll('button,input[type="button"],input[type="submit"]')??[])].filter(node=>clean(node.textContent||node.value).toLocaleLowerCase("it")==="salva").map(node=>{const react=props(node);return {label:clean(node.textContent||node.value),disabled:Boolean(node.disabled),reactOnClick:typeof react?.onClick==="function"}});const visible=node=>{if(!(node instanceof HTMLElement))return false;const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0};const alerts=[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].filter(visible).map(node=>clean(node.textContent)).filter(Boolean).slice(0,50);const tables=[...document.querySelectorAll("table")].map(table=>({headers:[...table.querySelectorAll("th")].map(cell=>clean(cell.textContent)),rows:[...table.querySelectorAll("tbody tr")].map(row=>[...row.querySelectorAll("td")].map(cell=>clean(cell.textContent)))}));return {urlPath:location.pathname,fields,invalidControlIds,saveControls,alerts,tables}})()`);
    const evidence = await this.capture("inspect_prepared_standard_page_without_save_v3", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; const durableDiagnostic = { kind: "prepared-standard-page-without-save-v3", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...diagnostic }; state.pagePreparationDiagnostic = durableDiagnostic; state.pageSaveDiagnostics = [...state.pageSaveDiagnostics, durableDiagnostic].slice(-200); this.write(state);
    return state.pagePreparationDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string };
  }

  async inspectInfissiAddModalContractReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (draftPackage.module !== "infissi" || !pageId.startsWith("screening:") || !step) throw new Error(`apr_cdp_enea_infissi_modal_diagnostic_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId);
    if (!mapping) throw new Error(`apr_cdp_enea_mapping_missing:${draftId}`);
    const { target, client } = await this.client();
    const expectedPath = `/pratica/ecobonus/2026/serramenti/${draftId}`;
    if (await client.evaluate<string>("location.pathname") !== expectedPath) { await client.navigate(`${this.allowedOrigin}${expectedPath}`); await this.waitForStable(client); }
    const open = () => client.evaluate<boolean>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const controls=[...document.querySelectorAll('button,input[type="button"]')].filter(node=>!node.disabled&&normalize(node.textContent||node.value)==="aggiungi");if(controls.length!==1)return false;controls[0].click();return true})()`);
    const alreadyOpen = await client.evaluate<boolean>(`(${JSON.stringify(step.markerIds)}).every(id=>document.getElementById(id))`);
    if (!alreadyOpen && !await open()) throw new Error(`apr_cdp_enea_infissi_add_not_unique:${pageId}`);
    let markersReady = false;
    for (let attempt = 0; attempt < 80 && !markersReady; attempt += 1) {
      markersReady = await client.evaluate<boolean>(`(${JSON.stringify(step.markerIds)}).every(id=>document.getElementById(id))`);
      if (!markersReady) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!markersReady) throw new Error(`apr_cdp_enea_infissi_markers_missing:${pageId}`);
    const diagnostic = await client.evaluate<{
      controls: Array<{ id: string; tag: string; type: string; value: string; min: string; max: string; step: string; required: boolean; disabled: boolean; validity: Record<string, boolean>; options: Array<{ value: string; text: string }>; reactProps: string[] }>;
      buttons: Array<{ label: string; disabled: boolean }>;
      formText: string;
    }>(`(()=>{const ids=${JSON.stringify(step.markerIds)};const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const first=ids.map(id=>document.getElementById(id)).find(Boolean);const form=first?.closest("form")||first?.closest('[role="dialog"],.modal,.modal-content');const controls=ids.map(id=>document.getElementById(id)).filter(Boolean).map(node=>{const key=Object.keys(node).find(item=>item.startsWith("__reactProps$"));const props=key?node[key]:null;return {id:node.id,tag:node.tagName.toLowerCase(),type:String(node.type||""),value:String(node.value??""),min:String(node.min??node.getAttribute("min")??""),max:String(node.max??node.getAttribute("max")??""),step:String(node.step??node.getAttribute("step")??""),required:Boolean(node.required),disabled:Boolean(node.disabled),validity:{valid:Boolean(node.validity?.valid),rangeOverflow:Boolean(node.validity?.rangeOverflow),rangeUnderflow:Boolean(node.validity?.rangeUnderflow),stepMismatch:Boolean(node.validity?.stepMismatch),patternMismatch:Boolean(node.validity?.patternMismatch)},options:node instanceof HTMLSelectElement?[...node.options].map(option=>({value:String(option.value??""),text:clean(option.text)})):[],reactProps:props?Object.keys(props).sort():[]}});const buttons=form?[...form.querySelectorAll('button,input[type="button"],input[type="submit"]')].map(node=>({label:clean(node.textContent||node.value),disabled:Boolean(node.disabled)})):[];return {controls,buttons,formText:clean(form?.textContent).slice(0,6000)}})()`);
    const evidence = await this.capture("inspect_infissi_add_modal_contract_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "infissi-add-modal-contract-readonly-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...diagnostic }; this.write(state);
    return state.pagePreparationDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string };
  }

  async inspectInfissiFilledModalWithoutSave(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (draftPackage.module !== "infissi" || !pageId.startsWith("screening:") || !step) throw new Error(`apr_cdp_enea_infissi_filled_modal_diagnostic_not_allowlisted:${pageId}`);
    const mapping = this.load().mappings.find((item) => item.packageFingerprint === draftPackage.packageFingerprint && item.draftId === draftId);
    if (!mapping) throw new Error(`apr_cdp_enea_mapping_missing:${draftId}`);
    const { target, client } = await this.client();
    const expectedPath = `/pratica/ecobonus/2026/serramenti/${draftId}`;
    if (await client.evaluate<string>("location.pathname") !== expectedPath) { await client.navigate(`${this.allowedOrigin}${expectedPath}`); await this.waitForStable(client); }
    let markersReady = await client.evaluate<boolean>(`(${JSON.stringify(step.markerIds)}).every(id=>document.getElementById(id))`);
    if (!markersReady) {
      const opened = await client.evaluate<boolean>(`(()=>{const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const controls=[...document.querySelectorAll('button,input[type="button"]')].filter(node=>!node.disabled&&normalize(node.textContent||node.value)==="aggiungi");if(controls.length!==1)return false;controls[0].click();return true})()`);
      if (!opened) throw new Error(`apr_cdp_enea_infissi_add_not_unique:${pageId}`);
      for (let attempt = 0; attempt < 80 && !markersReady; attempt += 1) {
        markersReady = await client.evaluate<boolean>(`(${JSON.stringify(step.markerIds)}).every(id=>document.getElementById(id))`);
        if (!markersReady) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!markersReady) throw new Error(`apr_cdp_enea_infissi_markers_missing:${pageId}`);
    const filled = await this.fillAndReadStable(client, step.fields);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const diagnostic = await client.evaluate<{
      fields: Array<{ id: string; value: string; checked: boolean; valid: boolean; ariaInvalid: string | null; validationMessage: string; reactValue: string; reactChecked: boolean | null }>;
      saveControls: Array<{ label: string; disabled: boolean; reactOnClick: string }>;
      alerts: string[];
    }>(`(()=>{const ids=${JSON.stringify(step.markerIds)};const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const props=node=>{const key=Object.keys(node||{}).find(item=>item.startsWith("__reactProps$"));return key?node[key]:null};const first=ids.map(id=>document.getElementById(id)).find(Boolean);const form=first?.closest("form");const fields=ids.map(id=>document.getElementById(id)).filter(Boolean).map(node=>{const react=props(node);return {id:node.id,value:String(node.value??""),checked:Boolean(node.checked),valid:Boolean(node.validity?.valid),ariaInvalid:node.getAttribute("aria-invalid"),validationMessage:String(node.validationMessage??""),reactValue:String(react?.value??""),reactChecked:typeof react?.checked==="boolean"?react.checked:null}});const saveControls=form?[...form.querySelectorAll('button,input[type="button"],input[type="submit"]')].filter(node=>clean(node.textContent||node.value).toLocaleLowerCase("it")==="salva").map(node=>{const react=props(node);return {label:clean(node.textContent||node.value),disabled:Boolean(node.disabled),reactOnClick:typeof react?.onClick==="function"?String(react.onClick).slice(0,4000):""}}):[];const alerts=[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].filter(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0}).map(node=>clean(node.textContent)).filter(Boolean).slice(0,50);return {fields,saveControls,alerts}})()`);
    const evidence = await this.capture("inspect_infissi_filled_modal_without_save", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "infissi-filled-modal-without-save-v1", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, filled, ...diagnostic }; this.write(state);
    return state.pagePreparationDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string; filled: typeof filled };
  }

  async inspectCalculationAllocationModalContractReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (!step?.expenseAllocation || pageId !== "page:Allocazione costi e detrazioni") throw new Error("apr_cdp_enea_calculation_modal_diagnostic_not_allowlisted");
    const { target, client } = await this.client();
    const url = `${this.allowedOrigin}/pratica/ecobonus/2026/calcolo/${draftId}`;
    await client.navigate(url);
    await this.waitForStable(client);
    let table = await this.calculationAllocationTable(client, step.expenseAllocation);
    for (let attempt = 0; attempt < 120 && !table.interventionRow; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      table = await this.calculationAllocationTable(client, step.expenseAllocation);
    }
    if (!table.interventionRow) throw new Error("apr_cdp_enea_calculation_modal_diagnostic_table_missing");
    const opened = await client.evaluate<boolean>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const wanted=${JSON.stringify(normalize(step.expenseAllocation.interventionLabel))};const rows=[...document.querySelectorAll("table tbody tr")].filter(row=>normalize(row.querySelector("td")?.textContent).includes(wanted));if(rows.length!==1)return false;const controls=[...rows[0].querySelectorAll('button,input[type="button"]')].filter(control=>!control.disabled);if(controls.length!==1)return false;controls[0].click();return true})()`);
    if (!opened) throw new Error("apr_cdp_enea_calculation_modal_diagnostic_edit_not_unique");
    const read = () => client.evaluate<{ modalFound: boolean; heading: string; inputs: unknown[]; buttons: unknown[]; forms: unknown[]; ancestors: unknown[]; alerts: string[]; body: string }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const visible=node=>{if(!(node instanceof HTMLElement))return false;const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.display!=="none"&&style.visibility!=="hidden"};const target=[...document.querySelectorAll('input:not([type="hidden"])')].find(input=>{const context=normalize(input.closest("div")?.textContent||input.parentElement?.textContent||"");return visible(input)&&context.includes("2025-2026")&&context.includes("36%")});const modal=target?.closest('[role="dialog"],.modal-content,.modal,form')||null;const props=node=>{const key=Object.keys(node||{}).find(item=>item.startsWith("__reactProps$"));const value=key?node[key]:null;if(!value)return null;return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,typeof item==="function"?String(item).slice(0,1200):typeof item==="object"?Object.prototype.toString.call(item):String(item)]))};const describe=node=>({tag:node.tagName.toLocaleLowerCase(),id:node.id||"",name:node.name||"",type:String(node.type||""),value:String(node.value??""),text:clean(node.textContent||node.value),label:clean(node.labels?.[0]?.textContent||node.getAttribute("aria-label")||node.getAttribute("placeholder")||node.closest("div")?.textContent).slice(0,500),disabled:Boolean(node.disabled),valid:Boolean(node.validity?.valid??true),step:node.step||"",min:node.min||"",max:node.max||"",inputMode:node.inputMode||"",reactProps:props(node)});const ancestors=[];for(let node=target,index=0;node&&index<12;node=node.parentElement,index+=1)ancestors.push({index,tag:node.tagName.toLocaleLowerCase(),id:node.id||"",className:String(node.className||""),role:node.getAttribute("role")||"",method:node.method||"",action:node.action||"",reactProps:props(node)});const forms=[...new Set([...(modal?.matches("form")?[modal]:[]),...(modal?.querySelectorAll("form")||[]),...(target?.closest("form")?[target.closest("form")]:[])])];return {modalFound:Boolean(modal),heading:clean(modal?.querySelector("h1,h2,h3,h4,.modal-title")?.textContent),inputs:[...(modal?.querySelectorAll('input:not([type="hidden"]),select,textarea')||[])].filter(visible).map(describe),buttons:[...(modal?.querySelectorAll('button,input[type="button"],input[type="submit"]')||[])].filter(visible).map(describe),forms:forms.map(form=>({id:form.id||"",method:form.method||"",action:form.action||"",reactProps:props(form)})),ancestors,alerts:[...document.querySelectorAll('[role="alert"],.alert,.invalid-feedback,.error,[class*="error" i]')].filter(visible).map(node=>clean(node.textContent)).filter(Boolean).slice(0,30),body:clean(modal?.textContent).slice(0,4000)}})()`);
    let diagnostic = await read();
    for (let attempt = 0; attempt < 80 && !diagnostic.modalFound; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 250)); diagnostic = await read(); }
    const evidence = await this.capture("inspect_calculation_allocation_modal_contract_readonly_v9", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1;
    const durableDiagnostic = { kind: "calculation-allocation-modal-contract-v9", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, table, ...diagnostic };
    state.pagePreparationDiagnostic = durableDiagnostic as never;
    // Questo contratto deve sopravvivere alle successive diagnostiche della
    // tabella GET: pagePreparationDiagnostic e volutamente volatile.
    state.calculationModalContractDiagnostic = durableDiagnostic as never;
    this.write(state);
    await client.navigate(url);
    await this.waitForStable(client);
    return state.calculationModalContractDiagnostic as typeof diagnostic & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string; table: CalculationAllocationTableResult };
  }

  async inspectGeneratorSummaryReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (!step?.hostRoute || !step.activationLabel || !/Generatore/.test(pageId)) throw new Error(`apr_cdp_enea_generator_diagnostic_not_allowlisted:${pageId}`);
    const { target, client } = await this.client();
    const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`;
    await client.navigate(hostUrl);
    await this.waitForStable(client);
    const read = () => client.evaluate<{ url: string; expectedActivationLabel: string; headers: string[]; rows: string[][]; rowDetails: Array<{ cells: string[]; actions: Array<{ tag: string; type: string; label: string; title: string; disabled: boolean }> }>; actions: Array<{ label: string; title: string; disabled: boolean }>; bodyText: string; loading: boolean; surfaceReady: boolean }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const bodyText=clean(document.body?.innerText).slice(-5000);const rowDetails=[...document.querySelectorAll("tr")].map(row=>({cells:[...row.querySelectorAll("th,td")].map(cell=>clean(cell.textContent)),actions:[...row.querySelectorAll('button,input[type="button"],a')].map(node=>({tag:node.tagName.toLocaleLowerCase(),type:String(node.type||""),label:clean(node.textContent||node.value),title:clean(node.title||node.getAttribute("aria-label")),disabled:Boolean(node.disabled)})).filter(item=>item.label||item.title)})).filter(row=>row.cells.length>0);return {url:location.href,expectedActivationLabel:${JSON.stringify(step.activationLabel)},headers:[...document.querySelectorAll("th")].map(cell=>clean(cell.textContent)),rows:rowDetails.map(row=>row.cells),rowDetails,actions:[...document.querySelectorAll('button,input[type="button"]')].map(node=>({label:clean(node.textContent||node.value),title:clean(node.title||node.getAttribute("aria-label")),disabled:Boolean(node.disabled)})).filter(item=>item.label||item.title).slice(0,100),bodyText,loading:/caricamento(?:\\.\\.\\.)?/i.test(bodyText),surfaceReady:rowDetails.length>0||Boolean(document.querySelector("table,form"))}})()`);
    let summary = await read();
    for (let attempt = 0; attempt < 120 && (summary.loading || !summary.surfaceReady); attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 250)); summary = await read(); }
    const evidence = await this.capture("inspect_generator_summary_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "generator-summary-readonly-v2", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, ...summary }; this.write(state);
    return state.pagePreparationDiagnostic as typeof summary & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string };
  }

  async inspectGeneratorActivationSurfaceReadOnly(draftPackage: AprEneaDraftPackage, draftId: string, pageId: string) {
    const step = this.stepFor(draftPackage, pageId);
    if (!step?.hostRoute || !step.activationLabel || !/Generatore/.test(pageId)) throw new Error(`apr_cdp_enea_generator_activation_diagnostic_not_allowlisted:${pageId}`);
    const { target, client } = await this.client();
    const hostUrl = `${this.allowedOrigin}/pratica/ecobonus/2026/${step.hostRoute}/${draftId}`;
    await client.navigate(hostUrl); await this.waitForStable(client);
    const activationLabels = eneaGeneratorActivationLabels(step.activationLabel);
    const findAndActivate = () => client.evaluate<{ rowFound: boolean; controlFound: boolean; clicked: boolean; rowText: string; controlTitle: string }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const normalize=value=>clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("it");const wanted=${JSON.stringify(activationLabels)}.map(normalize);const row=[...document.querySelectorAll("tr")].find(candidate=>{const first=normalize(candidate.querySelector("th,td")?.textContent);return wanted.some(label=>first===label||first.includes(label)||label.includes(first))});if(!row)return {rowFound:false,controlFound:false,clicked:false,rowText:"",controlTitle:""};const control=[...row.querySelectorAll('button,input[type="button"]')].find(node=>!node.disabled&&/(^|\\s)modifica(?:\\s|$)/.test(normalize(node.title||node.getAttribute("aria-label")||node.textContent||node.value)));if(!control)return {rowFound:true,controlFound:false,clicked:false,rowText:clean(row.textContent),controlTitle:""};const controlTitle=clean(control.title||control.getAttribute("aria-label")||control.textContent||control.value);control.click();return {rowFound:true,controlFound:true,clicked:true,rowText:clean(row.textContent),controlTitle}})()`);
    let activation = await findAndActivate();
    for (let attempt = 0; attempt < 120 && !activation.clicked; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 250)); activation = await findAndActivate(); }
    const read = () => client.evaluate<{ markerIdsPresent: string[]; forms: Array<{ id: string; text: string }>; controls: Array<{ id: string; name: string; tag: string; type: string; label: string; value: string; disabled: boolean; required: boolean }>; bodyText: string }>(`(()=>{const clean=value=>String(value??"").trim().replace(/\\s+/g," ");const label=node=>clean(node.labels?.[0]?.textContent||node.getAttribute("aria-label")||node.getAttribute("placeholder")||node.title||node.textContent||node.value);return {markerIdsPresent:${JSON.stringify(step.markerIds)}.filter(id=>document.getElementById(id)),forms:[...document.querySelectorAll("form")].map(form=>({id:form.id||"",text:clean(form.textContent).slice(0,1000)})).slice(-10),controls:[...document.querySelectorAll("input,select,textarea,button")].map(node=>({id:node.id||"",name:node.name||"",tag:node.tagName.toLocaleLowerCase(),type:String(node.type||""),label:label(node),value:String(node.value||""),disabled:Boolean(node.disabled),required:Boolean(node.required)})).slice(-150),bodyText:clean(document.body?.innerText).slice(-5000)}})()`);
    let surface = await read();
    for (let attempt = 0; attempt < 80 && activation.clicked && surface.markerIdsPresent.length === 0; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 250)); surface = await read(); }
    const evidence = await this.capture("inspect_generator_activation_surface_readonly_v2", target, client, { customerKey: draftPackage.customerKey, draftId, pageId });
    const state = this.load(); state.revision += 1; state.pagePreparationDiagnostic = { kind: "generator-activation-surface-readonly-v2", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, pageId, evidenceId: evidence.evidenceId, activation, ...surface }; this.write(state);
    return state.pagePreparationDiagnostic as typeof surface & { kind: string; observedAt: string; customerKey: string; draftId: string; pageId: string; evidenceId: string; activation: typeof activation };
  }

  completeDraftServerEvidence(draftPackage: AprEneaDraftPackage, draftId: string) {
    const pageIds = draftPackage.workflow.steps.map((item) => `page:${item.pageName}`).concat(draftPackage.workflow.screeningSteps.map((_, index) => `screening:${index + 1}`));
    return findCompleteDraftServerEvidence({ events: this.load().events, customerKey: draftPackage.customerKey, draftId, pageIds, allowedOrigin: this.allowedOrigin });
  }

  async verifyDraftSaved(draftPackage: AprEneaDraftPackage, draftId: string): Promise<AprEneaDraftEvidence | null> {
    const pageIds = draftPackage.workflow.steps.map((item) => `page:${item.pageName}`).concat(draftPackage.workflow.screeningSteps.map((_, index) => `screening:${index + 1}`));
    const durableEvidence = this.completeDraftServerEvidence(draftPackage, draftId);
    if (!durableEvidence) {
      for (const step of pageIds) {
        if (!await this.verifyPageSaved(draftPackage, draftId, step)) {
          const { target, client } = await this.client();
          await this.capture("verify_complete_draft_integrity_rejected_readonly", target, client, {
            customerKey: draftPackage.customerKey,
            draftId,
            pageId: step,
            appliedRuleIds: ["user-2026-08-14-preserve-technical-product-cardinality", "user-2026-08-18-form-invoice-portal-cardinality-cross-check", "system-final-draft-source-cardinality-and-cost-verification"],
          });
          return null;
        }
      }
    }
    if (draftPackage.module === "infissi" && draftPackage.workflow.screeningSteps.length > 0) {
      const { target, client } = await this.client();
      await client.navigate(`${this.allowedOrigin}/pratica/ecobonus/2026/serramenti/${draftId}`);
      await this.waitForStable(client);
      const readInfissiIntegritySurface = () => client.evaluate<{ visibleRowCount: number; paginationText: string[]; observedCost: number | null; loading: boolean; bodyText: string }>(`(()=>{const number=value=>{const compact=String(value??"").replace(/[^0-9,.-]/g,"");if(!compact)return null;const parsed=Number(compact.includes(",")?compact.replace(/\./g,"").replace(",","."):compact);return Number.isFinite(parsed)?parsed:null};const clean=value=>String(value??"").trim().replace(/\s+/g," ");const bodyText=clean(document.body?.innerText).slice(-5000);const tables=[...document.querySelectorAll("table")];const table=tables.find(candidate=>[...candidate.querySelectorAll("tr")].some(row=>row.querySelectorAll("td").length>=9))||null;const visibleRowCount=table?[...table.querySelectorAll("tr")].filter(row=>row.querySelectorAll("td").length>=9).length:0;const scope=table?.closest('.dataTables_wrapper,[class*="table" i]')||table?.parentElement||document;const paginationText=[...new Set([...scope.querySelectorAll('.dataTables_info,[id$="_info"],[class*="pagin" i],[aria-label*="pagina" i],[aria-label*="page" i],.MuiTablePagination-root')].map(node=>clean(node.textContent||node.getAttribute("aria-label"))).filter(Boolean))];return {visibleRowCount,paginationText,observedCost:number(document.getElementById("id-costo")?.value),loading:/caricamento(?:\.\.\.)?/i.test(bodyText),bodyText}})()`);
      let observed = await readInfissiIntegritySurface();
      for (let attempt = 0; attempt < 120 && (observed.loading || observed.visibleRowCount === 0 || observed.observedCost === null); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        observed = await readInfissiIntegritySurface();
      }
      const integrity = classifyInfissiFinalIntegrity({
        ...observed,
        expectedCount: draftPackage.workflow.screeningSteps.length,
        expectedCost: draftPackage.infissiPayload?.expenseGrossVatIncluded ?? -1,
      });
      if (!integrity.matched) {
        const evidence = await this.capture("verify_complete_infissi_integrity_rejected_readonly", target, client, { customerKey: draftPackage.customerKey, draftId, pageId: "page:Serramenti e infissi" });
        const state = this.load();
        state.revision += 1;
        state.pagePreparationDiagnostic = { kind: "final-infissi-integrity-readonly-v3", observedAt: new Date().toISOString(), customerKey: draftPackage.customerKey, draftId, evidenceId: evidence.evidenceId, ...integrity };
        this.write(state);
        return null;
      }
    } else if (draftPackage.workflow.screeningSteps.length > 0) {
      const summary = await this.inspectScreeningSummaryReadOnly(draftPackage, draftId, "screening:1");
      const expectedCost = draftPackage.workflow.steps
        .find((step) => step.pageName === "Schermature solari")?.fields
        .find((field) => field.portalId === "id-costo")?.value ?? "";
      const integrity = classifyFinalScreeningIntegrity(summary.rows, draftPackage.workflow.screeningSteps, expectedCost, summary.costValue);
      if (!integrity.matched) {
        const { target, client } = await this.client();
        await this.capture("verify_complete_draft_integrity_rejected_readonly", target, client, {
          customerKey: draftPackage.customerKey,
          draftId,
          pageId: "page:Schermature solari",
          appliedRuleIds: ["user-2026-08-14-preserve-technical-product-cardinality", "user-2026-08-18-form-invoice-portal-cardinality-cross-check", "system-final-draft-source-cardinality-and-cost-verification"],
        });
        return null;
      }
    }
    const { target, client } = await this.client();
    const evidence = await this.capture("verify_complete_draft_readonly", target, client, {
      customerKey: draftPackage.customerKey,
      draftId,
      appliedRuleIds: ["system-final-draft-source-cardinality-and-cost-verification"],
    });
    return { ...evidence, draftId };
  }

  snapshot() { return this.load(); }

  pendingCreationBarrier() {
    const state = this.load();
    if (!state.pendingCreate) return null;
    const evidenceId = state.creationSurface?.customerKey === state.pendingCreate.customerKey
      ? state.creationSurface.evidenceId
      : [...state.events].reverse().find((event) => event.customerKey === state.pendingCreate?.customerKey)?.evidenceId
        ?? `local-pending-create-${state.pendingCreate.customerKey}`;
    return { customerKey: state.pendingCreate.customerKey, evidenceId };
  }
}
