#!/usr/bin/env node
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmDocumentAnalysis } from "./crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "./crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "./infissiBatchPreflight";
import { runAprHistoricalBenchmark, type HistoricalComparableField } from "./aprHistoricalBenchmark";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function options(name: string): string[] {
  return process.argv.flatMap((value, index) => value === name && process.argv[index + 1] ? [process.argv[index + 1]] : []);
}

const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const auth = new PersistentAprCrmAuth(rootDirectory);
const analysis = new PersistentAprCrmDocumentAnalysis(rootDirectory);
const preflight = new PersistentAprCrmLocalPreflight(rootDirectory, analysis);
const infissiPreflight = new PersistentAprInfissiBatchPreflight(rootDirectory);

const COMMON_FIELD_BY_STEP_AND_PORTAL_ID: Record<string, Record<string, string>> = {
  beneficiary: {
    "id-nome": "beneficiario.nome", "id-cognome": "beneficiario.cognome", "id-codice_fiscale": "beneficiario.cf",
    "id-data_nascita": "beneficiario.data_nascita", "id-sesso": "beneficiario.sesso", "id-comune_nascita": "beneficiario.comune_nascita",
    "id-comune_residenza": "beneficiario.comune_residenza", "id-indirizzo_residenza": "beneficiario.indirizzo_residenza",
    "id-civico_residenza": "beneficiario.civico_residenza", "id-cap_residenza": "beneficiario.cap_residenza",
  },
  building: {
    "id-comune": "immobile.comune", "id-indirizzo": "immobile.indirizzo", "id-civico": "immobile.civico", "id-cap": "immobile.cap",
    "id-foglio": "immobile.foglio", "id-mappale": "immobile.mappale", "id-sub": "immobile.subalterno", "id-anno": "immobile.anno",
    "id-sup_utile": "immobile.superficie", "id-possesso": "beneficiario.titolo", "id-destinazione_uso": "immobile.destinazione_generale",
    "id-dpr412": "immobile.destinazione_particolare", "id-tipologia": "immobile.tipologia",
  },
  intervention: {
    "id-immobile": "intervento.ambito", "id-unita": "intervento.unita_oggetto", "id-acc": "intervento.accorpamenti",
    "id-data_inizio": "intervento.data_inizio", "id-data_fine": "intervento.data_fine",
  },
};

function infissiComparisonFields(customerKey: string): HistoricalComparableField[] {
  const draft = infissiPreflight.buildDraftExecutionPackage(customerKey);
  const infissiPayload = draft.infissiPayload;
  if (!infissiPayload) throw new Error(`apr_historical_benchmark_infissi_payload_missing:${customerKey}`);
  const fields: HistoricalComparableField[] = [];
  for (const step of draft.workflow.steps) {
    const mapping = COMMON_FIELD_BY_STEP_AND_PORTAL_ID[step.id];
    if (!mapping) continue;
    for (const field of step.fields) {
      const id = mapping[field.portalId];
      if (id) fields.push({ id, value: field.value, source: "APR Infissi" });
    }
  }
  fields.push({ id: "infissi.numero", value: infissiPayload.physicalWindowCount, source: "APR Infissi" });
  fields.push({ id: "infissi.spesa", value: infissiPayload.expenseGrossVatIncluded, source: "APR Infissi" });
  draft.workflow.screeningSteps.forEach((step, index) => {
    const byId = new Map(step.fields.map((field) => [field.portalId, field]));
    const add = (suffix: string, portalId: string, transform?: (value: string) => string | boolean) => {
      const value = byId.get(portalId)?.value;
      if (value !== undefined) fields.push({ id: `infissi.${index}.${suffix}`, value: transform ? transform(value) : value, source: "APR Infissi" });
    };
    add("telaio_vecchio", "id-f_pre"); add("vetro_vecchio", "id-v_pre"); add("trasmittanza_vecchio", "id-u_pre");
    add("superficie", "id-sup"); add("telaio_nuovo", "id-f_post"); add("vetro_nuovo", "id-v_post");
    add("trasmittanza_nuovo", "id-u_post"); add("confine", "id-conf");
    add("chiusura_oscurante", "id-osc", (value) => value === "true" ? "Sì" : "No");
  });
  return fields;
}
const result = await runAprHistoricalBenchmark(rootDirectory, {
  readOnlyGet: (pathname, search, now) => auth.readOnlyGet(pathname, search, now),
  readOnlyStorageGet: (bucket, objectPath, now) => auth.readOnlyStorageGet(bucket, objectPath, now),
  buildDraftExecutionPackage: (customerKey, now) => preflight.buildDraftExecutionPackage(customerKey, now),
  buildComparisonFields: (customerKey) => infissiComparisonFields(customerKey),
}, new Date(), options("--customer-key"));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
