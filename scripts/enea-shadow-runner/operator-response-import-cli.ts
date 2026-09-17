#!/usr/bin/env vite-node
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprOperatorResponseLedger, type AprOperatorResponseEntry } from "./operatorResponseLedger";

function main() {
  const [rootDirectory, importPath] = process.argv.slice(2);
  if (!rootDirectory || !importPath) throw new Error("usage: operator-response-import-cli.ts <apr-root-or-cohort-root> <import.json>");
  const value = JSON.parse(readFileSync(path.resolve(importPath), "utf8")) as { version?: string; responses?: AprOperatorResponseEntry[] };
  if (value.version !== "apr-operator-response-import-v1" || !Array.isArray(value.responses)) throw new Error("apr_operator_response_import_file_invalid");
  const ledger = new PersistentAprOperatorResponseLedger(path.resolve(rootDirectory));
  const state = ledger.importResponses(value.responses);
  process.stdout.write(`${JSON.stringify({ status: "imported", checkpointPath: ledger.checkpointPath, revision: state.revision, responseCount: state.responses.length, contentSha256: state.contentSha256 }, null, 2)}\n`);
}

main();
