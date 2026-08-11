import { describe, expect, it } from "vitest";
import { classifyCommercialHealth } from "./healthPolicy";

describe("commercial health policy", () => {
  it("riconosce azienda mai attivata", () => {
    expect(classifyCommercialHealth({
      totalPractices: 0,
      practicesLast30d: 0,
      practicesPrev30d: 0,
      firstPracticeDaysAgo: null,
      lastPracticeDaysAgo: null,
    })).toEqual({ status: "mai_attivato", attentionScore: 60 });
  });

  it("porta in cima un cliente che si ferma dopo attivita recente", () => {
    expect(classifyCommercialHealth({
      totalPractices: 20,
      practicesLast30d: 0,
      practicesPrev30d: 6,
      firstPracticeDaysAgo: 200,
      lastPracticeDaysAgo: 31,
    })).toEqual({ status: "a_rischio", attentionScore: 100 });
  });

  it("considera a rischio un calo almeno del 50 percento con base significativa", () => {
    expect(classifyCommercialHealth({
      totalPractices: 30,
      practicesLast30d: 3,
      practicesPrev30d: 8,
      firstPracticeDaysAgo: 250,
      lastPracticeDaysAgo: 8,
    }).status).toBe("a_rischio");
  });

  it("separa un calo moderato dal rischio forte", () => {
    expect(classifyCommercialHealth({
      totalPractices: 30,
      practicesLast30d: 6,
      practicesPrev30d: 8,
      firstPracticeDaysAgo: 250,
      lastPracticeDaysAgo: 5,
    }).status).toBe("in_calo");
  });

  it("riconosce crescita e cliente nuovo attivo", () => {
    expect(classifyCommercialHealth({
      totalPractices: 8,
      practicesLast30d: 6,
      practicesPrev30d: 2,
      firstPracticeDaysAgo: 80,
      lastPracticeDaysAgo: 2,
    }).status).toBe("in_crescita");

    expect(classifyCommercialHealth({
      totalPractices: 2,
      practicesLast30d: 1,
      practicesPrev30d: 1,
      firstPracticeDaysAgo: 10,
      lastPracticeDaysAgo: 2,
    }).status).toBe("nuovo_attivo");
  });

  it("mantiene in onboarding un nuovo cliente anche se il confronto sembra crescita", () => {
    expect(classifyCommercialHealth({
      totalPractices: 3,
      practicesLast30d: 3,
      practicesPrev30d: 0,
      firstPracticeDaysAgo: 12,
      lastPracticeDaysAgo: 1,
    })).toEqual({ status: "nuovo_attivo", attentionScore: 40 });
  });

  it("riconosce inattivita lunga prima degli altri confronti", () => {
    expect(classifyCommercialHealth({
      totalPractices: 10,
      practicesLast30d: 0,
      practicesPrev30d: 0,
      firstPracticeDaysAgo: 400,
      lastPracticeDaysAgo: 90,
    })).toEqual({ status: "inattivo", attentionScore: 90 });
  });
});
