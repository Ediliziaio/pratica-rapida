import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";
import { AprCrmOmbraAdapter, SupabaseAprCrmOmbraDataTransport } from "../../scripts/enea-shadow-runner/crmOmbraAdapter";
import { PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const practiceId = process.argv[2];
if (!practiceId) throw new Error("practice_id_required");
const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
const proof = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({ select: "id", id: `eq.${practiceId}`, limit: "1" }));
if (!proof.ok) throw new Error(`shadow_consume_auth_proof_failed:${proof.status}`);
const adapter = new AprCrmOmbraAdapter(
  new SupabaseAprCrmOmbraDataTransport(auth),
  new PersistentAprOperatorResponseLedger(path.join(runtimeRoot, "state")),
  runtimeRoot,
);
process.stdout.write(`${JSON.stringify(await adapter.consumeOperatorResponse(practiceId), null, 2)}\n`);
