export const ENEA_SESSION_LEASE_VERSION = "enea-session-lease-v1" as const;
export const ENEA_SESSION_LEASE_STORAGE_KEY = "enea-shadow-crm:enea-session-lease:v1";
export const ENEA_KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;
export const ENEA_KEEPALIVE_GRACE_MS = 60 * 1000;
export type InnocuousEneaSurface = "dashboard" | "summary" | "allowed_navigation";
export interface EneaKeepaliveInput { method:string; surface:InnocuousEneaSurface; action:string; hasBody?:boolean; mutativeIntent?:boolean }

export interface EneaSessionLeaseEvent { id:string; at:string; type:"session_reused"|"keepalive_ok"|"keepalive_failed"|"server_session_verified"|"lease_expired"|"login_required"; surface:InnocuousEneaSurface; detail:string }
export interface EneaSessionLease { version:typeof ENEA_SESSION_LEASE_VERSION; sessionId:string; status:"active"|"stopped"; globalClassification:"authenticated"|"blocked"|"login_required"; startedAt:string; lastKeepaliveAt:string|null; lastServerProofAt:string|null; stopReason:string|null; events:EneaSessionLeaseEvent[] }
export interface EneaSessionDiscovery { existingVisible:boolean; authenticated:boolean; sessionId:string|null }
export type EneaKeepaliveScheduleState = "not_due" | "due" | "overdue" | "stopped";
export interface EneaKeepaliveSchedule {
  state:EneaKeepaliveScheduleState;
  dueAt:string|null;
  overdueAt:string|null;
  queueMayUseEnea:boolean;
  nextAction:"none"|"read_existing_dashboard"|"stop_enea_globally";
}

export function decideEneaSession(discovery:EneaSessionDiscovery):"reuse_existing"|"login_required" {
  return discovery.existingVisible&&discovery.authenticated&&Boolean(discovery.sessionId)?"reuse_existing":"login_required";
}
export function startEneaSessionLease(discovery:EneaSessionDiscovery,now=new Date()):EneaSessionLease|null {
  if(decideEneaSession(discovery)!=="reuse_existing") return null;
  return {version:ENEA_SESSION_LEASE_VERSION,sessionId:discovery.sessionId!,status:"active",globalClassification:"authenticated",startedAt:now.toISOString(),lastKeepaliveAt:null,lastServerProofAt:now.toISOString(),stopReason:null,events:[{id:`lease-${now.getTime()}-0`,at:now.toISOString(),type:"session_reused",surface:"dashboard",detail:"Sessione ENEA autenticata esistente riusata; nessuna nuova finestra."}]};
}
export function isAllowedKeepalive(input:EneaKeepaliveInput):boolean {
  return ["GET","HEAD"].includes(input.method.toUpperCase()) && ["dashboard","summary","allowed_navigation"].includes(input.surface)
    && input.hasBody !== true && input.mutativeIntent !== true
    && !/(submit|secondo\s+invio|invia|save|salva|preview|anteprima|receipt|ricevuta|post|modify|update|delete)/i.test(input.action);
}
export function recordEneaKeepalive(lease:EneaSessionLease,input:EneaKeepaliveInput&{ok:boolean;serverVerified:boolean;reason?:string},now=new Date()):EneaSessionLease {
  if(lease.status!=="active") return lease;
  if(!isAllowedKeepalive(input)) return {...lease,status:"stopped",globalClassification:"blocked",stopReason:"forbidden_keepalive_action",events:[...lease.events,{id:`lease-${now.getTime()}-${lease.events.length}`,at:now.toISOString(),type:"keepalive_failed",surface:input.surface,detail:"Azione keepalive non consentita; parte ENEA sospesa globalmente."}]};
  const event:EneaSessionLeaseEvent={id:`lease-${now.getTime()}-${lease.events.length}`,at:now.toISOString(),type:input.ok?"keepalive_ok":"keepalive_failed",surface:input.surface,detail:input.ok?"Navigazione innocua completata.":(input.reason||"Sessione non verificabile.")};
  if(!input.ok||!input.serverVerified) return {...lease,status:"stopped",globalClassification:"blocked",stopReason:input.reason||"server_session_not_verified",events:[...lease.events,event]};
  return {...lease,lastKeepaliveAt:now.toISOString(),lastServerProofAt:now.toISOString(),events:[...lease.events,event,{id:`lease-${now.getTime()}-${lease.events.length+1}`,at:now.toISOString(),type:"server_session_verified",surface:input.surface,detail:"Prova server di sessione autenticata acquisita."}]};
}
export function leaseAllowsEneaAction(lease:EneaSessionLease|null):boolean { return Boolean(lease&&lease.status==="active"&&lease.lastServerProofAt); }
export function scheduleEneaKeepalive(lease:EneaSessionLease|null,now=new Date()):EneaKeepaliveSchedule {
  if(!lease||lease.status!=="active") return {state:"stopped",dueAt:null,overdueAt:null,queueMayUseEnea:false,nextAction:"stop_enea_globally"};
  const base=Date.parse(lease.lastKeepaliveAt??lease.startedAt);
  const due=base+ENEA_KEEPALIVE_INTERVAL_MS;
  const overdue=due+ENEA_KEEPALIVE_GRACE_MS;
  if(now.getTime()>overdue) return {state:"overdue",dueAt:new Date(due).toISOString(),overdueAt:new Date(overdue).toISOString(),queueMayUseEnea:false,nextAction:"stop_enea_globally"};
  if(now.getTime()>=due) return {state:"due",dueAt:new Date(due).toISOString(),overdueAt:new Date(overdue).toISOString(),queueMayUseEnea:false,nextAction:"read_existing_dashboard"};
  return {state:"not_due",dueAt:new Date(due).toISOString(),overdueAt:new Date(overdue).toISOString(),queueMayUseEnea:true,nextAction:"none"};
}
export function stopOverdueEneaLease(lease:EneaSessionLease|null,now=new Date()):EneaSessionLease|null {
  if(!lease||scheduleEneaKeepalive(lease,now).state!=="overdue") return lease;
  return {...lease,status:"stopped",globalClassification:"blocked",stopReason:"lease_expired",events:[...lease.events,{id:`lease-${now.getTime()}-${lease.events.length}`,at:now.toISOString(),type:"lease_expired",surface:"dashboard",detail:"Timeout keepalive: lease scaduta e gate globale chiuso; il logout non è inferito e la prova precedente resta auditata."}]};
}
export function recordServerVerifiedLogout(lease:EneaSessionLease,evidenceId:string,now=new Date()):EneaSessionLease {
  if(!evidenceId.trim()) throw new Error("Il logout globale richiede un evidenceId server non vuoto.");
  return {...lease,status:"stopped",globalClassification:"login_required",stopReason:"server_verified_logout",events:[...lease.events,{id:`lease-${now.getTime()}-${lease.events.length}`,at:now.toISOString(),type:"login_required",surface:"dashboard",detail:`Logout provato dal server (${evidenceId}); login_required globale senza ticket pratica.`}]};
}
export function saveEneaSessionLease(storage:Storage,lease:EneaSessionLease):boolean {try{storage.setItem(ENEA_SESSION_LEASE_STORAGE_KEY,JSON.stringify(lease));return true;}catch{return false;}}
export function loadEneaSessionLease(storage:Storage):EneaSessionLease|null {try{const raw=storage.getItem(ENEA_SESSION_LEASE_STORAGE_KEY);if(!raw)return null;const l=JSON.parse(raw) as EneaSessionLease;return l.version===ENEA_SESSION_LEASE_VERSION&&Array.isArray(l.events)?{...l,globalClassification:l.globalClassification??(l.status==="active"?"authenticated":"blocked")}:null;}catch{return null;}}
