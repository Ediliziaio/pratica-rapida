import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprOperatorResponseLedger } from "../../scripts/enea-shadow-runner/operatorResponseLedger";

const root = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner", "state");
const ledger = new PersistentAprOperatorResponseLedger(root);
const cases = [
  ["maria-luigia-fusco", "2527ecd1-8dd6-479e-a6d9-e1eddabd2a93"],
  ["amaranti-gigliola", "bc08d27a-0c8c-40cb-9c83-5c454a15b040"],
  ["federico-marino", "5aa5410c-f849-4dfc-b55a-ddccf911303e"],
  ["patrizia-teresa-taverna", "293ddc05-b9e5-468d-b3b2-c8dc90a3d0f8"],
] as const;
process.stdout.write(`${JSON.stringify(cases.map(([customerKey, practiceId]) => ({
  customerKey,
  practiceId,
  projection: ledger.projection(customerKey, practiceId),
})), null, 2)}\n`);
