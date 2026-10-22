import { describe, expect, it } from "vitest";

import { isMobileViewportWidth, MOBILE_BREAKPOINT } from "./use-mobile";

describe("tablet navigation breakpoint", () => {
  it("usa il menu a scomparsa su telefoni e tablet fino a 1024px", () => {
    expect(isMobileViewportWidth(390)).toBe(true);
    expect(isMobileViewportWidth(768)).toBe(true);
    expect(isMobileViewportWidth(820)).toBe(true);
    expect(isMobileViewportWidth(1024)).toBe(true);
  });

  it("mantiene il menu desktop sopra la fascia tablet", () => {
    expect(MOBILE_BREAKPOINT).toBe(1025);
    expect(isMobileViewportWidth(1025)).toBe(false);
    expect(isMobileViewportWidth(1440)).toBe(false);
  });
});
