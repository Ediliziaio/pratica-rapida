import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shouldPollCrmIncoming } from "./localDashboardServer";

describe("isolamento coorte APR congelata", () => {
  it("disabilita il polling generale Pronte da fare quando esiste un seed nominativo", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-frozen-cohort-"));
    expect(shouldPollCrmIncoming(root)).toBe(true);
    mkdirSync(path.join(root, "cohort-seed"), { recursive: true });
    writeFileSync(path.join(root, "cohort-seed", "checkpoint.json"), JSON.stringify({ candidates: [{ customerKey: "case-one" }, { customerKey: "case-two" }] }));
    expect(shouldPollCrmIncoming(root)).toBe(false);
  });
});
