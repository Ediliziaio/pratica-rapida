import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVATION_GATE_CUTOFF_DATE,
  assertAprCorrectionActivationGate,
  checkBundleFreshness,
  findMissingDeclaredTests,
  findMissingMatrixCoverage,
  findUnwiredRuleIds,
} from "./aprCorrectionActivationGate";

describe("gate permanente di attivazione delle correzioni", () => {
  it("lo stato reale del repository passa il gate (nessuna regola scritta ma non collegata, nessun test dichiarato ma inesistente)", () => {
    const result = assertAprCorrectionActivationGate({ repositoryRoot: process.cwd() });
    expect(result.status).toBe("PASS");
    expect(result.ruleCoverage.missingMatrixCoverage).toEqual([]);
    expect(result.ruleWiring.unwiredRuleIds).toEqual([]);
    expect(result.testExistence.missingTests).toEqual([]);
  });

  it("blocca una regola dichiarata nel registro ma mai citata altrove nel codice sorgente (ne' come stringa, ne' come accesso a proprieta')", () => {
    const rules = [{
      id: "user-2026-09-08-fake-orphan-for-test-v1",
      step: "economic_sources" as const,
      condition: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      audit: "test",
      outcome: "continue" as const,
    }];
    const { blocking, legacy } = findUnwiredRuleIds(process.cwd(), rules, { fakeOrphanForTest: "user-2026-09-08-fake-orphan-for-test-v1" });
    expect(blocking).toEqual(["user-2026-09-08-fake-orphan-for-test-v1"]);
    expect(legacy).toEqual([]);
  });

  it("una regola orfana datata prima del gate resta un debito informativo, non bloccante", () => {
    const rules = [{
      id: "user-2026-01-01-fake-legacy-orphan-for-test-v1",
      step: "economic_sources" as const,
      condition: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      audit: "test",
      outcome: "continue" as const,
    }];
    const { blocking, legacy } = findUnwiredRuleIds(process.cwd(), rules, {});
    expect(blocking).toEqual([]);
    expect(legacy).toEqual(["user-2026-01-01-fake-legacy-orphan-for-test-v1"]);
  });

  it("non blocca una regola gia' esplicitamente superseded o storica, anche se non collegata", () => {
    const rules = [{
      id: "user-2026-09-08-fake-superseded-for-test-v1",
      step: "economic_sources" as const,
      condition: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      audit: "test",
      outcome: "continue" as const,
      lifecycle: { status: "superseded" as const, generalGateEligible: false, note: "test" },
    }];
    const { blocking, legacy } = findUnwiredRuleIds(process.cwd(), rules, {});
    expect(blocking).toEqual([]);
    expect(legacy).toEqual([]);
  });

  it("riconosce una regola collegata per accesso a proprieta' (non solo per stringa letterale ripetuta)", () => {
    // technicalProductCardinality e' consultato ovunque solo come
    // USER_AUTHORIZED_RULE_IDS.technicalProductCardinality, mai ripetendo la
    // stringa "user-2026-08-14-preserve-technical-product-cardinality":
    // e' l'esempio reale che dimostra perche' il solo controllo per stringa
    // letterale produceva centinaia di falsi positivi prima di questa correzione.
    const rules = [{
      id: "user-2026-08-14-preserve-technical-product-cardinality",
      step: "economic_sources" as const,
      condition: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      audit: "test",
      outcome: "continue" as const,
    }];
    const { blocking, legacy } = findUnwiredRuleIds(process.cwd(), rules, { technicalProductCardinality: "user-2026-08-14-preserve-technical-product-cardinality" });
    expect(blocking).toEqual([]);
    expect(legacy).toEqual([]);
  });

  it("blocca una regola presente nel registro ma assente dalla matrice di copertura", () => {
    const decisions = [{
      decisionId: "decision:user-2026-09-08-fake-uncovered-v1",
      status: "candidate" as const,
      statement: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      ruleIds: ["user-2026-09-08-fake-uncovered-v1"],
      source: { kind: "user_instruction_registered" as const, receivedAt: "2026-09-08", reference: "test" },
    }];
    const missing = findMissingMatrixCoverage([], decisions);
    expect(missing).toEqual(["decision:user-2026-09-08-fake-uncovered-v1"]);
  });

  it("non blocca una decisione gia' superseded anche se assente dalla matrice", () => {
    const decisions = [{
      decisionId: "decision:user-2026-09-08-fake-superseded-decision-v1",
      status: "superseded" as const,
      statement: "test",
      sourcePrecedence: ["test"],
      deterministicAction: "test",
      ruleIds: ["user-2026-09-08-fake-superseded-decision-v1"],
      source: { kind: "user_instruction_registered" as const, receivedAt: "2026-09-08", reference: "test" },
    }];
    const missing = findMissingMatrixCoverage([], decisions);
    expect(missing).toEqual([]);
  });

  it("blocca una voce di matrice recente (datata da oggi in poi) il cui test dichiarato non esiste davvero in nessun file di test", () => {
    const matrix = [{
      key: "fake-recent-entry-for-test",
      registryRuleIds: [`user-${ACTIVATION_GATE_CUTOFF_DATE}-fake-recent-rule-for-test-v1`],
      automaticTests: ["moduloInventato: questo testo di test sicuramente non esiste in nessun file .test.ts del repository"],
    }];
    const missing = findMissingDeclaredTests(process.cwd(), matrix);
    expect(missing).toEqual([{ matrixKey: "fake-recent-entry-for-test", testLabel: "moduloInventato: questo testo di test sicuramente non esiste in nessun file .test.ts del repository" }]);
  });

  it("non blocca una voce di matrice precedente al gate anche se il testo dichiarato e' solo una sintesi parafrasata", () => {
    const matrix = [{
      key: "fake-legacy-entry-for-test",
      registryRuleIds: ["user-2026-01-01-fake-legacy-rule-for-test-v1"],
      automaticTests: ["moduloInventato: sintesi parafrasata che non compare mai letteralmente in un file di test"],
    }];
    const missing = findMissingDeclaredTests(process.cwd(), matrix);
    expect(missing).toEqual([]);
  });

  it("riconosce un test dichiarato quando il testo letterale esiste davvero in un file .test.ts", () => {
    const matrix = [{
      key: "fake-real-entry-for-test",
      registryRuleIds: [`user-${ACTIVATION_GATE_CUTOFF_DATE}-fake-real-rule-for-test-v1`],
      automaticTests: ["invoiceParser: regressione Mocenighi: riconosce 'scomparsa totale' anche col codice modello tra 'totale' e 'L' e chiusura plurale 'tende da sole'"],
    }];
    const missing = findMissingDeclaredTests(process.cwd(), matrix);
    expect(missing).toEqual([]);
  });

  it("rileva un bundle staged diverso da una ricostruzione indipendente dal sorgente corrente", () => {
    const stagingDirectory = mkdtempSync(path.join(tmpdir(), "apr-gate-test-stale-bundle-"));
    try {
      writeFileSync(path.join(stagingDirectory, "apr-supervisor.mjs"), "// contenuto volutamente diverso dal sorgente reale\n");
      writeFileSync(path.join(stagingDirectory, "apr-enea-worker.mjs"), "// contenuto volutamente diverso dal sorgente reale\n");
      writeFileSync(path.join(stagingDirectory, "apr-watchdog.mjs"), "// contenuto volutamente diverso dal sorgente reale\n");
      const result = checkBundleFreshness(process.cwd(), stagingDirectory);
      expect(result.matched).toBe(false);
      expect(result.mismatchedFiles).toEqual(["apr-supervisor.mjs", "apr-enea-worker.mjs", "apr-watchdog.mjs"]);
    } finally {
      rmSync(stagingDirectory, { recursive: true, force: true });
    }
  });

  it("il gate rifiuta l'installazione (lancia un errore con il risultato allegato) quando il bundle staged non e' fresco", () => {
    const stagingDirectory = mkdtempSync(path.join(tmpdir(), "apr-gate-test-stale-bundle-2-"));
    try {
      writeFileSync(path.join(stagingDirectory, "apr-supervisor.mjs"), "// stale\n");
      writeFileSync(path.join(stagingDirectory, "apr-enea-worker.mjs"), "// stale\n");
      writeFileSync(path.join(stagingDirectory, "apr-watchdog.mjs"), "// stale\n");
      let thrown: (Error & { gateResult?: unknown }) | null = null;
      try {
        assertAprCorrectionActivationGate({ repositoryRoot: process.cwd(), stagingDirectory });
      } catch (error) {
        thrown = error as Error & { gateResult?: unknown };
      }
      expect(thrown).not.toBeNull();
      expect(thrown!.message).toContain("bundle_not_fresh");
      expect((thrown!.gateResult as { status: string }).status).toBe("FAIL");
    } finally {
      rmSync(stagingDirectory, { recursive: true, force: true });
    }
  });
});
