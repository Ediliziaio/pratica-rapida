import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprUserDecisionRegistry } from "./userDecisionRegistry";

const roots: string[] = [];
const create = () => { const root = mkdtempSync(path.join(os.tmpdir(), "apr-user-decisions-")); roots.push(root); return new PersistentAprUserDecisionRegistry(root); };
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

const input = () => ({
  statement: "Quando una fattura documenta un prodotto, la sua presenza resta distinta dalla completezza delle misure.",
  normalizedPattern: "invoice documented product presence independent from measurement completeness",
  semanticInputs: ["invoice.product.presence", "invoice.product.measurements"],
  answer: "Il prodotto è presente; le misure incomplete richiedono un controllo separato.",
  source: { kind: "operator_answer" as const, sourceId: "question:product:presence", observedAt: "2026-09-05T10:00:00.000Z" },
  caseEvidence: { practiceId: "practice-fixture", customerKey: "customer-fixture", generationId: "generation-fixture" },
});

describe("registro durevole delle decisioni di Giuliano", () => {
  it("registra ogni risposta riutilizzabile come general_rule_candidate per default", () => {
    const registry = create();
    const state = registry.recordCandidate(input(), new Date("2026-09-05T10:00:00.000Z"));
    expect(state.decisions[0]).toMatchObject({ status: "candidate", linkedRuleIds: [], caseEvidence: { practiceId: "practice-fixture" } });
    expect(new PersistentAprUserDecisionRegistry(registry.rootDirectory).snapshot().counts.candidate).toBe(1);
  });

  it("rifiuta case_only implicito e certificazione senza regole generali", () => {
    const registry = create();
    const recorded = registry.recordCandidate(input());
    const id = recorded.decisions[0].decisionId;
    expect(() => registry.transition(id, { status: "case_only", reason: "solo questo caso" })).toThrow(/requires_explicit_authority/);
    expect(() => registry.transition(id, { status: "certified_deployed", reason: "manca il gate" })).toThrow(/certification_missing_rules/);
  });
});
