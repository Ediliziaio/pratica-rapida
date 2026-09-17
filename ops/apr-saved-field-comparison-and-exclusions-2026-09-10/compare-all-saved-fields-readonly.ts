import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCompletedEneaText } from "../../src/features/enea-lab/completedEneaAudit";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { aprAutomationExclusion } from "../../scripts/enea-shadow-runner/aprFutureTestExclusions";

type JsonObject = Record<string, unknown>;
type FieldValue = { value: string; portalId: string; pageId: string; evidence?: JsonObject | null };
type SavedCandidate = {
  cohortRoot: string;
  cohort: string;
  practiceId: string;
  customerKey: string;
  displayName: string;
  draftId: string;
  savedAt: string;
  mappingFingerprint: string;
  packagePath: string;
  packageValue: JsonObject;
  executionPath: string;
  dossierPath: string | null;
  dossier: JsonObject | null;
};
type HistoricalReference = { practiceId: string; customerKey: string; displayName: string; historicalPath: string; benchmarkPath: string; benchmarkDraftId: string };

const ROOT = path.resolve("ops/apr-saved-field-comparison-and-exclusions-2026-09-10");
const RUNTIME = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner";
const COHORTS = path.join(RUNTIME, "cohorts");
const AUTH_STATE = path.join(RUNTIME, "state");
const PDFTOTEXT = "/Users/giulianolavoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext";
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: Uint8Array | string) => crypto.createHash("sha256").update(value).digest("hex");

function atomicWrite(target: string, contents: string | Uint8Array) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function readJson(file: string): unknown {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function sortedDirectories(root: string) {
  return existsSync(root) ? readdirSync(root).map((name) => path.join(root, name)).filter((file) => statSync(file).isDirectory()).sort() : [];
}

function customerKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function dossierFor(root: string, key: string): { path: string; value: JsonObject } | null {
  const candidates = [
    path.join(root, "crm-acquisition", "dossiers", `${key}.json`),
    path.join(root, "crm-authenticated-readonly", "dossiers", `${key}.json`),
  ];
  for (const candidate of candidates) {
    const value = object(readJson(candidate));
    if (value) return { path: candidate, value };
  }
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const name of readdirSync(current)) {
      const file = path.join(current, name);
      const stat = statSync(file);
      if (stat.isDirectory() && !/^(?:install|canonical-draft-packages|checkpoints)$/u.test(name)) stack.push(file);
      else if (stat.isFile() && name === `${key}.json` && file.includes(`${path.sep}dossiers${path.sep}`)) {
        const value = object(readJson(file));
        if (value) return { path: file, value };
      }
    }
  }
  return null;
}

const historicalByPractice = new Map<string, HistoricalReference>();
const savedByPractice = new Map<string, SavedCandidate>();
for (const cohortRoot of sortedDirectories(COHORTS)) {
  const cohort = path.basename(cohortRoot);
  const benchmarkPath = path.join(cohortRoot, "historical-benchmark", "checkpoint.json");
  const benchmark = object(readJson(benchmarkPath));
  if (benchmark && Array.isArray(benchmark.cases)) {
    for (const raw of benchmark.cases) {
      const item = object(raw);
      if (!item || item.status !== "compared") continue;
      const practiceId = text(item.practiceId);
      const historicalPath = text(item.historicalPath);
      if (!practiceId || !historicalPath || !historicalPath.startsWith(`${practiceId}/`) || !/\.pdf$/iu.test(historicalPath)) continue;
      historicalByPractice.set(practiceId, {
        practiceId,
        customerKey: text(item.customerKey),
        displayName: text(item.displayName),
        historicalPath,
        benchmarkPath,
        benchmarkDraftId: text(item.draftId),
      });
    }
  }
  const executionPath = path.join(cohortRoot, "enea-draft-execution", "checkpoint.json");
  const execution = object(readJson(executionPath));
  if (!execution || !Array.isArray(execution.items)) continue;
  for (const raw of execution.items) {
    const item = object(raw);
    if (!item || item.state !== "saved") continue;
    const practiceId = text(item.practiceId);
    const key = text(item.customerKey);
    const mappingFingerprint = text(item.mappingFingerprint);
    const draftId = text(item.draftId);
    const savedAt = text(item.savedAt);
    if (!practiceId || !key || !mappingFingerprint || !draftId || !savedAt) continue;
    const packagePath = path.join(cohortRoot, "canonical-draft-packages", "packages", `${mappingFingerprint}.json`);
    const packageValue = object(readJson(packagePath));
    if (!packageValue || packageValue.practiceId !== practiceId || packageValue.packageFingerprint !== mappingFingerprint) continue;
    const dossier = dossierFor(cohortRoot, key);
    const candidate: SavedCandidate = {
      cohortRoot, cohort, practiceId, customerKey: key, displayName: text(item.displayName), draftId, savedAt,
      mappingFingerprint, packagePath, packageValue, executionPath, dossierPath: dossier?.path ?? null, dossier: dossier?.value ?? null,
    };
    const previous = savedByPractice.get(practiceId);
    if (!previous || Date.parse(candidate.savedAt) > Date.parse(previous.savedAt)) savedByPractice.set(practiceId, candidate);
  }
}

const commonFieldIds: Record<string, Record<string, string>> = {
  beneficiary: {
    "id-nome": "beneficiario.nome", "id-cognome": "beneficiario.cognome", "id-codice_fiscale": "beneficiario.cf",
    "id-data_nascita": "beneficiario.data_nascita", "id-sesso": "beneficiario.sesso", "id-comune_nascita": "beneficiario.comune_nascita",
    "id-comune_residenza": "beneficiario.comune_residenza", "id-indirizzo_residenza": "beneficiario.indirizzo_residenza",
    "id-civico_residenza": "beneficiario.civico_residenza", "id-cap_residenza": "beneficiario.cap_residenza", "id-telefono": "beneficiario.telefono",
  },
  building: {
    "id-comune": "immobile.comune", "id-indirizzo": "immobile.indirizzo", "id-civico": "immobile.civico", "id-cap": "immobile.cap",
    "id-foglio": "immobile.foglio", "id-mappale": "immobile.mappale", "id-sub": "immobile.subalterno", "id-anno": "immobile.anno",
    "id-sup_utile": "immobile.superficie", "id-unita": "intervento.unita_totali", "id-possesso": "beneficiario.titolo",
    "id-destinazione_uso": "immobile.destinazione_generale", "id-dpr412": "immobile.destinazione_particolare", "id-tipologia": "immobile.tipologia",
  },
  intervention: {
    "id-immobile": "intervento.ambito", "id-unita": "intervento.unita_oggetto", "id-acc": "intervento.accorpamenti",
    "id-data_inizio": "intervento.data_inizio", "id-data_fine": "intervento.data_fine", "id-comma-345a": "intervento.tipo",
    "id-comma-345b": "intervento.tipo", "id-impianto_centralizzato": "intervento.impianto_centralizzato",
  },
  plant: {
    "id-impianto": "impianto.tipo", "id-erogazione": "impianto.terminali", "id-distribuzione": "impianto.distribuzione",
    "id-regolazione": "impianto.regolazione", "id-vettore": "impianto.combustibile", "id-estivo": "impianto.condizionamento",
  },
  generator: { "id-num": "impianto.numero_generatori", "id-n": "impianto.rendimento", "id-pn": "impianto.potenza" },
};
const infissiFieldIds: Record<string, string> = {
  "id-f_pre": "telaio_vecchio", "id-v_pre": "vetro_vecchio", "id-u_pre": "trasmittanza_vecchio", "id-sup": "superficie",
  "id-f_post": "telaio_nuovo", "id-v_post": "vetro_nuovo", "id-u_post": "trasmittanza_nuovo", "id-conf": "confine", "id-osc": "chiusura_oscurante",
};
const screeningFieldIds: Record<string, string> = {
  "id-tipo": "tipo", "id-inst": "installazione", "id-sup_s": "superficie", "id-sup_f": "superficie_finestrata",
  "id-esp": "esposizione", "id-calc": "modalita_calcolo", "id-gtot": "gtot", "id-mat": "materiale", "id-mec": "regolazione",
};

function packageFields(pkg: JsonObject): Map<string, FieldValue> {
  const output = new Map<string, FieldValue>();
  const module = text(pkg.module);
  const workflow = object(pkg.workflow);
  const steps = Array.isArray(workflow?.steps) ? workflow.steps.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
  const productSteps = Array.isArray(workflow?.screeningSteps) ? workflow.screeningSteps.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
  const evidence = module === "infissi" && Array.isArray(object(object(pkg.infissiPayload)?.audit)?.fieldEvidence)
    ? (object(object(pkg.infissiPayload)?.audit)!.fieldEvidence as unknown[]).map(object).filter((item): item is JsonObject => Boolean(item))
    : [];
  const add = (fieldId: string, field: JsonObject, pageId: string, fieldEvidence?: JsonObject | null) => {
    let value = text(field.value);
    if (field.control === "checkbox") value = value === "true" ? "Sì" : value === "false" ? "No" : value;
    if (value) output.set(fieldId, { value, portalId: text(field.portalId), pageId, evidence: fieldEvidence ?? null });
  };
  for (const step of steps) {
    const pageId = text(step.id);
    const map = commonFieldIds[pageId];
    if (pageId === "generator" && text(step.activationLabel)) output.set("impianto.generatore", { value: text(step.activationLabel), portalId: "activationLabel", pageId });
    for (const field of Array.isArray(step.fields) ? step.fields.map(object).filter((item): item is JsonObject => Boolean(item)) : []) {
      const portalId = text(field.portalId);
      if (map?.[portalId]) add(map[portalId], field, pageId);
      else if (pageId === "infissi-summary" && portalId === "id-costo") add("infissi.spesa", field, pageId);
      else if (pageId === "screening-summary" && portalId === "id-costo") add("schermature.spesa", field, pageId);
      else if (pageId === "calculation" && portalId === "id-risp") add("riepilogo.risparmio_energia_primaria", field, pageId);
    }
  }
  productSteps.forEach((step, index) => {
    const prefix = module === "infissi" ? `infissi.${index}` : `schermature.${index}`;
    const map = module === "infissi" ? infissiFieldIds : screeningFieldIds;
    for (const field of Array.isArray(step.fields) ? step.fields.map(object).filter((item): item is JsonObject => Boolean(item)) : []) {
      const portalId = text(field.portalId);
      const suffix = map[portalId];
      if (!suffix) continue;
      const fieldEvidence = module === "infissi" && suffix === "trasmittanza_nuovo"
        ? evidence.find((item) => item.field === "newWindowThermalTransmittanceWm2K" && text(item.physicalRowId).endsWith(`:infisso:${index + 1}`)) ?? null
        : null;
      add(`${prefix}.${suffix}`, field, text(step.id), fieldEvidence);
    }
  });
  if (productSteps.length) output.set(module === "infissi" ? "infissi.numero" : "schermature.numero", { value: String(productSteps.length), portalId: "derived:screeningSteps.length", pageId: "package" });
  return output;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLocaleLowerCase("it").replace(/^[a-z]\.[ ]*/, "");
}

function numeric(value: string): number | null {
  const match = value.replace(/\.(?=\d{3}(?:\D|$))/g, "").match(/-?\d+(?:[.,]\d+)?/u);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function equivalent(fieldId: string, left: string, right: string) {
  if (/(?:superficie|trasmittanza|\.spesa$|\.numero$|unita_|potenza|rendimento|detrazione|risparmio|\.anno$)/u.test(fieldId)) {
    const a = numeric(left); const b = numeric(right);
    return a !== null && b !== null && Math.abs(a - b) < 0.005;
  }
  const date = (value: string) => {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  };
  if (/data_(?:inizio|fine|nascita)/u.test(fieldId)) return date(left) === date(right);
  const a = normalize(left); const b = normalize(right);
  const municipality = /^(?:beneficiario\.(?:comune_nascita|comune_residenza)|immobile\.comune)$/u.test(fieldId)
    ? (value: string) => value.replace(/\s*\([a-z]{2}\)\s*$/iu, "").trim()
    : (value: string) => value;
  const aliases: Record<string, string> = {
    "proprietario o comproprietario": "proprietario / comproprietario",
    "detentore o affittuario": "detentore / affittuario",
    "detentore o co-detentore (es. locatario, comodatario, usufruttuario, ecc.)": "detentore / affittuario",
    "familiare o convivente": "familiare / convivente",
    "edificio a schiera e condominio fino a tre piani": "edificio fino a 3 piani",
    "edificio a schiera e condominio oltre tre piani": "edificio oltre 3 piani (4+)",
    "edificio in linea e condominio fino a tre piani fuori terra": "edificio fino a 3 piani",
    "edificio in linea e condominio oltre i tre piani fuori terra": "edificio oltre 3 piani (4+)",
    "costruzione isolata (es. mono o plurifamiliare)": "casa singola o plurifamiliare",
    "acqua calda standard": "caldaia ad acqua calda standard",
    "acqua calda a bassa temperatura": "caldaia ad acqua calda a bassa temperatura",
    "gas a condensazione": "caldaia a gas a condensazione",
    "gasolio a condensazione": "caldaia a gasolio a condensazione",
    "altro (energia elettrica)": "generatore elettrico",
    "energia elettrica": "generatore elettrico",
    "altro (gpl)": "caldaia a gpl",
    "si": "si", "sì": "si",
  };
  const canonical = (value: string) => aliases[municipality(value)] ?? municipality(value);
  if (canonical(a) === canonical(b)) return true;
  // Il testo estratto da alcuni PDF ENEA separa lettere interne ("Ra ff aello").
  return canonical(a).replace(/[^a-z0-9]/g, "") === canonical(b).replace(/[^a-z0-9]/g, "");
}

function augmentHumanFields(source: string, fields: Record<string, string>) {
  const compact = source.replace(/\s+/g, " ").trim();
  const set = (id: string, pattern: RegExp) => { const value = compact.match(pattern)?.[1]?.trim(); if (value) fields[id] = value; };
  const setFromLayoutLine = (id: string, pattern: RegExp) => { const value = source.match(pattern)?.[1]?.trim(); if (value) fields[id] = value; };
  set("impianto.distribuzione", /3\. Tipo di distribuzione Indicare la tipologia prevalente\s+(.+?)\s+4\. Tipo di regolazione/iu);
  set("impianto.regolazione", /4\. Tipo di regolazione Indicare la tipologia prevalente\s+(.+?)\s+5\. Conduzione prevista/iu);
  // Non usare `\s` tra etichetta e valore: nei PDF a colonne attraversa i
  // newline e può catturare il numero della sezione seguente (3/4) anziché il
  // valore stampato sulla stessa riga.
  setFromLayoutLine("intervento.unita_totali", /^[ \t]*2\. Unità immobiliari[ \t]+([0-9]+)[ \t]*$/imu);
  setFromLayoutLine("intervento.unita_oggetto", /^[ \t]*detrazione[ \t]+([0-9]+)[ \t]*$/imu);

  const infissiStart = source.indexOf("IN. Serramenti e infissi");
  const infissiEnd = source.indexOf("Spese congrue sostenute", infissiStart);
  if (infissiStart < 0) return;
  const table = source.slice(infissiStart, infissiEnd > infissiStart ? infissiEnd : undefined);
  const ordinals: number[] = [];
  for (const line of table.split(/\r?\n/u)) {
    const row = line.match(/^\s*(\d+)\s{2,}(.+)$/u);
    if (!row) continue;
    const ordinal = Number(row[1]);
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 100) continue;
    const cells = [row[1], ...row[2].trim().split(/\s{2,}/u).map((item) => item.trim()).filter(Boolean)];
    // La prima cella numerica è l'ordinale della riga, non una trasmittanza.
    const numericIndexes = cells.flatMap((cell, index) => index > 0 && /^\d+(?:[.,]\d+)?$/u.test(cell) ? [index] : []);
    if (numericIndexes.length < 3) continue;
    const [oldUIndex, surfaceIndex, newUIndex] = numericIndexes.slice(0, 3);
    const index = ordinal - 1;
    ordinals.push(ordinal);
    fields[`infissi.${index}.trasmittanza_vecchio`] = cells[oldUIndex];
    fields[`infissi.${index}.superficie`] = cells[surfaceIndex];
    fields[`infissi.${index}.trasmittanza_nuovo`] = cells[newUIndex];
    if (oldUIndex > 1) fields[`infissi.${index}.vetro_vecchio`] = cells[oldUIndex - 1];
    if (surfaceIndex + 1 < newUIndex) fields[`infissi.${index}.telaio_nuovo`] = cells[surfaceIndex + 1];
    if (surfaceIndex + 2 < newUIndex) {
      const rawGlass = cells[surfaceIndex + 2];
      fields[`infissi.${index}.vetro_nuovo`] = /^(?:a bassa|emissione)$/iu.test(rawGlass) ? "A bassa emissione" : rawGlass;
    }
    const trailing = cells.slice(newUIndex + 1).join(" ");
    if (/\bNo\b/iu.test(trailing)) fields[`infissi.${index}.chiusura_oscurante`] = "No";
    if (/\bS[iì]\b/iu.test(trailing)) fields[`infissi.${index}.chiusura_oscurante`] = "Sì";
    if (/\bVerso\b/iu.test(trailing)) fields[`infissi.${index}.confine`] = "Verso esterno";
  }
  if (ordinals.length) fields["infissi.numero"] = String(Math.max(...ordinals));
}

const geometry = /^(?:infissi\.\d+\.superficie|schermature\.\d+\.(?:superficie|superficie_finestrata))$/u;
const portalComputed = /^(?:riepilogo\.(?:detrazione_totale|detrazione_massima|detrazione_ammissibile)|immobile\.(?:codice_catastale|zona_climatica|gradi_giorno|fascia_solare))$/u;
const candidates = [...savedByPractice.values()].filter((saved) => historicalByPractice.has(saved.practiceId));
const auth = new PersistentAprCrmAuth(AUTH_STATE);
await auth.maintainSession();
const cases = [];
const excluded = [];
for (const saved of candidates.sort((left, right) => left.displayName.localeCompare(right.displayName, "it"))) {
  const historical = historicalByPractice.get(saved.practiceId)!;
  const row = object(saved.dossier?.row);
  const exclusion = aprAutomationExclusion({ customerKey: saved.customerKey, displayName: saved.displayName, fornitore: row?.fornitore, companies: row?.companies });
  const form = object(row?.dati_form);
  if (exclusion || !form || Object.keys(form).length === 0) {
    excluded.push({ practiceId: saved.practiceId, displayName: saved.displayName, reason: exclusion ? `excluded_supplier_or_practice:${exclusion.canonicalKey}` : "regular_digital_form_not_available", supplier: text(row?.fornitore) || text(object(row?.companies)?.ragione_sociale) });
    continue;
  }
  const response = await auth.readOnlyStorageGet("enea-documents", historical.historicalPath);
  if (!response.ok) throw new Error(`historical_pdf_http_${response.status}:${saved.practiceId}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(`historical_pdf_signature_invalid:${saved.practiceId}`);
  const localPdf = path.join(ROOT, "historical-pdfs", saved.practiceId, "operator-completed.pdf");
  atomicWrite(localPdf, bytes);
  const pdfText = execFileSync(PDFTOTEXT, ["-layout", localPdf, "-"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  const human = parseCompletedEneaText(pdfText);
  augmentHumanFields(pdfText, human.fields);
  if (saved.packageValue.module === "screening" && human.screeningCount >= 0) human.fields["schermature.numero"] = String(human.screeningCount);
  const apr = packageFields(saved.packageValue);
  const fieldIds = [...new Set([...Object.keys(human.fields), ...apr.keys()])].filter((fieldId) => !geometry.test(fieldId)).sort();
  const comparisons = fieldIds.map((fieldId) => {
    const aprField = apr.get(fieldId) ?? null;
    const humanValue = human.fields[fieldId] ?? null;
    const fallback = aprField?.evidence && text(aprField.evidence.source).includes("authorized_fallback:fallback")
      ? "missing_source_fallback_1_3"
      : aprField?.evidence && text(aprField.evidence.ruleId).includes("portal-transmittance-over-max")
        ? "explicit_source_clamped_to_1_3_for_portal"
        : null;
    let result: "match" | "difference" | "human_only" | "apr_only" | "portal_computed_reference_only";
    if (aprField && humanValue !== null) result = equivalent(fieldId, aprField.value, humanValue) ? "match" : "difference";
    else if (humanValue !== null && portalComputed.test(fieldId)) result = "portal_computed_reference_only";
    else if (humanValue !== null) result = "human_only";
    else result = "apr_only";
    return { fieldId, result, humanValue, aprValue: aprField?.value ?? null, aprPortalId: aprField?.portalId ?? null, aprPageId: aprField?.pageId ?? null, transmittancePolicy: fallback, aprEvidence: aprField?.evidence ?? null };
  });
  const nonComparable = comparisons.filter((item) => item.result === "human_only" || item.result === "apr_only");
  const fallbackRows = comparisons.filter((item) => item.transmittancePolicy === "missing_source_fallback_1_3");
  const expectedPages = Array.isArray(object(readJson(saved.executionPath))?.items)
    ? (object(readJson(saved.executionPath))!.items as unknown[]).map(object).find((item) => item?.practiceId === saved.practiceId)?.expectedPageIds
    : null;
  const completedPages = Array.isArray(object(readJson(saved.executionPath))?.items)
    ? (object(readJson(saved.executionPath))!.items as unknown[]).map(object).find((item) => item?.practiceId === saved.practiceId)?.completedPageIds
    : null;
  cases.push({
    practiceId: saved.practiceId,
    customerKey: saved.customerKey,
    displayName: saved.displayName,
    supplier: text(row?.fornitore) || text(object(row?.companies)?.ragione_sociale),
    module: saved.packageValue.module,
    savedAt: saved.savedAt,
    references: {
      execution: { path: saved.executionPath, sha256: sha256(readFileSync(saved.executionPath)), draftId: saved.draftId, expectedPageCount: Array.isArray(expectedPages) ? expectedPages.length : null, completedPageCount: Array.isArray(completedPages) ? completedPages.length : null },
      immutablePackage: { path: saved.packagePath, sha256: sha256(readFileSync(saved.packagePath)), packageFingerprint: saved.mappingFingerprint },
      humanBenchmark: { path: historical.benchmarkPath, sha256: sha256(readFileSync(historical.benchmarkPath)), historicalObjectPath: historical.historicalPath, localPdf, pdfSha256: sha256(bytes), cpid: human.cpid },
      crmDossier: saved.dossierPath ? { path: saved.dossierPath, sha256: sha256(readFileSync(saved.dossierPath)), digitalFormPresent: true } : null,
    },
    tripleVerification: {
      executionSaved: true,
      packageFingerprintMatchesExecution: saved.packageValue.packageFingerprint === saved.mappingFingerprint,
      historicalBenchmarkMatchedPractice: historical.practiceId === saved.practiceId,
      concordant: saved.packageValue.packageFingerprint === saved.mappingFingerprint && historical.practiceId === saved.practiceId,
    },
    comparisonSummary: {
      nonGeometricFieldsInUnion: comparisons.length,
      directlyComparable: comparisons.filter((item) => item.result === "match" || item.result === "difference").length,
      matches: comparisons.filter((item) => item.result === "match").length,
      differences: comparisons.filter((item) => item.result === "difference").length,
      humanOnly: comparisons.filter((item) => item.result === "human_only").length,
      aprOnly: comparisons.filter((item) => item.result === "apr_only").length,
      portalComputedReferenceOnly: comparisons.filter((item) => item.result === "portal_computed_reference_only").length,
      missingSourceTransmittanceFallback13Rows: fallbackRows.length,
      missingSourceFallback13Differences: fallbackRows.filter((item) => item.result === "difference").length,
    },
    fallback13Rows: fallbackRows,
    nonComparableFields: nonComparable,
    differences: comparisons.filter((item) => item.result === "difference"),
    comparisons,
  });
}

const legacyHumanComparableWithoutImmutablePackage = [...historicalByPractice.values()]
  .filter((item) => !savedByPractice.has(item.practiceId))
  .map((item) => ({ practiceId: item.practiceId, displayName: item.displayName, reason: "historical_operator_reference_exists_but_no_immutable_canonical_saved_package" }))
  .sort((left, right) => left.displayName.localeCompare(right.displayName, "it"));
const differenceFields = new Map<string, number>();
for (const item of cases) for (const difference of item.differences) differenceFields.set(difference.fieldId, (differenceFields.get(difference.fieldId) ?? 0) + 1);
const output = {
  version: "apr-all-saved-non-geometric-field-comparison-v1",
  generatedAt: new Date().toISOString(),
  scope: "Every unique saved APR practice for which both an immutable canonical package and an operator-completed historical ENEA PDF exist, limited to regular digital-form resellers. Product geometry is excluded; transmittance is included.",
  safety: { crmMethods: ["GET"], storageMethods: ["GET"], crmWrites: false, eneaOpened: false, eneaWrites: false, historicalValuesMayFeedApr: false },
  eligibility: {
    historicalOperatorReferences: historicalByPractice.size,
    uniqueSavedImmutablePackages: savedByPractice.size,
    compared: cases.length,
    excludedNonRegularOrPermanent: excluded.length,
    legacyWithoutImmutablePackage: legacyHumanComparableWithoutImmutablePackage.length,
  },
  aggregate: {
    directlyComparableFields: cases.reduce((sum, item) => sum + item.comparisonSummary.directlyComparable, 0),
    matches: cases.reduce((sum, item) => sum + item.comparisonSummary.matches, 0),
    differences: cases.reduce((sum, item) => sum + item.comparisonSummary.differences, 0),
    casesWithDifferences: cases.filter((item) => item.comparisonSummary.differences > 0).length,
    missingSourceTransmittanceFallback13Cases: cases.filter((item) => item.comparisonSummary.missingSourceTransmittanceFallback13Rows > 0).length,
    missingSourceTransmittanceFallback13Rows: cases.reduce((sum, item) => sum + item.comparisonSummary.missingSourceTransmittanceFallback13Rows, 0),
    missingSourceFallback13DifferenceRows: cases.reduce((sum, item) => sum + item.comparisonSummary.missingSourceFallback13Differences, 0),
    differencesByField: [...differenceFields.entries()].sort((left, right) => right[1] - left[1]).map(([fieldId, count]) => ({ fieldId, count })),
  },
  excluded,
  legacyHumanComparableWithoutImmutablePackage,
  cases,
};
const outputPath = path.join(ROOT, "saved-non-geometric-field-comparison.json");
atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
atomicWrite(path.join(ROOT, "saved-non-geometric-field-comparison.sha256"), `${sha256(readFileSync(outputPath))}  saved-non-geometric-field-comparison.json\n`);
if (cases.some((item) => !item.tripleVerification.concordant)) throw new Error("saved_field_comparison_triple_verification_inconsistent");
process.stdout.write(`${JSON.stringify({ outputPath, eligibility: output.eligibility, aggregate: output.aggregate, casesWithDifferences: cases.filter((item) => item.differences.length).map((item) => ({ displayName: item.displayName, differences: item.differences.length, fallback13Rows: item.fallback13Rows.length, fallback13Differences: item.comparisonSummary.missingSourceFallback13Differences })) }, null, 2)}\n`);
