#!/usr/bin/env node
import path from "node:path";
import { prepareAprCohortLaunchAgents } from "./aprCohortLaunchAgents";

const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name: string) => { const value = option(name); if (!value) throw new Error(`apr_cohort_service_option_missing:${name}`); return value; };

const result = prepareAprCohortLaunchAgents({
  cohortNumber: Number(required("--cohort")), dashboardPort: Number(required("--port")),
  stateDirectory: path.resolve(required("--state-dir")), installDirectory: path.resolve(required("--install-dir")),
  nodeExecutable: path.resolve(required("--node")), supervisorBundle: path.resolve(required("--supervisor-bundle")),
  workerBundle: path.resolve(required("--worker-bundle")), watchdogBundle: path.resolve(required("--watchdog-bundle")),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
