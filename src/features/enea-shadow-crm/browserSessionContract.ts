import { isAllowedKeepalive, type InnocuousEneaSurface } from "./eneaSessionLease";
import { canStartQueue, type SessionReadinessRun } from "./sessionReadiness";

export const BROWSER_SESSION_CONTRACT_VERSION = "browser-session-contract-v1" as const;
export const BROWSER_COLD_START_VERSION = "browser-session-cold-start-v1" as const;

export interface BrowserColdStartInput {
  bootId: string;
  previousBootId: string | null;
  browserInstanceCount: number;
  persistentProfileCount: number;
  crmTabs: readonly { id:string; authenticated:boolean }[];
  eneaTabs: readonly { id:string; authenticated:boolean }[];
}
export interface BrowserColdStartResult {
  version:typeof BROWSER_COLD_START_VERSION;
  phase:"initial_personal_setup"|"autonomous_queue_ready"|"session_not_ready";
  outcome:"setup_required"|"ready"|"session_not_ready";
  requiresPersonalLogin:boolean;
  perPracticeUserActionAllowed:false;
  reason:"login_required_once"|"ok"|"not_cold_start"|"multiple_instances_or_profiles"|"missing_or_duplicate_tabs";
}

export function checkBrowserColdStart(input:BrowserColdStartInput):BrowserColdStartResult {
  const base={version:BROWSER_COLD_START_VERSION,perPracticeUserActionAllowed:false as const};
  if(!input.bootId.trim()||input.previousBootId===input.bootId) return {...base,phase:"session_not_ready",outcome:"session_not_ready",requiresPersonalLogin:false,reason:"not_cold_start"};
  if(input.browserInstanceCount!==1||input.persistentProfileCount!==1) return {...base,phase:"session_not_ready",outcome:"session_not_ready",requiresPersonalLogin:false,reason:"multiple_instances_or_profiles"};
  if(input.crmTabs.length!==1||input.eneaTabs.length!==1) return {...base,phase:"session_not_ready",outcome:"session_not_ready",requiresPersonalLogin:false,reason:"missing_or_duplicate_tabs"};
  if(!input.crmTabs[0].authenticated||!input.eneaTabs[0].authenticated) return {...base,phase:"initial_personal_setup",outcome:"setup_required",requiresPersonalLogin:true,reason:"login_required_once"};
  return {...base,phase:"autonomous_queue_ready",outcome:"ready",requiresPersonalLogin:false,reason:"ok"};
}

export interface BrowserSessionContractInput {
  registeredBrowserInstanceId: string;
  observedBrowserInstanceId: string;
  registeredProfileId: string;
  observedProfileId: string;
  crmTabs: readonly { id: string; authenticated: boolean }[];
  eneaTabs: readonly { id: string; authenticated: boolean }[];
  registeredCrmTabId: string;
  registeredEneaTabId: string;
  childDocumentSurfaces: readonly { id: string; parentTabId: string }[];
}

export interface BrowserSessionContractResult {
  version: typeof BROWSER_SESSION_CONTRACT_VERSION;
  outcome: "ready" | "session_not_ready";
  reason: "ok" | "instance_mismatch" | "profile_mismatch" | "crm_missing_or_duplicate" | "enea_missing_or_duplicate" | "tab_not_reused" | "authentication_missing" | "orphan_child_surface";
  queueMayStart: boolean;
  createFallbackAllowed: false;
}

export function checkBrowserSessionContract(input: BrowserSessionContractInput): BrowserSessionContractResult {
  const stop = (reason: BrowserSessionContractResult["reason"]): BrowserSessionContractResult => ({ version:BROWSER_SESSION_CONTRACT_VERSION,outcome:"session_not_ready",reason,queueMayStart:false,createFallbackAllowed:false });
  if(input.registeredBrowserInstanceId!==input.observedBrowserInstanceId) return stop("instance_mismatch");
  if(input.registeredProfileId!==input.observedProfileId) return stop("profile_mismatch");
  if(input.crmTabs.length!==1) return stop("crm_missing_or_duplicate");
  if(input.eneaTabs.length!==1) return stop("enea_missing_or_duplicate");
  if(input.crmTabs[0].id!==input.registeredCrmTabId||input.eneaTabs[0].id!==input.registeredEneaTabId) return stop("tab_not_reused");
  if(!input.crmTabs[0].authenticated||!input.eneaTabs[0].authenticated) return stop("authentication_missing");
  if(input.childDocumentSurfaces.some(surface=>![input.registeredCrmTabId,input.registeredEneaTabId].includes(surface.parentTabId))) return stop("orphan_child_surface");
  return {version:BROWSER_SESSION_CONTRACT_VERSION,outcome:"ready",reason:"ok",queueMayStart:true,createFallbackAllowed:false};
}

export function browserSessionKeepaliveAllowed(input:{method:string;surface:InnocuousEneaSurface;action:string}) {
  return isAllowedKeepalive(input);
}

export function globalQueueStartDecision(browser:BrowserSessionContractResult,readiness:SessionReadinessRun|null,coldStart?:BrowserColdStartResult) {
  return browser.outcome==="ready"&&browser.queueMayStart&&canStartQueue(readiness)&&(!coldStart||coldStart.outcome==="ready")
    ? {accepted:true as const}
    : {accepted:false as const,reason:"session_not_ready" as const};
}
