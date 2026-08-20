import { describe, expect, it } from "vitest";
import { APR_SHADOW_RUNTIME_AUTHORIZATION } from "./aprShadowRuntimeAuthorization";
import { resolveEneaLabQueueMode } from "./useReadOnlyQueue";

describe("APR shadow runtime authorization bridge", () => {
  it("resta disattivato finche l'utente non concede il gate esplicito", () => {
    expect(APR_SHADOW_RUNTIME_AUTHORIZATION).toBeUndefined();
    expect(resolveEneaLabQueueMode(false, APR_SHADOW_RUNTIME_AUTHORIZATION)).toBe("pre-shadow");
  });
});
