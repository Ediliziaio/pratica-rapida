export type Project400Audience = "warm_legacy" | "new_acquisition" | "existing_customer_reactivation";
export type Project400Motion = "segmented-reactivation" | "acquisition" | "retention-recovery";

export interface Project400FunnelCounts {
  leads: number;
  firstPractices: number;
  secondPractices: number;
  fifthPractices: number;
}

export interface Project400FunnelRates {
  leadToFirst: number;
  firstToSecond: number;
  secondToFifth: number;
}

export interface Project400Kpis {
  leadToFirst: number | null;
  firstToSecond: number | null;
  secondToFifth: number | null;
  leadToFifth: number | null;
}

export interface Project400BackwardsInput {
  targetMonthlyPractices: number;
  currentMonthlyPractices: number;
  averageMonthlyPracticesPerFifthPracticeCustomer: number;
  rates: Project400FunnelRates;
}

export interface Project400BackwardsPlan {
  targetMonthlyPractices: number;
  currentMonthlyPractices: number;
  monthlyPracticeGap: number;
  funnelConversionToFifth: number;
  requiredFifthPracticeCustomers: number;
  requiredSecondPractices: number;
  requiredFirstPractices: number;
  requiredLeads: number;
}

export interface Project400ChannelInput {
  channelId: string;
  audience: Project400Audience;
  availableLeads: number;
  /**
   * Contatti che si intende realmente lavorare nel ciclo corrente.
   * Per warm_legacy è obbligatorio: l'intera audience storica non può essere
   * usata implicitamente come se fosse un mass blast.
   */
  plannedContacts?: number;
  rates: Project400FunnelRates;
  averageMonthlyPracticesPerFifthPracticeCustomer: number;
  costPerLead?: number;
}

export interface Project400ChannelForecast extends Project400ChannelInput {
  plannedContacts: number;
  recommendedMotion: Project400Motion;
  funnelConversionToFifth: number;
  expectedFirstPractices: number;
  expectedSecondPractices: number;
  expectedFifthPracticeCustomers: number;
  expectedMonthlyPractices: number;
  projectedSpend: number | null;
  costPerFifthPracticeCustomer: number | null;
  costPerIncrementalMonthlyPractice: number | null;
}

export interface Project400PortfolioInput {
  targetMonthlyPractices: number;
  currentMonthlyPractices: number;
  channels: Project400ChannelInput[];
}

export interface Project400PortfolioPlan {
  targetMonthlyPractices: number;
  currentMonthlyPractices: number;
  currentGap: number;
  channels: Project400ChannelForecast[];
  projectedIncrementalMonthlyPractices: number;
  remainingGap: number;
  projectedSurplus: number;
  projectedSpend: number | null;
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} deve essere un numero finito >= 0`);
  }
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} deve essere un numero finito > 0`);
  }
}

function assertRate(name: keyof Project400FunnelRates, value: number, allowZero = true): void {
  const min = allowZero ? 0 : Number.EPSILON;
  if (!Number.isFinite(value) || value < min || value > 1) {
    throw new Error(`${name} deve essere compreso tra ${allowZero ? "0" : "0 escluso"} e 1`);
  }
}

function validateRates(rates: Project400FunnelRates, allowZero = true): void {
  assertRate("leadToFirst", rates.leadToFirst, allowZero);
  assertRate("firstToSecond", rates.firstToSecond, allowZero);
  assertRate("secondToFifth", rates.secondToFifth, allowZero);
}

function conversionToFifth(rates: Project400FunnelRates): number {
  return rates.leadToFirst * rates.firstToSecond * rates.secondToFifth;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function calculateProject400Kpis(counts: Project400FunnelCounts): Project400Kpis {
  assertFiniteNonNegative("leads", counts.leads);
  assertFiniteNonNegative("firstPractices", counts.firstPractices);
  assertFiniteNonNegative("secondPractices", counts.secondPractices);
  assertFiniteNonNegative("fifthPractices", counts.fifthPractices);

  if (counts.firstPractices > counts.leads) {
    throw new Error("firstPractices non può superare leads");
  }
  if (counts.secondPractices > counts.firstPractices) {
    throw new Error("secondPractices non può superare firstPractices");
  }
  if (counts.fifthPractices > counts.secondPractices) {
    throw new Error("fifthPractices non può superare secondPractices");
  }

  return {
    leadToFirst: rate(counts.firstPractices, counts.leads),
    firstToSecond: rate(counts.secondPractices, counts.firstPractices),
    secondToFifth: rate(counts.fifthPractices, counts.secondPractices),
    leadToFifth: rate(counts.fifthPractices, counts.leads),
  };
}

export function workBackwardsToProject400(input: Project400BackwardsInput): Project400BackwardsPlan {
  assertPositive("targetMonthlyPractices", input.targetMonthlyPractices);
  assertFiniteNonNegative("currentMonthlyPractices", input.currentMonthlyPractices);
  assertPositive(
    "averageMonthlyPracticesPerFifthPracticeCustomer",
    input.averageMonthlyPracticesPerFifthPracticeCustomer,
  );
  validateRates(input.rates, false);

  const monthlyPracticeGap = Math.max(0, input.targetMonthlyPractices - input.currentMonthlyPractices);
  const funnelConversionToFifth = conversionToFifth(input.rates);
  const requiredFifthPracticeCustomers = Math.ceil(
    monthlyPracticeGap / input.averageMonthlyPracticesPerFifthPracticeCustomer,
  );
  const requiredSecondPractices = Math.ceil(
    requiredFifthPracticeCustomers / input.rates.secondToFifth,
  );
  const requiredFirstPractices = Math.ceil(
    requiredSecondPractices / input.rates.firstToSecond,
  );
  const requiredLeads = Math.ceil(requiredFirstPractices / input.rates.leadToFirst);

  return {
    targetMonthlyPractices: input.targetMonthlyPractices,
    currentMonthlyPractices: input.currentMonthlyPractices,
    monthlyPracticeGap,
    funnelConversionToFifth,
    requiredFifthPracticeCustomers,
    requiredSecondPractices,
    requiredFirstPractices,
    requiredLeads,
  };
}

function motionForAudience(audience: Project400Audience): Project400Motion {
  if (audience === "warm_legacy") return "segmented-reactivation";
  if (audience === "existing_customer_reactivation") return "retention-recovery";
  return "acquisition";
}

function resolvePlannedContacts(input: Project400ChannelInput): number {
  if (input.audience === "warm_legacy" && input.plannedContacts === undefined) {
    throw new Error("plannedContacts è obbligatorio per warm_legacy: il forecast non può assumere un mass blast");
  }

  const plannedContacts = input.plannedContacts ?? input.availableLeads;
  assertFiniteNonNegative("plannedContacts", plannedContacts);

  if (plannedContacts > input.availableLeads) {
    throw new Error("plannedContacts non può superare availableLeads");
  }

  return plannedContacts;
}

export function buildProject400ChannelForecast(input: Project400ChannelInput): Project400ChannelForecast {
  if (!input.channelId.trim()) throw new Error("channelId è obbligatorio");
  assertFiniteNonNegative("availableLeads", input.availableLeads);
  assertPositive(
    "averageMonthlyPracticesPerFifthPracticeCustomer",
    input.averageMonthlyPracticesPerFifthPracticeCustomer,
  );
  validateRates(input.rates);
  if (input.costPerLead !== undefined) assertFiniteNonNegative("costPerLead", input.costPerLead);

  const plannedContacts = resolvePlannedContacts(input);
  const expectedFirstPractices = plannedContacts * input.rates.leadToFirst;
  const expectedSecondPractices = expectedFirstPractices * input.rates.firstToSecond;
  const expectedFifthPracticeCustomers = expectedSecondPractices * input.rates.secondToFifth;
  const expectedMonthlyPractices = (
    expectedFifthPracticeCustomers * input.averageMonthlyPracticesPerFifthPracticeCustomer
  );
  const projectedSpend = input.costPerLead === undefined
    ? null
    : plannedContacts * input.costPerLead;

  return {
    ...input,
    plannedContacts,
    recommendedMotion: motionForAudience(input.audience),
    funnelConversionToFifth: conversionToFifth(input.rates),
    expectedFirstPractices,
    expectedSecondPractices,
    expectedFifthPracticeCustomers,
    expectedMonthlyPractices,
    projectedSpend,
    costPerFifthPracticeCustomer: projectedSpend !== null && expectedFifthPracticeCustomers > 0
      ? projectedSpend / expectedFifthPracticeCustomers
      : null,
    costPerIncrementalMonthlyPractice: projectedSpend !== null && expectedMonthlyPractices > 0
      ? projectedSpend / expectedMonthlyPractices
      : null,
  };
}

export function planProject400Portfolio(input: Project400PortfolioInput): Project400PortfolioPlan {
  assertPositive("targetMonthlyPractices", input.targetMonthlyPractices);
  assertFiniteNonNegative("currentMonthlyPractices", input.currentMonthlyPractices);

  const channels = input.channels.map(buildProject400ChannelForecast);
  const currentGap = Math.max(0, input.targetMonthlyPractices - input.currentMonthlyPractices);
  const projectedIncrementalMonthlyPractices = channels.reduce(
    (total, channel) => total + channel.expectedMonthlyPractices,
    0,
  );
  const projectedSpendValues = channels.map((channel) => channel.projectedSpend);
  const hasCompleteSpendData = projectedSpendValues.every((value) => value !== null);
  const projectedSpend = hasCompleteSpendData
    ? projectedSpendValues.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null;

  return {
    targetMonthlyPractices: input.targetMonthlyPractices,
    currentMonthlyPractices: input.currentMonthlyPractices,
    currentGap,
    channels,
    projectedIncrementalMonthlyPractices,
    remainingGap: Math.max(0, currentGap - projectedIncrementalMonthlyPractices),
    projectedSurplus: Math.max(0, projectedIncrementalMonthlyPractices - currentGap),
    projectedSpend,
  };
}
