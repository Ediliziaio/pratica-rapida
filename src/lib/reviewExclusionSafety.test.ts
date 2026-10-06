import { describe, expect, it } from "vitest";
import {
  isReviewExcluded,
  isReviewRequestTemplate,
} from "../../supabase/functions/_shared/review-exclusion";

describe("review exclusion safety", () => {
  it("esclude soltanto una pratica marcata esplicitamente", () => {
    expect(isReviewExcluded({ recensione_esclusa: true })).toBe(true);
    expect(isReviewExcluded({ recensione_esclusa: false })).toBe(false);
    expect(isReviewExcluded({ recensione_esclusa: null })).toBe(false);
    expect(isReviewExcluded(undefined)).toBe(false);
  });

  it("riconosce tutti i template che chiedono una recensione", () => {
    expect(isReviewRequestTemplate("recensione")).toBe(true);
    expect(isReviewRequestTemplate("richiesta_recensione")).toBe(true);
    expect(isReviewRequestTemplate("sollecito_recensione")).toBe(true);
    expect(isReviewRequestTemplate("pratica_inviata_recensione")).toBe(true);
  });

  it("non blocca le normali comunicazioni di consegna", () => {
    expect(isReviewRequestTemplate("pratica_completata")).toBe(false);
    expect(isReviewRequestTemplate("pratica_inviata")).toBe(false);
    expect(isReviewRequestTemplate("form_compilato")).toBe(false);
  });
});
