import path from "node:path";
import { PersistentAprCrmAuthenticatedReadOnly } from "./crmAuthenticatedReadOnly";
import { PersistentAprCrmAuth } from "./crmAuth";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const required = (name: string) => {
  const value = option(name);
  if (!value) throw new Error(`Opzione obbligatoria ${name}.`);
  return value;
};

const rootDirectory = path.resolve(required("--state-dir"));
const acquisition = new PersistentAprCrmAuthenticatedReadOnly(rootDirectory, new PersistentAprCrmAuth(rootDirectory));
const state = acquisition.correctNotFoundIdentity(required("--customer-key"), {
  resolutionId: required("--resolution-id"),
  displayName: required("--display-name"),
});
process.stdout.write(`${JSON.stringify({
  status: state.status,
  revision: state.revision,
  corrected: state.items.find((item) => item.customerKey === required("--customer-key")),
  externalActionAllowed: state.externalActionAllowed,
}, null, 2)}\n`);
