import { describe, expect, it } from "vitest";
import {
  buildProject400ChannelForecast,
  calculateProject400Kpis,
  planProject400Portfolio,
  workBackwardsToProject400,
} from "./project400Model";

describe("Project 400 operating model", () => {
  it("misura il funnel lead → prima → seconda → quinta pratica senza nascondere i denominatori", () => {
    const kpis = calculateProject400Kpis({
      leads: 100,
      firstPractices: 25,
      secondPractices: 15,
      fifthPractices: 6,
    });

    expect(kpis.leadToFirst).toBeCloseTo(0.25);
    expect(kpis.firstToSecond).toBeCloseTo(0.6);
    expect(kpis.secondToFifth).toBeCloseTo(0.4);
    expect(kpis.leadToFifth).toBeCloseTo(0.06);
  });

  it("lavora a ritroso dal gap mensile di pratiche fino ai lead necessari", () => {
    const plan = workBackwardsToProject400({
      targetMonthlyPractices: 400,
      currentMonthlyPractices: 220,
      averageMonthlyPracticesPerFifthPracticeCustomer: 4,
      rates: {
        leadToFirst: 0.25,
        firstToSecond: 0.5,
        secondToFifth: 0.5,
      },
    });

    expect(plan.monthlyPracticeGap).toBe(180);
    expect(plan.requiredFifthPracticeCustomers).toBe(45);
    expect(plan.requiredSecondPractices).toBe(90);
    expect(plan.requiredFirstPractices).toBe(180);
    expect(plan.requiredLeads).toBe(720);
  });

  it("tratta il database storico come audience calda e prevede solo il lotto pianificato, non tutti i 600 contatti", () => {
    const forecast = buildProject400ChannelForecast({
      channelId: "legacy-crm",
      audience: "warm_legacy",
      availableLeads: 600,
      plannedContacts: 25,
      rates: {
        leadToFirst: 0.2,
        firstToSecond: 0.5,
        secondToFifth: 0.5,
      },
      averageMonthlyPracticesPerFifthPracticeCustomer: 3,
      costPerLead: 1,
    });

    expect(forecast.recommendedMotion).toBe("segmented-reactivation");
    expect(forecast.plannedContacts).toBe(25);
    expect(forecast.expectedFifthPracticeCustomers).toBeCloseTo(1.25);
    expect(forecast.expectedMonthlyPractices).toBeCloseTo(3.75);
    expect(forecast.projectedSpend).toBe(25);
    expect(forecast.costPerFifthPracticeCustomer).toBeCloseTo(20);
  });

  it("rifiuta un forecast warm legacy senza un lotto esplicito invece di assumere un mass blast", () => {
    expect(() => buildProject400ChannelForecast({
      channelId: "legacy-crm",
      audience: "warm_legacy",
      availableLeads: 600,
      rates: {
        leadToFirst: 0.2,
        firstToSecond: 0.5,
        secondToFifth: 0.5,
      },
      averageMonthlyPracticesPerFifthPracticeCustomer: 3,
    })).toThrow(/plannedContacts/);
  });

  it("rifiuta lotti superiori all'audience disponibile", () => {
    expect(() => buildProject400ChannelForecast({
      channelId: "legacy-crm",
      audience: "warm_legacy",
      availableLeads: 600,
      plannedContacts: 601,
      rates: {
        leadToFirst: 0.2,
        firstToSecond: 0.5,
        secondToFifth: 0.5,
      },
      averageMonthlyPracticesPerFifthPracticeCustomer: 3,
    })).toThrow(/availableLeads/);
  });

  it("separa la capacità dei canali dal gap ancora da coprire usando il lotto warm legacy, non l'intera audience", () => {
    const portfolio = planProject400Portfolio({
      targetMonthlyPractices: 400,
      currentMonthlyPractices: 250,
      channels: [
        {
          channelId: "legacy-crm",
          audience: "warm_legacy",
          availableLeads: 300,
          plannedContacts: 30,
          rates: { leadToFirst: 0.2, firstToSecond: 0.5, secondToFifth: 0.5 },
          averageMonthlyPracticesPerFifthPracticeCustomer: 4,
        },
        {
          channelId: "new-inbound",
          audience: "new_acquisition",
          availableLeads: 100,
          rates: { leadToFirst: 0.1, firstToSecond: 0.5, secondToFifth: 0.4 },
          averageMonthlyPracticesPerFifthPracticeCustomer: 4,
        },
      ],
    });

    expect(portfolio.currentGap).toBe(150);
    expect(portfolio.channels[0].plannedContacts).toBe(30);
    expect(portfolio.channels[1].plannedContacts).toBe(100);
    expect(portfolio.projectedIncrementalMonthlyPractices).toBeCloseTo(14);
    expect(portfolio.remainingGap).toBeCloseTo(136);
  });

  it("rifiuta rate fuori dominio invece di produrre un piano numericamente seducente ma falso", () => {
    expect(() => workBackwardsToProject400({
      targetMonthlyPractices: 400,
      currentMonthlyPractices: 200,
      averageMonthlyPracticesPerFifthPracticeCustomer: 4,
      rates: {
        leadToFirst: 1.2,
        firstToSecond: 0.5,
        secondToFifth: 0.5,
      },
    })).toThrow(/leadToFirst/);
  });
});
