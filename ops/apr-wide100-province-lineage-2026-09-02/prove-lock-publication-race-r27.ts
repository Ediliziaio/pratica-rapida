import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersistentAprEneaGlobalBrowserController } from "../../scripts/enea-shadow-runner/aprEneaGlobalBrowserController";

const root = mkdtempSync(path.join(os.tmpdir(), "apr-lock-race-proof-"));
try {
  const profileDirectory = path.join(root, "profile");
  const stateRoot = path.join(root, "state");
  mkdirSync(profileDirectory, { recursive: true });
  const publisher = new PersistentAprEneaGlobalBrowserController({ profileDirectory, remoteDebuggingPort: 9331, stateRoot });

  // Riproduce esattamente la finestra del codice corrente: open("wx") rende
  // visibile il pathname prima che write+fsync+close abbiano pubblicato il JSON.
  const descriptor = openSync(publisher.lockPath, "wx", 0o600);
  const proof: { pathVisible: boolean; bytesBeforeWrite: number; competingReaderError: string | null } = {
    pathVisible: existsSync(publisher.lockPath),
    bytesBeforeWrite: readFileSync(publisher.lockPath).length,
    competingReaderError: null,
  };
  try {
    const reader = new PersistentAprEneaGlobalBrowserController({ profileDirectory, remoteDebuggingPort: 9331, stateRoot });
    reader.tryAcquire({ ownerId: "competing-reader", cohortRoot: path.join(root, "cohort") });
  } catch (error) {
    proof.competingReaderError = error instanceof Error ? error.message : String(error);
  } finally {
    closeSync(descriptor);
  }
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
