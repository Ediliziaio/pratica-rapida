#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmNamedSelection, type AprCrmNamedSelectionRequest } from "./aprCrmNamedSelection";

const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name: string) => { const value = option(name); if (!value) throw new Error(`apr_crm_named_selection_option_missing:${name}`); return path.resolve(value); };
const stateDirectory = required("--state-dir");
const authDirectory = required("--auth-state-dir");
const request = JSON.parse(readFileSync(required("--request"), "utf8")) as AprCrmNamedSelectionRequest;
const auth = new PersistentAprCrmAuth(authDirectory);
await auth.maintainSession();
const result = await new PersistentAprCrmNamedSelection(stateDirectory, auth).discover(request);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
