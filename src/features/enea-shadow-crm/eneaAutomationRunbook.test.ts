import { describe, expect, it } from "vitest";
import { retryDecision, submitRecoveryDecision, summarizeEneaAutomationTimings, validateEneaAutomationPreflight } from "./eneaAutomationRunbook";

describe("runbook automazione ENEA zero-touch dopo SPID", () => {
  const ready = {
    cdpLoopbackUrl: "http://127.0.0.1:9333",
    datasetComplete: true,
    mappingComplete: true,
    calculationComplete: true,
    dialogSubscriptionInstalled: true,
    serverStatus: "draft" as const,
    cpid: null,
  };

  it("blocca sessioni non-CDP/non-loopback e lavoro non completato prima dello SPID", () => {
    expect(validateEneaAutomationPreflight({ ...ready, cdpLoopbackUrl: "", mappingComplete: false, dialogSubscriptionInstalled: false }))
      .toEqual(expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(["cdp-url-non-valido", "mapping-incompleto-prima-spid", "dialog-listener-non-installato"]) }));
    expect(validateEneaAutomationPreflight({ ...ready, cdpLoopbackUrl: "https://example.com:9333" }))
      .toEqual(expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(["cdp-non-loopback"]) }));
    expect(validateEneaAutomationPreflight(ready)).toEqual({ allowed: true, runbookVersion: "enea-cdp-zero-touch-v1" });
  });

  it("consente un solo submit e vieta retry finché il server non chiarisce l'esito", () => {
    expect(retryDecision({ serverStatus: "draft", cpid: null, submitAttempts: 0 })).toBe("single-submit-allowed");
    expect(retryDecision({ serverStatus: "draft", cpid: null, submitAttempts: 1 })).toBe("no-retry-operator-review");
    expect(retryDecision({ serverStatus: "unknown", cpid: null, submitAttempts: 1 })).toBe("no-retry-operator-review");
    expect(retryDecision({ serverStatus: "submitted", cpid: "CPID-TEST", submitAttempts: 1 })).toBe("complete");
  });

  it("mantiene la bozza senza richiedere l'utente quando l'automazione submit non è disponibile", () => {
    expect(submitRecoveryDecision({ automationState: "automation_submit_unavailable", serverStatus: "draft", cpid: null, nativeConfirmationVerified: false }))
      .toBe("keep-draft-no-user-action");
    expect(submitRecoveryDecision({ automationState: "available", serverStatus: "draft", cpid: null, nativeConfirmationVerified: true }))
      .toBe("single-submit-allowed");
    expect(submitRecoveryDecision({ automationState: "submit_uncertain", serverStatus: "unknown", cpid: null, nativeConfirmationVerified: false }))
      .toBe("server-verification-required");
    expect(submitRecoveryDecision({ automationState: "submit_uncertain", serverStatus: "submitted", cpid: "CPID-TEST", nativeConfirmationVerified: false }))
      .toBe("complete");
  });

  it("misura ogni fase e il tempo complessivo senza stime", () => {
    expect(summarizeEneaAutomationTimings([
      { phase: "preflight", startedAtMs: 0, endedAtMs: 100 },
      { phase: "spid_wait", startedAtMs: 100, endedAtMs: 500 },
      { phase: "submit", startedAtMs: 500, endedAtMs: 650 },
    ])).toMatchObject({ totalMs: 650, phases: [{ durationMs: 100 }, { durationMs: 400 }, { durationMs: 150 }] });
  });
});
