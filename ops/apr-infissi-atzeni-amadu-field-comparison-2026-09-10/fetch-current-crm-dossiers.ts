import crypto from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const ROOT = path.resolve("ops/apr-infissi-atzeni-amadu-field-comparison-2026-09-10");
const AUTH_STATE = "/Users/giulianolavoro/Library/Application Support/PraticaRapida/enea-shadow-runner/state";
const IDS = Object.freeze([
  "dc4484cd-c462-49c0-a734-3064dd6469a8",
  "e94df373-f8f5-44b9-bd31-3e6c36025c13",
]);

function atomicWrite(target: string, contents: string): void {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try { writeFileSync(descriptor, contents, "utf8"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  renameSync(temporary, target);
}

const auth = new PersistentAprCrmAuth(AUTH_STATE);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,cliente_cf,prodotto_installato,dati_form,pipeline_stages(stage_type,name),companies(ragione_sociale)",
  or: `(${IDS.map((id) => `id.eq.${id}`).join(",")})`,
  limit: String(IDS.length),
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
if (!response.ok) throw new Error(`crm_current_dossier_http_${response.status}`);
const rows = await response.json() as Array<Record<string, unknown>>;
if (!Array.isArray(rows) || rows.length !== IDS.length) throw new Error("crm_current_dossier_cardinality_mismatch");
for (const id of IDS) if (!rows.some((row) => row.id === id)) throw new Error(`crm_current_dossier_identity_missing:${id}`);

const result = {
  version: "apr-atzeni-amadu-current-crm-dossiers-v1",
  generatedAt: new Date().toISOString(),
  readOnly: true,
  crmMethods: ["GET"],
  externalMutationAllowed: false,
  rows,
};
atomicWrite(path.join(ROOT, "current-crm-dossiers.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  generatedAt: result.generatedAt,
  readOnly: result.readOnly,
  rows: rows.map((row) => ({
    id: row.id,
    displayName: `${String(row.cliente_nome ?? "")} ${String(row.cliente_cognome ?? "")}`.trim(),
    hasDatiForm: Boolean(row.dati_form && typeof row.dati_form === "object" && Object.keys(row.dati_form as object).length),
    stage: row.pipeline_stages,
  })),
}, null, 2)}\n`);
