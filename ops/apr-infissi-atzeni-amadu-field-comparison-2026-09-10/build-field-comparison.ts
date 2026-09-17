import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCompletedEneaText } from "../../src/features/enea-lab/completedEneaAudit";
import { mapInfissiNewWindowTransmittanceForEnea } from "../../src/features/enea-shadow-crm/infissiEneaDraftPayload";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const ROOT = path.resolve("ops/apr-infissi-atzeni-amadu-field-comparison-2026-09-10");
const PDFTOTEXT = "/Users/giulianolavoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext";

const metadata = JSON.parse(readFileSync(path.join(ROOT, "historical-inputs.json"), "utf8")) as {
  cases: Array<{ practiceId: string; displayName: string }>;
};
const currentCrmPath = path.join(ROOT, "current-crm-dossiers.json");
const currentCrm = JSON.parse(readFileSync(currentCrmPath, "utf8")) as {
  generatedAt: string;
  readOnly: boolean;
  rows: Array<JsonObject>;
};
const replay = JSON.parse(readFileSync(path.join(ROOT, "current-readonly-replay.json"), "utf8")) as {
  cases: Array<{ customerKey: string; sourceRoot: string; commonCheckpoint: { path: string; sha256: string }; infissiCheckpoint: { path: string; sha256: string }; common: { state: string; report: JsonObject }; infissi: { state: string; report: JsonObject } }>;
};

const verifiedHumanOverrides: Record<string, { page: number; fields: Record<string, string>; blankFields: string[] }> = {
  "giovanna-atzeni": {
    page: 2,
    fields: {
      "immobile.zona_climatica": "C",
      "immobile.gradi_giorno": "1185",
      "immobile.fascia_solare": "4",
      "beneficiario.cointestatari": "Nessuno",
      "impianto.tipo": "b. impianto centralizzato",
      "impianto.terminali": "d. radiatori",
      "impianto.generatore": "Caldaia a gas a condensazione",
      "impianto.numero_generatori": "1",
      "impianto.rendimento": "97",
      "impianto.potenza": "206",
      "impianto.combustibile": "c. gpl",
      "impianto.condizionamento": "Sì",
      ...Object.fromEntries([1.4, 1.4, 1.38, 1.4, 1.37, 1.39, 1.37, 1.39].flatMap((u, index) => [
        [`infissi.${index}.vetro_nuovo`, "A bassa emissione"],
        [`infissi.${index}.trasmittanza_nuovo`, String(u)],
        [`infissi.${index}.confine`, "Verso esterno"],
        [`infissi.${index}.chiusura_oscurante`, "No"],
      ])),
    },
    blankFields: ["impianto.distribuzione", "impianto.regolazione", "impianto.manutenzione_straordinaria"],
  },
  "giovanni-amadu": {
    page: 2,
    fields: {
      "immobile.zona_climatica": "D",
      "immobile.gradi_giorno": "2086",
      "immobile.fascia_solare": "4",
      "beneficiario.cointestatari": "Nessuno",
      "impianto.tipo": "a. impianto autonomo",
      "impianto.terminali": "b. ventilconvettori",
      "impianto.generatore": "Pompa di calore / Impianto geotermico",
      "impianto.numero_generatori": "1",
      "impianto.rendimento": "97",
      "impianto.potenza": "5.6",
      "impianto.combustibile": "f. energia elettrica",
      "impianto.condizionamento": "Sì",
      ...Object.fromEntries([1.38, 1.36, 1.36, 1.38, 1.41].flatMap((u, index) => [
        [`infissi.${index}.vetro_nuovo`, "A bassa emissione"],
        [`infissi.${index}.trasmittanza_nuovo`, String(u)],
        [`infissi.${index}.confine`, "Verso esterno"],
        [`infissi.${index}.chiusura_oscurante`, "No"],
      ])),
    },
    blankFields: ["impianto.distribuzione", "impianto.regolazione", "impianto.manutenzione_straordinaria"],
  },
};

function atomicWrite(target: string, contents: string) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  renameSync(temporary, target);
  const directory = openSync(path.dirname(target), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function normalize(value: string) {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  if (/^(?:bassa emissivita|a bassa emissione)$/.test(base)) return "low-e";
  if (/^comma 345a/.test(base)) return "comma-345a";
  if (/^si$/.test(base)) return "si";
  return base;
}

function equivalent(fieldId: string, apr: string, human: string) {
  const numeric = /(?:trasmittanza|\.spesa$|\.numero$|unita_|potenza|rendimento|detrazione|risparmio)/.test(fieldId);
  if (numeric) {
    const left = Number(apr.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    const right = Number(human.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.005;
  }
  const date = (value: string) => {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  };
  if (/data_(?:inizio|fine|nascita)/.test(fieldId)) return date(apr) === date(human);
  return normalize(apr) === normalize(human);
}

function fallbackOldFrame(material: unknown) {
  const value = text(material).toLocaleLowerCase("it");
  if (value === "legno") return "Legno";
  if (value === "pvc") return "PVC";
  if (value.includes("metallo") && value.includes("taglio") && !value.includes("senza")) return "Metallo, taglio termico";
  if (value.includes("metallo") && value.includes("senza")) return "Metallo, no taglio termico";
  if (value === "misto") return "Misto";
  return "Metallo, no taglio termico";
}

function fallbackOldGlass(value: unknown) {
  const normalized = text(value).toLocaleLowerCase("it");
  if (normalized.includes("singol")) return "Singolo";
  if (normalized.includes("doppi")) return "Doppio";
  if (normalized.includes("tripl")) return "Triplo";
  if (normalized.includes("pannell")) return "Pannello opaco";
  return "Singolo";
}

function comparisonFor(entry: typeof replay.cases[number]) {
  const practice = metadata.cases.find((item) => item.displayName.toLocaleLowerCase("it").replace(/\s+/g, "-") === entry.customerKey);
  if (!practice) throw new Error(`historical_practice_missing:${entry.customerKey}`);
  const pdfPath = path.join(ROOT, "historical-pdfs", practice.practiceId, "operator-completed-1.pdf");
  const humanText = execFileSync(PDFTOTEXT, ["-layout", pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const human = parseCompletedEneaText(humanText);
  const humanOverride = verifiedHumanOverrides[entry.customerKey];
  if (!humanOverride) throw new Error(`human_visual_verification_missing:${entry.customerKey}`);
  Object.assign(human.fields, humanOverride.fields);
  const common = entry.common.report;
  const infissi = entry.infissi.report;
  const technical = object(infissi.technical);
  const productRules = object(infissi.productRules);
  const productAudit = object(productRules?.audit);
  const oldThermal = object(productAudit?.oldWindowThermalTransmittance);
  const oldMaterial = oldThermal?.material;
  const oldGlass = oldThermal?.glazing;
  const rows = Array.isArray(technical?.rows) ? technical.rows.map(object).filter((item): item is JsonObject => Boolean(item)) : [];
  const allocation = object(infissi.shadingClosureAllocation);
  const flags = Array.isArray(allocation?.flags) ? allocation.flags : [];
  const dossier = JSON.parse(readFileSync(path.join(entry.sourceRoot, "crm-acquisition", "dossiers", `${entry.customerKey}.json`), "utf8")) as { row?: JsonObject };
  const currentCrmRow = currentCrm.rows.find((item) => item.id === practice.practiceId);
  if (!currentCrmRow) throw new Error(`current_crm_practice_missing:${practice.practiceId}`);
  const row = currentCrmRow ?? dossier.row ?? {};

  const values = new Map<string, { value: string; readiness: "ready_value" | "candidate_blocked" | "source_present_but_rejected" }>();
  const add = (fieldId: string, value: unknown, readiness: "ready_value" | "candidate_blocked" | "source_present_but_rejected" = "candidate_blocked") => {
    if (value !== null && value !== undefined && text(String(value))) values.set(fieldId, { value: String(value), readiness });
  };
  add("intervento.tipo", "Comma 345A - Interventi sull'involucro", "ready_value");
  add("intervento.data_inizio", common.startDate);
  add("intervento.data_fine", common.completionDate);
  add("intervento.unita_totali", common.buildingUnitCount);
  const identity = object(object(common.primaryBeneficiaryResolution)?.identity);
  add("beneficiario.nome", identity?.name);
  add("beneficiario.cognome", identity?.surname);
  add("beneficiario.cf", common.resolvedTaxCode);
  add("beneficiario.sesso", identity?.sex);
  add("beneficiario.data_nascita", identity?.birthDate);
  const works = object(object(common.worksMunicipalityResolution)?.value);
  add("immobile.comune", works?.comune);
  const coBeneficiary = object(common.coBeneficiaryResolution);
  if (coBeneficiary?.present === false) add("beneficiario.cointestatari", "Nessuno", "ready_value");
  if (!identity) {
    add("beneficiario.nome", row.cliente_nome, "source_present_but_rejected");
    add("beneficiario.cognome", row.cliente_cognome, "source_present_but_rejected");
    add("beneficiario.cf", row.cliente_cf, "source_present_but_rejected");
  }
  add("infissi.numero", rows.length, "ready_value");
  add("infissi.spesa", infissi.invoiceGrossTotal);
  rows.forEach((technicalRow, index) => {
    add(`infissi.${index}.telaio_vecchio`, fallbackOldFrame(oldMaterial), "candidate_blocked");
    add(`infissi.${index}.vetro_vecchio`, fallbackOldGlass(oldGlass), "candidate_blocked");
    add(`infissi.${index}.trasmittanza_vecchio`, productRules?.oldWindowThermalTransmittanceWm2K, "candidate_blocked");
    add(`infissi.${index}.telaio_nuovo`, productRules?.newFrameMaterial, "candidate_blocked");
    add(`infissi.${index}.vetro_nuovo`, productRules?.glassType === "Bassa emissivita" ? "A bassa emissione" : productRules?.glassType, "candidate_blocked");
    const sourceU = Number(technicalRow.thermalTransmittanceWm2K);
    if (Number.isFinite(sourceU) && sourceU > 0) add(`infissi.${index}.trasmittanza_nuovo`, mapInfissiNewWindowTransmittanceForEnea(sourceU).eneaValueWm2K, "candidate_blocked");
    add(`infissi.${index}.confine`, "Verso esterno", "candidate_blocked");
    if (typeof flags[index] === "boolean") add(`infissi.${index}.chiusura_oscurante`, flags[index] ? "Sì" : "No", "ready_value");
  });

  const excludedMeasurementFields = Object.keys(human.fields).filter((fieldId) => /^infissi\.\d+\.superficie$/.test(fieldId));
  const portalManagedFields = new Set(Object.keys(human.fields).filter((fieldId) => fieldId.startsWith("riepilogo.")));
  for (const fieldId of ["immobile.zona_climatica", "immobile.gradi_giorno", "immobile.fascia_solare"]) portalManagedFields.add(fieldId);
  const comparisons = Object.entries(human.fields)
    .filter(([fieldId]) => !excludedMeasurementFields.includes(fieldId))
    .map(([fieldId, humanValue]) => {
      const apr = values.get(fieldId);
      if (portalManagedFields.has(fieldId)) return { fieldId, humanValue, aprValue: null, result: "portal_managed_not_written_by_apr", readiness: "portal_managed" };
      if (!apr) return { fieldId, humanValue, aprValue: null, result: "missing_in_current_apr_inputs", readiness: "missing" };
      const same = equivalent(fieldId, apr.value, humanValue);
      return {
        fieldId,
        humanValue,
        aprValue: apr.value,
        result: apr.readiness === "source_present_but_rejected"
          ? same ? "same_raw_crm_value_but_not_accepted_by_preflight" : "different_raw_crm_value_not_accepted_by_preflight"
          : same ? "match" : "difference",
        readiness: apr.readiness,
      };
    });
  const counted = comparisons.filter((item) => item.result !== "portal_managed_not_written_by_apr");
  return {
    customerKey: entry.customerKey,
    displayName: practice.displayName,
    practiceId: practice.practiceId,
    humanReference: { path: pdfPath, sha256: sha256(readFileSync(pdfPath)), cpid: human.cpid, parsedFieldCount: Object.keys(human.fields).length, visuallyVerifiedPage: humanOverride.page, blankFields: humanOverride.blankFields },
    aprReference: { commonCheckpoint: entry.commonCheckpoint, infissiCheckpoint: entry.infissiCheckpoint, commonState: entry.common.state, infissiState: entry.infissi.state },
    currentCrmReference: {
      path: currentCrmPath,
      sha256: sha256(readFileSync(currentCrmPath)),
      fetchedAt: currentCrm.generatedAt,
      readOnly: currentCrm.readOnly,
      hasCustomerForm: Boolean(currentCrmRow.dati_form && object(currentCrmRow.dati_form) && Object.keys(object(currentCrmRow.dati_form)!).length),
    },
    safety: { comparisonOnly: true, crmWrites: false, eneaOpened: false, eneaWrites: false },
    closureDecision: {
      mode: allocation?.mode,
      flags,
      evidenceCount: object(allocation?.audit)?.explicitNoScreenCount,
      evidenceSourceIds: object(allocation?.audit)?.explicitNoScreenSourceIds,
      invoiceClosureMentionSourceIds: object(allocation?.audit)?.invoiceClosureMentionSourceIds,
      ruleId: "user-2026-09-10-infissi-explicit-no-screen-negative-closure-evidence-v1",
    },
    currentNonClosureBlockers: {
      common: Array.isArray(common.blockers) ? common.blockers : [],
      infissi: Array.isArray(infissi.blockers) ? infissi.blockers : [],
    },
    excludedProductMeasurementFields: excludedMeasurementFields,
    comparisonSummary: {
      comparedNonPortalFields: counted.length,
      matches: counted.filter((item) => item.result === "match").length,
      differences: counted.filter((item) => item.result === "difference").length,
      missing: counted.filter((item) => item.result === "missing_in_current_apr_inputs").length,
      sameRawButRejected: counted.filter((item) => item.result === "same_raw_crm_value_but_not_accepted_by_preflight").length,
      portalManaged: comparisons.filter((item) => item.result === "portal_managed_not_written_by_apr").length,
    },
    comparisons,
  };
}

const cases = replay.cases.map(comparisonFor);
const output = {
  version: "apr-atzeni-amadu-field-comparison-v2",
  generatedAt: new Date().toISOString(),
  scope: "Read-only comparison against historical operator-completed ENEA PDF; product surface/measure fields excluded by user request.",
  caveat: "APR values marked candidate_blocked are deterministic intermediate mappings only. No complete executable package exists while the independent economic/form/date gates remain closed; this is not an operational saved verdict.",
  cases,
};
const outputPath = path.join(ROOT, "field-by-field-comparison.json");
atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
const digestPath = path.join(ROOT, "field-by-field-comparison.sha256");
atomicWrite(digestPath, `${sha256(readFileSync(outputPath))}  field-by-field-comparison.json\n`);
process.stdout.write(`${JSON.stringify({ outputPath, digestPath, summaries: cases.map((item) => ({ customerKey: item.customerKey, closureDecision: item.closureDecision, comparisonSummary: item.comparisonSummary, differences: item.comparisons.filter((comparison) => comparison.result === "difference"), missing: item.comparisons.filter((comparison) => comparison.result === "missing_in_current_apr_inputs").map((comparison) => comparison.fieldId) })) }, null, 2)}\n`);
