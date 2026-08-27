import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprEneaBrowserWorker, PersistentSimulatedEneaPortalDriver, type AprEneaDraftPackage } from "./aprEneaBrowserWorker";
import { CdpEneaBrowserDriver, autocompleteRecoveryOrder, autocompleteSearchQueries, classifyCalculationAllocationTable, classifyCoBeneficiaryRows, classifyFinalScreeningIntegrity, classifyInfissiFinalIntegrity, eneaGeneratorActivationLabels, findCompleteDraftServerEvidence, findExternalAuthenticationTarget, italianCalculationInput, matchingScreeningRowIndexes, pollPersistedPageFieldsReadOnly, portalNumberValue, siblingCohortOwnedDraftIds } from "./cdpEneaBrowserDriver";
import { PersistentAprChromeRuntime } from "./cdpClient";
import { PersistentAprEneaDraftExecution } from "./eneaDraftExecution";

const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const directories: string[] = [];
const runtimes: PersistentAprChromeRuntime[] = [];
const servers: Server[] = [];
const fixtureTarget = (id: string, type: string, url: string, controlled = true) => ({
  id,
  type,
  title: id,
  url,
  webSocketDebuggerUrl: controlled ? `ws://127.0.0.1/${id}` : undefined,
});

async function freeTcpPort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("free_tcp_port_missing");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

afterEach(async () => {
  // Snapshot every resource before awaiting. Vitest does not cancel an async
  // hook when its timeout expires: a late splice used to consume resources
  // created by the following test and could delete its live checkpoint.
  const ownedRuntimes = runtimes.splice(0);
  const ownedServers = servers.splice(0);
  const ownedDirectories = directories.splice(0);
  await Promise.all(ownedRuntimes.map((runtime) => runtime.stop()));
  await Promise.all(ownedServers.map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  })));
  // Chrome 151 on macOS may keep profile helper processes alive for a short
  // interval after the debugging endpoint disappears. Without this bounded
  // cooldown, the following fixture can inherit resource pressure and the
  // renderer may terminate during a CDP command.
  if (ownedRuntimes.length > 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
  for (const directory of ownedDirectories) rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}, 30_000);

async function fixtureServer(options: { intermediateCreation?: "valid" | "diagnostic"; dashboardDraftId?: string; delayedBeneficiaryMount?: boolean; sharedReactStateBeneficiaryPage?: boolean; offscreenSaveButton?: boolean; ignoreFirstSaveDelivery?: boolean; delayedScreeningRowMount?: boolean; coBeneficiaryPage?: boolean; coBeneficiaryRealIdsPage?: boolean; municipalitySearchModalPage?: boolean; municipalityAuthoritativeCodePage?: boolean; persistedMunicipalityPage?: boolean; residenceSelectionRemountsBirth?: boolean; ambiguousRoot?: boolean; authenticatedRootEsci?: boolean; dashboardMode?: "authenticated" | "spa-authenticated" | "path-only" | "logged-out" | "redirect-root" } = {}) {
  let nextDraftId = 700001;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/geo/comuni") {
      response.setHeader("content-type", "application/json; charset=utf-8");
      const search = url.searchParams.get("search") ?? "";
      const result = search === "Castel d'aiano"
        ? [{ codice_istat: "037013", nome: "Castel d'Aiano", nome_alt: null, sigla_pro: "BO", cessato: false }]
        : /castel/i.test(search)
          ? []
          : [{ codice_istat: "027035", nome: "Santa Maria di Sala", nome_alt: null, sigla_pro: "VE", cessato: false }];
      response.end(JSON.stringify({ result, error: false, status: 200 }));
      return;
    }
    if (url.pathname === "/api/geo/comune/027035") {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ result: { codice_istat: "027035", nome: "Santa Maria di Sala", nome_alt: null, sigla_pro: "VE", cessato: false }, error: false, status: 200 }));
      return;
    }
    if (url.pathname === "/api/geo/comune/037013") {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ result: { codice_istat: "037013", nome: "Castel d'Aiano", nome_alt: null, sigla_pro: "BO", cessato: false }, error: false, status: 200 }));
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (options.sharedReactStateBeneficiaryPage && /\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname)) {
      const draftId = url.pathname.match(/(\d+)$/)?.[1];
      response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><form><input id="id-nome"><input id="id-cognome"><input id="id-codice_fiscale"><button type="button" id="save">Salva</button></form><script>const key="fixture:${draftId}:shared-react",ids=["id-nome","id-cognome","id-codice_fiscale"];let model=JSON.parse(sessionStorage.getItem(key)||"{}");const render=()=>{for(const id of ids){const input=document.getElementById(id);input.value=model[id]||"";input["__reactProps$fixture"]={value:model[id]||"",onChange:event=>{const next={...model,[id]:String(event.target.value)};setTimeout(()=>{model=next;render()},0)}}}};render();document.getElementById("save").addEventListener("click",event=>{if(!event.isTrusted||!ids.every(id=>model[id]))return;sessionStorage.setItem(key,JSON.stringify(model))})</script></body></html>`);
      return;
    }
    if (options.delayedBeneficiaryMount && /\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname)) {
      const draftId = url.pathname.match(/(\d+)$/)?.[1];
      response.end(`<!doctype html><html><head>${options.offscreenSaveButton ? '<style>html{scroll-behavior:smooth}</style>' : ''}</head><body><div data-apr-authenticated="true">Utente connesso</div><div id="root"></div><script>const key="fixture:${draftId}:delayed-name";let deliveries=0;setTimeout(()=>{document.getElementById("root").innerHTML='<form><input id="id-nome">${options.offscreenSaveButton ? '<div style="height:3000px"></div>' : ''}<button type="button" id="save">Salva</button></form>';document.getElementById("id-nome").value=sessionStorage.getItem(key)||"";document.getElementById("save").addEventListener("click",event=>{if(!event.isTrusted)return;deliveries+=1;if(${options.ignoreFirstSaveDelivery ? "true" : "false"}&&deliveries===1)return;sessionStorage.setItem(key,document.getElementById("id-nome").value)})},1200)</script></body></html>`);
      return;
    }
    if (options.delayedScreeningRowMount && /\/pratica\/ecobonus\/2026\/schermature\/\d+/.test(url.pathname)) {
      const draftId = url.pathname.match(/(\d+)$/)?.[1];
      response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><table><tbody id="rows"></tbody></table><button type="button" id="add">Aggiungi</button><div id="modal"></div><script>const key="fixture:${draftId}:delayed-screening";const ids=["id-tipo","id-inst","id-sup_s","id-sup_f","id-esp","id-calc","id-gtot","id-mat","id-mec"];const columns={"id-tipo":1,"id-inst":2,"id-sup_s":3,"id-sup_f":4,"id-esp":6,"id-calc":7,"id-gtot":8,"id-mat":9,"id-mec":10};const render=values=>{const row=document.createElement("tr");const ordinal=document.createElement("th");ordinal.textContent="1";row.appendChild(ordinal);for(let index=1;index<11;index+=1){const cell=document.createElement("td");const id=Object.keys(columns).find(candidate=>columns[candidate]===index);cell.textContent=id?values[id]:"";row.appendChild(cell)}document.getElementById("rows").appendChild(row)};const persisted=sessionStorage.getItem(key);if(persisted)setTimeout(()=>render(JSON.parse(persisted)),1200);document.getElementById("add").addEventListener("click",()=>{document.getElementById("modal").innerHTML='<form><select id="id-tipo"><option>Schermatura solare</option></select><select id="id-inst"><option>Interna</option></select><input id="id-sup_s"><input id="id-sup_f"><select id="id-esp"><option>Sud</option></select><select id="id-calc"><option>Calcolo semplificato</option></select><input id="id-gtot"><select id="id-mat"><option>Misto</option></select><select id="id-mec"><option>Manuale</option></select><button type="button" id="save">Salva</button></form>';document.getElementById("save").addEventListener("click",()=>{const values=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]));sessionStorage.setItem(key,JSON.stringify(values));document.getElementById("modal").innerHTML="";setTimeout(()=>render(values),1200)})})</script></body></html>`);
      return;
    }
    if (url.pathname === "/") response.end(options.authenticatedRootEsci
      ? `<!doctype html><html><body><main>Bonus fiscali ENEA</main><button type="button">Esci</button><a href="/dashboard">Area riservata</a></body></html>`
      : options.ambiguousRoot
        ? `<!doctype html><html><body><main>Bonus fiscali ENEA</main><a href="/dashboard">Area riservata</a></body></html>`
        : `<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><a href="/dashboard">Area riservata</a></body></html>`);
    else if (url.pathname === "/dashboard" && options.dashboardMode === "redirect-root") {
      response.statusCode = 302;
      response.setHeader("location", "/");
      response.end();
    }
    else if (url.pathname === "/dashboard") response.end(options.dashboardMode === "path-only"
      ? `<!doctype html><html><body><main>Bonus fiscali ENEA</main></body></html>`
      : options.dashboardMode === "logged-out"
        ? `<!doctype html><html><body><a href="/login/spid">Accedi con SPID</a></body></html>`
        : options.dashboardMode === "spa-authenticated"
          ? `<!doctype html><html><body><main id="app">Bonus fiscali ENEA</main><script>const a=document.createElement("a");a.href=["","pratica","ecobonus","2026","nuova"].join("/");a.textContent=["Nuova","pratica","Ecobonus"].join(" ");document.getElementById("app").appendChild(a)</script></body></html>`
          : `<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><a href="/pratica/ecobonus/2026/nuova">Inserisci nuova scheda descrittiva Ecobonus con data di fine lavori nel 2026</a>${options.dashboardDraftId ? `<a href="/pratica/ecobonus/2026/beneficiario/${options.dashboardDraftId}">Bozza ${options.dashboardDraftId}</a>` : ""}</body></html>`);
    else if (url.pathname === "/pratica/ecobonus/2026/nuova" && options.intermediateCreation === "diagnostic") response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><form id="create-beneficiary" method="post" action="/pratica/ecobonus/2026/nuova"><label for="beneficiary-type">Tipo beneficiario</label><select id="beneficiary-type" name="beneficiaryType"><option>Persona fisica</option><option>Condominio</option></select><button type="submit">Inserisci</button></form></body></html>`);
    else if (url.pathname === "/pratica/ecobonus/2026/nuova" && options.intermediateCreation === "valid") { const draftId = nextDraftId++; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><div id="wizard"></div><script>setTimeout(()=>{const wizard=document.getElementById("wizard");wizard.innerHTML='<button type="button" id="id-role-beneficiario">Beneficiario</button><button type="button" id="id-role-intermediario">Intermediario</button><button type="button" id="id-tipo-pf" disabled>beneficiario della detrazione fiscale</button><button type="button" id="id-tipo-pg">persona giuridica incaricata dal beneficiario</button><button type="submit" id="create" disabled>Crea scheda descrittiva</button>';let role=false,pf=false;const type=document.getElementById("id-tipo-pf"),create=document.getElementById("create");document.getElementById("id-role-intermediario").addEventListener("click",()=>setTimeout(()=>{role=true;type.disabled=false;type.textContent="persona fisica incaricata dal beneficiario"},350));type.addEventListener("click",()=>setTimeout(()=>{pf=true;create.disabled=false},350));create.addEventListener("click",event=>{event.preventDefault();if(role&&pf)location.href="/pratica/ecobonus/2026/beneficiario/${draftId}"})},350);</script></body></html>`); }
    else if (url.pathname === "/pratica/ecobonus/2026/nuova") { const draftId = nextDraftId++; response.statusCode = 302; response.setHeader("location", `/pratica/ecobonus/2026/beneficiario/${draftId}`); response.end(); }
    else if (url.pathname === "/signed-out") response.end(`<!doctype html><html><body><a href="/login">Accedi con SPID</a></body></html>`);
    else if (url.pathname === "/new") response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><a href="/scheme">Ecobonus</a></body></html>`);
    else if (url.pathname === "/scheme") { const draftId = nextDraftId++; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><a href="/pratica/ecobonus/2026/beneficiario/${draftId}">Schermature solari</a></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/intervento\/\d+/.test(url.pathname)) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><form id="intervention"><select id="id-immobile"><option value="">-</option><option value="253">Singola unità immobiliare (in un edificio costituito da più unità immobiliari)</option><option value="254">Edificio costituito da una singola unità immobiliare</option></select><input id="id-unita"><select id="id-acc"><option value="">-</option><option value="N">No</option></select><input id="id-data_inizio"><input id="id-data_fine"><button id="id-comma-345b" type="button">Comma 345B - Schermature solari</button><select id="id-impianto_centralizzato" disabled><option value="">-</option><option value="N">No</option></select><button id="save-intervention" type="button">Salva</button></form><script>const prefix="fixture:${draftId}:intervention:";for(const id of ["id-immobile","id-unita","id-acc","id-data_inizio","id-data_fine"])document.getElementById(id).value=sessionStorage.getItem(prefix+id)||"";document.getElementById("save-intervention").addEventListener("click",()=>{for(const id of ["id-immobile","id-unita","id-acc","id-data_inizio","id-data_fine"])sessionStorage.setItem(prefix+id,document.getElementById(id).value)});</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/impianto_esistente\/\d+/.test(url.pathname)) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><form id="plant"><table><tbody><tr><td>Caldaia a gas a condensazione</td><td id="staged-num"></td><td id="staged-n"></td><td id="staged-pn"></td><td><button id="open-generator" type="button" title="Modifica generatore">Modifica</button></td></tr></tbody></table><select id="id-impianto"><option value="">-</option><option value="10">Impianto autonomo</option></select><select id="id-erogazione"><option value="">-</option><option value="20">Radiatori</option></select><select id="id-distribuzione"><option value="">-</option><option value="30">Distribuzione ad acqua</option></select><select id="id-regolazione"><option value="">-</option><option value="40">Termostato</option></select><select id="id-vettore"><option value="">-</option><option value="50">Energia elettrica</option></select><select id="id-estivo"><option value="">-</option><option value="N">No</option></select><input id="id-interventi"><button type="button" id="save-plant">Salva</button></form><div id="generator-modal"></div><script>const generatorPrefix="fixture:${draftId}:generator:",plantPrefix="fixture:${draftId}:plant:";const generatorIds=["id-num","id-n","id-pn"],stagedIds=["staged-num","staged-n","staged-pn"],plantIds=["id-impianto","id-erogazione","id-distribuzione","id-regolazione","id-vettore","id-estivo","id-interventi"];generatorIds.forEach((id,index)=>document.getElementById(stagedIds[index]).textContent=sessionStorage.getItem(generatorPrefix+id)||"");plantIds.forEach(id=>document.getElementById(id).value=sessionStorage.getItem(plantPrefix+id)||"");const modal=document.getElementById("generator-modal");document.getElementById("open-generator").addEventListener("click",()=>{modal.innerHTML='<form id="generator"><input id="id-num"><input id="id-n"><input id="id-pn"><button type="button" id="save-generator">Salva</button></form>';generatorIds.forEach((id,index)=>document.getElementById(id).value=document.getElementById(stagedIds[index]).textContent||"");document.getElementById("save-generator").addEventListener("click",()=>{generatorIds.forEach((id,index)=>document.getElementById(stagedIds[index]).textContent=document.getElementById(id).value);modal.innerHTML=""})});document.getElementById("save-plant").addEventListener("click",()=>{generatorIds.forEach((id,index)=>sessionStorage.setItem(generatorPrefix+id,document.getElementById(stagedIds[index]).textContent||""));plantIds.forEach(id=>sessionStorage.setItem(plantPrefix+id,document.getElementById(id).value))});</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/schermature\/\d+/.test(url.pathname)) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><form id="screening-summary"><input type="search" aria-label="Cerca" value=""><table><thead><tr><th>Tipo schermatura</th><th>Installazione</th><th>Superficie schermatura</th><th>Superficie finestra</th><th>Esposizione</th><th>gTot</th><th>Materiale</th><th>Movimentazione</th></tr></thead><tbody id="screening-rows"></tbody></table><div id="empty-screenings">Nessun elemento</div><input id="id-costo" disabled><button type="button" id="add-screening" disabled>Aggiungi</button><button type="button" id="save-summary">Salva</button></form><div id="screening-modal"></div><script>const storageKey="fixture:${draftId}:screenings",costKey="fixture:${draftId}:cost",ids=["id-tipo","id-inst","id-sup_s","id-sup_f","id-esp","id-calc","id-gtot","id-mat","id-mec"],columns={"id-tipo":1,"id-inst":2,"id-sup_s":3,"id-sup_f":4,"id-esp":6,"id-calc":7,"id-gtot":8,"id-mat":9,"id-mec":10};let rows=JSON.parse(sessionStorage.getItem(storageKey)||"[]");const tbody=document.getElementById("screening-rows"),cost=document.getElementById("id-costo"),modal=document.getElementById("screening-modal");const render=()=>{document.getElementById("empty-screenings").hidden=rows.length>0;tbody.innerHTML="";for(const row of rows){const tr=document.createElement("tr");for(let index=0;index<11;index+=1){const td=document.createElement("td");const id=Object.keys(columns).find(key=>columns[key]===index);td.textContent=id?row[id]||"":"";tr.appendChild(td)}tbody.appendChild(tr)}cost.disabled=rows.length===0;cost.value=sessionStorage.getItem(costKey)||cost.value};render();setTimeout(()=>document.getElementById("add-screening").disabled=false,3500);document.getElementById("add-screening").addEventListener("click",()=>{modal.innerHTML='<form id="screening"><select id="id-tipo"><option>Schermatura solare</option></select><select id="id-inst"><option>Interna</option></select><input id="id-sup_s"><input id="id-sup_f"><select id="id-esp"><option>Sud</option></select><select id="id-calc"><option>Calcolo semplificato</option></select><input id="id-gtot"><select id="id-mat"><option>Misto</option></select><select id="id-mec"><option>Manuale</option></select><button type="button" id="save-screening">Salva</button></form>';document.getElementById("save-screening").addEventListener("click",()=>{rows.push(Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value])));modal.innerHTML="";render()})});document.getElementById("save-summary").addEventListener("click",()=>{sessionStorage.setItem(storageKey,JSON.stringify(rows));sessionStorage.setItem(costKey,cost.value)});</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/calcolo\/\d+/.test(url.pathname)) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><table><thead><tr><th>Intervento</th><th>Spese 50% fino al 2024</th><th>Spese 65% fino al 2024</th><th>Spese congrue sostenute nel 2025-2026 (aliquota 50%)</th><th>Spese congrue sostenute nel 2025-2026 (aliquota 36%)</th><th>Spese 2027 36%</th><th>Spese 2027 30%</th><th>Totali [€]</th><th>Modifica</th></tr></thead><tbody><tr><td>SS. Schermature solari</td><td>--</td><td>--</td><td id="cell50"></td><td id="cell36"></td><td>--</td><td>--</td><td>10478.07</td><td><button type="button" id="edit-cost">Modifica</button></td></tr></tbody></table><div id="cost-modal"></div><script>const key="fixture:${draftId}:cost36",traceKey="fixture:${draftId}:trusted-input-trace",total=10478.07,cell50=document.getElementById("cell50"),cell36=document.getElementById("cell36"),modal=document.getElementById("cost-modal");const render=()=>{const value=Number(sessionStorage.getItem(key)||0);cell36.textContent=value?value.toFixed(2):"--";cell50.textContent=value?"--":total.toFixed(2)};render();document.getElementById("edit-cost").addEventListener("click",()=>{const current=Number(sessionStorage.getItem(key)||0);modal.innerHTML='<form id="cost-form"><div>Spese congrue sostenute nel 2025-2026 (aliquota 50%) <strong id="derived50">'+(total-current).toFixed(2)+' €</strong></div><div>Spese congrue sostenute nel 2025-2026 (aliquota 36%) <input id="cost36"></div><button type="button" id="save-cost">Salva</button><button type="button">Annulla</button></form>';const input=document.getElementById("cost36"),derived=document.getElementById("derived50"),props={value:current?current.toFixed(2):"0",onChange:event=>{props.value=String(event.target.value);input.value=props.value;derived.textContent=Math.max(0,total-Number(props.value.replace(",","."))).toFixed(2)+" €"}};input["__reactProps$fixture"]=props;input.value=props.value;input.addEventListener("input",event=>{if(event.isTrusted){const trace=JSON.parse(sessionStorage.getItem(traceKey)||"[]");trace.push(String(input.value));sessionStorage.setItem(traceKey,JSON.stringify(trace))}derived.textContent=Math.max(0,total-Number(String(input.value).replace(",","."))).toFixed(2)+" €"});document.getElementById("save-cost").addEventListener("click",()=>{sessionStorage.setItem(key,String(Number(props.value.replace(",","."))));modal.innerHTML="";render()})})</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname) && options.coBeneficiaryRealIdsPage) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form id="beneficiary"><input id="id-cf"><button type="button" id="save">Salva</button></form><section><table><thead><tr><th>Nome</th><th>Cognome</th><th>Codice fiscale</th></tr></thead><tbody id="co-rows"></tbody></table><button type="button" id="add-co">Aggiungi persona fisica</button><div id="co-modal"></div></section><script>const primaryKey="fixture:${draftId}:cf",personKey="fixture:${draftId}:co-beneficiary",primary=document.getElementById("id-cf"),rows=document.getElementById("co-rows"),modal=document.getElementById("co-modal");primary.value=sessionStorage.getItem(primaryKey)||"";const render=()=>{const person=JSON.parse(sessionStorage.getItem(personKey)||"null");rows.innerHTML=person?'<tr><td>'+person.name+'</td><td>'+person.surname+'</td><td>'+person.taxCode+'</td></tr>':""};render();document.getElementById("save").addEventListener("click",()=>sessionStorage.setItem(primaryKey,primary.value));document.getElementById("add-co").addEventListener("click",()=>{modal.innerHTML='<div role="dialog"><h3>Altro beneficiario (persona fisica)</h3><div class="shared-grid"><label for="id-nome">Nome *</label><label for="id-cognome">Cognome *</label><label for="id-codice_fiscale">Codice fiscale *</label><input id="id-nome" required><input id="id-cognome" required><input id="id-codice_fiscale" required></div><button type="button" id="save-co">Salva</button></div>';const props={};for(const id of ["id-nome","id-cognome","id-codice_fiscale"]){const input=document.getElementById(id),state={value:"",onChange:event=>{state.value=String(event.target.value);input.value=state.value}};input["__reactProps$fixture"]=state;props[id]=state}setTimeout(()=>modal.querySelectorAll("label").forEach(label=>label.removeAttribute("for")),300);document.getElementById("save-co").addEventListener("click",event=>{if(!event.isTrusted)return;sessionStorage.setItem(personKey,JSON.stringify({name:props["id-nome"].value,surname:props["id-cognome"].value,taxCode:props["id-codice_fiscale"].value}));modal.innerHTML="";render()})});</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname) && options.coBeneficiaryPage) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form id="beneficiary"><label for="id-cf">Codice fiscale</label><input id="id-cf"><button type="button" id="save">Salva</button></form><section><h2>Altri beneficiari</h2><table><thead><tr><th>Nome</th><th>Cognome</th><th>Codice fiscale</th></tr></thead><tbody id="co-rows"></tbody></table><button type="button" id="add-co">Aggiungi persona fisica</button><div id="co-modal"></div></section><script>const primaryKey="fixture:${draftId}:cf",personKey="fixture:${draftId}:co-beneficiary",primary=document.getElementById("id-cf"),rows=document.getElementById("co-rows"),modal=document.getElementById("co-modal");primary.value=sessionStorage.getItem(primaryKey)||"";const render=()=>{const person=JSON.parse(sessionStorage.getItem(personKey)||"null");rows.innerHTML=person?'<tr><td>'+person.name+'</td><td>'+person.surname+'</td><td>'+person.taxCode+'</td></tr>':""};render();document.getElementById("save").addEventListener("click",()=>sessionStorage.setItem(primaryKey,primary.value));document.getElementById("add-co").addEventListener("click",()=>{modal.innerHTML='<div role="dialog"><h3>Altro beneficiario (persona fisica)</h3><label for="co-name">Nome *</label><input id="co-name" required><label for="co-surname">Cognome *</label><input id="co-surname" required><label for="co-cf">Codice fiscale *</label><input id="co-cf" required><button type="button" id="save-co">Salva</button></div>';const props={};for(const id of ["co-name","co-surname","co-cf"]){const input=document.getElementById(id),state={value:"",onChange:event=>{state.value=String(event.target.value);input.value=state.value}};input["__reactProps$fixture"]=state;props[id]=state}document.getElementById("save-co").addEventListener("click",event=>{if(!event.isTrusted)return;sessionStorage.setItem(personKey,JSON.stringify({name:props["co-name"].value,surname:props["co-surname"].value,taxCode:props["co-cf"].value}));modal.innerHTML="";render()})});</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname) && options.municipalitySearchModalPage) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form><button id="id-mode" type="button">Modalità</button><div class="input-group"><input id="id-comune" aria-invalid="false"><span class="input-group-text">Cerca comune</span></div><input id="id-civico"><button type="button">Salva</button></form><div id="lookup"></div><script>const input=document.getElementById("id-comune"),lookup=document.getElementById("lookup");document.getElementById("id-mode").addEventListener("click",()=>{input.value="";input.removeAttribute("data-apr-autocomplete-selected")});input["__reactProps$fixture"]={onChange:event=>{input.value=event.target.value;setTimeout(()=>{lookup.innerHTML='<div class="dropdown-menu" style="display:block"><button style="pointer-events:none" type="button" role="menuitem" class="dropdown-item">Bologna (BO)</button></div>';lookup.querySelector("button").addEventListener("click",()=>{input.value="Bologna (BO)";input.setAttribute("aria-invalid","false");document.getElementById("id-civico").value="";lookup.innerHTML=""})},100)}};</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname) && options.municipalityAuthoritativeCodePage) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form><div class="input-group"><input name="comune" id="id-comune" aria-invalid="false"><span class="input-group-text">Cerca comune</span></div><div class="dropdown-menu" style="display:block"><button type="button" role="menuitem" class="dropdown-item">Santa Maria di Sala (VE)</button></div><button type="button">Salva</button></form><script>window.ENV={REACT_APP_API:location.origin+"/api"};window.__aprMunicipalityAuthoritativeCode="";const input=document.getElementById("id-comune");document.querySelector('[role="menuitem"]').addEventListener("click",()=>{input.value="Santa Maria di Sala (VE)"});const component={memoizedProps:{autocompleteFunction(){},resolveFunction(){},onChange:event=>{if(!/^[0-9]{6}$/.test(String(event.target.value)))return;window.__aprMunicipalityAuthoritativeCode=event.target.value;fetch(window.ENV.REACT_APP_API+"/geo/comune/"+event.target.value).then(response=>response.json()).then(payload=>{input.value=payload.result.nome+" ("+payload.result.sigla_pro+")";input.disabled=true})}},return:null};input["__reactFiber$fixture"]={memoizedProps:{},return:component};input["__reactProps$fixture"]={onChange:event=>{input.value=event.target.value}};</script></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname) && options.persistedMunicipalityPage) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form><input id="id-comune" value="Milano (MI)" aria-invalid="false" disabled><select id="id-tipologia"><option value="16" selected>Condominio oltre tre piani fuori terra</option><option value="18">Costruzione isolata (es. mono e plurifamiliare)</option></select><button type="button">Salva</button></form></body></html>`); }
    else if (/\/pratica\/ecobonus\/2026\/beneficiario\/\d+/.test(url.pathname)) { const draftId = url.pathname.match(/(\d+)$/)?.[1]; response.end(`<!doctype html><html><body><div data-apr-authenticated="true">Utente connesso</div><nav><a data-apr-page-id="page:Beneficiario" href="/pratica/ecobonus/2026/beneficiario/${draftId}">Beneficiario</a></nav><form id="beneficiary"><input id="id-cf"><select id="id-nazione_nascita"><option value="">Scegli</option><option value="ita">Italia</option></select><input id="id-comune_nascita"><div id="birth-menu" class="easy-autocomplete-container"><ul></ul></div><button type="button" id="id-mode">Modalità</button><select id="id-nazione_residenza" disabled><option value="ita">Italia</option></select><input id="id-comune_residenza"><div id="residence-menu" class="easy-autocomplete-container"><ul></ul></div><button type="button" id="save">Salva</button></form><script>const key="fixture:${draftId}:cf",birthKey="fixture:${draftId}:birth",birthCityKey="fixture:${draftId}:birth-city",residenceCityKey="fixture:${draftId}:residence-city";document.getElementById("id-cf").value=sessionStorage.getItem(key)||"";document.getElementById("id-comune_nascita").value=sessionStorage.getItem(birthCityKey)||"";document.getElementById("id-comune_residenza").value=sessionStorage.getItem(residenceCityKey)||"";const attach=(inputId,menuId,label)=>{const input=document.getElementById(inputId),menu=document.querySelector('#'+menuId+' ul');input.addEventListener("keyup",()=>{menu.innerHTML='<li>'+label+' (MI)</li>';menu.firstElementChild.addEventListener("click",()=>{input.value=label+" (MI)";menu.innerHTML="";if(inputId==="id-comune_residenza"&&${options.residenceSelectionRemountsBirth ? "true" : "false"})setTimeout(()=>{const oldBirth=document.getElementById("id-comune_nascita"),replacement=oldBirth.cloneNode(true);replacement.value=oldBirth.value;oldBirth.replaceWith(replacement);attach("id-comune_nascita","birth-menu","Sesto San Giovanni")},0)})})};attach("id-comune_nascita","birth-menu","Sesto San Giovanni");attach("id-comune_residenza","residence-menu","Corsico");const birth=document.getElementById("id-nazione_nascita");birth.value=sessionStorage.getItem(birthKey)||"";birth.addEventListener("change",()=>{const replacement=birth.cloneNode(true);replacement.value="";birth.replaceWith(replacement);setTimeout(()=>{replacement.value="ita"},150)});document.getElementById("id-mode").addEventListener("click",()=>setTimeout(()=>{document.getElementById("id-nazione_residenza").disabled=false},250));document.getElementById("id-nazione_residenza").addEventListener("change",()=>setTimeout(()=>{document.getElementById("id-nazione_nascita").value=""},250));document.getElementById("save").addEventListener("click",()=>{sessionStorage.setItem(key,document.getElementById("id-cf").value);sessionStorage.setItem(birthKey,document.getElementById("id-nazione_nascita").value);sessionStorage.setItem(birthCityKey,document.getElementById("id-comune_nascita").value);sessionStorage.setItem(residenceCityKey,document.getElementById("id-comune_residenza").value)});</script></body></html>`); }
    else { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture_server_address_missing");
  return `http://127.0.0.1:${address.port}`;
}

function draftPackage(customerKey = "case-cdp"): AprEneaDraftPackage {
  const step = { id: "beneficiary", pageName: "Beneficiario", markerIds: ["id-cf"], successMessage: "ok", fields: [{ portalId: "id-cf", control: "input" as const, value: "RSSMRA80A01H501U" }, { portalId: "id-nazione_nascita", control: "select" as const, value: "Italia" }, { portalId: "id-comune_nascita", control: "autocomplete" as const, value: "Sesto S.Giovanni" }, { portalId: "id-mode", control: "button" as const, value: "Modalità" }, { portalId: "id-nazione_residenza", control: "select" as const, value: "Italia (etichetta interna)", selectValue: "ita" }, { portalId: "id-comune_residenza", control: "autocomplete" as const, value: "Corsico" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Beneficiario"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function persistenceDraftPackage(customerKey = "case-cdp"): AprEneaDraftPackage {
  const complete = draftPackage(customerKey);
  return {
    ...complete,
    workflow: {
      ...complete.workflow,
      steps: [{
        id: "beneficiary",
        pageName: "Beneficiario",
        markerIds: ["id-cf"],
        successMessage: "ok",
        fields: [{ portalId: "id-cf", control: "input" as const, value: "RSSMRA80A01H501U" }],
      }],
    },
  };
}

function municipalitySearchDraftPackage(): AprEneaDraftPackage {
  return {
    module: "screening",
    customerKey: "case-municipality-search",
    displayName: "Comune con ricerca obbligatoria",
    practiceId: "crm-case-municipality-search",
    packageFingerprint: "package-case-municipality-search",
    workflowFingerprint: "workflow-case-municipality-search",
    workflow: {
      supportedPages: ["Beneficiario"],
      screeningItemCount: 0,
      steps: [{ id: "beneficiary", pageName: "Beneficiario", markerIds: ["id-comune"], successMessage: "ok", fields: [{ portalId: "id-mode", control: "button", value: "Modalità" }, { portalId: "id-comune", control: "autocomplete", value: "Bologna", autocompleteQualifier: "BO" }, { portalId: "id-civico", control: "input", value: "42" }] }],
      screeningSteps: [],
    },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
}

function municipalityAuthoritativeCodeDraftPackage(): AprEneaDraftPackage {
  const draft = municipalitySearchDraftPackage();
  return {
    ...draft,
    customerKey: "case-municipality-authoritative-code",
    displayName: "Comune selezionato tramite codice ISTAT autorevole",
    practiceId: "crm-case-municipality-authoritative-code",
    packageFingerprint: "package-case-municipality-authoritative-code",
    workflowFingerprint: "workflow-case-municipality-authoritative-code",
    workflow: {
      ...draft.workflow,
      steps: [{ id: "beneficiary", pageName: "Beneficiario", markerIds: ["id-comune"], successMessage: "ok", fields: [{ portalId: "id-comune", control: "autocomplete", value: "Santa Maria di Sala", autocompleteQualifier: "VE" }] }],
    },
  };
}

function persistedMunicipalityCorrectionDraftPackage(): AprEneaDraftPackage {
  return {
    module: "screening",
    customerKey: "case-persisted-municipality-correction",
    displayName: "Comune server persistito con correzione edificio",
    practiceId: "crm-case-persisted-municipality-correction",
    packageFingerprint: "package-case-persisted-municipality-correction",
    workflowFingerprint: "workflow-case-persisted-municipality-correction",
    workflow: {
      supportedPages: ["Beneficiario"],
      screeningItemCount: 0,
      steps: [{ id: "beneficiary", pageName: "Beneficiario", markerIds: ["id-comune", "id-tipologia"], successMessage: "ok", fields: [{ portalId: "id-comune", control: "autocomplete", value: "Milano" }, { portalId: "id-tipologia", control: "select", value: "Costruzione isolata (es. mono e plurifamiliare)", selectValue: "18" }] }],
      screeningSteps: [],
    },
    safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false },
  };
}

function coBeneficiaryDraftPackage(customerKey = "luca-callegari"): AprEneaDraftPackage {
  const step = {
    id: "beneficiary",
    pageName: "Beneficiario",
    markerIds: ["id-cf"],
    successMessage: "ok",
    fields: [{ portalId: "id-cf", control: "input" as const, value: "CLLLCU82D29G916U" }],
    coBeneficiary: {
      name: "Maria Giovanna Angela",
      surname: "Pinna",
      taxCode: "PNNMGV84B43G203G",
      sourceIds: ["invoice-luca"],
      appliedRuleIds: ["user-2026-08-17-invoice-co-beneficiary-person-flow"],
    },
  };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Beneficiario"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function delayedBeneficiaryDraftPackage(customerKey = "case-delayed-beneficiary"): AprEneaDraftPackage {
  const step = { id: "beneficiary", pageName: "Anagrafica Beneficiario", markerIds: ["id-nome"], successMessage: "ok", fields: [{ portalId: "id-nome", control: "input" as const, value: "Ada" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Anagrafica Beneficiario"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function sharedReactStateBeneficiaryDraftPackage(customerKey = "case-shared-react-beneficiary"): AprEneaDraftPackage {
  const step = { id: "beneficiary", pageName: "Anagrafica Beneficiario", markerIds: ["id-nome", "id-cognome", "id-codice_fiscale"], successMessage: "ok", fields: [{ portalId: "id-nome", control: "input" as const, value: "Ada" }, { portalId: "id-cognome", control: "input" as const, value: "Lovelace" }, { portalId: "id-codice_fiscale", control: "input" as const, value: "LVLDAA15L44Z114R" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Anagrafica Beneficiario"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function generatorDraftPackage(customerKey = "case-generator"): AprEneaDraftPackage {
  const step = { id: "generator", pageName: "Generatore dell'impianto termico", markerIds: ["id-num", "id-n", "id-pn"], successMessage: "ok", activationLabel: "Gas a condensazione", hostRoute: "impianto_esistente", fields: [{ portalId: "id-num", control: "input" as const, value: "1" }, { portalId: "id-n", control: "input" as const, value: "98,1" }, { portalId: "id-pn", control: "input" as const, value: "24" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Generatore dell'impianto termico"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function generatorAndPlantDraftPackage(customerKey = "case-generator-plant"): AprEneaDraftPackage {
  const generator = generatorDraftPackage(customerKey).workflow.steps[0];
  const plant = { id: "plant", pageName: "Impianto termico esistente", markerIds: ["id-impianto", "id-erogazione", "id-vettore"], successMessage: "ok", hostRoute: "impianto_esistente", fields: [{ portalId: "id-impianto", control: "select" as const, value: "Impianto autonomo", selectValue: "10" }, { portalId: "id-erogazione", control: "select" as const, value: "Radiatori", selectValue: "20" }, { portalId: "id-distribuzione", control: "select" as const, value: "Distribuzione ad acqua", selectValue: "30" }, { portalId: "id-regolazione", control: "select" as const, value: "Termostato", selectValue: "40" }, { portalId: "id-vettore", control: "select" as const, value: "Energia elettrica", selectValue: "50" }, { portalId: "id-estivo", control: "select" as const, value: "No", selectValue: "N" }, { portalId: "id-interventi", control: "input" as const, value: "2020" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Generatore dell'impianto termico", "Impianto termico esistente"], screeningItemCount: 0, steps: [generator, plant], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function interventionDraftPackage(customerKey = "case-intervention", centralized: "S" | "N" = "N"): AprEneaDraftPackage {
  const step = { id: "intervention", pageName: "Intervento", markerIds: ["id-immobile", "id-unita", "id-data_fine"], successMessage: "ok", fields: [{ portalId: "id-immobile", control: "select" as const, value: "Singola unità immobiliare (in un edificio costituito da più unità immobiliari)", selectValue: "253" }, { portalId: "id-unita", control: "input" as const, value: "1" }, { portalId: "id-acc", control: "select" as const, value: "No", selectValue: "N" }, { portalId: "id-data_inizio", control: "input" as const, value: "19/06/2026" }, { portalId: "id-data_fine", control: "input" as const, value: "29/07/2026" }, { portalId: "id-comma-345b", control: "button" as const, value: "Comma 345B - Schermature solari" }, { portalId: "id-impianto_centralizzato", control: "select" as const, value: centralized === "S" ? "Sì" : "No", selectValue: centralized }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Intervento"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function screeningDraftPackage(customerKey = "case-screening"): AprEneaDraftPackage {
  const item = (index: number, surface: string) => ({ id: `screening-${index}`, pageName: "Aggiungi schermatura solare", markerIds: ["id-tipo", "id-sup_s", "id-gtot"], successMessage: "ok", fields: [{ portalId: "id-tipo", control: "select" as const, value: "Schermatura solare" }, { portalId: "id-inst", control: "select" as const, value: "Interna" }, { portalId: "id-sup_s", control: "input" as const, value: surface }, { portalId: "id-sup_f", control: "input" as const, value: surface }, { portalId: "id-esp", control: "select" as const, value: "Sud" }, { portalId: "id-calc", control: "select" as const, value: "Calcolo semplificato" }, { portalId: "id-gtot", control: "input" as const, value: "0,33" }, { portalId: "id-mat", control: "select" as const, value: "Misto" }, { portalId: "id-mec", control: "select" as const, value: "Manuale" }] });
  const summary = { id: "screening-summary", pageName: "Schermature solari", markerIds: ["id-costo"], successMessage: "ok", hostRoute: "schermature", fields: [{ portalId: "id-costo", control: "input" as const, value: "2150,00" }] };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Schermature solari"], screeningItemCount: 2, steps: [summary], screeningSteps: [item(1, "10,00"), item(2, "5,50")] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function calculationAllocationDraftPackage(customerKey = "case-calculation-36"): AprEneaDraftPackage {
  const step = { id: "calculation-expense-allocation", pageName: "Allocazione costi e detrazioni", markerIds: [], successMessage: "ok", hostRoute: "calcolo", fields: [], expenseAllocation: { fieldId: "schermature.spesa", interventionLabel: "Schermature solari", value: "10478.07", rate: 36 as const, appliedRuleIds: ["user-2026-08-16-secondary-home-36-percent-calculation-allocation", "system-atomic-checkpoint-resume"] } };
  return { module: "screening", customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, packageFingerprint: `package-${customerKey}`, workflowFingerprint: `workflow-${customerKey}`, workflow: { supportedPages: ["Allocazione costi e detrazioni"], screeningItemCount: 0, steps: [step], screeningSteps: [] }, safety: { createAllowedAfterPersistentIntent: true, saveAllowedAfterAllPageCheckpoints: true, previewAllowed: false, submitAllowed: false, communicationsAllowed: false } };
}

function twoCasePreflight() {
  return { status: "completed", sourceFingerprint: "cdp-two-case-preflight", items: ["case-one", "case-two"].map((customerKey) => ({ customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, state: "ready_local_plan", report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `mapping-${customerKey}`, requiredPortalFieldCount: 1, portalGate: { status: "ready", workflowFingerprint: `workflow-${customerKey}`, supportedPages: ["Beneficiario"], screeningItemCount: 0 } } } })) } as never;
}

function generatorPlantPreflight() {
  return { status: "completed", sourceFingerprint: "cdp-generator-plant-preflight", items: ["case-generator-plant-one", "case-generator-plant-two"].map((customerKey) => ({ customerKey, displayName: customerKey, practiceId: `crm-${customerKey}`, state: "ready_local_plan", report: { eneaPayloadAudit: { draftReady: true, mappingFingerprint: `mapping-${customerKey}`, requiredPortalFieldCount: 10, portalGate: { status: "ready", workflowFingerprint: `workflow-${customerKey}`, supportedPages: ["Generatore dell'impianto termico", "Impianto termico esistente"], screeningItemCount: 0 } } } })) } as never;
}

describe("driver Chrome persistente di APR", () => {
  it.runIf(process.platform === "darwin")("riusa una sola connessione CDP per dieci keepalive e la chiude allo stop del worker", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-keepalive-reuse-")); directories.push(root);
    const origin = await fixtureServer({ authenticatedRootEsci: true });
    const runtime = new PersistentAprChromeRuntime({
      chromeExecutable,
      profileDirectory: path.join(root, "chrome-profile"),
      remoteDebuggingPort: await freeTcpPort(),
      headless: true,
      initialUrl: `${origin}/`,
    });
    runtimes.push(runtime);
    await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, {
      allowedOrigin: origin,
      dashboardUrl: `${origin}/`,
      allowOpenInitialPage: false,
    });

    for (let index = 0; index < 10; index += 1) {
      expect(await driver.verifySession()).toMatchObject({ authenticated: true, serverLogoutProven: false });
    }

    expect(runtime.connectionStats()).toMatchObject({ active: 1, opened: 1, closed: 0 });
    expect(runtime.connectionStats().targetIds).toHaveLength(1);
    await runtime.stop();
    expect(runtime.connectionStats()).toMatchObject({ active: 0, opened: 1, closed: 1, targetIds: [] });
  }, 60_000);

  it("chiude la connessione CDP trattenuta quando il keepalive fallisce", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-keepalive-error-")); directories.push(root);
    let active = 0;
    let closed = 0;
    const target = {
      id: "target-error",
      type: "page",
      title: "Bonus fiscali ENEA",
      url: "https://bonusfiscali.enea.it/dashboard",
      webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/target-error",
    };
    const runtime = {
      profileFingerprint: "f".repeat(64),
      targets: async () => [target],
      pageClient: async () => {
        active = 1;
        return { evaluate: async () => { throw new Error("keepalive_fixture_failure"); } };
      },
      closePageClientsExcept: () => undefined,
      closeAllPageClients: () => { active = 0; closed += 1; },
    } as unknown as PersistentAprChromeRuntime;
    const driver = new CdpEneaBrowserDriver(root, runtime, {
      allowedOrigin: "https://bonusfiscali.enea.it",
      dashboardUrl: "https://bonusfiscali.enea.it/dashboard",
      allowOpenInitialPage: false,
    });

    await expect(driver.verifySession()).rejects.toThrow("keepalive_fixture_failure");
    expect({ active, closed }).toEqual({ active: 0, closed: 1 });
  });

  it("riconcilia prima la residenza e poi la nascita dopo un remount React, senza includere campi concordanti", () => {
    const fields = [
      { portalId: "id-comune_nascita", control: "autocomplete" as const, value: "Crotone" },
      { portalId: "id-comune_residenza", control: "autocomplete" as const, value: "Bollate" },
      { portalId: "id-comune", control: "autocomplete" as const, value: "Milano" },
      { portalId: "id-civico_residenza", control: "input" as const, value: "2" },
    ];
    expect(autocompleteRecoveryOrder(fields, ["id-comune_nascita", "id-comune_residenza"]).map((field) => field.portalId)).toEqual([
      "id-comune_residenza",
      "id-comune_nascita",
    ]);
  });

  it("usa un prefisso di ricerca solo per ottenere la voce ENEA autorevole quando la fonte omette l'apostrofo", () => {
    expect(autocompleteSearchQueries("Castel d aiano")).toEqual(["Castel d aiano", "Castel d'aiano", "Castel"]);
    expect(autocompleteSearchQueries("Crotone")).toEqual(["Crotone"]);
    expect(autocompleteSearchQueries("S. Giovanni")).toEqual(["San Giovanni"]);
  });
  it("normalizza i costi ENEA italiani senza confondere separatori e decimali", () => {
    expect(portalNumberValue("2150,00")).toBe(2150);
    expect(portalNumberValue("2.150,00 €")).toBe(2150);
    expect(portalNumberValue("2150.00")).toBe(2150);
    expect(portalNumberValue(2150)).toBe(2150);
    expect(portalNumberValue("--")).toBeNull();
  });

  it("verifica l'idratazione server con sonde brevi senza una Runtime.evaluate lunga", async () => {
    const observations = [
      { compiled: [], missing: [], mismatched: ["id-nome", "id-cognome"] },
      { compiled: ["id-nome"], missing: [], mismatched: ["id-cognome"] },
      { compiled: ["id-nome", "id-cognome"], missing: [], mismatched: [] },
    ];
    let reads = 0;
    let waits = 0;
    const result = await pollPersistedPageFieldsReadOnly(
      async () => observations[Math.min(reads++, observations.length - 1)],
      2,
      { attempts: 5, intervalMs: 1, wait: async () => { waits += 1; } },
    );
    expect(result).toEqual(observations[2]);
    expect(reads).toBe(3);
    expect(waits).toBe(2);
  });

  it("riconosce presenza, assenza e conflitto nella tabella Altri beneficiari", () => {
    expect(classifyCoBeneficiaryRows([["1", "Maria Giovanna Angela", "Pinna", "PNNMGV84B43G203G"]], "PNNMGV84B43G203G")).toMatchObject({ status: "present", matchingCount: 1 });
    expect(classifyCoBeneficiaryRows([], "PNNMGV84B43G203G")).toMatchObject({ status: "missing" });
    expect(classifyCoBeneficiaryRows([["1", "Mario", "Rossi", "RSSMRA80A01H501U"]], "PNNMGV84B43G203G")).toMatchObject({ status: "conflict", conflictingFiscalCodes: ["RSSMRA80A01H501U"] });
  });
  it.runIf(process.platform === "darwin")("inserisce il beneficiario di fattura una sola volta e lo rilegge dopo GET", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-co-beneficiary-")); directories.push(root);
    const origin = await fixtureServer({ coBeneficiaryRealIdsPage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = coBeneficiaryDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    expect(driver.snapshot().events.filter((event) => event.action === "co_beneficiary_save_intent")).toHaveLength(1);
    expect(driver.snapshot().events.filter((event) => event.action === "co_beneficiary_saved_verified")).toHaveLength(1);
    expect(driver.snapshot().events.filter((event) => event.action === "co_beneficiary_already_present_readonly")).toHaveLength(1);
    await driver.savePage(draft, created.draftId, "page:Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Beneficiario")).not.toBeNull();
    const persisted = await driver.inspectPersistedPageValuesReadOnly(draft, created.draftId, "page:Beneficiario");
    expect(persisted.fields).toContainEqual(expect.objectContaining({ portalId: "semantic:beneficiary:co-beneficiary-tax-code", actual: "PNNMGV84B43G203G", matches: true }));
  }, 60_000);
  it("riconosce una sola riga schermatura dal contenuto tecnico anche quando l'indice ordinale non è più disponibile", () => {
    const fields = screeningDraftPackage().workflow.screeningSteps[0].fields;
    const rows = [["Tenda o veneziana", "Esterna", "4.6", "2.1", "0.08", "Sud-Ovest", "Dichiarato dal fornitore", "0.1", "Tessuto", "Manuale", ""]];
    const matchingFields = fields.map((field) => ({ ...field }));
    Object.assign(matchingFields.find((field) => field.portalId === "id-tipo")!, { value: "Tenda o veneziana" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-inst")!, { value: "Esterna" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-sup_s")!, { value: "4,6" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-sup_f")!, { value: "2,1" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-esp")!, { value: "Sud-Ovest" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-calc")!, { value: "Dichiarato dal fornitore" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-gtot")!, { value: "0,1" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-mat")!, { value: "Tessuto" });
    Object.assign(matchingFields.find((field) => field.portalId === "id-mec")!, { value: "Manuale" });
    expect(matchingScreeningRowIndexes(rows, matchingFields)).toEqual([0]);
    expect(matchingScreeningRowIndexes(rows, [...matchingFields, { portalId: "id-rsup", value: "0,08", control: "input" }])).toEqual([0]);
    expect(matchingScreeningRowIndexes(rows, [...matchingFields, { portalId: "id-rsup", value: "0,17", control: "input" }])).toEqual([]);
    expect(matchingScreeningRowIndexes(rows, matchingFields.map((field) => field.portalId === "id-gtot" ? { ...field, value: "0,33" } : field))).toEqual([]);
    expect(matchingScreeningRowIndexes([...rows, rows[0]], matchingFields)).toEqual([0, 1]);
    expect(matchingScreeningRowIndexes(rows, matchingFields.map((field) => field.portalId === "id-sup_s" ? { ...field, value: "4,6037" } : field))).toEqual([0]);
    expect(matchingScreeningRowIndexes(rows, matchingFields.map((field) => field.portalId === "id-sup_s" ? { ...field, value: "4,6137" } : field))).toEqual([]);
  });
  it("rifiuta una bozza finale che ha perso un prodotto anche se tutti i checkpoint intermedi erano verdi", () => {
    const draft = screeningDraftPackage("elisa-moro-regression");
    const expected = draft.workflow.screeningSteps;
    const row = (step: typeof expected[number]) => {
      const value = (id: string) => step.fields.find((field) => field.portalId === id)?.value ?? "";
      return [value("id-tipo"), value("id-inst"), value("id-sup_s"), value("id-sup_f"), "", value("id-esp"), value("id-calc"), value("id-gtot"), value("id-mat"), value("id-mec"), ""];
    };
    expect(classifyFinalScreeningIntegrity([row(expected[0])], expected, "1250,00", "1250")).toMatchObject({
      matched: false,
      reason: "final-screening-cardinality-or-fields-mismatch",
      expectedRowCount: 2,
      observedRowCount: 1,
      missingExpectedIndexes: [1],
      expectedCost: 1250,
      observedCost: 1250,
    });
  });
  it("richiede una riga server distinta per ogni prodotto fisico e confronta il costo numericamente", () => {
    const draft = screeningDraftPackage("cardinality-one-to-one");
    const identical = draft.workflow.screeningSteps.map((step) => ({ ...step, fields: step.fields.map((field) => ({ ...field })) }));
    identical[1].fields = identical[0].fields.map((field) => ({ ...field }));
    const value = (id: string) => identical[0].fields.find((field) => field.portalId === id)?.value ?? "";
    const row = [value("id-tipo"), value("id-inst"), value("id-sup_s"), value("id-sup_f"), "", value("id-esp"), value("id-calc"), value("id-gtot"), value("id-mat"), value("id-mec"), ""];
    expect(classifyFinalScreeningIntegrity([row, [...row]], identical, "1.250,00", "1250")).toMatchObject({ matched: true, matchedRowIndexes: [0, 1] });
    expect(classifyFinalScreeningIntegrity([row, [...row]], identical, "1250,00", "1249,99")).toMatchObject({ matched: false, reason: "final-screening-cost-mismatch" });
  });
  it("verifica semanticamente che il totale sia passato dal 50% al 36% senza cambiare il totale", () => {
    expect(italianCalculationInput("11965.48")).toBe("11965,48");
    expect(italianCalculationInput("10.478,07")).toBe("10478,07");
    const allocation = { fieldId: "schermature.spesa", interventionLabel: "Schermature solari", value: "10478.07", rate: 36 as const, appliedRuleIds: ["user-2026-08-16-secondary-home-36-percent-calculation-allocation"] };
    const headers = ["Intervento", "Spese 50% fino al 2024", "Spese 65% fino al 2024", "Spese congrue sostenute nel 2025-2026 (aliquota 50%)", "Spese congrue sostenute nel 2025-2026 (aliquota 36%)", "Spese 2027 36%", "Spese 2027 30%", "Totali [€]", "Modifica"];
    const rows = [["SS. Schermature solari", "--", "--", "--", "10478.07", "--", "--", "10478.07", ""]];
    expect(classifyCalculationAllocationTable(headers, rows, allocation)).toMatchObject({ matched: true, observed50: 0, observed36: 10478.07, observedTotal: 10478.07 });
    expect(classifyCalculationAllocationTable(headers, [["SS. Schermature solari", "--", "--", "10478.07", "--", "--", "--", "10478.07", ""]], allocation)).toMatchObject({ matched: false, observed50: 10478.07, observed36: 0 });
  });

  it.runIf(process.platform === "darwin")("prepara, salva una volta e rilegge da GET l'allocazione generale al 36%", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-calculation-36-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = calculationAllocationDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    const modalContract = await driver.inspectCalculationAllocationModalContractReadOnly(draft, created.draftId, "page:Allocazione costi e detrazioni");
    expect(modalContract).toMatchObject({ kind: "calculation-allocation-modal-contract-v9", customerKey: draft.customerKey, draftId: created.draftId });
    await driver.preparePage(draft, created.draftId, "page:Allocazione costi e detrazioni");
    expect(driver.snapshot().calculationModalContractDiagnostic).toMatchObject({ kind: "calculation-allocation-modal-contract-v9", evidenceId: modalContract.evidenceId });
    const calculationTarget = (await runtime.targets()).find((target) => target.url.includes(`/calcolo/${created.draftId}`));
    expect(calculationTarget).toBeDefined();
    const calculationClient = await runtime.pageClient(calculationTarget!);
    expect(await calculationClient.evaluate<string>('document.getElementById("cost36")?.value ?? ""')).toBe("10478,07");
    const trustedInputTrace = await calculationClient.evaluate<string[]>('JSON.parse(sessionStorage.getItem("fixture:' + created.draftId + ':trusted-input-trace") || "[]")');
    expect(trustedInputTrace[0]).toBe("");
    expect(trustedInputTrace.at(-1)).toBe("10478,07");
    await driver.savePage(draft, created.draftId, "page:Allocazione costi e detrazioni");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Allocazione costi e detrazioni")).not.toBeNull();
    expect(driver.snapshot().calculationModalContractDiagnostic).toMatchObject({ kind: "calculation-allocation-modal-contract-v9", evidenceId: modalContract.evidenceId });
    const persisted = await driver.inspectPersistedPageValuesReadOnly(draft, created.draftId, "page:Allocazione costi e detrazioni");
    expect(persisted.fields).toEqual(expect.arrayContaining([expect.objectContaining({ portalId: "semantic:calculation:2025-2026:50", actual: "0", matches: true }), expect.objectContaining({ portalId: "semantic:calculation:2025-2026:36", actual: "10478.07", matches: true }), expect.objectContaining({ portalId: "semantic:calculation:total", actual: "10478.07", matches: true })]));
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once" && event.pageId === "page:Allocazione costi e detrazioni")).toHaveLength(1);
  }, 30_000);
  it("riconosce il redirect SPID esterno senza confonderlo con una scheda ENEA mancante", () => {
    const allowedOrigin = "https://bonusfiscali.enea.it";
    expect(findExternalAuthenticationTarget([
      fixtureTarget("extension", "background_page", "chrome-extension://apr/background.html"),
      fixtureTarget("spid", "page", "https://identity.example.test/login"),
    ], allowedOrigin)).toMatchObject({ id: "spid" });
    expect(findExternalAuthenticationTarget([
      fixtureTarget("enea", "page", `${allowedOrigin}/`),
      fixtureTarget("uncontrolled", "page", "https://identity.example.test/login", false),
    ], allowedOrigin)).toBeNull();
    expect(findExternalAuthenticationTarget([
      fixtureTarget("enea", "page", `${allowedOrigin}/`),
      fixtureTarget("crm", "page", "https://app.praticarapida.it/kanban"),
    ], allowedOrigin)).toBeNull();
  });

  it("non apre una nuova scheda ENEA mentre il target corrente è sul provider SPID", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-spid-journey-")); directories.push(root);
    let openPageCalls = 0;
    const runtime = {
      profileFingerprint: "fixture-spid-profile",
      targets: async () => [{ id: "spid", type: "page", title: "SPID", url: "https://identity.example.test/login", webSocketDebuggerUrl: "ws://127.0.0.1/spid" }],
      openPage: async () => { openPageCalls += 1; throw new Error("unexpected_open_page"); },
      closePageClientsExcept: () => undefined,
      closeAllPageClients: () => undefined,
    } as unknown as PersistentAprChromeRuntime;
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: "https://bonusfiscali.enea.it", dashboardUrl: "https://bonusfiscali.enea.it/" });
    expect(await driver.inspectExternalAuthenticationJourneyReadOnly()).toMatchObject({ inProgress: true, evidenceId: expect.stringMatching(/^external-auth-/) });
    await expect(driver.verifySession()).rejects.toThrow("apr_cdp_enea_external_login_in_progress");
    expect(openPageCalls).toBe(0);
  });

  it("riclassifica come viaggio SPID la race in cui il target ENEA cambia origine durante verifySession", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-spid-origin-race-")); directories.push(root);
    const allowedOrigin = "https://bonusfiscali.enea.it";
    let targetReads = 0;
    const runtime = {
      profileFingerprint: "fixture-spid-race-profile",
      targets: async () => {
        targetReads += 1;
        return targetReads === 1
          ? [fixtureTarget("enea", "page", `${allowedOrigin}/dashboard`)]
          : [fixtureTarget("spid", "page", "https://identity.example.test/login")];
      },
      pageClient: async () => ({ evaluate: async () => "https://identity.example.test/login" }),
      closePageClientsExcept: () => undefined,
      closeAllPageClients: () => undefined,
    } as unknown as PersistentAprChromeRuntime;
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin, dashboardUrl: `${allowedOrigin}/`, allowOpenInitialPage: false });

    await expect(driver.verifySession()).rejects.toThrow("apr_cdp_enea_external_login_in_progress");
    expect(targetReads).toBe(2);
  });

  it("non riclassifica un'origine estranea quando esiste ancora un target ENEA controllabile", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-foreign-origin-")); directories.push(root);
    const allowedOrigin = "https://bonusfiscali.enea.it";
    let targetReads = 0;
    const runtime = {
      profileFingerprint: "fixture-foreign-origin-profile",
      targets: async () => {
        targetReads += 1;
        return targetReads === 1
          ? [fixtureTarget("enea-racing", "page", `${allowedOrigin}/dashboard`)]
          : [fixtureTarget("enea-stable", "page", `${allowedOrigin}/dashboard`), fixtureTarget("foreign", "page", "https://unrelated.example.test/")];
      },
      pageClient: async () => ({ evaluate: async () => "https://unrelated.example.test/" }),
      closePageClientsExcept: () => undefined,
      closeAllPageClients: () => undefined,
    } as unknown as PersistentAprChromeRuntime;
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin, dashboardUrl: `${allowedOrigin}/`, allowOpenInitialPage: false });

    await expect(driver.verifySession()).rejects.toThrow("apr_cdp_enea_origin_rejected");
    expect(targetReads).toBe(2);
  });

  it.runIf(process.platform === "darwin")("prova l'autenticazione dalla capability dashboard quando la root ENEA è ambigua", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-dashboard-auth-")); directories.push(root);
    const origin = await fixtureServer({ ambiguousRoot: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true, serverLogoutProven: false });
    expect(driver.snapshot().events.filter((event) => event.action === "verify_session_dom_server_get")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("riconosce la root ENEA autenticata dal controllo Esci senza dipendere dal percorso dashboard", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-root-exit-auth-")); directories.push(root);
    const origin = await fixtureServer({ authenticatedRootEsci: true, dashboardMode: "path-only" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true, serverLogoutProven: false, url: `${origin}/` });
    expect(driver.snapshot().events.filter((event) => event.action === "verify_session_dom_server_get")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("non scambia il solo percorso dashboard per prova di autenticazione o logout", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-dashboard-path-only-")); directories.push(root);
    const origin = await fixtureServer({ ambiguousRoot: true, dashboardMode: "path-only" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: false, serverLogoutProven: false });
  }, 30_000);

  it.runIf(process.platform === "darwin")("prova il logout solo quando il server respinge la dashboard verso il gateway pubblico", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-dashboard-server-logout-")); directories.push(root);
    const origin = await fixtureServer({ ambiguousRoot: true, dashboardMode: "redirect-root" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: false, serverLogoutProven: true, url: `${origin}/` });
    expect(driver.snapshot().events.filter((event) => event.action === "verify_session_dashboard_navigation_readonly_get")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("recupera la prova DOM dalla dashboard SPA con una sola navigazione GET sicura", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-dashboard-spa-")); directories.push(root);
    const origin = await fixtureServer({ ambiguousRoot: true, dashboardMode: "spa-authenticated" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true, serverLogoutProven: false, url: `${origin}/dashboard` });
    expect(driver.snapshot().events.filter((event) => event.action === "verify_session_dashboard_navigation_readonly_get")).toHaveLength(1);
  }, 30_000);

  it("riconosce una bozza completa dalla catena durevole di prove server e rifiuta catene incomplete", () => {
    const event = (revision: number, action: string, pageId: string, route: string) => ({ revision, at: `2026-08-16T10:00:${String(revision).padStart(2, "0")}.000Z`, action, evidenceId: `server-${revision}`, url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/${route}/411950`, targetId: "target", customerKey: "amelia-lerose", draftId: "411950", pageId, domSha256: "a".repeat(64), appliedRuleIds: ["system-atomic-checkpoint-resume"] });
    const events = [
      event(1, "save_page_once", "page:Anagrafica Beneficiario", "immobile"),
      event(2, "verify_page_saved_server_redirect", "page:Anagrafica Beneficiario", "immobile"),
      event(3, "save_page_once", "screening:1", "schermature"),
      event(4, "verify_screening_staged_page_state", "screening:1", "schermature"),
      event(5, "save_page_once", "page:Calcolo costi e detrazioni", "riepilogo"),
      event(6, "verify_page_saved_server_redirect", "page:Calcolo costi e detrazioni", "riepilogo"),
    ];
    const input = { events, customerKey: "amelia-lerose", draftId: "411950", pageIds: ["page:Anagrafica Beneficiario", "screening:1", "page:Calcolo costi e detrazioni"] };
    expect(findCompleteDraftServerEvidence(input)).toMatchObject({ evidenceId: "server-6", url: "https://bonusfiscali.enea.it/pratica/ecobonus/2026/riepilogo/411950" });
    expect(findCompleteDraftServerEvidence({ ...input, events: events.filter((item) => item.revision !== 4) })).toBeNull();
  });

  it("riconosce una riga screening recuperata e verificata read-only prima del Salva esterno", () => {
    const event = (revision: number, action: string, pageId: string, route: string) => ({ revision, at: `2026-08-18T10:00:${String(revision).padStart(2, "0")}.000Z`, action, evidenceId: `server-${revision}`, url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/${route}/416890`, targetId: "target", customerKey: "elisa-moro", draftId: "416890", pageId, domSha256: "b".repeat(64), appliedRuleIds: ["system-atomic-checkpoint-resume"] });
    const events = [
      event(1, "save_page_once", "screening:1", "schermature"),
      event(2, "verify_screening_post_save_failed_readonly_diagnostic", "screening:1", "schermature"),
      event(3, "save_page_once", "page:Schermature solari", "calcolo"),
      event(4, "verify_page_saved_server_redirect", "page:Schermature solari", "calcolo"),
      event(5, "save_page_once", "page:Calcolo costi e detrazioni", "riepilogo"),
      event(6, "verify_page_saved_server_redirect", "page:Calcolo costi e detrazioni", "riepilogo"),
    ];
    expect(findCompleteDraftServerEvidence({ events, customerKey: "elisa-moro", draftId: "416890", pageIds: ["screening:1", "page:Schermature solari", "page:Calcolo costi e detrazioni"] })).toMatchObject({ evidenceId: "server-6" });
  });

  it("riconosce la catena durevole Infissi con generatore annidato, righe tecniche 1:1 e Salva esterni", () => {
    const event = (revision: number, action: string, pageId: string, route: string) => ({ revision, at: `2026-08-22T10:00:${String(revision).padStart(2, "0")}.000Z`, action, evidenceId: `server-${revision}`, url: `https://bonusfiscali.enea.it/pratica/ecobonus/2026/${route}/424547`, targetId: "target", customerKey: "mara-elena-maddiotto", draftId: "424547", pageId, domSha256: "c".repeat(64), appliedRuleIds: ["system-atomic-checkpoint-resume"] });
    const events = [
      event(1, "save_page_once", "page:Generatore dell'impianto termico", "impianto_esistente"),
      event(2, "verify_generator_staged_page_state", "page:Generatore dell'impianto termico", "impianto_esistente"),
      event(3, "save_page_once", "page:Impianto termico esistente", "strutture_opache"),
      event(4, "verify_page_saved_server_redirect", "page:Impianto termico esistente", "strutture_opache"),
      event(5, "save_page_once", "screening:1", "serramenti"),
      event(6, "verify_infissi_row_staged_page_state", "screening:1", "serramenti"),
      event(7, "save_page_once", "page:Serramenti e infissi", "calcolo"),
      event(8, "verify_page_saved_server_redirect", "page:Serramenti e infissi", "calcolo"),
      event(9, "save_page_once", "page:Calcolo costi e detrazioni", "riepilogo"),
      event(10, "verify_page_saved_server_redirect", "page:Calcolo costi e detrazioni", "riepilogo"),
    ];
    const input = { events, customerKey: "mara-elena-maddiotto", draftId: "424547", pageIds: ["page:Generatore dell'impianto termico", "page:Impianto termico esistente", "screening:1", "page:Serramenti e infissi", "page:Calcolo costi e detrazioni"] };
    expect(findCompleteDraftServerEvidence(input)).toMatchObject({ evidenceId: "server-10" });
    expect(findCompleteDraftServerEvidence({ ...input, events: events.filter((item) => item.revision !== 6) })).toBeNull();
  });

  it("certifica la cardinalità Infissi totale anche quando la tabella server è paginata", () => {
    expect(classifyInfissiFinalIntegrity({ visibleRowCount: 5, paginationText: ["Visualizzati da 1 a 5 di 11 elementi"], expectedCount: 11, observedCost: 12000, expectedCost: 12000 })).toMatchObject({ matched: true, rowCount: 11, cardinalityMatched: true, costMatched: true });
    expect(classifyInfissiFinalIntegrity({ visibleRowCount: 5, paginationText: ["Showing 1 to 5 of 10 entries"], expectedCount: 11, observedCost: 12000, expectedCost: 12000 })).toMatchObject({ matched: false, rowCount: 10, cardinalityMatched: false });
  });

  it("traduce il vettore energetico elettrico nella riga tecnica Altro senza cambiare gli altri generatori", () => {
    expect(eneaGeneratorActivationLabels("Energia elettrica")).toEqual(["Energia elettrica", "Altro"]);
    expect(eneaGeneratorActivationLabels("Caldaia a GPL")).toEqual(["Caldaia a GPL", "Altro"]);
    expect(eneaGeneratorActivationLabels("Caldaia a gas a condensazione")).toEqual(["Caldaia a gas a condensazione"]);
  });
  it.runIf(process.platform === "darwin")("prova in sola lettura l'assenza delle vecchie bozze prima di un repeat-test", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-repeat-absence-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    const proof = await driver.verifyDraftIdsAbsentReadOnly(["411950", "411954", "411957"]);
    expect(proof).toMatchObject({ allAbsent: true, presentDraftIds: [], requestedDraftIds: ["411950", "411954", "411957"] });
    expect(driver.snapshot().events.filter((event) => event.action === "verify_repeat_draft_absence_server_get")).toHaveLength(1);
  }, 30_000);
  it.runIf(process.platform === "darwin")("ritira la mappatura locale cancellata solo con prova di assenza server e consente una nuova generazione", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-deleted-mapping-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const draft = draftPackage("case-deleted-and-requeued");
    const created = await driver.createDraft(draft);
    expect(driver.snapshot().mappings).toEqual([expect.objectContaining({ customerKey: draft.customerKey, draftId: created.draftId })]);

    const proof = await driver.verifyDraftIdsAbsentReadOnly([created.draftId]);
    expect(proof.allAbsent).toBe(true);
    expect(driver.retireDeletedDraftMappingAfterVerifiedAbsence(draft.customerKey, created.draftId, proof)).toMatchObject({ retired: true, evidenceId: expect.stringMatching(/^cdp-local-/) });
    expect(driver.snapshot().mappings).toEqual([]);
    expect(await driver.discoverExistingDraft(draft)).toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "retire_deleted_draft_mapping_after_server_absence")).toEqual([
      expect.objectContaining({ customerKey: draft.customerKey, draftId: created.draftId, domSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
  }, 30_000);
  it.runIf(process.platform === "darwin")("attende mount React e usa un solo clic fisico attendibile sulla route Beneficiario", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-delayed-beneficiary-")); directories.push(root);
    const origin = await fixtureServer({ delayedBeneficiaryMount: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = delayedBeneficiaryDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    await driver.savePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Anagrafica Beneficiario")).not.toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("serializza gli onChange dei campi che condividono lo stato React prima dell'unico Salva", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-shared-react-beneficiary-")); directories.push(root);
    const origin = await fixtureServer({ sharedReactStateBeneficiaryPage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = sharedReactStateBeneficiaryDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    await driver.savePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Anagrafica Beneficiario")).not.toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("misura Salva dopo lo scroll e non clicca coordinate fuori viewport", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-offscreen-save-")); directories.push(root);
    const origin = await fixtureServer({ delayedBeneficiaryMount: true, offscreenSaveButton: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = delayedBeneficiaryDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    await driver.savePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Anagrafica Beneficiario")).not.toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("ridistribuisce lo stesso intento Salva via tastiera solo quando il primo clic non produce alcuna mutazione", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-save-delivery-fallback-")); directories.push(root);
    const origin = await fixtureServer({ delayedBeneficiaryMount: true, ignoreFirstSaveDelivery: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = delayedBeneficiaryDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    await driver.savePage(draft, created.draftId, "page:Anagrafica Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Anagrafica Beneficiario")).not.toBeNull();
    expect(driver.snapshot().pageSaveDiagnostics.at(-1)).toMatchObject({ deliveryFallback: "trusted_enter_then_react_click_after_no_mutation" });
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
  }, 40_000);

  it.runIf(process.platform === "darwin")("attende la riga schermatura ritardata dopo l'unico Salva", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-delayed-screening-")); directories.push(root);
    const origin = await fixtureServer({ delayedScreeningRowMount: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = screeningDraftPackage("case-delayed-screening");
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "screening:1");
    await driver.savePage(draft, created.draftId, "screening:1");
    expect(await driver.verifyPageSaved(draft, created.draftId, "screening:1")).not.toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
    const target = (await runtime.targets()).find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && candidate.url.includes(`/schermature/${created.draftId}`));
    if (!target) throw new Error("fixture_screening_target_missing");
    const client = await runtime.pageClient(target);
    await client.evaluate(`document.documentElement.innerHTML=""`);
    expect(await driver.verifyNestedPageSavedCanonicalReadOnly(draft, created.draftId, "screening:1")).not.toBeNull();
    const diagnostic = await driver.inspectScreeningSummaryReadOnly(draft, created.draftId, "screening:1");
    expect(diagnostic).toMatchObject({ kind: "screening-summary-readonly-v4", url: `${origin}/pratica/ecobonus/2026/schermature/${created.draftId}`, loading: false, surfaceReady: true, authenticated: true });
    expect(diagnostic.bodyText).toContain("Utente connesso");
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(1);
  }, 45_000);

  it.runIf(process.platform === "darwin")("controlla un Chrome dedicato sul solo fixture locale e recupera la mappatura dopo riavvio del driver", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-driver-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/signed-out` });
    runtimes.push(runtime); await runtime.ensureRunning(); await runtime.openPage(`${origin}/`);
    let driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    const session = await driver.verifySession();
    expect(session).toMatchObject({ authenticated: true, serverLogoutProven: false });
    expect(await driver.inspectPortalContractReadOnly()).toMatchObject({ ready: true, operationalUrl: `${origin}/dashboard`, createCandidateCount: 1, forbiddenCandidateCount: 0, navigationCandidates: expect.arrayContaining([{ tag: "a", label: "inserisci nuova scheda descrittiva ecobonus con data di fine lavori nel 2026", path: "/pratica/ecobonus/2026/nuova" }]) });
    const draft = persistenceDraftPackage();
    const created = await driver.createDraft(draft);
    expect(created).toMatchObject({ draftId: "700001" });
    const prepared = await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    expect(prepared.evidenceId).toMatch(/^cdp-server-/);
    await driver.savePage(draft, created.draftId, "page:Beneficiario");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Beneficiario")).not.toBeNull();
    const draftTarget = (await runtime.targets()).find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && candidate.url.startsWith(origin));
    if (!draftTarget) throw new Error("fixture_draft_target_missing");
    const draftClient = await runtime.pageClient(draftTarget);
    await draftClient.navigate(`${origin}/new`);
    draftClient.close();
    expect(await driver.inspectPersistedPageValuesReadOnly(draft, created.draftId, "page:Beneficiario")).toMatchObject({ customerKey: "case-cdp", draftId: "700001", fields: [expect.objectContaining({ portalId: "id-cf", matches: true })] });
    expect(await driver.verifyDraftSaved(draft, created.draftId)).toMatchObject({ draftId: "700001" });

    driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.discoverExistingDraft(draft)).toMatchObject({ draftId: "700001" });
    const snapshot = driver.snapshot();
    expect(snapshot.mappings).toHaveLength(1);
    expect(snapshot.events.map((event) => event.action)).toEqual(expect.arrayContaining(["verify_session_dom_server_get", "inspect_portal_contract_readonly", "create_draft_once", "prepare_allowlisted_page", "save_page_once", "verify_complete_draft_readonly"]));
    expect(snapshot.events.every((event) => ["authorized-27-enea-session-readonly-keepalive", "system-atomic-checkpoint-resume", "system-single-active-practice"].every((ruleId) => event.appliedRuleIds.includes(ruleId)) && event.domSha256.length === 64)).toBe(true);
    expect(snapshot.events.find((event) => event.action === "verify_complete_draft_readonly")?.appliedRuleIds).toContain("system-final-draft-source-cardinality-and-cost-verification");
  }, 60_000);

  it.runIf(process.platform === "darwin")("seleziona il Comune dal widget React obbligatorio senza accettare testo libero", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-municipality-search-")); directories.push(root);
    const origin = await fixtureServer({ municipalitySearchModalPage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = municipalitySearchDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    const target = (await runtime.targets()).find((candidate) => candidate.url.includes(`/beneficiario/${created.draftId}`));
    expect(target).toBeDefined();
    const client = await runtime.pageClient(target!);
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.value ?? ""')).toBe("Bologna (BO)");
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.dataset.aprAutocompleteSelected ?? ""')).toBe("true");
  }, 30_000);

  it.runIf(process.platform === "darwin")("consegna al form il codice ISTAT della GET autorevole quando il menu React non e esposto", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-municipality-code-")); directories.push(root);
    const origin = await fixtureServer({ municipalityAuthoritativeCodePage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = municipalityAuthoritativeCodeDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    const target = (await runtime.targets()).find((candidate) => candidate.url.includes(`/beneficiario/${created.draftId}`));
    expect(target).toBeDefined();
    const client = await runtime.pageClient(target!);
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.value ?? ""')).toBe("Santa Maria di Sala (VE)");
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.dataset.aprAutocompleteSelected ?? ""')).toBe("true");
    expect(await client.evaluate<string>('window.__aprMunicipalityAuthoritativeCode ?? ""')).toBe("027035");
  }, 30_000);

  it.runIf(process.platform === "darwin")("accetta senza provincia soltanto l'unico Comune attivo con nome esatto", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-municipality-unique-name-")); directories.push(root);
    const origin = await fixtureServer({ municipalityAuthoritativeCodePage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = municipalityAuthoritativeCodeDraftPackage();
    delete draft.workflow.steps[0].fields[0].autocompleteQualifier;
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    const target = (await runtime.targets()).find((candidate) => candidate.url.includes(`/beneficiario/${created.draftId}`));
    expect(target).toBeDefined();
    const client = await runtime.pageClient(target!);
    expect(await client.evaluate<string>('window.__aprMunicipalityAuthoritativeCode ?? ""')).toBe("027035");
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.dataset.aprAutocompleteSelected ?? ""')).toBe("true");
  }, 30_000);

  it.runIf(process.platform === "darwin")("usa la variante con apostrofo soltanto come query e conserva la corrispondenza esatta", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-municipality-apostrophe-query-")); directories.push(root);
    const origin = await fixtureServer({ municipalityAuthoritativeCodePage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = municipalityAuthoritativeCodeDraftPackage();
    draft.workflow.steps[0].fields[0].value = "Castel d aiano";
    delete draft.workflow.steps[0].fields[0].autocompleteQualifier;
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await driver.preparePage(draft, created.draftId, "page:Beneficiario");
    const target = (await runtime.targets()).find((candidate) => candidate.url.includes(`/beneficiario/${created.draftId}`));
    expect(target).toBeDefined();
    const client = await runtime.pageClient(target!);
    expect(await client.evaluate<string>('window.__aprMunicipalityAuthoritativeCode ?? ""')).toBe("037013");
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.value ?? ""')).toBe("Castel d'Aiano (BO)");
  }, 30_000);

  it.runIf(process.platform === "darwin")("preserva il Comune disabilitato gia persistito mentre corregge un altro campo", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-persisted-municipality-")); directories.push(root);
    const origin = await fixtureServer({ persistedMunicipalityPage: true });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = persistedMunicipalityCorrectionDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await expect(driver.preparePage(draft, created.draftId, "page:Beneficiario")).resolves.toMatchObject({ evidenceId: expect.stringMatching(/^cdp-server-/) });
    const target = (await runtime.targets()).find((candidate) => candidate.url.includes(`/beneficiario/${created.draftId}`));
    expect(target).toBeDefined();
    const client = await runtime.pageClient(target!);
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.value ?? ""')).toBe("Milano (MI)");
    expect(await client.evaluate<string>('document.getElementById("id-comune")?.dataset.aprAutocompleteSelected ?? ""')).toBe("true");
    expect(await client.evaluate<string>('document.getElementById("id-tipologia")?.value ?? ""')).toBe("18");
  }, 30_000);

  it.runIf(process.platform === "darwin")("fa eseguire al processo APR due pratiche consecutive nello stesso Chrome senza controller Codex", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-two-case-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true, serverLogoutProven: false });
    expect(await driver.inspectPortalContractReadOnly()).toMatchObject({ ready: true, operationalUrl: `${origin}/dashboard` });
    const execution = new PersistentAprEneaDraftExecution(root, { allowedPortalOrigin: origin });
    execution.prepare(twoCasePreflight());
    const worker = new PersistentAprEneaBrowserWorker(root, execution, persistenceDraftPackage, driver, { instanceId: "apr-real-browser-fixture-worker", processPid: 4301 });
    const completed = await worker.runUntilTerminal();

    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-one", "case-two"], driverKind: "cdp_chrome", forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0 });
    expect(execution.snapshot()).toMatchObject({ status: "completed", progress: { saved: 2, blocked: 0, queued: 0, active: 0 } });
    expect(execution.snapshot().items.map((item) => item.draftId)).toEqual(["700001", "700002"]);
    expect(driver.snapshot().mappings.map((mapping) => mapping.customerKey)).toEqual(["case-one", "case-two"]);
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(2);
    expect(completed.audit.every((event) => event.executorKind === "apr_browser_worker" && event.processPid === 4301)).toBe(true);
  }, 90_000);

  it.runIf(process.platform === "darwin")("inventa in sola lettura la pagina intermedia senza submit o secondo tentativo", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-creation-surface-")); directories.push(root);
    const origin = await fixtureServer({ intermediateCreation: "diagnostic" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true });
    expect(await driver.inspectPortalContractReadOnly()).toMatchObject({ ready: true });
    await expect(driver.createDraft(draftPackage("case-intermediate"))).rejects.toThrow("apr_cdp_enea_creation_wizard_contract_invalid");
    expect(await driver.inspectPendingCreationSurfaceReadOnly()).toMatchObject({ customerKey: "case-intermediate", forms: [{ id: "create-beneficiary", method: "post", path: "/pratica/ecobonus/2026/nuova" }], controls: expect.arrayContaining([expect.objectContaining({ id: "beneficiary-type", name: "beneficiaryType", label: "Tipo beneficiario" })]), actions: expect.arrayContaining([expect.objectContaining({ type: "submit", label: "Inserisci" })]) });
    expect(driver.snapshot().events.filter((event) => event.action === "inspect_pending_creation_surface_readonly")).toHaveLength(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("crea una sola bozza attraverso il wizard intermediario persona fisica", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-wizard-create-")); directories.push(root);
    const origin = await fixtureServer({ intermediateCreation: "valid" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/` });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true });
    expect(await driver.inspectPortalContractReadOnly()).toMatchObject({ ready: true });
    expect(await driver.createDraft(draftPackage("case-wizard"))).toMatchObject({ draftId: "700001" });
    expect(driver.snapshot()).toMatchObject({ pendingCreate: null, mappings: [expect.objectContaining({ customerKey: "case-wizard", draftId: "700001" })] });
  }, 30_000);

  it.runIf(process.platform === "darwin")("recupera dalla dashboard una bozza materializzata senza redirect del wizard", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-dashboard-create-discovery-")); directories.push(root);
    const origin = await fixtureServer({ dashboardDraftId: "700777" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/dashboard` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-dashboard", customerKey: "case-dashboard", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture" };
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    expect(await driver.discoverExistingDraft(draftPackage("case-dashboard"))).toMatchObject({ draftId: "700777" });
    expect(driver.snapshot()).toMatchObject({ pendingCreate: null, mappings: [expect.objectContaining({ customerKey: "case-dashboard", draftId: "700777" })] });
  }, 30_000);

  it("raccoglie come gia possedute le bozze delle coorti sorelle", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-sibling-ownership-")); directories.push(base);
    const current = path.join(base, "cohorts", "current");
    const sibling = path.join(base, "cohorts", "sibling", "enea-draft-execution");
    mkdirSync(current, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, "checkpoint.json"), `${JSON.stringify({ items: [{ customerKey: "other-case", draftId: "700777" }] })}\n`);
    expect([...siblingCohortOwnedDraftIds(current)]).toEqual(["700777"]);
  });

  it("resta fail-closed se una fonte di ownership di una coorte sorella e illeggibile", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-sibling-corrupt-")); directories.push(base);
    const current = path.join(base, "cohorts", "current");
    const sibling = path.join(base, "cohorts", "sibling", "enea-browser-worker");
    mkdirSync(current, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, "cdp-driver.json"), "{corrotto");
    expect(() => siblingCohortOwnedDraftIds(current)).toThrow("apr_cdp_sibling_draft_ownership_checkpoint_invalid");
  });

  it.runIf(process.platform === "darwin")("rifiuta una bozza dashboard gia assegnata a una coorte sorella", async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-cross-cohort-discovery-")); directories.push(base);
    const root = path.join(base, "cohorts", "current");
    const siblingExecution = path.join(base, "cohorts", "sibling", "enea-draft-execution");
    mkdirSync(root, { recursive: true });
    mkdirSync(siblingExecution, { recursive: true });
    writeFileSync(path.join(siblingExecution, "checkpoint.json"), `${JSON.stringify({ items: [{ customerKey: "case-owner", draftId: "700777", state: "saved" }] })}\n`);
    const origin = await fixtureServer({ dashboardDraftId: "700777" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/dashboard` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-dashboard", customerKey: "case-dashboard", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture" };
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    expect(await driver.discoverExistingDraft(draftPackage("case-dashboard"))).toBeNull();
    expect(driver.snapshot()).toMatchObject({ mappings: [] });
  }, 30_000);

  it.runIf(process.platform === "darwin")("non ripete il submit del wizard quando il tentativo persistente e gia consumato", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-wizard-submit-guard-")); directories.push(root);
    const origin = await fixtureServer({ intermediateCreation: "valid" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/pratica/ecobonus/2026/nuova` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-guard", customerKey: "case-guard", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture" };
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    await expect(driver.createDraft(draftPackage("case-guard"))).rejects.toThrow("apr_cdp_enea_wizard_submit_already_attempted");
    expect(driver.snapshot().pendingCreate?.wizardSubmitAttemptCount).toBe(1);
  }, 30_000);

  it.runIf(process.platform === "darwin")("autorizza una sola nuova creazione soltanto dopo due letture server concordanti e vuote", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-create-double-absence-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/dashboard` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-absence", customerKey: "case-absence", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture" };
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    const draft = draftPackage("case-absence");
    const proof = await driver.verifyPendingCreateAbsentReadOnly(draft);
    expect(proof).toMatchObject({ conclusivelyAbsent: true, candidateDraftIdsByReading: [[], []] });
    expect(new Set(proof.evidenceIds).size).toBe(2);
    driver.authorizeSingleCreateRetryAfterAbsence(draft, proof);
    expect(driver.snapshot()).toMatchObject({ pendingCreate: null, createRecoveryRecords: [{ customerKey: "case-absence", status: "retry_authorized" }] });
    expect(() => driver.authorizeSingleCreateRetryAfterAbsence(draft, proof)).toThrow("apr_cdp_enea_create_absence_proof_invalid");
  }, 30_000);

  it.runIf(process.platform === "darwin")("non autorizza il retry se le letture vedono una bozza candidata e libera la coda solo in quarantena", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-create-absence-inconclusive-")); directories.push(root);
    const origin = await fixtureServer({ dashboardDraftId: "700991" });
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/dashboard` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-inconclusive", customerKey: "case-inconclusive", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture" };
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    const draft = draftPackage("case-inconclusive");
    const proof = await driver.verifyPendingCreateAbsentReadOnly(draft);
    expect(proof.conclusivelyAbsent).toBe(false);
    expect(proof.candidateDraftIdsByReading).toEqual([["700991"], ["700991"]]);
    expect(() => driver.authorizeSingleCreateRetryAfterAbsence(draft, proof)).toThrow("apr_cdp_enea_create_retry_requires_conclusive_absence");
    driver.quarantinePendingCreateAfterInconclusive(draft, proof);
    expect(driver.snapshot()).toMatchObject({ pendingCreate: null, createRecoveryRecords: [{ customerKey: "case-inconclusive", status: "quarantined_inconclusive" }] });
  }, 30_000);

  it.runIf(process.platform === "darwin")("dopo l'unico retry esaurito non crea ancora e rimuove la barriera globale", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-create-retry-exhausted-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/dashboard` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/dashboard` });
    await driver.verifySession();
    const checkpointPath = path.join(root, "enea-browser-worker", "cdp-driver.json");
    const state = driver.snapshot();
    state.pendingCreate = { packageFingerprint: "package-case-exhausted", customerKey: "case-exhausted", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 1, wizardSubmitAttemptedAt: new Date().toISOString(), wizardContractFingerprint: "fixture-second-attempt" };
    state.createRecoveryRecords = [{ customerKey: "case-exhausted", packageFingerprint: "package-case-exhausted", status: "retry_authorized", evidenceIds: ["first-read-1", "first-read-2"], recordedAt: new Date().toISOString() }];
    writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    const draft = draftPackage("case-exhausted");
    const proof = await driver.verifyPendingCreateAbsentReadOnly(draft);
    expect(proof.conclusivelyAbsent).toBe(true);
    expect(() => driver.authorizeSingleCreateRetryAfterAbsence(draft, proof)).toThrow("apr_cdp_enea_create_absence_proof_invalid");
    driver.quarantinePendingCreateAfterExhaustedRetry(draft, proof);
    expect(driver.snapshot()).toMatchObject({
      pendingCreate: null,
      createRecoveryRecords: [
        { customerKey: "case-exhausted", status: "retry_authorized" },
        { customerKey: "case-exhausted", status: "retry_exhausted_quarantined" },
      ],
    });
  }, 30_000);

  it.runIf(process.platform === "darwin")("staggia il generatore, salva una sola volta la pagina impianto e verifica entrambi lato server", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-generator-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = generatorAndPlantDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    expect(await driver.verifySession()).toMatchObject({ authenticated: true });
    expect(await driver.inspectPortalContractReadOnly()).toMatchObject({ ready: true, operationalUrl: `${origin}/dashboard` });
    const created = await driver.createDraft(draft);
    expect(created).toMatchObject({ draftId: "700001" });
    expect(await driver.inspectGeneratorSummaryReadOnly(draft, created.draftId, "page:Generatore dell'impianto termico")).toMatchObject({ kind: "generator-summary-readonly-v2", expectedActivationLabel: "Gas a condensazione", loading: false, surfaceReady: true, rows: expect.arrayContaining([expect.arrayContaining(["Caldaia a gas a condensazione"])]) });
    expect(await driver.inspectGeneratorActivationSurfaceReadOnly(draft, created.draftId, "page:Generatore dell'impianto termico")).toMatchObject({ kind: "generator-activation-surface-readonly-v2", activation: { rowFound: true, controlFound: true, clicked: true }, markerIdsPresent: ["id-num", "id-n", "id-pn"] });
    await driver.preparePage(draft, created.draftId, "page:Generatore dell'impianto termico");
    await driver.savePage(draft, created.draftId, "page:Generatore dell'impianto termico");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Generatore dell'impianto termico")).not.toBeNull();
    expect(driver.snapshot().events.filter((event) => event.action === "verify_generator_staged_page_state")).toHaveLength(1);
    await driver.preparePage(draft, created.draftId, "page:Impianto termico esistente");
    await driver.savePage(draft, created.draftId, "page:Impianto termico esistente");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Impianto termico esistente")).not.toBeNull();
    expect(await driver.verifyDraftSaved(draft, created.draftId)).toMatchObject({ draftId: "700001" });
    expect(driver.snapshot().events.filter((event) => event.action === "save_page_once")).toHaveLength(2);
  }, 180_000);

  it.runIf(process.platform === "darwin")("rilegge due schermature persistite 1:1 e rifiuta la perdita di una riga", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-screenings-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = screeningDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    const target = (await runtime.targets()).find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && candidate.url.startsWith(origin));
    if (!target) throw new Error("fixture_screening_target_missing");
    const client = await runtime.pageClient(target);
    await client.navigate(`${origin}/pratica/ecobonus/2026/schermature/${created.draftId}`);
    const persistedRows = draft.workflow.screeningSteps.map((step) => Object.fromEntries(step.fields.map((field) => [field.portalId, field.value])));
    await client.evaluate(`(()=>{rows=${JSON.stringify(persistedRows)};cost.value="2150,00";sessionStorage.setItem(storageKey,JSON.stringify(rows));sessionStorage.setItem(costKey,cost.value);render();return rows.length})()`);
    const complete = await driver.inspectScreeningSummaryReadOnly(draft, created.draftId, "screening:1");
    expect(classifyFinalScreeningIntegrity(complete.rows, draft.workflow.screeningSteps, "2150,00", complete.costValue)).toMatchObject({ matched: true, expectedRowCount: 2, observedRowCount: 2 });
    await client.evaluate(`(()=>{rows.pop();sessionStorage.setItem(storageKey,JSON.stringify(rows));render();return rows.length})()`);
    client.close();
    const incomplete = await driver.inspectScreeningSummaryReadOnly(draft, created.draftId, "screening:1");
    expect(classifyFinalScreeningIntegrity(incomplete.rows, draft.workflow.screeningSteps, "2150,00", incomplete.costValue)).toMatchObject({ matched: false, expectedRowCount: 2, observedRowCount: 1 });
  }, 120_000);

  it.runIf(process.platform === "darwin")("produce due prove read-only indipendenti e fail-closed sui filtri del riepilogo vuoto", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-empty-screenings-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = screeningDraftPackage("case-empty-screenings");
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    const first = await driver.inspectScreeningSummaryReadOnly(draft, created.draftId, "screening:1");
    const second = await driver.inspectScreeningSummaryReadOnly(draft, created.draftId, "screening:1");
    expect(first).toMatchObject({ kind: "screening-summary-readonly-v4", allowlistedOrigin: true, authenticated: true, expectedHeadersPresent: true, filtersClear: true, loading: false, surfaceReady: true, emptyMarkerVisible: true, rowCount: 0 });
    expect(second).toMatchObject({ kind: "screening-summary-readonly-v4", allowlistedOrigin: true, authenticated: true, expectedHeadersPresent: true, filtersClear: true, loading: false, surfaceReady: true, emptyMarkerVisible: true, rowCount: 0 });
    expect(second.evidenceId).not.toBe(first.evidenceId);
    expect(driver.snapshot().pageSaveDiagnostics.filter((item) => (item as { kind?: string }).kind === "screening-summary-readonly-v4")).toHaveLength(2);

  }, 120_000);

  it.runIf(process.platform === "darwin")("sincronizza lo stato React senza inventare Rsupp prima del Salva", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-screening-react-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = screeningDraftPackage("case-screening-react");
    const screeningSelectValues: Record<string, string> = { "id-tipo": "127", "id-inst": "192", "id-esp": "132", "id-calc": "193", "id-mat": "141", "id-mec": "143" };
    for (const field of draft.workflow.screeningSteps[0].fields) if (screeningSelectValues[field.portalId]) field.selectValue = screeningSelectValues[field.portalId];
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    const target = (await runtime.targets()).find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl)!;
    const client = await runtime.pageClient(target);
    await client.navigate(`${origin}/pratica/ecobonus/2026/schermature/${created.draftId}`);
    await new Promise((resolve) => setTimeout(resolve, 3_750));
    await client.evaluate(`(()=>{document.getElementById("add-screening").click();window.__aprReactValues={};const codes={"id-tipo":"127","id-inst":"192","id-esp":"132","id-calc":"193","id-mat":"141","id-mec":"143"};for(const id of ["id-tipo","id-inst","id-sup_s","id-sup_f","id-esp","id-calc","id-gtot","id-mat","id-mec"]){const element=document.getElementById(id);if(element instanceof HTMLSelectElement){element.options[0].value=codes[id];const blank=document.createElement("option");blank.value="";blank.textContent="-";element.prepend(blank);element.value=""}const props={value:"",onChange:event=>{window.__aprReactValues[id]=event.target.value;props.value=event.target.value}};element["__reactProps$aprFixture"]=props}const rsup=document.createElement("input");rsup.id="id-rsup";rsup.disabled=true;rsup.value="";rsup["__reactProps$aprFixture"]={value:"",onChange(){}};document.getElementById("screening").appendChild(rsup);return true})()`);
    await driver.preparePage(draft, created.draftId, "screening:1");
    const reactValues = await client.evaluate<Record<string, string>>(`window.__aprReactValues`);
    expect(reactValues).toMatchObject({ "id-tipo": "127", "id-inst": "192", "id-sup_s": "10,00", "id-sup_f": "10,00", "id-esp": "132", "id-calc": "193", "id-gtot": "0,33", "id-mat": "141", "id-mec": "143" });
    expect(await client.evaluate<string>(`document.getElementById("id-rsup").value`)).toBe("");
    client.close();
    await driver.savePage(draft, created.draftId, "screening:1");
    const savedTarget = (await runtime.targets()).find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl && candidate.url.includes(created.draftId));
    if (!savedTarget) throw new Error("fixture_screening_saved_target_missing");
    const savedClient = await runtime.pageClient(savedTarget);
    expect(await savedClient.evaluate<number>(`[...document.querySelectorAll("tbody tr")].filter(row=>row.querySelectorAll("td").length>=11).length`)).toBe(1);
    savedClient.close();
  }, 60_000);

  it("completa col worker APR due checkpoint annidati generatore-impianto senza dipendere dal lifecycle Chrome", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-generator-plant-worker-")); directories.push(root);
    const driver = new PersistentSimulatedEneaPortalDriver(root);
    const execution = new PersistentAprEneaDraftExecution(root);
    execution.prepare(generatorPlantPreflight());
    const worker = new PersistentAprEneaBrowserWorker(root, execution, generatorAndPlantDraftPackage, driver, { instanceId: "apr-generator-plant-worker", processPid: 4310 });
    const completed = await worker.runUntilTerminal();
    expect(completed).toMatchObject({ status: "completed", completedCustomerKeys: ["case-generator-plant-one", "case-generator-plant-two"], forbiddenActionCount: 0, previewAttemptCount: 0, submitAttemptCount: 0, communicationAttemptCount: 0 });
    expect(execution.snapshot().items).toEqual(expect.arrayContaining([expect.objectContaining({ state: "saved", createAttemptCount: 1, saveAttemptCount: 1, completedPageIds: ["page:Generatore dell'impianto termico", "page:Impianto termico esistente"] }), expect.objectContaining({ state: "saved", createAttemptCount: 1, saveAttemptCount: 1, completedPageIds: ["page:Generatore dell'impianto termico", "page:Impianto termico esistente"] })]));
    expect(execution.snapshot().audit.filter((event) => event.type === "nested_page_staged")).toHaveLength(2);
    expect(driver.snapshot().events.filter((event) => event.action === "save_page")).toHaveLength(4);
  }, 300_000);

  it.runIf(process.platform === "darwin")("non attribuisce a un nuovo cliente una bozza già mappata e ripara l'associazione locale conflittuale", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-discovery-dedup-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const first = await driver.createDraft(draftPackage("case-owner"));
    const state = JSON.parse(readFileSync(driver.checkpointPath, "utf8"));
    state.pendingCreate = { packageFingerprint: "package-case-next", customerKey: "case-next", beforeDraftIds: [], startedAt: new Date().toISOString(), wizardSubmitAttemptCount: 0, wizardSubmitAttemptedAt: null, wizardContractFingerprint: null };
    writeFileSync(driver.checkpointPath, `${JSON.stringify(state, null, 2)}\n`);
    await runtime.openPage(first.url);
    expect(await driver.discoverExistingDraft(draftPackage("case-next"))).toBeNull();

    const conflicting = JSON.parse(readFileSync(driver.checkpointPath, "utf8"));
    conflicting.pendingCreate = null;
    conflicting.mappings.push({ packageFingerprint: "package-case-next", customerKey: "case-next", draftId: first.draftId, url: first.url, mappedAt: new Date().toISOString() });
    const sourceEvent = conflicting.events.find((event: { action: string }) => event.action === "create_draft_once");
    conflicting.events.push({ ...sourceEvent, revision: ++conflicting.revision, action: "discover_pending_draft_readonly", customerKey: "case-next" });
    writeFileSync(driver.checkpointPath, `${JSON.stringify(conflicting, null, 2)}\n`);
    expect(driver.discardConflictingDiscoveredMapping("case-next", first.draftId).evidenceId).toMatch(/^cdp-local-/);
    expect(driver.snapshot().mappings).toEqual([expect.objectContaining({ customerKey: "case-owner", draftId: first.draftId })]);
  }, 30_000);

  it.runIf(process.platform === "darwin")("riallinea in sola lettura il fingerprint locale di una bozza legacy senza creare o salvare", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-legacy-mapping-rebind-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const legacyPackage = draftPackage("case-legacy-rebind");
    const created = await driver.createDraft(legacyPackage);
    const revisedPackage = { ...legacyPackage, packageFingerprint: "package-case-legacy-rebind-revalidated", workflowFingerprint: "workflow-case-legacy-rebind-revalidated" };
    const mutationsBefore = driver.snapshot().events.filter((event) => event.action === "create_draft_once" || event.action === "save_page_once").length;

    await expect(driver.rebindLegacyMappingReadOnly(revisedPackage, created.draftId)).resolves.toMatchObject({ url: expect.stringContaining(created.draftId), evidenceId: expect.stringMatching(/^cdp-server-/) });
    expect(driver.snapshot().mappings).toEqual([expect.objectContaining({ customerKey: revisedPackage.customerKey, draftId: created.draftId, packageFingerprint: revisedPackage.packageFingerprint })]);
    await expect(driver.inspectPersistedPageValuesReadOnly(revisedPackage, created.draftId, "page:Beneficiario")).resolves.toMatchObject({ customerKey: revisedPackage.customerKey, draftId: created.draftId });
    expect(driver.snapshot().events.filter((event) => event.action === "rebind_legacy_mapping_readonly")).toHaveLength(1);
    expect(driver.snapshot().events.filter((event) => event.action === "create_draft_once" || event.action === "save_page_once")).toHaveLength(mutationsBefore);
  }, 30_000);

  it.runIf(process.platform === "darwin")("accetta impianto centralizzato disabilitato per una singola unità in edificio multi-unità", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-intervention-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = interventionDraftPackage();
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await expect(driver.preparePage(draft, created.draftId, "page:Intervento")).resolves.toMatchObject({ evidenceId: expect.stringMatching(/^cdp-server-/) });
    await driver.savePage(draft, created.draftId, "page:Intervento");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Intervento")).not.toBeNull();
  }, 30_000);

  it.runIf(process.platform === "darwin")("tratta come non applicabile anche il Sì documentato quando ENEA disabilita il controllo centralizzato", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "apr-cdp-intervention-centralized-")); directories.push(root);
    const origin = await fixtureServer();
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable, profileDirectory: path.join(root, "chrome-profile"), remoteDebuggingPort: await freeTcpPort(), headless: true, initialUrl: `${origin}/` });
    runtimes.push(runtime); await runtime.ensureRunning();
    const draft = interventionDraftPackage("case-intervention-centralized", "S");
    const driver = new CdpEneaBrowserDriver(root, runtime, { allowedOrigin: origin, dashboardUrl: `${origin}/`, createActionLabels: ["Nuova pratica", "Ecobonus", "Schermature solari"] });
    await driver.verifySession(); await driver.inspectPortalContractReadOnly();
    const created = await driver.createDraft(draft);
    await expect(driver.preparePage(draft, created.draftId, "page:Intervento")).resolves.toMatchObject({ evidenceId: expect.stringMatching(/^cdp-server-/) });
    await driver.savePage(draft, created.draftId, "page:Intervento");
    expect(await driver.verifyPageSaved(draft, created.draftId, "page:Intervento")).not.toBeNull();
  }, 30_000);
});
