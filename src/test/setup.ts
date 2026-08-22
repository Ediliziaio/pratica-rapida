import "@testing-library/jest-dom";
import { vi } from "vitest";

// Alcuni moduli importano il client Supabase anche nei test pur senza eseguire
// query. Valori locali e non sensibili mantengono la suite riproducibile senza
// dipendere dai secret di produzione o della CI.
vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-anon-key");

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
