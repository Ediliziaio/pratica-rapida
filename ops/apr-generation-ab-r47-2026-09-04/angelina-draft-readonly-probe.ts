import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprChromeRuntime } from "../../scripts/enea-shadow-runner/cdpClient";
import { PersistentAprEneaGlobalBrowserController } from "../../scripts/enea-shadow-runner/aprEneaGlobalBrowserController";

const ORIGIN = "https://bonusfiscali.enea.it";
const DRAFT_ID = String(process.env.APR_READONLY_DRAFT_ID ?? "462287").trim();
const CUSTOMER_KEY = String(process.env.APR_READONLY_CUSTOMER_KEY ?? "angelina-stricelli").trim();
if (!/^\d+$/.test(DRAFT_ID)) throw new Error("apr_readonly_probe_draft_id_invalid");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(CUSTOMER_KEY)) throw new Error("apr_readonly_probe_customer_key_invalid");
const DRAFT_URL = `${ORIGIN}/pratica/ecobonus/2026/beneficiario/${DRAFT_ID}`;
const DASHBOARD_URL = `${ORIGIN}/dashboard`;
const DRAFT_API_URL = `${ORIGIN}/api/pratica/ecobonus/2026/${DRAFT_ID}`;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertReadOnlyHttpRequest(method: string, url: string) {
  const normalizedMethod = method.toUpperCase();
  const parsed = new URL(url);
  if (!new Set(["GET", "HEAD"]).has(normalizedMethod)) throw new Error(`apr_readonly_probe_method_rejected:${normalizedMethod}`);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password) throw new Error("apr_readonly_probe_origin_rejected");
  return { method: normalizedMethod, url: parsed.toString() };
}

export function assertProbeResult(result: any) {
  if (!Array.isArray(result?.requests) || result.requests.some((request: any) => MUTATING_METHODS.has(String(request.method).toUpperCase()))) {
    throw new Error("apr_readonly_probe_mutating_request_observed");
  }
  if (result.blockedRequests?.length) throw new Error("apr_readonly_probe_background_mutation_attempted");
  if (result.probes?.length !== 3) throw new Error("apr_readonly_probe_three_sources_missing");
  const [first, second, third] = result.probes;
  for (const probe of [first, second, third]) {
    if (probe.status !== 200 || new URL(probe.finalUrl).origin !== ORIGIN) throw new Error("apr_readonly_probe_auth_or_response_invalid");
  }
  if (result.mode === "api" && [first, second, third].some((probe) => probe.kind !== "draft_api_get")) {
    throw new Error("apr_readonly_probe_source_kind_invalid");
  }
  if (result.mode === "api" && new Set([first.payloadFingerprint, second.payloadFingerprint, third.payloadFingerprint]).size !== 1) {
    throw new Error("apr_readonly_probe_repeat_get_disagrees");
  }
  if (result.mode !== "api") {
    if (first.kind !== "draft_html_get" || second.kind !== "draft_html_get" || third.kind !== "dashboard_html_get") throw new Error("apr_readonly_probe_source_kind_invalid");
    if (first.fieldsFingerprint !== second.fieldsFingerprint) throw new Error("apr_readonly_probe_repeat_get_disagrees");
    if (third.htmlLength < 100 || !/text\/html/i.test(third.contentType)) throw new Error("apr_readonly_probe_dashboard_response_invalid");
  }
  return result;
}

function sha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function selfTest() {
  assertReadOnlyHttpRequest("GET", DRAFT_URL);
  assertReadOnlyHttpRequest("HEAD", DASHBOARD_URL);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    let rejected = false;
    try { assertReadOnlyHttpRequest(method, DRAFT_URL); } catch { rejected = true; }
    if (!rejected) throw new Error(`apr_readonly_probe_negative_test_failed:${method}`);
  }
  let foreignRejected = false;
  try { assertReadOnlyHttpRequest("GET", "https://example.invalid/"); } catch { foreignRejected = true; }
  if (!foreignRejected) throw new Error("apr_readonly_probe_foreign_origin_negative_test_failed");
  process.stdout.write(`${JSON.stringify({ status: "PASS", positive: ["GET", "HEAD"], negative: ["POST", "PUT", "PATCH", "DELETE", "foreign_origin"] })}\n`);
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const stateRoot = process.argv[2];
  if (!stateRoot || !path.isAbsolute(stateRoot)) throw new Error("Uso: <state-root-assoluto> oppure --self-test");
  const workerRoot = path.join(stateRoot, "enea-browser-worker");
  const config = JSON.parse(readFileSync(path.join(workerRoot, "config.json"), "utf8"));
  const driverState = JSON.parse(readFileSync(path.join(workerRoot, "cdp-driver.json"), "utf8"));
  const latestDiagnostic = [...(driverState.pageDiagnostics ?? [])].reverse().find((item: any) =>
    item.customerKey === CUSTOMER_KEY && item.draftId === DRAFT_ID && item.pageId === "page:Anagrafica Beneficiario");
  if (!latestDiagnostic?.fields?.length) throw new Error("apr_readonly_probe_expected_fields_missing");
  const expectedFields = latestDiagnostic.fields.map((field: any) => ({ portalId: field.portalId, control: field.control, expected: field.expected }));
  const controller = new PersistentAprEneaGlobalBrowserController({ profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort });
  const ownerId = `apr-readonly-draft-${DRAFT_ID}-${process.pid}`;
  const result = await controller.runExclusive({ ownerId, cohortRoot: stateRoot, purpose: "diagnostic_readonly", accessMode: "readonly", processPid: process.pid, waitTimeoutMs: 30_000 }, async (access, capability) => {
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
    runtime.setAccessGuard((mode) => mode === "mutating" ? capability.kind === "apr_enea_cdp_mutating" && capability.assertMutationAllowed() : capability.assertValid(), { ownerId: access.ownerId, fencingEpoch: access.fencingEpoch }, () => capability.renew());
    try {
      const target = await runtime.findPage((candidate) => candidate.url === DASHBOARD_URL);
      if (!target) throw new Error("apr_readonly_probe_dashboard_target_missing");
      const client = await runtime.pageClient(target);
      const requests: Array<{ method: string; url: string; disposition: "continued" | "blocked" }> = [];
      const pausedTasks = new Set<Promise<void>>();
      const offPaused = client.onEvent<any>("Fetch.requestPaused", (event) => {
        const task = (async () => {
          const method = String(event.request?.method ?? "").toUpperCase();
          const url = String(event.request?.url ?? "");
          try {
            assertReadOnlyHttpRequest(method, url);
            requests.push({ method, url, disposition: "continued" });
            await client.send("Fetch.continueRequest", { requestId: event.requestId });
          } catch {
            requests.push({ method, url, disposition: "blocked" });
            await client.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" });
          }
        })().finally(() => pausedTasks.delete(task));
        pausedTasks.add(task);
      });
      await client.send("Network.enable");
      await client.send("Fetch.enable", { patterns: [{ urlPattern: `${ORIGIN}/*`, requestStage: "Request" }] });
      const fetchProbe = async (kind: "draft_html_get" | "dashboard_html_get", baseUrl: string, nonce: string) => {
        assertReadOnlyHttpRequest("GET", baseUrl);
        const expression = `(()=>fetch(${JSON.stringify(`${baseUrl}?apr_readonly_probe=${nonce}`)},{method:"GET",credentials:"same-origin",cache:"no-store",redirect:"follow",headers:{Accept:"text/html"}}).then(async response=>{const html=await response.text();const doc=new DOMParser().parseFromString(html,"text/html");const ids=${JSON.stringify(expectedFields.map((field: any) => field.portalId))};const fields=ids.map(portalId=>{const element=doc.getElementById(portalId);if(!element)return {portalId,tag:"missing",value:"<missing>",selectedText:""};const tag=element.tagName.toLowerCase();const value=String(element.getAttribute("value")??element.value??"");const selected=tag==="select"?element.querySelector("option[selected]")||element.options?.[element.selectedIndex]:null;return {portalId,tag,value,selectedText:String(selected?.textContent??"").trim()}});const forms=[...doc.forms].map(form=>({method:String(form.method||"get").toUpperCase(),action:String(form.action||"")}));const scripts=[...doc.scripts].map(script=>script.src||"").filter(Boolean);const links=[...doc.querySelectorAll('link[href]')].map(link=>String(link.href||link.getAttribute("href")||"")).filter(Boolean);const bodyText=String(doc.body?.innerText||doc.body?.textContent||"").replace(/\\s+/g," ").trim();return {kind:${JSON.stringify(kind)},requestedUrl:${JSON.stringify(baseUrl)},status:response.status,finalUrl:response.url,contentType:response.headers.get("content-type")||"",htmlSha256:null,htmlLength:html.length,fields,forms,scripts,links,draftReferencePresent:bodyText.includes(${JSON.stringify(DRAFT_ID)})||html.includes(${JSON.stringify(DRAFT_ID)}),bodyExcerpt:bodyText.slice(0,500)}}))()`;
        const probe = await client.evaluateServerReconciliation<any>(expression, true);
        probe.htmlSha256 = "browser-private-not-exported";
        probe.fieldsFingerprint = sha256(probe.fields);
        return probe;
      };
      const apiMode = process.argv.includes("--api");
      const fetchApiProbe = async (nonce: string) => {
        assertReadOnlyHttpRequest("GET", DRAFT_API_URL);
        const expression = `(()=>{const token=localStorage.getItem("auth-token");if(!token)throw new Error("auth_token_missing");return fetch(${JSON.stringify(`${DRAFT_API_URL}?apr_readonly_probe=${nonce}`)},{method:"GET",cache:"no-store",redirect:"follow",headers:{Accept:"application/json",Authorization:"Bearer "+token}}).then(async response=>{const data=await response.json();const result=data&&data.result;const pratica=result&&result.pratica;const beneficiary=pratica&&pratica.beneficiario;const info=result&&typeof result==="object"?Object.fromEntries(Object.entries(result).filter(([key])=>key!=="pratica")):null;return {kind:"draft_api_get",requestedUrl:${JSON.stringify(DRAFT_API_URL)},status:response.status,finalUrl:response.url,contentType:response.headers.get("content-type")||"",topLevelKeys:data&&typeof data==="object"?Object.keys(data).sort():[],resultKeys:result&&typeof result==="object"?Object.keys(result).sort():[],practiceKeys:pratica&&typeof pratica==="object"?Object.keys(pratica).sort():[],beneficiary,info}})})()`;
        const probe = await client.evaluateServerReconciliation<any>(expression, true);
        probe.payloadFingerprint = sha256({ beneficiary: probe.beneficiary, info: probe.info, practiceKeys: probe.practiceKeys });
        return probe;
      };
      const probes = apiMode ? [
        await fetchApiProbe(`a-${Date.now()}`),
        await fetchApiProbe(`b-${Date.now()}`),
        await fetchApiProbe(`c-${Date.now()}`),
      ] : [
        await fetchProbe("draft_html_get", DRAFT_URL, `a-${Date.now()}`),
        await fetchProbe("draft_html_get", DRAFT_URL, `b-${Date.now()}`),
        await fetchProbe("dashboard_html_get", DASHBOARD_URL, `c-${Date.now()}`),
      ];
      await Promise.all([...pausedTasks]);
      await client.send("Fetch.disable");
      offPaused();
      const blockedRequests = requests.filter((request) => request.disposition === "blocked");
      return assertProbeResult({
        version: "apr-enea-draft-readonly-probe-v1",
        mode: apiMode ? "api" : "html_shell",
        observedAt: new Date().toISOString(),
        customerKey: CUSTOMER_KEY,
        draftId: DRAFT_ID,
        sourceDiagnosticEvidenceId: latestDiagnostic.evidenceId,
        expectedFields,
        probes,
        requests,
        blockedRequests,
        networkContract: {
          allowedMethods: ["GET", "HEAD"],
          mutatingMethodsBlockedBeforeDispatch: ["POST", "PUT", "PATCH", "DELETE"],
          domEventsEmitted: [],
          navigationPerformed: false,
          tabCreated: false,
          draftFormLoadedInUi: false,
        },
      });
    } finally {
      runtime.closeAllPageClients();
    }
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();
