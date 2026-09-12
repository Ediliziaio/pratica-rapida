import { describe,expect,it } from "vitest";
import { browserSessionKeepaliveAllowed, checkBrowserColdStart, checkBrowserSessionContract, globalQueueStartDecision } from "./browserSessionContract";

const ready={registeredBrowserInstanceId:"browser-1",observedBrowserInstanceId:"browser-1",registeredProfileId:"profile-1",observedProfileId:"profile-1",crmTabs:[{id:"crm-1",authenticated:true}],eneaTabs:[{id:"enea-1",authenticated:true}],registeredCrmTabId:"crm-1",registeredEneaTabId:"enea-1",childDocumentSurfaces:[{id:"pdf-1",parentTabId:"crm-1"}]};
describe("browser-session-contract-v1",()=>{
  it("blocca globalmente se manca CRM senza creare ticket cliente",()=>expect(checkBrowserSessionContract({...ready,crmTabs:[]})).toMatchObject({outcome:"session_not_ready",reason:"crm_missing_or_duplicate",queueMayStart:false,createFallbackAllowed:false}));
  it("blocca ENEA duplicata",()=>expect(checkBrowserSessionContract({...ready,eneaTabs:[...ready.eneaTabs,{id:"enea-2",authenticated:true}]})).toMatchObject({reason:"enea_missing_or_duplicate",queueMayStart:false}));
  it("blocca profilo o istanza diversa",()=>{
    expect(checkBrowserSessionContract({...ready,observedBrowserInstanceId:"browser-2"}).reason).toBe("instance_mismatch");
    expect(checkBrowserSessionContract({...ready,observedProfileId:"profile-2"}).reason).toBe("profile_mismatch");
  });
  it("riusa le due schede registrate e tratta i PDF come superfici figlie",()=>expect(checkBrowserSessionContract(ready)).toMatchObject({outcome:"ready",queueMayStart:true,reason:"ok"}));
  it("consente keepalive solo read-only innocuo e mai submit",()=>{
    expect(browserSessionKeepaliveAllowed({method:"GET",surface:"dashboard",action:"verifica sessione"})).toBe(true);
    expect(browserSessionKeepaliveAllowed({method:"POST",surface:"dashboard",action:"submit"})).toBe(false);
  });
  it("impedisce l'inizio coda prima del prerequisito globale",()=>expect(globalQueueStartDecision(checkBrowserSessionContract({...ready,crmTabs:[]}),null)).toEqual({accepted:false,reason:"session_not_ready"}));
  it("separa login personale iniziale dal lavoro autonomo successivo",()=>{
    const cold={bootId:"boot-2",previousBootId:"boot-1",browserInstanceCount:1,persistentProfileCount:1,crmTabs:[{id:"crm-new",authenticated:false}],eneaTabs:[{id:"enea-new",authenticated:false}]};
    expect(checkBrowserColdStart(cold)).toMatchObject({phase:"initial_personal_setup",outcome:"setup_required",requiresPersonalLogin:true,perPracticeUserActionAllowed:false});
    expect(checkBrowserColdStart({...cold,crmTabs:[{id:"crm-new",authenticated:true}],eneaTabs:[{id:"enea-new",authenticated:true}]})).toMatchObject({phase:"autonomous_queue_ready",outcome:"ready",requiresPersonalLogin:false,perPracticeUserActionAllowed:false});
  });
  it("rifiuta stato precedente, istanze duplicate e schede mancanti all'avvio a freddo",()=>{
    const base={bootId:"boot-2",previousBootId:"boot-1",browserInstanceCount:1,persistentProfileCount:1,crmTabs:[{id:"crm",authenticated:true}],eneaTabs:[{id:"enea",authenticated:true}]};
    expect(checkBrowserColdStart({...base,previousBootId:"boot-2"}).reason).toBe("not_cold_start");
    expect(checkBrowserColdStart({...base,browserInstanceCount:2}).reason).toBe("multiple_instances_or_profiles");
    expect(checkBrowserColdStart({...base,eneaTabs:[]}).reason).toBe("missing_or_duplicate_tabs");
  });
});
