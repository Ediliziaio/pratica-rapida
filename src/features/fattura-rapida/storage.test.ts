import { describe, expect, it, vi } from "vitest";
import { emptyWorkspace, loadWorkspace, saveWorkspace } from "./storage";

describe("storage multi-azienda FatturaRapida", () => {
  it("separa le chiavi per azienda", () => {
    const values: Record<string, string> = {};
    const storage = { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; } };
    saveWorkspace(storage, emptyWorkspace("demo-sole"));
    saveWorkspace(storage, emptyWorkspace("demo-casa"));
    expect(Object.keys(values)).toEqual(["fattura-rapida:workspace:v1:demo-sole", "fattura-rapida:workspace:v1:demo-casa"]);
  });

  it("rifiuta dati corrotti o appartenenti a un altro tenant", () => {
    expect(loadWorkspace({ getItem: () => "{" }, "demo-sole")).toEqual(emptyWorkspace("demo-sole"));
    const otherTenant = JSON.stringify({ ...emptyWorkspace("demo-casa"), quotes: [{ companyId: "demo-casa" }] });
    expect(loadWorkspace({ getItem: () => otherTenant }, "demo-sole")).toEqual(emptyWorkspace("demo-sole"));
  });

  it("degrada senza perdere il controllo se lo storage non è disponibile", () => {
    const setItem = vi.fn(() => { throw new Error("quota"); });
    expect(saveWorkspace({ setItem }, emptyWorkspace("demo-sole"))).toBe(false);
  });
});
