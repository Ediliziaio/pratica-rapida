import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { APR_DECLARED_BUSINESS_DECISIONS, type AprDeclaredBusinessDecision } from "../../src/features/enea-shadow-crm/businessDecisionLedger";
import { ENEA_USER_AUTHORIZED_RULES, USER_AUTHORIZED_RULE_IDS, type OperationalRegistryRule } from "../../src/features/enea-shadow-crm/operationalRegistry";
import { APR_RULE_TEST_MATRIX, type AprRuleTestEntry } from "../../src/features/enea-shadow-crm/ruleTestMatrix";
import { canonicalSha256, envelopeImmutableArtifact } from "./aprMonotonicArtifacts";

/**
 * Gate permanente pre-installazione: nasce da tre incidenti reali in due
 * giorni in cui una correzione scritta e testata correttamente non era
 * davvero attiva nel sistema reale (una condizione mai raggiunta dal flusso
 * vero, un bundle non ricostruito/installato, un ID regola dichiarato ma
 * mai collegato). Ognuno dei quattro controlli qui sotto e' la
 * verifica automatica e permanente di uno di questi modi di fallire; nessuno
 * richiede una verifica manuale da rifare a mente ogni volta.
 *
 * Questo modulo non sostituisce il rituale formale di governance
 * (aprPreDeployCertificate.ts, che richiede un albero git pulito): lo
 * affianca per l'uso reale in un worktree condiviso e mai pulito, dove il
 * rituale formale non e' mai stato ne' sara' realisticamente eseguibile.
 * Resta comunque un gate obbligatorio, non facoltativo: promoteAprBundlesWithActivationGate
 * lo richiama sempre internamente, non si limita a fidarsi di un risultato
 * gia' calcolato in precedenza.
 */

export const APR_CORRECTION_ACTIVATION_GATE_VERSION = "apr-correction-activation-gate-v1" as const;

const EXCLUDED_WIRING_FILES = new Set([
  "src/features/enea-shadow-crm/operationalRegistry.ts",
  "src/features/enea-shadow-crm/ruleTestMatrix.ts",
  "src/features/enea-shadow-crm/businessDecisionLedger.ts",
]);

const BUNDLE_FILES = ["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"] as const;

export interface AprCorrectionActivationGateInput {
  repositoryRoot: string;
  /** Se fornita, verifica anche che il bundle staged sia byte-per-byte identico a una ricostruzione indipendente dal sorgente corrente. */
  stagingDirectory?: string;
}

export interface AprCorrectionActivationGateResult {
  version: typeof APR_CORRECTION_ACTIVATION_GATE_VERSION;
  checkedAt: string;
  status: "PASS" | "FAIL";
  reasons: readonly string[];
  ruleCoverage: { totalDeclaredRules: number; missingMatrixCoverage: readonly string[] };
  /**
   * unwiredRuleIds (regole datate da ACTIVATION_GATE_CUTOFF_DATE in poi) blocca
   * l'installazione. legacyUnwiredRuleIds (regole precedenti al gate stesso)
   * e' solo informativo: debito di governance reale ma preesistente, riportato
   * sempre per trasparenza, mai bloccante da solo, perche' risalire e collegare
   * ogni regola di mesi fa e' un lavoro distinto dal costruire il gate.
   */
  ruleWiring: { totalRuleIds: number; unwiredRuleIds: readonly string[]; legacyUnwiredRuleIds: readonly string[] };
  testExistence: { totalDeclaredTests: number; missingTests: readonly { matrixKey: string; testLabel: string }[] };
  bundleFreshness: { checked: boolean; matched: boolean; mismatchedFiles: readonly string[] };
}

interface SourceFile { relativePath: string; content: string }

/**
 * Legge una sola volta tutti i file .ts sotto src/ e scripts/ in memoria,
 * invece di lanciare un processo grep separato per ogni ID regola/etichetta
 * di test (centinaia di sottoprocessi, troppo lento per girare prima di
 * ogni installazione e dentro la suite di test normale). La ricerca vera e
 * propria e' poi una semplice String.includes in memoria, molto piu veloce.
 */
function buildSourceIndex(repositoryRoot: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (absoluteDir: string, relativeDir: string) => {
    for (const entry of readdirSync(absoluteDir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const absolutePath = path.join(absoluteDir, entry);
      const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) { walk(absolutePath, relativePath); continue; }
      if (entry.endsWith(".ts")) files.push({ relativePath, content: readFileSync(absolutePath, "utf8") });
    }
  };
  for (const root of ["src", "scripts"]) walk(path.join(repositoryRoot, root), root);
  return files;
}

function filesContaining(index: readonly SourceFile[], needle: string): string[] {
  return index.filter((file) => file.content.includes(needle)).map((file) => file.relativePath);
}

/**
 * Data di introduzione di questo gate: da qui in poi ogni correzione nuova
 * (regola registrata + test dichiarati) deve essere davvero collegata e
 * verificabile, senza eccezioni. Il debito precedente a questa data (regole
 * mai collegate scritte mesi fa) resta visibile ma non bloccante da solo:
 * e' un lavoro di bonifica separato dal costruire il gate stesso.
 */
export const ACTIVATION_GATE_CUTOFF_DATE = "2026-09-07";

function ruleDate(ruleId: string): string | null {
  return ruleId.match(/^(?:user|system)-(\d{4}-\d{2}-\d{2})-/)?.[1] ?? null;
}

/**
 * Un ID regola dichiarato nel registro ma mai citato al di fuori del
 * registro stesso, della matrice o dei test e' scritto ma non collegato al
 * flusso reale: nessun codice di produzione lo consulta mai per decidere
 * qualcosa. La stragrande maggioranza delle regole viene consultata per
 * accesso alla proprieta' (`USER_AUTHORIZED_RULE_IDS.nomeProprieta`), non
 * ripetendo la stringa letterale altrove: il controllo deve riconoscere
 * entrambe le forme, altrimenti segnala come "non collegate" centinaia di
 * regole gia' correttamente in uso. Alcune correzioni (es. Fiorini, Cotta)
 * dichiarano l'ID anche in un secondo oggetto di costanti locali con lo
 * stesso valore stringa (es. PRODUCT_CLASSIFIER_RULE_IDS): la stringa
 * letterale resta comunque il segnale definitivo, perche' e' cio' che
 * confluisce davvero in appliedRuleIds a runtime. Le regole gia'
 * esplicitamente superseded/storiche sono escluse: non devono piu' essere
 * collegate al flusso corrente per definizione.
 */
export function findUnwiredRuleIds(
  repositoryRoot: string,
  rules: readonly OperationalRegistryRule[] = ENEA_USER_AUTHORIZED_RULES,
  ruleIdMap: Readonly<Record<string, string>> = USER_AUTHORIZED_RULE_IDS,
  sourceIndex: readonly SourceFile[] = buildSourceIndex(repositoryRoot),
): { blocking: string[]; legacy: string[] } {
  const propertyKeyById = new Map<string, string>(Object.entries(ruleIdMap).map(([key, id]) => [id, key]));
  const blocking: string[] = [];
  const legacy: string[] = [];
  for (const rule of rules) {
    if (rule.lifecycle?.status === "superseded" || rule.lifecycle?.status === "historical_override_non_propagable") continue;
    const propertyKey = propertyKeyById.get(rule.id);
    const byLiteralString = filesContaining(sourceIndex, rule.id)
      .filter((file) => !EXCLUDED_WIRING_FILES.has(file) && !file.endsWith(".test.ts"));
    const byPropertyAccess = propertyKey
      ? filesContaining(sourceIndex, `.${propertyKey}`).filter((file) => !EXCLUDED_WIRING_FILES.has(file) && !file.endsWith(".test.ts"))
      : [];
    if (byLiteralString.length > 0 || byPropertyAccess.length > 0) continue;
    const date = ruleDate(rule.id);
    if (date && date >= ACTIVATION_GATE_CUTOFF_DATE) blocking.push(rule.id);
    else legacy.push(rule.id);
  }
  return { blocking: blocking.sort(), legacy: legacy.sort() };
}

/**
 * Una regola dichiarata nel registro deve comparire nella matrice di
 * copertura (assertCompleteBusinessDecisionCoverage la impone gia' nei
 * test; qui la stessa verifica diventa un prerequisito di installazione,
 * non solo un test che puo' non essere rieseguito prima di un bundle
 * costruito con uno script ad-hoc).
 */
export function findMissingMatrixCoverage(
  matrix: readonly Pick<AprRuleTestEntry, "key" | "registryRuleIds">[] = APR_RULE_TEST_MATRIX,
  declaredDecisions: readonly AprDeclaredBusinessDecision[] = APR_DECLARED_BUSINESS_DECISIONS,
): string[] {
  const links = new Map<string, string[]>();
  for (const entry of matrix) for (const ruleId of entry.registryRuleIds) links.set(ruleId, [...(links.get(ruleId) ?? []), entry.key]);
  return declaredDecisions
    .filter((decision) => decision.status !== "superseded")
    .filter((decision) => decision.ruleIds.some((ruleId) => !(links.get(ruleId)?.length)))
    .map((decision) => decision.decisionId)
    .sort();
}

/**
 * Le voci di matrice precedenti a ACTIVATION_GATE_CUTOFF_DATE documentano i
 * test con una sintesi leggibile, non con il testo letterale di it(...):
 * imporre ora una corrispondenza esatta retroattiva produrrebbe centinaia
 * di falsi positivi su una convenzione diversa e legittima usata per mesi.
 * Da quella data in poi (introduzione di questo gate) ogni nuova voce deve
 * riportare il testo letterale del test, ed e' quello che il controllo
 * verifica.
 */
function newestRuleDate(registryRuleIds: readonly string[]): string | null {
  const dates = registryRuleIds.flatMap((id) => ruleDate(id) ?? []);
  return dates.length ? dates.sort().at(-1)! : null;
}

/**
 * Una voce di matrice puo' dichiarare un test che in realta' non esiste (o
 * non esiste piu', rinominato in una correzione successiva): la copertura
 * risulterebbe verde solo sulla carta. Verifica che il testo dichiarato
 * compaia davvero in almeno un file di test, per le voci introdotte da
 * ACTIVATION_GATE_CUTOFF_DATE in poi.
 */
const OWN_GATE_TEST_FILE = "scripts/enea-shadow-runner/aprCorrectionActivationGate.test.ts";

export function findMissingDeclaredTests(
  repositoryRoot: string,
  matrix: readonly Pick<AprRuleTestEntry, "key" | "registryRuleIds" | "automaticTests">[] = APR_RULE_TEST_MATRIX,
  sourceIndex: readonly SourceFile[] = buildSourceIndex(repositoryRoot),
): Array<{ matrixKey: string; testLabel: string }> {
  const missing: Array<{ matrixKey: string; testLabel: string }> = [];
  for (const entry of matrix) {
    const entryDate = newestRuleDate(entry.registryRuleIds);
    if (!entryDate || entryDate < ACTIVATION_GATE_CUTOFF_DATE) continue;
    for (const rawLabel of entry.automaticTests) {
      const testLabel = rawLabel.includes(": ") ? rawLabel.slice(rawLabel.indexOf(": ") + 2) : rawLabel;
      // Il file di test di questo stesso gate contiene, come dati di fixture,
      // stringhe di test volutamente inesistenti: va escluso dalla ricerca,
      // altrimenti un test scritto qui per dimostrare un "test mancante"
      // troverebbe se stesso e non rileverebbe mai nulla.
      const files = filesContaining(sourceIndex, testLabel).filter((file) => file.endsWith(".test.ts") && file !== OWN_GATE_TEST_FILE);
      if (files.length === 0) missing.push({ matrixKey: entry.key, testLabel: rawLabel });
    }
  }
  return missing;
}

/**
 * Il bundle che si sta per installare deve essere byte-per-byte identico a
 * una ricostruzione indipendente eseguita ORA dallo stesso sorgente:
 * l'unico modo automatico per provare che non si sta installando un
 * bundle vecchio o costruito da un albero diverso (problema di ieri notte:
 * bundle non ricostruito/installato dopo le correzioni).
 */
export function checkBundleFreshness(repositoryRoot: string, stagingDirectory: string): { matched: boolean; mismatchedFiles: string[] } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "apr-activation-gate-rebuild-"));
  try {
    execFileSync("node", ["scripts/enea-shadow-runner/buildPersistentBundles.mjs", tempDir], { cwd: repositoryRoot, stdio: "pipe" });
    const mismatched: string[] = [];
    for (const file of BUNDLE_FILES) {
      const staged = createHash("sha256").update(readFileSync(path.join(stagingDirectory, file))).digest("hex");
      const rebuilt = createHash("sha256").update(readFileSync(path.join(tempDir, file))).digest("hex");
      if (staged !== rebuilt) mismatched.push(file);
    }
    return { matched: mismatched.length === 0, mismatchedFiles: mismatched };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function assertAprCorrectionActivationGate(input: AprCorrectionActivationGateInput, now = new Date()): AprCorrectionActivationGateResult {
  const reasons: string[] = [];
  const sourceIndex = buildSourceIndex(input.repositoryRoot);

  const missingMatrixCoverage = findMissingMatrixCoverage();
  if (missingMatrixCoverage.length) reasons.push(`missing_matrix_coverage:${missingMatrixCoverage.join(",")}`);

  const { blocking: unwiredRuleIds, legacy: legacyUnwiredRuleIds } = findUnwiredRuleIds(input.repositoryRoot, ENEA_USER_AUTHORIZED_RULES, USER_AUTHORIZED_RULE_IDS, sourceIndex);
  if (unwiredRuleIds.length) reasons.push(`unwired_rule_ids:${unwiredRuleIds.join(",")}`);

  const missingTests = findMissingDeclaredTests(input.repositoryRoot, APR_RULE_TEST_MATRIX, sourceIndex);
  if (missingTests.length) reasons.push(`missing_declared_tests:${missingTests.map((item) => `${item.matrixKey}::${item.testLabel}`).join("|")}`);

  const bundleFreshness = input.stagingDirectory
    ? checkBundleFreshness(input.repositoryRoot, input.stagingDirectory)
    : { matched: true, mismatchedFiles: [] as string[] };
  if (input.stagingDirectory && !bundleFreshness.matched) reasons.push(`bundle_not_fresh:${bundleFreshness.mismatchedFiles.join(",")}`);

  const result: AprCorrectionActivationGateResult = {
    version: APR_CORRECTION_ACTIVATION_GATE_VERSION,
    checkedAt: now.toISOString(),
    status: reasons.length === 0 ? "PASS" : "FAIL",
    reasons,
    ruleCoverage: { totalDeclaredRules: ENEA_USER_AUTHORIZED_RULES.length, missingMatrixCoverage },
    ruleWiring: { totalRuleIds: Object.values(USER_AUTHORIZED_RULE_IDS).length, unwiredRuleIds, legacyUnwiredRuleIds },
    testExistence: { totalDeclaredTests: APR_RULE_TEST_MATRIX.reduce((sum, entry) => sum + entry.automaticTests.length, 0), missingTests },
    bundleFreshness: { checked: Boolean(input.stagingDirectory), ...bundleFreshness },
  };
  if (result.status === "FAIL") {
    const error = new Error(`apr_correction_activation_gate_failed:${reasons.join(";")}`) as Error & { gateResult: AprCorrectionActivationGateResult };
    error.gateResult = result;
    throw error;
  }
  return result;
}

export function envelopeAprCorrectionActivationGateResult(result: AprCorrectionActivationGateResult) {
  return envelopeImmutableArtifact(result);
}

export function canonicalGateResultSha256(result: AprCorrectionActivationGateResult) {
  return canonicalSha256(result);
}
