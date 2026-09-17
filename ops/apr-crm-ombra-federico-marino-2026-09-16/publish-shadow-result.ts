import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";
import { AprCrmOmbraAdapter, SupabaseAprCrmOmbraDataTransport } from "../../scripts/enea-shadow-runner/crmOmbraAdapter";
import { PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function required(name: string) { const value = option(name); if (!value) throw new Error(`missing_option:${name}`); return value; }

const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
// Force a Keychain-backed refresh before constructing the attested adapter.
const proof = await auth.readOnlyGet("/rest/v1/enea_practices_public", new URLSearchParams({
  select: "id",
  id: `eq.${required("--practice-id")}`,
  limit: "1",
}));
if (!proof.ok) throw new Error(`shadow_publish_auth_proof_failed:${proof.status}`);
const adapter = new AprCrmOmbraAdapter(
  new SupabaseAprCrmOmbraDataTransport(auth),
  new PersistentAprOperatorResponseLedger(path.join(runtimeRoot, "state")),
  runtimeRoot,
);
const result = await adapter.recordSavedDraft({
  practiceId: required("--practice-id"),
  draftId: required("--draft-id"),
  draftUrl: required("--draft-url"),
  savedAt: new Date(required("--saved-at")),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
