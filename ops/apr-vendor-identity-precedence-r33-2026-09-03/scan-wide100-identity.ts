import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolvePrimaryBeneficiaryFromOfficialDocuments } from "../../scripts/enea-shadow-runner/crmLocalPreflight";

const manifest = JSON.parse(readFileSync("ops/apr-wide100-province-lineage-2026-09-02/manifest.json", "utf8"));
const norm = (value: unknown) => typeof value === "string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase() : "";
const rows = [];
const otherDemographicDiscrepancies = [];
const cohortRoot = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/cohorts";
for (const candidate of manifest.cases ?? []) {
  const prefix = `apr-pilot-${2920 + candidate.cohort}-global-controller-`;
  const directory = readdirSync(cohortRoot).find((name) => name.startsWith(prefix));
  if (!directory) continue;
  const root = `${cohortRoot}/${directory}`;
  const dossierPath = `${root}/crm-acquisition/dossiers/${candidate.customerKey}.json`;
  const analysisPath = `${root}/crm-document-analysis/checkpoint.json`;
  if (!existsSync(dossierPath) || !existsSync(analysisPath)) continue;
  const dossier = JSON.parse(readFileSync(dossierPath, "utf8")); const row = dossier.row ?? {}; const form = row.dati_form?.richiedente ?? {}; const owner = row.dati_form?.catastali ?? {};
  const result = resolvePrimaryBeneficiaryFromOfficialDocuments({ customerKey: candidate.customerKey, taxCode: row.cliente_cf || form.cf || null, requesterBirthDate: form.data_nascita ?? null, analysis: JSON.parse(readFileSync(analysisPath, "utf8")) });
  if (result.status !== "verified_document" || !result.identity) continue;
  const documentary = `${result.identity.name} ${result.identity.surname}`;
  const sources = [
    { field: "crm", value: `${row.cliente_nome ?? ""} ${row.cliente_cognome ?? ""}` },
    { field: "form.richiedente", value: `${form.nome ?? ""} ${form.cognome ?? ""}` },
    { field: "form.catastali.proprietario", value: `${owner.proprietario_nome ?? ""} ${owner.proprietario_cognome ?? ""}` },
  ].filter((entry) => norm(entry.value));
  const discrepancies = sources.filter((entry) => norm(entry.value) !== norm(documentary));
  if (discrepancies.length) rows.push({ customerKey: candidate.customerKey, practiceId: candidate.practiceId, documentaryIdentity: result.identity, authority: result.authority, sourceIds: result.sourceIds, discrepancies });
  const demographic = [
    row.cliente_cf && String(row.cliente_cf).replace(/\s+/g, "").toUpperCase() !== result.identity.taxCode ? { field: "crm.codice_fiscale", crmValue: row.cliente_cf, documentaryValue: result.identity.taxCode } : null,
    form.cf && String(form.cf).replace(/\s+/g, "").toUpperCase() !== result.identity.taxCode ? { field: "form.codice_fiscale", crmValue: form.cf, documentaryValue: result.identity.taxCode } : null,
    result.identity.birthDate && form.data_nascita && String(form.data_nascita).slice(0, 10) !== result.identity.birthDate ? { field: "form.data_nascita", crmValue: form.data_nascita, documentaryValue: result.identity.birthDate } : null,
    result.identity.sex && form.sesso && String(form.sesso).slice(0, 1).toUpperCase() !== result.identity.sex ? { field: "form.sesso", crmValue: form.sesso, documentaryValue: result.identity.sex } : null,
  ].filter(Boolean);
  if (demographic.length) otherDemographicDiscrepancies.push({ customerKey: candidate.customerKey, practiceId: candidate.practiceId, discrepancies: demographic, sourceIds: result.sourceIds });
}
const artifact = { schemaVersion: "apr-wide100-identity-discrepancy-scan-r33-v2", manifestCaseCount: manifest.cases?.length ?? 0, verifiedNameDiscrepancyCount: rows.length, cases: rows, otherDemographicDiscrepancyCount: otherDemographicDiscrepancies.length, otherDemographicDiscrepancies };
writeFileSync("ops/apr-vendor-identity-precedence-r33-2026-09-03/wide100-identity-discrepancy-scan.json", `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
