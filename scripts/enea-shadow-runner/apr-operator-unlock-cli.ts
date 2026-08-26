import { runAprOperatorUnlockCli } from "./operatorUnlockCli";

try { runAprOperatorUnlockCli(process.argv.slice(2)); }
catch (error) { process.stderr.write(`APR_OPERATOR_UNLOCK_ERROR: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
