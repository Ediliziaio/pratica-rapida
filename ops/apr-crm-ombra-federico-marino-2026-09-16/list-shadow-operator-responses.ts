import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";
import { parseAprCrmOmbraQuestion } from "../../scripts/enea-shadow-runner/crmOmbraAdapter";

const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
const response = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,prodotto_installato,fornitore,current_stage_id,note_documenti_mancanti,pipeline_stages!inner(id,name,stage_type)",
  brand: "eq.enea",
  "pipeline_stages.stage_type": "eq.intervento_operatore",
  order: "cliente_cognome.asc,cliente_nome.asc",
}));
if (!response.ok) throw new Error(`shadow_operator_list_failed:${response.status}:${await response.text()}`);
const rows = await response.json() as Array<Record<string, unknown> & { note_documenti_mancanti?: string | null }>;
process.stdout.write(`${JSON.stringify({
  count: rows.length,
  rows: rows.map((row) => ({ ...row, parsed: parseAprCrmOmbraQuestion(row.note_documenti_mancanti ?? null) })),
}, null, 2)}\n`);
