import { describe, expect, it } from "vitest";
import { includeArchivedForCrmSearch } from "@/features/enea-shadow-crm/searchPolicy";

describe("includeArchivedForCrmSearch", () => {
  it("include il soft-archive durante una ricerca nominativa", () => {
    expect(includeArchivedForCrmSearch(false, "Fabio Sartori", "")).toBe(true);
  });

  it("include il soft-archive durante la ricerca cliente avanzata", () => {
    expect(includeArchivedForCrmSearch(false, "", "Sartori")).toBe(true);
  });

  it("mantiene il filtro ordinario quando non esiste alcuna ricerca", () => {
    expect(includeArchivedForCrmSearch(false, "   ", "")).toBe(false);
  });

  it("rispetta il toggle archiviate anche senza ricerca", () => {
    expect(includeArchivedForCrmSearch(true, "", "")).toBe(true);
  });
});
