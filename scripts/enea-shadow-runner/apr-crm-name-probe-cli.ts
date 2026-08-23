#!/usr/bin/env node
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const authStateDirectory = path.resolve(option("--auth-state-dir") ?? "");
const query = (option("--query") ?? "").trim();
if (!authStateDirectory || !query) throw new Error("apr_crm_name_probe_options_missing");

const auth = new PersistentAprCrmAuth(authStateDirectory);
await auth.maintainSession();
const params = new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,pipeline_stages!inner(stage_type)",
  brand: "eq.enea",
  or: `(cliente_nome.ilike.*${query}*,cliente_cognome.ilike.*${query}*)`,
  limit: "50",
});
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
if (!response.ok) throw new Error(`apr_crm_name_probe_http_${response.status}`);
const rows = await response.json() as Array<Record<string, unknown>>;
process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
