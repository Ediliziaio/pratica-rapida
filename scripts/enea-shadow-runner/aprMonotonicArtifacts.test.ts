import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalSha256, envelopeImmutableArtifact, verifyImmutableArtifactEnvelope } from "./aprMonotonicArtifacts";

describe("APR monotonic immutable artifacts", () => {
  it("serializza gli oggetti in modo canonico indipendentemente dall'ordine delle chiavi", () => {
    const first = { z: 1, nested: { b: true, a: "value" }, list: [3, 2, 1] };
    const second = { list: [3, 2, 1], nested: { a: "value", b: true }, z: 1 };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalSha256(first)).toBe(canonicalSha256(second));
  });

  it("calcola l'ID sul solo payload e rileva la manomissione dell'envelope", () => {
    const envelope = envelopeImmutableArtifact({ schemaVersion: "fixture-v1", value: 42 });
    expect(verifyImmutableArtifactEnvelope(envelope)).toBe(true);
    expect(verifyImmutableArtifactEnvelope({ ...envelope, payload: { ...envelope.payload, value: 43 } })).toBe(false);
  });

  it("mantiene lo stesso artifactId con percorsi locali differenti", () => {
    const payload = { schemaVersion: "fixture-v1", logicalRef: "apr-bundle-staging" };
    const first = envelopeImmutableArtifact(payload, { root: "/machine-a/worktree" });
    const second = envelopeImmutableArtifact(payload, { root: "/machine-b/worktree" });
    expect(first.artifactId).toBe(second.artifactId);
    expect(first.localMetadata).not.toEqual(second.localMetadata);
    expect(verifyImmutableArtifactEnvelope(first)).toBe(true);
    expect(verifyImmutableArtifactEnvelope(second)).toBe(true);
  });

  it("rifiuta valori non canonici invece di produrre hash ambigui", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/non_finite/);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
  });
});
