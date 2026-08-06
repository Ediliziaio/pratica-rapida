export type EneaPortalControl = "input" | "select" | "autocomplete";

export interface EneaPortalRuntimeField {
  portalId: string;
  control: EneaPortalControl;
  value: string;
  selectValue?: string;
}

interface EneaPortalScriptOptions {
  fields: EneaPortalRuntimeField[];
  pageName: string;
  markerIds: string[];
  successMessage: string;
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

  return `(async()=>{const data=${data};const markers=${markers};const result={compiled:[],notFound:[],notAvailable:[],notSelected:[]};if(!/(^|\\.)enea\\.it$/i.test(location.hostname)||!markers.every(id=>document.getElementById(id))){throw new Error(${wrongPageMessage});}const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const normalize=value=>String(value??"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim().replace(/\\s+/g," ").toLocaleLowerCase("it");const setValue=(element,value)=>{const prototype=element instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(prototype,"value")?.set;if(setter)setter.call(element,value);else element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));};const chooseAutocomplete=async(element,value)=>{element.focus();setValue(element,value);element.dispatchEvent(new KeyboardEvent("keyup",{key:value.slice(-1),bubbles:true}));const wanted=normalize(value);for(let attempt=0;attempt<25;attempt+=1){await wait(100);const candidates=[...document.querySelectorAll('[role="option"],.ui-autocomplete li,.awesomplete li,.autocomplete-item,.dropdown-menu .dropdown-item,.list-group-item')];const candidate=candidates.find(item=>{const text=normalize(item.textContent);return text===wanted||text.startsWith(wanted+" (")||text.startsWith(wanted+" -")});if(!candidate)continue;const target=candidate.querySelector("a,button")||candidate;for(const type of ["mousedown","mouseup","click"]){target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));}await wait(150);return normalize(element.value)===wanted||normalize(element.value).startsWith(wanted+" (");}return false;};for(const item of data){const element=document.getElementById(item.portalId);if(!element){result.notFound.push(item.portalId);continue;}if(item.control==="autocomplete"){if(!await chooseAutocomplete(element,item.value)){result.notSelected.push(item.portalId);continue;}}else if(item.control==="select"){const wanted=normalize(item.value);const option=[...element.options].find(candidate=>(item.selectValue&&candidate.value===item.selectValue)||normalize(candidate.value)===wanted||normalize(candidate.text)===wanted);if(!option){result.notAvailable.push(item.portalId);continue;}setValue(element,option.value);await wait(50);}else{setValue(element,item.value);}result.compiled.push(item.portalId);}console.info(${completionMessage},result);return result;})()`;
}
