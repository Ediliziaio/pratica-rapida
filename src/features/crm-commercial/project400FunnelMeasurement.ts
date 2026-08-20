import type { Project400IdentityResolution } from "./project400Identity";
import type { Project400Audience } from "./project400Model";

export type Project400AcquisitionAudience = Exclude<
  Project400Audience,
  "existing_customer_reactivation"
>;

export type Project400FunnelMeasurementBlocker =
  | "invalid-runtime-shape"
  | "invalid-maturity-window"
  | "invalid-observation-date"
  | "future-observation"
  | "duplicate-lead-id"
  | "duplicate-practice-id"
  | "unsupported-audience-for-acquisition-funnel"
  | "invalid-matched-identity"
  | "duplicate-matched-company"
  | "preexisting-practice-before-lead"
  | "identity-resolution-incomplete";

export interface Project400LeadObservation {
  id: string;
  channelId: string;
  audience: Project400Audience;
  createdAt: string;
  identity: Project400IdentityResolution;
}

export interface Project400PracticeObservation {
  id: string;
  companyId: string;
  createdAt: string;
}

export interface Project400FunnelMaturityWindows {
  /** Giorni minimi concessi a un lead prima di misurare lead -> prima pratica. */
  leadToFirstDays: number;
  /** Giorni minimi dalla prima pratica prima di misurare prima -> seconda. */
  firstToSecondDays: number;
  /** Giorni minimi dalla seconda pratica prima di misurare seconda -> quinta. */
  secondToFifthDays: number;
}

export interface Project400FunnelMeasurementInput {
  asOf: string;
  leads: readonly Project400LeadObservation[];
  practices: readonly Project400PracticeObservation[];
  maturity: Project400FunnelMaturityWindows;
}

export interface Project400IdentityCoverage {
  total: number;
  matched: number;
  needsReview: number;
  ambiguous: number;
  unmatched: number;
  matchedShare: number | null;
}

export interface Project400MeasuredStage {
  /** Coorte matura rispetto alla finestra dello stadio. */
  eligible: number;
  /** Elementi della coorte per cui l'identita e abbastanza risolta da misurare. */
  resolvedEligible: number;
  /** Elementi maturi ancora ambigui/da revisionare. */
  unresolvedEligible: number;
  converted: number;
  /** Indicatore direzionale sui soli casi risolti. */
  observedRate: number | null;
  /** KPI utilizzabile per decisioni solo quando l'intera coorte matura e risolta. */
  certifiedRate: number | null;
}

export interface Project400FunnelMeasurementResult {
  evidenceValid: boolean;
  blockers: Project400FunnelMeasurementBlocker[];
  identity: Project400IdentityCoverage;
  leadToFirst: Project400MeasuredStage;
  firstToSecond: Project400MeasuredStage;
  secondToFifth: Project400MeasuredStage;
  officialActionsAllowed: false;
}

const DAY_MS = 86_400_000;
const ACQUISITION_AUDIENCES = new Set<Project400Audience>([
  "warm_legacy",
  "new_acquisition",
]);

function emptyStage(): Project400MeasuredStage {
  return {
    eligible: 0,
    resolvedEligible: 0,
    unresolvedEligible: 0,
    converted: 0,
    observedRate: null,
    certifiedRate: null,
  };
}

function emptyIdentity(): Project400IdentityCoverage {
  return {
    total: 0,
    matched: 0,
    needsReview: 0,
    ambiguous: 0,
    unmatched: 0,
    matchedShare: null,
  };
}

function invalidResult(
  blockers: Project400FunnelMeasurementBlocker[],
): Project400FunnelMeasurementResult {
  return {
    evidenceValid: false,
    blockers: [...new Set(blockers)],
    identity: emptyIdentity(),
    leadToFirst: emptyStage(),
    firstToSecond: emptyStage(),
    secondToFifth: emptyStage(),
    officialActionsAllowed: false,
  };
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isMaturityWindow(value: unknown): value is number {
  return Number.isInteger(value) && Number.isFinite(value) && (value as number) >= 0;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function buildStage(
  eligible: number,
  resolvedEligible: number,
  converted: number,
): Project400MeasuredStage {
  const unresolvedEligible = Math.max(0, eligible - resolvedEligible);
  return {
    eligible,
    resolvedEligible,
    unresolvedEligible,
    converted,
    observedRate: rate(converted, resolvedEligible),
    certifiedRate: unresolvedEligible === 0 ? rate(converted, eligible) : null,
  };
}

function hasDuplicateIds(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Misura il funnel lead -> prima -> seconda -> quinta pratica sulle coorti
 * effettivamente mature. Nessuna finestra temporale viene inventata: e il
 * chiamante a dichiarare quanti giorni servono prima di considerare uno stadio
 * osservabile.
 *
 * Il vecchio CRM (~600 contatti warm legacy) puo quindi essere misurato come
 * audience calda senza confonderlo con i clienti gia attivi. Se una societa
 * aveva pratiche prima del lead, l'evidenza viene fermata invece di attribuire
 * arbitrariamente quelle pratiche alla campagna di acquisizione.
 *
 * Le identita ambiguous/needs_review non vengono trasformate in non-conversioni:
 * producono un observedRate direzionale sui casi risolti ma tengono il
 * certifiedRate a null finche la coorte matura non e completamente attribuita.
 */
export function measureProject400AcquisitionFunnel(
  input: Project400FunnelMeasurementInput,
): Project400FunnelMeasurementResult {
  if (
    input == null
    || typeof input !== "object"
    || !Array.isArray(input.leads)
    || !Array.isArray(input.practices)
    || input.maturity == null
    || typeof input.maturity !== "object"
  ) {
    return invalidResult(["invalid-runtime-shape"]);
  }

  const blockers: Project400FunnelMeasurementBlocker[] = [];
  const asOf = parseDate(input.asOf);
  if (asOf == null) blockers.push("invalid-observation-date");

  if (
    !isMaturityWindow(input.maturity.leadToFirstDays)
    || !isMaturityWindow(input.maturity.firstToSecondDays)
    || !isMaturityWindow(input.maturity.secondToFifthDays)
  ) {
    blockers.push("invalid-maturity-window");
  }

  const leadIds: string[] = [];
  const practiceIds: string[] = [];
  const leadTimestamps = new Map<string, number>();
  const practiceTimestamps = new Map<string, number>();

  for (const lead of input.leads) {
    if (
      lead == null
      || typeof lead !== "object"
      || !isCanonicalId(lead.id)
      || !isCanonicalId(lead.channelId)
      || lead.identity == null
      || typeof lead.identity !== "object"
    ) {
      blockers.push("invalid-runtime-shape");
      continue;
    }
    leadIds.push(lead.id);
    const timestamp = parseDate(lead.createdAt);
    if (timestamp == null) blockers.push("invalid-observation-date");
    else {
      leadTimestamps.set(lead.id, timestamp);
      if (asOf != null && timestamp > asOf) blockers.push("future-observation");
    }
    if (!ACQUISITION_AUDIENCES.has(lead.audience)) {
      blockers.push("unsupported-audience-for-acquisition-funnel");
    }
    if (lead.identity.status === "matched" && !isCanonicalId(lead.identity.companyId)) {
      blockers.push("invalid-matched-identity");
    }
  }

  for (const practice of input.practices) {
    if (
      practice == null
      || typeof practice !== "object"
      || !isCanonicalId(practice.id)
      || !isCanonicalId(practice.companyId)
    ) {
      blockers.push("invalid-runtime-shape");
      continue;
    }
    practiceIds.push(practice.id);
    const timestamp = parseDate(practice.createdAt);
    if (timestamp == null) blockers.push("invalid-observation-date");
    else {
      practiceTimestamps.set(practice.id, timestamp);
      if (asOf != null && timestamp > asOf) blockers.push("future-observation");
    }
  }

  if (hasDuplicateIds(leadIds)) blockers.push("duplicate-lead-id");
  if (hasDuplicateIds(practiceIds)) blockers.push("duplicate-practice-id");

  const matchedCompanyIds = input.leads
    .filter((lead) => lead?.identity?.status === "matched" && isCanonicalId(lead.identity.companyId))
    .map((lead) => lead.identity.companyId as string);
  if (hasDuplicateIds(matchedCompanyIds)) blockers.push("duplicate-matched-company");

  const structuralBlockers = blockers.filter(
    (blocker) => blocker !== "identity-resolution-incomplete",
  );
  if (structuralBlockers.length > 0 || asOf == null) {
    return invalidResult(blockers);
  }

  const practicesByCompany = new Map<string, Array<{ id: string; timestamp: number }>>();
  for (const practice of input.practices) {
    const timestamp = practiceTimestamps.get(practice.id);
    if (timestamp == null) continue;
    const companyPractices = practicesByCompany.get(practice.companyId) ?? [];
    companyPractices.push({ id: practice.id, timestamp });
    practicesByCompany.set(practice.companyId, companyPractices);
  }
  for (const practices of practicesByCompany.values()) {
    practices.sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  }

  const identity: Project400IdentityCoverage = {
    total: input.leads.length,
    matched: 0,
    needsReview: 0,
    ambiguous: 0,
    unmatched: 0,
    matchedShare: null,
  };

  let leadEligible = 0;
  let leadResolvedEligible = 0;
  let leadConverted = 0;
  let firstEligible = 0;
  let firstConverted = 0;
  let secondEligible = 0;
  let fifthConverted = 0;
  let unresolvedMatureIdentities = 0;

  for (const lead of input.leads) {
    if (lead.identity.status === "matched") identity.matched += 1;
    else if (lead.identity.status === "needs_review") identity.needsReview += 1;
    else if (lead.identity.status === "ambiguous") identity.ambiguous += 1;
    else identity.unmatched += 1;

    const leadTimestamp = leadTimestamps.get(lead.id);
    if (leadTimestamp == null) continue;
    const leadAgeDays = (asOf - leadTimestamp) / DAY_MS;
    const matureForFirst = leadAgeDays >= input.maturity.leadToFirstDays;
    if (matureForFirst) leadEligible += 1;

    if (lead.identity.status === "needs_review" || lead.identity.status === "ambiguous") {
      if (matureForFirst) unresolvedMatureIdentities += 1;
      continue;
    }

    if (matureForFirst) leadResolvedEligible += 1;
    if (lead.identity.status === "unmatched") continue;

    const companyId = lead.identity.companyId as string;
    const allCompanyPractices = practicesByCompany.get(companyId) ?? [];
    const preexisting = allCompanyPractices.some((practice) => practice.timestamp < leadTimestamp);
    if (preexisting) {
      blockers.push("preexisting-practice-before-lead");
      continue;
    }

    const postLeadPractices = allCompanyPractices.filter(
      (practice) => practice.timestamp >= leadTimestamp && practice.timestamp <= asOf,
    );
    const first = postLeadPractices[0];
    const second = postLeadPractices[1];
    const fifth = postLeadPractices[4];

    if (matureForFirst && first) leadConverted += 1;

    if (first) {
      const firstAgeDays = (asOf - first.timestamp) / DAY_MS;
      if (firstAgeDays >= input.maturity.firstToSecondDays) {
        firstEligible += 1;
        if (second) firstConverted += 1;
      }
    }

    if (second) {
      const secondAgeDays = (asOf - second.timestamp) / DAY_MS;
      if (secondAgeDays >= input.maturity.secondToFifthDays) {
        secondEligible += 1;
        if (fifth) fifthConverted += 1;
      }
    }
  }

  identity.matchedShare = rate(identity.matched, identity.total);

  if (blockers.includes("preexisting-practice-before-lead")) {
    return invalidResult(blockers);
  }
  if (unresolvedMatureIdentities > 0) blockers.push("identity-resolution-incomplete");

  return {
    evidenceValid: true,
    blockers: [...new Set(blockers)],
    identity,
    leadToFirst: buildStage(leadEligible, leadResolvedEligible, leadConverted),
    firstToSecond: buildStage(firstEligible, firstEligible, firstConverted),
    secondToFifth: buildStage(secondEligible, secondEligible, fifthConverted),
    officialActionsAllowed: false,
  };
}
