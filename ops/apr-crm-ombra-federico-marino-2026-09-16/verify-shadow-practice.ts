import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";

const practiceId = process.argv[2];
if (!practiceId) throw new Error("practice_id_required");
const expectedStageType = process.argv[3] ?? "da_inviare";
const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
const exact = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,current_stage_id,note_interne,note_documenti_mancanti,documenti_mancanti,pipeline_stages!inner(name,stage_type)",
  id: `eq.${practiceId}`,
  limit: "2",
}));
const exactRows = await exact.json();
const stageId = Array.isArray(exactRows) && typeof exactRows[0]?.current_stage_id === "string" ? exactRows[0].current_stage_id : "";
const stage = await auth.readOnlyGet("/rest/v1/pipeline_stages", new URLSearchParams({
  select: "id,name,stage_type,brand,reseller_id",
  id: `eq.${stageId}`,
  limit: "2",
}));
const stageRows = await stage.json();
const reverse = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id,cliente_nome,cliente_cognome,current_stage_id,pipeline_stages!inner(name,stage_type)",
  id: `eq.${practiceId}`,
  "pipeline_stages.stage_type": `eq.${expectedStageType}`,
  limit: "2",
}));
const reverseRows = await reverse.json();
process.stdout.write(`${JSON.stringify({
  exact: { http: exact.status, rows: exactRows },
  stage: { http: stage.status, rows: stageRows },
  reverseStageMembership: { expectedStageType, http: reverse.status, rows: reverseRows },
}, null, 2)}\n`);
