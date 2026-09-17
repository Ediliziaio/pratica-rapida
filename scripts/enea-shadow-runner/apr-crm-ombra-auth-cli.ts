import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmOmbraAuth } from "./crmOmbraAuth";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  const root = path.join(homedir(), "Library", "Application Support", "PraticaRapida", "enea-shadow-runner");
  const auth = new PersistentAprCrmOmbraAuth(root);
  if (command === "configure-from-bundle") {
    if (!argument) throw new Error("usage: configure-from-bundle <dist/assets/index.js>");
    const snapshot = auth.configureFromPublicBundle(argument);
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  if (command === "login" && argument === "--password-stdin") {
    const password = await readStdin();
    const snapshot = await auth.authenticate(password);
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  if (command === "status") {
    process.stdout.write(`${JSON.stringify(auth.snapshot(), null, 2)}\n`);
    return;
  }
  throw new Error("usage: configure-from-bundle <file> | login --password-stdin | status");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

