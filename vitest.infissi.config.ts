import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

/**
 * Suite deterministica del modulo Infissi.
 *
 * Mantiene separati i contratti di dominio dai test HTTP/processo correlati:
 * questo comando non apre socket, non usa fixture reali e non richiede sistemi
 * esterni. Le integrazioni locali sono raccolte da vitest.infissi-related.config.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/features/enea-shadow-crm/infissiModule.test.ts",
      "src/features/enea-shadow-crm/infissiTechnicalSources.test.ts",
      "src/features/enea-shadow-crm/infissiProductRules.test.ts",
      "src/features/enea-shadow-crm/infissiOldWindowTransmittance.test.ts",
      "src/features/enea-shadow-crm/infissiOldWindowSourceResolution.test.ts",
      "src/features/enea-shadow-crm/infissiInvoiceCertificateCardinality.test.ts",
      "src/features/enea-shadow-crm/infissiEneaDraftPayload.test.ts",
      "src/features/enea-shadow-crm/infissiOriginalDocumentParser.test.ts",
      "src/features/enea-shadow-crm/infissiAutomaticDocumentEvidence.test.ts",
      "scripts/enea-shadow-runner/infissiLocalMappingPreflight.test.ts",
      "scripts/enea-shadow-runner/infissiBatchPreflight.test.ts",
      "scripts/enea-shadow-runner/infissiShadowTestPreparation.test.ts",
      "scripts/enea-shadow-runner/infissiDraftPackage.test.ts",
      "scripts/enea-shadow-runner/infissiUncertainSavePolicy.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
