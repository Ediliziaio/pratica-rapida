import { describe, expect, it } from "vitest";
import { createAcquisitionArtifact, verifyAcquisitionArtifact } from "./aprAcquisitionLevelObservation";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("APR Slice 6 L1 acquisition artifact", () => {
  it("sigilla documenti e pagine complete senza eseguire acquisizione", () => {
    const artifact = createAcquisitionArtifact({
      customerKey: "l1-complete",
      practiceId: "practice-l1-complete",
      documents: [{
        documentId: "invoice",
        pages: [
          { pageId: "invoice:2", pageNumber: 2, contentSha256: HASH_B, acquisitionMethod: "ocr", outcome: "complete" },
          { pageId: "invoice:1", pageNumber: 1, contentSha256: HASH_A, acquisitionMethod: "upload", outcome: "complete" },
        ],
      }],
    });
    expect(artifact.payload).toMatchObject({ status: "completed", blockerCodes: [], operationalAuthority: false });
    expect(artifact.payload.documents[0].pages.map((page) => page.pageId)).toEqual(["invoice:1", "invoice:2"]);
    expect(verifyAcquisitionArtifact(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.payload.documents[0].pages[0])).toBe(true);
  });

  it("propaga pagine illeggibili e mancanti come blocchi L1 espliciti", () => {
    const artifact = createAcquisitionArtifact({
      customerKey: "l1-blocked",
      practiceId: "practice-l1-blocked",
      documents: [{
        documentId: "technical",
        pages: [
          { pageId: "technical:1", pageNumber: 1, contentSha256: HASH_A, acquisitionMethod: "ocr", outcome: "unreadable" },
          { pageId: "technical:2", pageNumber: 2, contentSha256: null, acquisitionMethod: null, outcome: "missing" },
        ],
      }],
    });
    expect(artifact.payload.status).toBe("blocked");
    expect(artifact.payload.blockerCodes).toEqual([
      "apr_l1_page_missing:technical:technical:2",
      "apr_l1_page_unreadable:technical:technical:1",
    ]);
    expect(verifyAcquisitionArtifact(artifact)).toBe(true);
  });

  it("e deterministico rispetto all'ordine di documenti e pagine", () => {
    const documents = [
      { documentId: "form", pages: [{ pageId: "form:1", pageNumber: 1, contentSha256: HASH_A, acquisitionMethod: "text_extraction" as const, outcome: "complete" as const }] },
      { documentId: "invoice", pages: [{ pageId: "invoice:1", pageNumber: 1, contentSha256: HASH_B, acquisitionMethod: "upload" as const, outcome: "complete" as const }] },
    ];
    const first = createAcquisitionArtifact({ customerKey: "l1-deterministic", practiceId: "practice-l1-deterministic", documents });
    const second = createAcquisitionArtifact({ customerKey: "l1-deterministic", practiceId: "practice-l1-deterministic", documents: [...documents].reverse() });
    expect(first).toEqual(second);
    expect(first.artifactId).toBe(second.artifactId);
  });

  it("rifiuta input che fingono contenuto per una pagina mancante", () => {
    expect(() => createAcquisitionArtifact({
      customerKey: "l1-invalid",
      practiceId: "practice-l1-invalid",
      documents: [{ documentId: "invoice", pages: [{ pageId: "invoice:1", pageNumber: 1, contentSha256: HASH_A, acquisitionMethod: "upload", outcome: "missing" }] }],
    })).toThrow("apr_l1_missing_page_has_content:invoice:invoice:1");
  });
});
