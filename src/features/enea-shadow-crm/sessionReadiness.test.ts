import {describe,expect,it} from "vitest";
import {canStartQueue,checkSessionReadiness,loadSessionReadiness,queueStartDecision,saveSessionReadiness} from "./sessionReadiness";
const green={authorizedChromeVisible:true,crmDedicatedSessionVisible:true,crmAuthenticated:true,crmReadOnlyPageReachable:true,eneaSessionVisible:true,eneaAuthenticated:true,crmOriginAllowlisted:true,attachmentReadCapabilityVerified:true,eneaLeaseActive:true,persistentBrowserIdentityVerified:true};
describe("session readiness contract",()=>{
 it("abilita la coda solo con tutte le capacità verdi",()=>{const r=checkSessionReadiness(green,new Date("2026-08-13T20:00:00Z"));expect(canStartQueue(r)).toBe(true);expect(r.outcome).toBe("ready");});
 it("rifiuta prima dell'avvio con una sola segnalazione tecnica",()=>{const r=checkSessionReadiness({...green,authorizedChromeVisible:false,eneaAuthenticated:false});expect(queueStartDecision(r)).toEqual({accepted:false,reason:"session_not_ready"});expect(r.checks.filter(c=>!c.ok).map(c=>c.reason)).toEqual(["authorized_chrome_not_visible","enea_not_authenticated"]);});
 it("non crea ticket pratica e decade se una sessione sparisce",()=>{expect(canStartQueue(checkSessionReadiness({...green,crmDedicatedSessionVisible:false}))).toBe(false);});
 it("persiste e degrada in sicurezza",()=>{const values:Record<string,string>={};const storage={getItem:(k:string)=>values[k]??null,setItem:(k:string,v:string)=>{values[k]=v;},removeItem:()=>{},clear:()=>{},key:()=>null,length:0} as Storage;const run=checkSessionReadiness(green);expect(saveSessionReadiness(storage,run)).toBe(true);expect(loadSessionReadiness(storage)).toEqual(run);values[Object.keys(values)[0]]="{}";expect(loadSessionReadiness(storage)).toBeNull();});
});
