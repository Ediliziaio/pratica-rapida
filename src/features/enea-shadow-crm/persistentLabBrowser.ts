export const PERSISTENT_LAB_BROWSER_VERSION = "enea-persistent-browser-v1" as const;
export const PERSISTENT_LAB_BROWSER_STORAGE_KEY = "enea-shadow-crm:persistent-browser:v1";

export interface PersistentLabBrowserIdentity { version:typeof PERSISTENT_LAB_BROWSER_VERSION; browserInstanceId:string; profileId:string; profilePath:string; crmTabId:string; eneaTabId:string; registeredAt:string }
export interface PersistentBrowserObservation { browserInstanceId:string; profileId:string; profilePath:string; crmTabIds:string[]; eneaTabIds:string[]; crmAuthenticated:boolean; eneaAuthenticated:boolean }
export interface PersistentBrowserStatus { outcome:"ready"|"not_ready"; reason:"ok"|"not_registered"|"instance_mismatch"|"duplicate_surface"|"tab_mismatch"|"crm_not_authenticated"|"login_required"; nextAction:string }

const validId=(v:string)=>/^[a-zA-Z0-9._:-]{3,160}$/.test(v);
export function isPersistentProfilePath(path:string):boolean {
  const normalized=path.replace(/\\/g,"/");
  return normalized.startsWith("/Users/") && !normalized.includes("/private/tmp/") && !normalized.includes("/var/folders/");
}
export function registerPersistentLabBrowser(observation:PersistentBrowserObservation,now=new Date()):PersistentLabBrowserIdentity|null {
  if(!validId(observation.browserInstanceId)||!validId(observation.profileId)||!isPersistentProfilePath(observation.profilePath)||observation.crmTabIds.length!==1||observation.eneaTabIds.length!==1) return null;
  return {version:PERSISTENT_LAB_BROWSER_VERSION,browserInstanceId:observation.browserInstanceId,profileId:observation.profileId,profilePath:observation.profilePath,crmTabId:observation.crmTabIds[0],eneaTabId:observation.eneaTabIds[0],registeredAt:now.toISOString()};
}
export function verifyPersistentLabBrowser(identity:PersistentLabBrowserIdentity|null,observation:PersistentBrowserObservation):PersistentBrowserStatus {
  if(!identity)return {outcome:"not_ready",reason:"not_registered",nextAction:"Avviare una volta la sessione laboratorio persistente."};
  if(!isPersistentProfilePath(identity.profilePath)||!isPersistentProfilePath(observation.profilePath)||identity.browserInstanceId!==observation.browserInstanceId||identity.profileId!==observation.profileId||identity.profilePath!==observation.profilePath)return {outcome:"not_ready",reason:"instance_mismatch",nextAction:"Ricollegare esclusivamente l'istanza laboratorio persistente registrata."};
  if(observation.crmTabIds.length!==1||observation.eneaTabIds.length!==1)return {outcome:"not_ready",reason:"duplicate_surface",nextAction:"Ripristinare le due sole schede registrate senza crearne altre."};
  if(identity.crmTabId!==observation.crmTabIds[0]||identity.eneaTabId!==observation.eneaTabIds[0])return {outcome:"not_ready",reason:"tab_mismatch",nextAction:"Recuperare le schede persistenti registrate; nessun fallback."};
  if(!observation.crmAuthenticated)return {outcome:"not_ready",reason:"crm_not_authenticated",nextAction:"Eseguire il login iniziale CRM nella sessione dedicata."};
  if(!observation.eneaAuthenticated)return {outcome:"not_ready",reason:"login_required",nextAction:"Eseguire una sola volta il login SPID nella scheda ENEA persistente."};
  return {outcome:"ready",reason:"ok",nextAction:"Coda autorizzabile sulla sessione unica."};
}
export function savePersistentLabBrowser(storage:Storage,identity:PersistentLabBrowserIdentity):boolean {try{storage.setItem(PERSISTENT_LAB_BROWSER_STORAGE_KEY,JSON.stringify(identity));return true;}catch{return false;}}
export function loadPersistentLabBrowser(storage:Storage):PersistentLabBrowserIdentity|null {try{const raw=storage.getItem(PERSISTENT_LAB_BROWSER_STORAGE_KEY);if(!raw)return null;const i=JSON.parse(raw) as PersistentLabBrowserIdentity;return i.version===PERSISTENT_LAB_BROWSER_VERSION&&validId(i.browserInstanceId)&&validId(i.profileId)&&isPersistentProfilePath(i.profilePath)?i:null;}catch{return null;}}
