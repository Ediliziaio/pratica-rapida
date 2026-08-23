#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmArchivedScreeningDiscovery } from "./aprCrmArchivedScreeningDiscovery";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stateDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const historyRoot = path.resolve(option("--history-root") ?? path.dirname(stateDirectory));
const authStateDirectory = path.resolve(option("--auth-state-dir") ?? stateDirectory);
const auth = new PersistentAprCrmAuth(authStateDirectory);
const includePriorDrafts = option("--selection-mode") === "random-all-screenings";
const requiredCount = Number(option("--count") ?? "10");
const result = await new PersistentAprCrmArchivedScreeningDiscovery(stateDirectory, auth, historyRoot, {
  includePriorDrafts,
  randomSeed: includePriorDrafts ? option("--random-seed") ?? randomUUID() : undefined,
  requiredCount,
}).discover();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "selected") process.exitCode = 2;
