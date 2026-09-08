import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PersistentAprChromeRuntime } from "../../scripts/enea-shadow-runner/cdpClient";
import { PersistentAprEneaGlobalBrowserController } from "../../scripts/enea-shadow-runner/aprEneaGlobalBrowserController";

const ORIGIN = "https://bonusfiscali.enea.it";
const draftId = String(process.env.APR_DIAGNOSTIC_DRAFT_ID ?? "").trim();
const customerKey = String(process.env.APR_DIAGNOSTIC_CUSTOMER_KEY ?? "").trim();
const stateRoot = process.argv[2];
if (!/^\d+$/.test(draftId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(customerKey)) throw new Error("readonly_probe_identity_invalid");
if (!stateRoot || !path.isAbsolute(stateRoot)) throw new Error("readonly_probe_state_root_invalid");

const apiUrl = `${ORIGIN}/api/pratica/ecobonus/2026/${draftId}`;
const mutating = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assertAllowed = (method: string, url: string) => {
  const normalized = method.toUpperCase();
  const parsed = new URL(url);
  if (!new Set(["GET", "HEAD"]).has(normalized)) throw new Error(`readonly_probe_method_rejected:${normalized}`);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password) throw new Error("readonly_probe_origin_rejected");
};

if (process.argv.includes("--self-test")) {
  assertAllowed("GET", apiUrl);
  for (const method of mutating) {
    let rejected = false;
    try { assertAllowed(method, apiUrl); } catch { rejected = true; }
    if (!rejected) throw new Error(`readonly_probe_negative_test_failed:${method}`);
  }
  process.stdout.write(`${JSON.stringify({ status: "PASS", allowed: ["GET", "HEAD"], rejected: [...mutating] })}\n`);
} else {
  const workerRoot = path.join(stateRoot, "enea-browser-worker");
  const config = JSON.parse(readFileSync(path.join(workerRoot, "config.json"), "utf8"));
  const controller = new PersistentAprEneaGlobalBrowserController({ profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort });
  const ownerId = `apr-readonly-api-${draftId}-${process.pid}`;
  const result = await controller.runExclusive({ ownerId, cohortRoot: stateRoot, purpose: "diagnostic_readonly", accessMode: "readonly", processPid: process.pid, waitTimeoutMs: 30_000 }, async (access, capability) => {
    const runtime = new PersistentAprChromeRuntime({ chromeExecutable: config.chromeExecutable, profileDirectory: config.profileDirectory, remoteDebuggingPort: config.remoteDebuggingPort, headless: false, initialUrl: config.dashboardUrl });
    runtime.setAccessGuard((mode) => mode === "mutating" ? capability.kind === "apr_enea_cdp_mutating" && capability.assertMutationAllowed() : capability.assertValid(), { ownerId: access.ownerId, fencingEpoch: access.fencingEpoch }, () => capability.renew());
    try {
      const target = await runtime.findPage((candidate) => candidate.url === `${ORIGIN}/dashboard`);
      if (!target) throw new Error("readonly_probe_dashboard_target_missing");
      const client = await runtime.pageClient(target);
      const requests: Array<{ method: string; url: string; disposition: string }> = [];
      const tasks = new Set<Promise<void>>();
      const offPaused = client.onEvent<any>("Fetch.requestPaused", (event) => {
        const task = (async () => {
          const method = String(event.request?.method ?? "").toUpperCase();
          const url = String(event.request?.url ?? "");
          try {
            assertAllowed(method, url);
            requests.push({ method, url, disposition: "continued" });
            await client.send("Fetch.continueRequest", { requestId: event.requestId });
          } catch {
            requests.push({ method, url, disposition: "blocked" });
            await client.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" });
          }
        })().finally(() => tasks.delete(task));
        tasks.add(task);
      });
      await client.send("Network.enable");
      await client.send("Fetch.enable", { patterns: [{ urlPattern: `${ORIGIN}/*`, requestStage: "Request" }] });
      const probe = async (nonce: string) => client.evaluateServerReconciliation<any>(`(()=>{const token=localStorage.getItem("auth-token");if(!token)throw new Error("auth_token_missing");return fetch(${JSON.stringify(apiUrl)}+"?apr_readonly_probe="+${JSON.stringify(nonce)},{method:"GET",cache:"no-store",redirect:"follow",headers:{Accept:"application/json",Authorization:"Bearer "+token}}).then(async response=>{const data=await response.json();const result=data&&data.result;const pratica=result&&result.pratica;return {status:response.status,finalUrl:response.url,contentType:response.headers.get("content-type")||"",topLevelKeys:data&&typeof data==="object"?Object.keys(data).sort():[],resultKeys:result&&typeof result==="object"?Object.keys(result).sort():[],practiceKeys:pratica&&typeof pratica==="object"?Object.keys(pratica).sort():[],practiceVersion:pratica?.ver??null,beneficiaryPresent:Boolean(pratica?.beneficiario),interventionPresent:Boolean(pratica?.intervento),buildingPresent:Boolean(pratica?.immobile),calculationPresent:Boolean(pratica?.calcolo),statusValue:result?.stato??result?.status??null,createdAt:result?.data_inserimento??null,modifiedAt:result?.data_modifica??null}})})()`, true);
      const probes = [await probe(`a-${Date.now()}`), await probe(`b-${Date.now()}`), await probe(`c-${Date.now()}`)];
      await Promise.all([...tasks]);
      await client.send("Fetch.disable");
      offPaused();
      const fingerprints = probes.map(({ finalUrl: _finalUrl, ...item }) => sha256(item));
      if (probes.some((item) => item.status !== 200) || new Set(fingerprints).size !== 1) throw new Error("readonly_probe_three_gets_disagree");
      if (requests.some((item) => mutating.has(item.method) && item.disposition === "continued")) throw new Error("readonly_probe_mutation_observed");
      return { version: "apr-r86-identified-technical-draft-readonly-v1", observedAt: new Date().toISOString(), customerKey, draftId, probes, fingerprints, requests, blockedRequests: requests.filter((item) => item.disposition === "blocked"), networkContract: { allowed: ["GET", "HEAD"], rejectedBeforeDispatch: [...mutating], navigationPerformed: false, formLoadedInUi: false } };
    } finally {
      runtime.closeAllPageClients();
    }
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
