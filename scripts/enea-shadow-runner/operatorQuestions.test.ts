import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentAprOperatorQuestions } from "./operatorQuestions";

describe("PersistentAprOperatorQuestions", () => {
  it("riconosce il caso documentale Cm 2850/Cm 2800 come domanda e non come conversione automatica", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const source = path.join(root, "ordine.txt");
    writeFileSync(source, "PERGOTENDA\nProfondita\nLarghezza totale\nCm 2400\nCm 3150\nCm 2800\nCm 2850\nQta 1");
    const store = new PersistentAprOperatorQuestions(root);
    store.discoverMeasurementUnitAmbiguities({ items: [{ customerKey: "enrica-moretti", displayName: "Enrica Moretti", state: "blocked_case", report: { products: [], blockers: [{ code: "screenings_missing" }] } }] } as never, { items: [{ customerKey: "enrica-moretti", documentKey: "6139d18e389ad53f46e98b2017b44011", textPath: source }] } as never, new Date("2026-08-16T09:59:00Z"));
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({ openCount: 1, questions: [{ customerKey: "enrica-moretti", status: "open", payload: { rawWidth: 2850, rawHeight: 2800, reportedUnit: "cm" } }] });
    expect(snapshot.questions[0].prompt).toContain("Confermi l'unita' reale?");
  });
  it("persiste domanda, risposta e riaccodamento idempotente attraverso un riavvio", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apr-operator-question-"));
    const first = new PersistentAprOperatorQuestions(root);
    first.requestMeasurementUnit({ id: "unit:enrica-moretti:screenings-1", customerKey: "enrica-moretti", displayName: "Enrica Moretti", field: "screenings.1.dimensions.unit", prompt: "Confermi che 2850 × 2800 sono millimetri?", evidenceText: "Larghezza totale / Profondita; Cm 2850 / Cm 2800", sourceIds: ["source-order-1504dp"], payload: { rawWidth: 2850, rawHeight: 2800, reportedUnit: "cm", description: "Pergotenda S120" } }, new Date("2026-08-16T10:00:00Z"));
    first.answer("unit:enrica-moretti:screenings-1", "millimeters", "Misure in millimetri", "operatore", "answer:enrica:mm:1", new Date("2026-08-16T10:01:00Z"));
    const afterRestart = new PersistentAprOperatorQuestions(root);
    expect(afterRestart.snapshot().pendingApplicationCount).toBe(1);
    afterRestart.markApplied("unit:enrica-moretti:screenings-1", new Date("2026-08-16T10:02:00Z"));
    afterRestart.markApplied("unit:enrica-moretti:screenings-1", new Date("2026-08-16T10:03:00Z"));
    const snapshot = afterRestart.snapshot();
    expect(snapshot.questions[0]).toMatchObject({ status: "applied", answer: { value: "millimeters", note: "Misure in millimetri" } });
    expect(snapshot.audit.filter((event) => event.type === "answer_applied")).toHaveLength(1);
  });

  it("mantiene il caso bloccato quando l'operatore risponde non determinabile", () => {
    const store = new PersistentAprOperatorQuestions(mkdtempSync(path.join(tmpdir(), "apr-operator-question-")));
    store.requestMeasurementUnit({ id: "unit:case-2:screenings-1", customerKey: "case-2", displayName: "Caso 2", field: "screenings.1.dimensions.unit", prompt: "Qual e' l'unita'?", evidenceText: "Dato ambiguo", sourceIds: ["source-2"], payload: { rawWidth: 250, rawHeight: 300, reportedUnit: "cm", description: "Tenda" } });
    store.answer("unit:case-2:screenings-1", "cannot_determine", "Serve il fornitore", "operatore", "answer:case-2:1");
    expect(store.snapshot()).toMatchObject({ openCount: 0, pendingApplicationCount: 0, questions: [{ status: "answered", answer: { value: "cannot_determine" } }] });
    expect(() => store.markApplied("unit:case-2:screenings-1")).toThrow("operator_answer_not_applicable");
  });
});
