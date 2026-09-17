import { describe, expect, it } from "vitest";
import { isAprCaseWithdrawnByOperator, summariseAprLotAcceptance, type AprLotCaseInput } from "./aprLotAcceptanceSummary";

const caso = (over: Partial<AprLotCaseInput> = {}): AprLotCaseInput => ({
  customerKey: "eugenio-codognato",
  state: "saved",
  preflightState: "ready_local_plan",
  dispositionKind: null,
  withdrawalReason: null,
  persistedQuestionCount: 0,
  ...over,
});

const ritirata = (over: Partial<AprLotCaseInput> = {}) => caso({
  state: "operator_required",
  preflightState: "deferred_operator",
  dispositionKind: "user_deferred",
  withdrawalReason: "Fine lavori oltre il termine legale di 90 giorni.",
  ...over,
});

describe("standard di accettazione: o salvata, o arrivata con la sua domanda", () => {
  it("una pratica ferma senza domanda e' non conforme, non 'in attesa di operatore'", () => {
    const summary = summariseAprLotAcceptance([caso({ state: "operator_required", persistedQuestionCount: 0 })]);
    expect(summary).toMatchObject({ salvate: 0, conDomanda: 0, nonConformi: 1 });
    expect(summary.fermeSenzaDomanda).toEqual(["eugenio-codognato"]);
    expect(summary.casi[0].reason).toContain("non e' arrivata all'operatore");
  });

  it("una pratica ferma con la domanda scritta rispetta lo standard", () => {
    const summary = summariseAprLotAcceptance([caso({ state: "technical_block", persistedQuestionCount: 2 })]);
    expect(summary).toMatchObject({ conDomanda: 1, nonConformi: 0 });
    expect(summary.fermeSenzaDomanda).toEqual([]);
  });

  it("le pratiche ritirate escono dal denominatore invece di contare come fallimenti", () => {
    const summary = summariseAprLotAcceptance([
      caso({ customerKey: "a", state: "saved" }),
      caso({ customerKey: "b", state: "saved" }),
      caso({ customerKey: "c", state: "saved" }),
      ritirata({ customerKey: "d" }),
    ]);
    expect(summary).toMatchObject({ presentate: 4, lavorabili: 3, ritirate: 1, salvate: 3, autonomiaPercento: 100 });
  });

  it("il motivo del ritiro viene riportato, non riassunto", () => {
    const [assessment] = summariseAprLotAcceptance([ritirata({ withdrawalReason: "Pratica dichiarata chiusa da Giuliano." })]).casi;
    expect(assessment.verdict).toBe("ritirata");
    expect(assessment.reason).toContain("Pratica dichiarata chiusa da Giuliano.");
  });

  it("non basta essere fermi per essere ritirati: serve la disposizione dell'operatore", () => {
    expect(isAprCaseWithdrawnByOperator(caso({ state: "technical_block", preflightState: "blocked_case" }))).toBe(false);
    expect(isAprCaseWithdrawnByOperator(caso({ preflightState: "deferred_operator", dispositionKind: null }))).toBe(false);
    expect(isAprCaseWithdrawnByOperator(ritirata())).toBe(true);
  });

  it("una pratica salvata resta salvata anche se qualcuno le aveva scritto una domanda", () => {
    expect(summariseAprLotAcceptance([caso({ state: "saved", persistedQuestionCount: 3 })]))
      .toMatchObject({ salvate: 1, conDomanda: 0 });
  });

  it("riproduce il lotto r121: 76 presentate, 71 lavorabili, 48 salvate, 26 ferme senza domanda", () => {
    const cases: AprLotCaseInput[] = [
      ...Array.from({ length: 48 }, (_, index) => caso({ customerKey: `salvata-${index}`, state: "saved" })),
      ...Array.from({ length: 2 }, (_, index) => caso({ customerKey: `domanda-${index}`, state: "operator_required", persistedQuestionCount: 1 })),
      ...Array.from({ length: 21 }, (_, index) => caso({ customerKey: `muta-${index}`, state: "technical_block" })),
      ...Array.from({ length: 5 }, (_, index) => ritirata({ customerKey: `ritirata-${index}` })),
    ];
    expect(summariseAprLotAcceptance(cases)).toMatchObject({
      presentate: 76, lavorabili: 71, salvate: 48, conDomanda: 2, nonConformi: 21, ritirate: 5, autonomiaPercento: 67.6,
    });
  });

  it("senza pratiche lavorabili non inventa una percentuale", () => {
    expect(summariseAprLotAcceptance([ritirata()]).autonomiaPercento).toBeNull();
    expect(summariseAprLotAcceptance([]).autonomiaPercento).toBeNull();
  });
});
