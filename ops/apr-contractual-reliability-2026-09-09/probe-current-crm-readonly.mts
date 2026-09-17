#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const authDirectory = path.resolve(option("--auth-state-dir") ?? "");
const practiceId = (option("--practice-id") ?? "").trim();
if (!authDirectory || !/^[a-f0-9-]{36}$/i.test(practiceId)) throw new Error("crm_readonly_probe_options_invalid");

const auth = new PersistentAprCrmAuth(authDirectory);
await auth.maintainSession();
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,fatture_urls,documenti_aggiuntivi_urls,dati_form,updated_at,fornitore,companies:reseller_id(ragione_sociale)",
  id: `eq.${practiceId}`,
  limit: "2",
}));
const body = await response.text();
if (!response.ok) throw new Error(`crm_readonly_probe_http_${response.status}`);
const rows = JSON.parse(body) as Array<Record<string, unknown>>;
if (rows.length !== 1) throw new Error(`crm_readonly_probe_cardinality_${rows.length}`);
const row = rows[0];
const dataForm = row.dati_form && typeof row.dati_form === "object" && !Array.isArray(row.dati_form)
  ? row.dati_form as Record<string, unknown>
  : {};
process.stdout.write(`${JSON.stringify({
  responseSha256: createHash("sha256").update(body).digest("hex"),
  observedAt: new Date().toISOString(),
  row: {
    ...row,
    dati_form: dataForm,
  },
}, null, 2)}\n`);
