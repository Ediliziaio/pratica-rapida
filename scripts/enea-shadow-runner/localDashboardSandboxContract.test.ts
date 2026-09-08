import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("contratto permanente test dashboard sandbox-safe", () => {
  it("esercita il gestore HTTP in-process senza aprire socket o usare fetch reale", () => {
    const source = readFileSync(path.resolve("scripts/enea-shadow-runner/localDashboardServer.test.ts"), "utf8");
    expect(source).toContain("startInProcessForTest");
    expect(source).toContain("requestInProcessForTest");
    expect(source).not.toMatch(/await\s+[A-Za-z_$][\w$]*\.start\(\)/);
    expect(source).not.toMatch(/\bfetch\(/);
  });

  it("impedisce anche agli altri test del supervisore di riaprire una porta", () => {
    const source = readFileSync(path.resolve("scripts/enea-shadow-runner/aprResumeCheckpointGuard.test.ts"), "utf8");
    expect(source).toContain("startInProcessForTest");
    expect(source).not.toMatch(/await\s+[A-Za-z_$][\w$]*\.start\(\)/);
  });

  it("mantiene un test di integrazione socket separato ed esplicito", () => {
    const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["test:apr:sandbox"]).toContain("--exclude scripts/enea-shadow-runner/cdpClientTimeout.test.ts");
    expect(packageJson.scripts["test:apr:sandbox"]).toContain("--exclude scripts/enea-shadow-runner/cdpEneaBrowserDriver.test.ts");
    expect(packageJson.scripts["test:apr:socket-integration"]).toContain("cdpClientTimeout.test.ts");
    expect(packageJson.scripts["test:apr:socket-integration"]).toContain("cdpEneaBrowserDriver.test.ts");
  });
});
