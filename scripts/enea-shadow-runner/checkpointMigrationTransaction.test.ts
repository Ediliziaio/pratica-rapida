import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprCheckpointMigrationTransaction } from "./checkpointMigrationTransaction";

const stores = ["crm-document-analysis", "crm-local-preflight", "infissi-batch-preflight", "enea-draft-execution"];
const root = () => mkdtempSync(path.join(os.tmpdir(), "apr-migration-"));
function seed(directory: string, generation: string) {
  for (const store of stores) {
    mkdirSync(path.join(directory, store), { recursive: true });
    writeFileSync(path.join(directory, store, "checkpoint.json"), `${JSON.stringify({ store, generation, items: [{ customerKey: "case-1" }] })}\n`);
  }
}
function generations(directory: string) {
  return stores.map((store) => JSON.parse(readFileSync(path.join(directory, store, "checkpoint.json"), "utf8")).generation);
}

describe("APR checkpoint migration transaction", () => {
  it("committa insieme tutti gli store della nuova generazione", () => {
    const directory = root(); seed(directory, "old");
    const transaction = new PersistentAprCheckpointMigrationTransaction(directory);
    const prepared = transaction.begin(new Date("2026-08-24T10:00:00Z"));
    seed(directory, "new");
    expect(transaction.commit(prepared.transactionId, new Date("2026-08-24T10:00:01Z"))).toMatchObject({ status: "committed", caseKeys: ["case-1"] });
    expect(generations(directory)).toEqual(["new", "new", "new", "new"]);
  });

  it("dopo errore o crash ripristina tutti gli store alla generazione precedente", () => {
    const directory = root(); seed(directory, "old");
    const first = new PersistentAprCheckpointMigrationTransaction(directory);
    first.begin(new Date("2026-08-24T10:01:00Z"));
    writeFileSync(path.join(directory, stores[0], "checkpoint.json"), `${JSON.stringify({ generation: "partial" })}\n`);

    const restarted = new PersistentAprCheckpointMigrationTransaction(directory);
    expect(restarted.recover(new Date("2026-08-24T10:01:01Z"))).toMatchObject({ status: "rolled_back" });
    expect(generations(directory)).toEqual(["old", "old", "old", "old"]);
  });
});
