export type EneaPortalControl = "input" | "select" | "autocomplete" | "button";

export interface EneaPortalRuntimeField {
  portalId: string;
  control: EneaPortalControl;
  value: string;
  selectValue?: string;
}

export interface EneaPortalScriptOptions {
  fields: EneaPortalRuntimeField[];
  pageName: string;
  markerIds: string[];
  successMessage: string;
}

export interface EneaPortalWorkflowStep extends EneaPortalScriptOptions {
  id: string;
}

interface EneaPortalWorkflowOptions {
  practiceCode: string;
  steps: EneaPortalWorkflowStep[];
  screeningSteps: EneaPortalWorkflowStep[];
}

/**
 * Genera uno script autosufficiente da eseguire manualmente nella Console ENEA.
 * Lo script compila soltanto i controlli osservati: non cerca né attiva pulsanti
 * di salvataggio, avanzamento o invio.
 */
export function buildEneaPortalRuntimeScript({
  fields,
  pageName,
  markerIds,
  successMessage,
}: EneaPortalScriptOptions): string {
  const data = JSON.stringify(fields);
  const markers = JSON.stringify(markerIds);
  const wrongPageMessage = JSON.stringify(
    `Aprire la pagina ${pageName} del portale ENEA prima di eseguire la compilazione.`,
  );
  const completionMessage = JSON.stringify(successMessage);

  return `(async()=>{const data=${data};const markers=${markers};const result={compiled:[],notFound:[],notAvailable:[],notSelected:[]};if(!/(^|\\.)enea\\.it$/i.test(location.hostname)||!markers.every(id=>document.getElementById(id))){throw new Error(${wrongPageMessage});}const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const setValue=(element,value)=>{const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;if(setter)setter.call(element,value);else element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));};const chooseAutocomplete=async(element,value)=>{element.focus();setValue(element,value);element.dispatchEvent(new KeyboardEvent("keyup",{key:value.slice(-1),bubbles:true}));const wanted=normalize(value);for(let attempt=0;attempt<25;attempt+=1){await wait(100);const candidates=[...document.querySelectorAll('[role="option"],.ui-autocomplete li,.awesomplete li,.autocomplete-item,.dropdown-menu .dropdown-item,.list-group-item')];const candidate=candidates.find(item=>{const text=normalize(item.textContent);return text===wanted||text.startsWith(wanted+" (")||text.startsWith(wanted+" -")});if(!candidate)continue;const target=candidate.querySelector("a,button")||candidate;for(const type of ["mousedown","mouseup","click"]){target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}await wait(150);return normalize(element.value)===wanted||normalize(element.value).startsWith(wanted+" (");}return false;};for(const item of data){const element=document.getElementById(item.portalId);if(!element){result.notFound.push(item.portalId);continue;}if(item.control==="autocomplete"){if(!await chooseAutocomplete(element,item.value)){result.notSelected.push(item.portalId);continue;}}else if(item.control==="select"){const wanted=normalize(item.value);const option=[...element.options].find(candidate=>(item.selectValue&&candidate.value===item.selectValue)||normalize(candidate.value)===wanted||normalize(candidate.text)===wanted);if(!option){result.notAvailable.push(item.portalId);continue;}setValue(element,option.value);await wait(50);}else if(item.control==="button"){if(!(element instanceof HTMLElement)||element.hasAttribute("disabled")||element.classList.contains("disabled")){result.notAvailable.push(item.portalId);continue;}for(const type of ["mousedown","mouseup","click"]){element.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}await wait(150);}else{setValue(element,item.value);}result.compiled.push(item.portalId);}console.info(${completionMessage},result);return result;})()`;
}

/**
 * Genera un unico comando riutilizzabile sulle pagine ENEA gia mappate.
 * Riconosce la pagina dai controlli presenti e compila soltanto quella pagina.
 * Non attiva mai Salva, Avanti, Conferma o Invia.
 */
export function buildEneaPortalWorkflowRuntimeScript({
  practiceCode,
  steps,
  screeningSteps,
}: EneaPortalWorkflowOptions): string {
  const serializedSteps = JSON.stringify(steps);
  const serializedScreenings = JSON.stringify(screeningSteps);
  const storageKey = JSON.stringify(`enea-lab:${practiceCode}:schermatura`);

  return `(async()=>{
    const steps=${serializedSteps};
    const screenings=${serializedScreenings};
    const storageKey=${storageKey};
    if(!/(^|\\.)enea\\.it$/i.test(location.hostname))throw new Error("Aprire una pagina della pratica sul portale ENEA.");
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");
    const setValue=(element,value)=>{const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;if(setter)setter.call(element,value);else element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));};
    const chooseAutocomplete=async(element,value)=>{element.focus();setValue(element,value);element.dispatchEvent(new KeyboardEvent("keyup",{key:value.slice(-1),bubbles:true}));const wanted=normalize(value);for(let attempt=0;attempt<25;attempt+=1){await wait(100);const candidates=[...document.querySelectorAll('[role="option"],.ui-autocomplete li,.awesomplete li,.autocomplete-item,.dropdown-menu .dropdown-item,.list-group-item')];const candidate=candidates.find(item=>{const text=normalize(item.textContent);return text===wanted||text.startsWith(wanted+" (")||text.startsWith(wanted+" -")});if(!candidate)continue;const target=candidate.querySelector("a,button")||candidate;for(const type of ["mousedown","mouseup","click"]){target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}await wait(150);return normalize(element.value)===wanted||normalize(element.value).startsWith(wanted+" (");}return false;};
    const screeningOpen=["id-tipo","id-sup_s","id-gtot"].every(id=>document.getElementById(id));
    const pageMatches=steps.filter(candidate=>candidate.markerIds.every(id=>document.getElementById(id)));
    const generatorOverlay=pageMatches.length===2&&pageMatches.some(candidate=>candidate.id==="generator")&&pageMatches.some(candidate=>candidate.id==="plant");
    const recognizedMatches=generatorOverlay?pageMatches.filter(candidate=>candidate.id==="generator"):pageMatches;
    if(recognizedMatches.length>1||(screeningOpen&&screenings.length&&recognizedMatches.length)){
      const matched=[...recognizedMatches.map(candidate=>candidate.id+" ("+candidate.pageName+")"),...(screeningOpen&&screenings.length?["screening (Schermature solari)"]:[])].join(", ");
      throw new Error("Riconoscimento pagina ENEA ambiguo: "+matched+". Nessun campo compilato.");
    }
    let screeningIndex=0;
    let step;
    if(screeningOpen&&screenings.length){
      const stored=Number(sessionStorage.getItem(storageKey)||"0");
      screeningIndex=Number.isInteger(stored)&&stored>=0&&stored<screenings.length?stored:0;
      step=screenings[screeningIndex];
    }else{
      [step]=recognizedMatches;
    }
    if(!step)throw new Error("Questa pagina ENEA non e ancora mappata nel laboratorio.");
    const result={step:step.id,pageName:step.pageName,compiled:[],notFound:[],notAvailable:[],notSelected:[]};
    for(const item of step.fields){const element=document.getElementById(item.portalId);if(!element){result.notFound.push(item.portalId);continue;}if(item.control==="autocomplete"){if(!await chooseAutocomplete(element,item.value)){result.notSelected.push(item.portalId);continue;}}else if(item.control==="select"){const wanted=normalize(item.value);const option=[...element.options].find(candidate=>(item.selectValue&&candidate.value===item.selectValue)||normalize(candidate.value)===wanted||normalize(candidate.text)===wanted);if(!option){result.notAvailable.push(item.portalId);continue;}setValue(element,option.value);await wait(50);}else if(item.control==="button"){if(!(element instanceof HTMLElement)||element.hasAttribute("disabled")||element.classList.contains("disabled")){result.notAvailable.push(item.portalId);continue;}for(const type of ["mousedown","mouseup","click"]){element.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}await wait(150);}else{setValue(element,item.value);}result.compiled.push(item.portalId);}
    if(screeningOpen&&screenings.length){const form=document.getElementById("id-tipo")?.closest("form");const save=[...(form?.querySelectorAll('button,input[type="submit"]')||[])].find(element=>normalize(element.textContent||element.value)==="salva");if(save&&!save.dataset.eneaLabProgress){save.dataset.eneaLabProgress="1";save.addEventListener("click",()=>sessionStorage.setItem(storageKey,String(Math.min(screeningIndex+1,screenings.length-1))),{once:true});}}
    console.info("ENEA Lab: pagina riconosciuta e compilata. Nessun salvataggio o invio eseguito.",result);
    return result;
  })()`;
}
