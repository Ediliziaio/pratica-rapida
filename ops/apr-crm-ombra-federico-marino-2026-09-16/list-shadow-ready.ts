import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";

const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,reseller_id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,current_stage_id,pipeline_stages!inner(id,name,stage_type),companies:reseller_id(ragione_sociale),fatture_urls,documenti_aggiuntivi_urls",
  brand: "eq.enea",
  "pipeline_stages.stage_type": "eq.pronte_da_fare",
  order: "cliente_cognome.asc,cliente_nome.asc",
}));
if (!response.ok) throw new Error(`shadow_ready_list_failed:${response.status}:${await response.text()}`);
const rows = await response.json();
process.stdout.write(`${JSON.stringify({ count: Array.isArray(rows) ? rows.length : null, rows }, null, 2)}\n`);
