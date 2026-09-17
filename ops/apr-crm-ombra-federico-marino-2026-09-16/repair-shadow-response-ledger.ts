import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const legacy = new PersistentAprOperatorResponseLedger(runtimeRoot);
const canonical = new PersistentAprOperatorResponseLedger(path.join(runtimeRoot, "state"));
const customerKey = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const responses = legacy.load().responses
  .filter((entry) => entry.source === "giuliano_crm_ombra")
  .map((entry) => ({ ...entry, customerKey: customerKey(entry.displayName) }));
if (responses.length === 0) throw new Error("no_shadow_responses_to_repair");
const state = canonical.importResponses(responses);
process.stdout.write(`${JSON.stringify({
  status: "shadow_responses_repaired",
  imported: responses.map((entry) => ({ responseId: entry.responseId, customerKey: entry.customerKey, practiceId: entry.practiceId })),
  checkpointPath: canonical.checkpointPath,
  revision: state.revision,
  contentSha256: state.contentSha256,
}, null, 2)}\n`);
