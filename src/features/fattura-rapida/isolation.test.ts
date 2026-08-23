import { describe, expect, it, vi } from "vitest";
import { isIsolatedFatturaRapida, loadRootComponent } from "@/appBootstrap";

describe("shell isolata FatturaRapida", () => {
  it("è disponibile solo in DEV, anche con slash finale", async () => {
    expect(isIsolatedFatturaRapida(true, "/fattura-rapida")).toBe(true);
    expect(isIsolatedFatturaRapida(true, "/fattura-rapida/")).toBe(true);
    expect(isIsolatedFatturaRapida(false, "/fattura-rapida")).toBe(false);
    const app = vi.fn().mockResolvedValue({ default: () => null });
    const preview = vi.fn().mockResolvedValue({ default: () => null });
    const fatturaRapida = vi.fn().mockResolvedValue({ default: () => null });
    await loadRootComponent(true, "/fattura-rapida", { app, preview, fatturaRapida });
    await loadRootComponent(false, "/fattura-rapida", { app, preview, fatturaRapida });
    expect(fatturaRapida).toHaveBeenCalledOnce();
    expect(app).toHaveBeenCalledOnce();
    expect(preview).not.toHaveBeenCalled();
  });

  it("non inizializza rete per selezionare la shell locale", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const app = vi.fn();
    const preview = vi.fn();
    const fatturaRapida = vi.fn().mockResolvedValue({ default: () => null });
    await loadRootComponent(true, "/fattura-rapida", { app, preview, fatturaRapida });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
