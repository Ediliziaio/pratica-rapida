import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmIntegrationWorkflow } from "./crmIntegrationWorkflow";
import { PersistentAprOperatorUnlockRegistry, type AprOperatorUnlockSubmission } from "./operatorUnlockRegistry";

const optionFrom = (args: readonly string[], name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const requiredFrom = (args: readonly string[], name: string) => { const value = optionFrom(args, name); if (!value) throw new Error(`Opzione obbligatoria ${name}.`); return value; };

export function runAprOperatorUnlockCli(args: readonly string[], write: (value: string) => void = (value) => process.stdout.write(value)) {
  const command = args[0];
  const rootDirectory = path.resolve(optionFrom(args, "--root") ?? optionFrom(args, "--state-dir") ?? ".enea-shadow-runtime");
  const registry = new PersistentAprOperatorUnlockRegistry(rootDirectory);
  registry.syncFromCrmWorkflow(new PersistentAprCrmIntegrationWorkflow(rootDirectory).snapshot());
  if (command === "show") {
    write(`${JSON.stringify(registry.snapshot(new Date(), optionFrom(args, "--customer-key")), null, 2)}\n`);
    return;
  }
  if (command === "submit") {
    const submission = JSON.parse(readFileSync(path.resolve(requiredFrom(args, "--request-file")), "utf8")) as AprOperatorUnlockSubmission;
    write(`${JSON.stringify(registry.submit(submission), null, 2)}\n`);
    return;
  }
  throw new Error("Comando sblocco operatore non riconosciuto: usare show o submit.");
}
