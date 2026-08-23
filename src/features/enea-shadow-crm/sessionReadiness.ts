export const SESSION_READINESS_CONTRACT_VERSION = "enea-session-readiness-v1" as const;
export const SESSION_READINESS_STORAGE_KEY = "enea-shadow-crm:session-readiness:v1";

export interface SessionReadinessInput {
  authorizedChromeVisible: boolean;
  crmDedicatedSessionVisible: boolean;
  crmAuthenticated: boolean;
  crmReadOnlyPageReachable: boolean;
  eneaSessionVisible: boolean;
  eneaAuthenticated: boolean;
  crmOriginAllowlisted: boolean;
  attachmentReadCapabilityVerified: boolean;
  eneaLeaseActive: boolean;
  persistentBrowserIdentityVerified: boolean;
}
export type SessionReadinessReason =
  | "authorized_chrome_not_visible" | "crm_session_not_visible" | "crm_not_authenticated"
  | "crm_readonly_unreachable" | "enea_session_not_visible" | "enea_not_authenticated"
  | "crm_origin_not_allowlisted" | "attachment_read_not_verified" | "enea_lease_not_active" | "persistent_browser_mismatch";
export interface SessionReadinessCheck { key: keyof SessionReadinessInput; ok: boolean; reason: SessionReadinessReason | null }
export interface SessionReadinessRun {
  id: string;
  version: typeof SESSION_READINESS_CONTRACT_VERSION;
  checkedAt: string;
  outcome: "ready" | "session_not_ready";
  checks: SessionReadinessCheck[];
}

const CHECKS: ReadonlyArray<[keyof SessionReadinessInput, SessionReadinessReason]> = [
  ["authorizedChromeVisible", "authorized_chrome_not_visible"], ["crmDedicatedSessionVisible", "crm_session_not_visible"],
  ["crmAuthenticated", "crm_not_authenticated"], ["crmReadOnlyPageReachable", "crm_readonly_unreachable"],
  ["eneaSessionVisible", "enea_session_not_visible"], ["eneaAuthenticated", "enea_not_authenticated"],
  ["crmOriginAllowlisted", "crm_origin_not_allowlisted"], ["attachmentReadCapabilityVerified", "attachment_read_not_verified"],
  ["eneaLeaseActive", "enea_lease_not_active"],
  ["persistentBrowserIdentityVerified", "persistent_browser_mismatch"],
];

export function checkSessionReadiness(input: SessionReadinessInput, now = new Date()): SessionReadinessRun {
  const checks=CHECKS.map(([key,reason])=>({key,ok:input[key],reason:input[key]?null:reason}));
  return { id:`session-check-${now.getTime()}`, version:SESSION_READINESS_CONTRACT_VERSION, checkedAt:now.toISOString(), outcome:checks.every(c=>c.ok)?"ready":"session_not_ready", checks };
}
export function canStartQueue(run: SessionReadinessRun | null): boolean {
  return Boolean(run && run.version===SESSION_READINESS_CONTRACT_VERSION && run.outcome==="ready" && run.checks.length===CHECKS.length && run.checks.every((c,i)=>c.key===CHECKS[i][0]&&c.ok));
}
export function queueStartDecision(run: SessionReadinessRun | null): {accepted:true}|{accepted:false;reason:"session_not_ready"} {
  return canStartQueue(run)?{accepted:true}:{accepted:false,reason:"session_not_ready"};
}
export function saveSessionReadiness(storage:Storage,run:SessionReadinessRun):boolean { try{storage.setItem(SESSION_READINESS_STORAGE_KEY,JSON.stringify(run));return true;}catch{return false;} }
export function loadSessionReadiness(storage:Storage):SessionReadinessRun|null { try{const raw=storage.getItem(SESSION_READINESS_STORAGE_KEY);if(!raw)return null;const run=JSON.parse(raw) as SessionReadinessRun;return run.version===SESSION_READINESS_CONTRACT_VERSION&&Array.isArray(run.checks)?run:null;}catch{return null;} }
