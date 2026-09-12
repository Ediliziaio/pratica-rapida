import {describe,expect,it} from "vitest";
import {registerPersistentLabBrowser,verifyPersistentLabBrowser} from "./persistentLabBrowser";
const observed={browserInstanceId:"lab-browser-001",profileId:"isolated-profile-001",profilePath:"/Users/demo/Library/Application Support/Google/Chrome/Default",crmTabIds:["crm-tab"],eneaTabIds:["enea-tab"],crmAuthenticated:true,eneaAuthenticated:true};
describe("browser laboratorio persistente",()=>{
 it("registra una volta e resta valido dopo riconnessione alla stessa istanza",()=>{const id=registerPersistentLabBrowser(observed)!;expect(verifyPersistentLabBrowser(id,{...observed})).toMatchObject({outcome:"ready"});});
 it("rifiuta una superficie browser diversa",()=>{const id=registerPersistentLabBrowser(observed)!;expect(verifyPersistentLabBrowser(id,{...observed,browserInstanceId:"other-browser"}).reason).toBe("instance_mismatch");});
 it("vieta schede duplicate e fallback",()=>{const id=registerPersistentLabBrowser(observed)!;expect(verifyPersistentLabBrowser(id,{...observed,eneaTabIds:["enea-tab","enea-fallback"]}).reason).toBe("duplicate_surface");expect(registerPersistentLabBrowser({...observed,crmTabIds:[] })).toBeNull();});
 it("trasforma la scadenza ENEA nel solo blocco globale login_required",()=>{const id=registerPersistentLabBrowser(observed)!;expect(verifyPersistentLabBrowser(id,{...observed,eneaAuthenticated:false})).toEqual({outcome:"not_ready",reason:"login_required",nextAction:"Eseguire una sola volta il login SPID nella scheda ENEA persistente."});});
 it("rifiuta definitivamente profili temporanei anche dopo riavvio",()=>{expect(registerPersistentLabBrowser({...observed,profilePath:"/private/tmp/enea-profile.123"})).toBeNull();expect(registerPersistentLabBrowser({...observed,profilePath:"/private/var/folders/x/profile"})).toBeNull();});
});
