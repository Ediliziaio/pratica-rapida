import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "../../scripts/enea-shadow-runner/crmOmbraAuth";
import { SupabaseAprCrmOmbraDataTransport } from "../../scripts/enea-shadow-runner/crmOmbraAdapter";

const practiceId = process.argv[2];
const reason = process.argv.slice(3).join(" ").trim();
if (!practiceId || !reason) throw new Error("practice_id_and_reason_required");
const runtimeRoot = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
const auth = new PersistentAprCrmOmbraAuth(runtimeRoot);
const transport = new SupabaseAprCrmOmbraDataTransport(auth);
const practice = await transport.readPractice(practiceId);
if (!practice) throw new Error("crm_ombra_practice_not_found");
const line = `Risposta non applicata da APR: ${reason}`;
const existing = (practice.note_interne ?? "").trim();
const note = existing.split("\n").some((value) => value.trim() === line) ? existing : existing ? `${existing}\n${line}` : line;
await transport.patchPractice(practiceId, practice.current_stage_id, { note_interne: note });
process.stdout.write(`${JSON.stringify({ status: "response_not_applied", practiceId, reason, note }, null, 2)}\n`);
