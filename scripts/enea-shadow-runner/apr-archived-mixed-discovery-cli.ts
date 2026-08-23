#!/usr/bin/env node
import path from "node:path";
import { PersistentAprCrmAuth } from "./crmAuth";
import { PersistentAprCrmArchivedMixedDiscovery } from "./aprCrmArchivedMixedDiscovery";
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name: string) => { const value = option(name); if (!value) throw new Error(`apr_archived_mixed_discovery_option_missing:${name}`); return value; };
const stateDirectory = path.resolve(required("--state-dir"));
const authStateDirectory = path.resolve(required("--auth-state-dir"));
const historyRoot = path.resolve(required("--history-root"));
const result = await new PersistentAprCrmArchivedMixedDiscovery(stateDirectory, new PersistentAprCrmAuth(authStateDirectory), historyRoot, required("--random-seed")).discover();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status !== "selected") process.exitCode = 2;
