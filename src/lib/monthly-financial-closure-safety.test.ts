import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/KanbanBoard.tsx"), "utf8");

describe("monthly financial closure source", () => {
  it("uses the permanent ingresso-in-gestionale event instead of practice creation", () => {
    expect(source).toContain('.from("cruscotto_pratiche_da_crm")');
    expect(source).toContain('.gte("entrato_in_stage_at", financialMonthWindow.from)');
    expect(source).toContain('revenue_at: enteredAtByPractice.get(practice.id)!');
    expect(source).not.toContain('.gte("created_at", financialMonthWindow.from)');
  });
});
