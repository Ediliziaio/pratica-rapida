import { describe, expect, it } from "vitest";
import { resolveProject400Identity } from "./project400Identity";

describe("Project 400 identity resolution", () => {
  const companies = [
    { id: "a", email: "info@azienda-a.it", phone: "+39 351 111 1111" },
    { id: "b", email: "info@azienda-b.it", phone: "+39 351 222 2222" },
  ];

  it("collega automaticamente solo una corrispondenza forte e univoca", () => {
    expect(resolveProject400Identity(
      { id: "lead-1", email: " INFO@AZIENDA-A.IT ", phone: null },
      companies,
    )).toEqual({
      status: "matched",
      companyId: "a",
      matchedBy: ["email"],
      candidateCompanyIds: ["a"],
    });
  });

  it("non sceglie tra email e telefono che indicano aziende diverse", () => {
    const result = resolveProject400Identity(
      { id: "lead-2", email: "info@azienda-a.it", phone: "+39 351 222 2222" },
      companies,
    );

    expect(result.status).toBe("ambiguous");
    expect(result.candidateCompanyIds).toEqual(["a", "b"]);
  });

  it("non auto-collega una variante telefonica solo nazionale: la manda a revisione", () => {
    const result = resolveProject400Identity(
      { id: "legacy-1", email: null, phone: "3511111111" },
      companies,
    );

    expect(result).toEqual({
      status: "needs_review",
      companyId: null,
      matchedBy: ["phone-national"],
      candidateCompanyIds: ["a"],
    });
  });

  it("resta fail-closed se due aziende condividono la stessa email", () => {
    const result = resolveProject400Identity(
      { id: "lead-3", email: "shared@example.it", phone: null },
      [
        { id: "a", email: "shared@example.it", phone: null },
        { id: "b", email: "shared@example.it", phone: null },
      ],
    );

    expect(result.status).toBe("ambiguous");
    expect(result.candidateCompanyIds).toEqual(["a", "b"]);
  });

  it("non inventa un collegamento quando non esiste evidenza sufficiente", () => {
    expect(resolveProject400Identity(
      { id: "lead-4", email: "nobody@example.it", phone: "3330000000" },
      companies,
    )).toEqual({
      status: "unmatched",
      companyId: null,
      matchedBy: [],
      candidateCompanyIds: [],
    });
  });
});
