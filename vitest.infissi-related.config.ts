import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

/**
 * Regressioni condivise toccate dal modulo Infissi.
 *
 * localDashboardServer.test avvia un server effimero su 127.0.0.1: il bind e
 * parte intenzionale del contratto HTTP locale e puo richiedere l'abilitazione
 * del loopback quando la suite gira dentro un sandbox ristretto.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/features/enea-lab/interventionRules.test.ts",
      "src/features/enea-shadow-crm/operationalRegistry.test.ts",
      "src/features/enea-shadow-crm/financialReconciliation.test.ts",
      "scripts/enea-shadow-runner/crmLocalDraftPackages.test.ts",
      "scripts/enea-shadow-runner/crmDocumentAnalysis.test.ts",
      "scripts/enea-shadow-runner/caseStatusTruth.test.ts",
      "scripts/enea-shadow-runner/aprWatchdogRuntime.test.ts",
      "scripts/enea-shadow-runner/localDashboardServer.test.ts",
      "scripts/enea-shadow-runner/ruleMatrixEvidence.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
