import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "scripts/enea-shadow-runner/localDashboardServer.ts"), "utf8");

describe("aggancio runtime delle domande terminali", () => {
  it("persiste la disposizione dopo la revisione profonda e la preparazione esecuzione", () => {
    const deepTick = source.indexOf("this.deepCaseReview.tick(now);");
    const executionPreparation = source.indexOf("prepareEneaDraftExecutionIfAbsent", deepTick);
    const persistence = source.indexOf("this.persistTerminalStoppedCaseQuestions(now);", executionPreparation);
    const delivery = source.indexOf("this.deliverOperatorQuestions(now);", persistence);
    expect(deepTick).toBeGreaterThan(0);
    expect(executionPreparation).toBeGreaterThan(deepTick);
    expect(persistence).toBeGreaterThan(executionPreparation);
    expect(delivery).toBeGreaterThan(persistence);
  });

  it("non esegue la persistenza mutativa nel ramo observer-only", () => {
    const observer = source.slice(source.indexOf("private observerPulse()"), source.indexOf("private pulse()"));
    expect(observer).not.toContain("persistTerminalStoppedCaseQuestions");
  });
});
