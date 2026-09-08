#!/usr/bin/env node
import path from "node:path";
import { readFileSync } from "node:fs";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { PersistentAprCrmDocumentAnalysis } from "../../scripts/enea-shadow-runner/crmDocumentAnalysis";
import { PersistentAprCrmLocalPreflight } from "../../scripts/enea-shadow-runner/crmLocalPreflight";
import { PersistentAprInfissiBatchPreflight } from "../../scripts/enea-shadow-runner/infissiBatchPreflight";
import { runAprHistoricalBenchmark, type HistoricalComparableField } from "../../scripts/enea-shadow-runner/aprHistoricalBenchmark";

const root = path.resolve(process.argv[2] ?? "");
if (!root) throw new Error("state_dir_required");
const seed = JSON.parse(readFileSync(path.join(root, "cohort-seed", "checkpoint.json"), "utf8"));
const moduleName = seed.candidates?.[0]?.productModule;
const auth = new PersistentAprCrmAuth(root);
const analysis = new PersistentAprCrmDocumentAnalysis(root);
const preflight = new PersistentAprCrmLocalPreflight(root, analysis);
const infissi = new PersistentAprInfissiBatchPreflight(root);

const common: Record<string, Record<string, string>> = {
  beneficiary: { "id-nome":"beneficiario.nome", "id-cognome":"beneficiario.cognome", "id-codice_fiscale":"beneficiario.cf", "id-data_nascita":"beneficiario.data_nascita", "id-sesso":"beneficiario.sesso", "id-comune_nascita":"beneficiario.comune_nascita", "id-comune_residenza":"beneficiario.comune_residenza", "id-indirizzo_residenza":"beneficiario.indirizzo_residenza", "id-civico_residenza":"beneficiario.civico_residenza", "id-cap_residenza":"beneficiario.cap_residenza" },
  building: { "id-comune":"immobile.comune", "id-indirizzo":"immobile.indirizzo", "id-civico":"immobile.civico", "id-cap":"immobile.cap", "id-foglio":"immobile.foglio", "id-mappale":"immobile.mappale", "id-sub":"immobile.subalterno", "id-anno":"immobile.anno", "id-sup_utile":"immobile.superficie", "id-possesso":"beneficiario.titolo", "id-destinazione_uso":"immobile.destinazione_generale", "id-dpr412":"immobile.destinazione_particolare", "id-tipologia":"immobile.tipologia" },
  intervention: { "id-immobile":"intervento.ambito", "id-unita":"intervento.unita_oggetto", "id-acc":"intervento.accorpamenti", "id-data_inizio":"intervento.data_inizio", "id-data_fine":"intervento.data_fine" },
};

function infissiFields(key: string): HistoricalComparableField[] {
  const draft = infissi.buildDraftExecutionPackage(key);
  if (!draft.infissiPayload) throw new Error(`infissi_payload_missing:${key}`);
  const fields: HistoricalComparableField[] = [];
  for (const step of draft.workflow.steps) for (const field of step.fields) {
    const id = common[step.id]?.[field.portalId];
    if (id) fields.push({ id, value: field.value, source: "APR Infissi" });
  }
  fields.push({ id:"infissi.numero", value:draft.infissiPayload.physicalWindowCount, source:"APR Infissi" });
  fields.push({ id:"infissi.spesa", value:draft.infissiPayload.expenseGrossVatIncluded, source:"APR Infissi" });
  draft.workflow.screeningSteps.forEach((step, index) => {
    const byId = new Map(step.fields.map((field) => [field.portalId, field.value]));
    const add = (suffix:string, portalId:string, transform?:(v:string)=>string|boolean) => { const value=byId.get(portalId); if (value !== undefined) fields.push({ id:`infissi.${index}.${suffix}`, value:transform ? transform(value) : value, source:"APR Infissi" }); };
    add("telaio_vecchio","id-f_pre"); add("vetro_vecchio","id-v_pre"); add("trasmittanza_vecchio","id-u_pre"); add("superficie","id-sup"); add("telaio_nuovo","id-f_post"); add("vetro_nuovo","id-v_post"); add("trasmittanza_nuovo","id-u_post"); add("confine","id-conf"); add("chiusura_oscurante","id-osc",v=>v==="true"?"Sì":"No");
  });
  return fields;
}

const result = await runAprHistoricalBenchmark(root, {
  readOnlyGet: (pathname, search, now) => auth.readOnlyGet(pathname, search, now),
  readOnlyStorageGet: (bucket, objectPath, now) => auth.readOnlyStorageGet(bucket, objectPath, now),
  buildDraftExecutionPackage: (key, now) => preflight.buildDraftExecutionPackage(key, now),
  ...(moduleName === "infissi" ? { buildComparisonFields: (key:string) => infissiFields(key) } : {}),
});
process.stdout.write(JSON.stringify({ moduleName, summary: result.report.summary, outputPath: result.outputPath }) + "\n");
