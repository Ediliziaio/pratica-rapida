import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PersistentAprCrmReadOnlyAdapter } from "./crmReadOnlyAdapter";
import { PersistentReadinessLease } from "./readinessLease";
import { PersistentReadOnlyAdapter } from "./readOnlyAdapter";
import { PersistentLocalDossierBatch } from "./localDossierBatch";
import { PersistentRuleMatrixEvidence } from "./ruleMatrixEvidence";
import { PersistentAprPilotSample } from "./pilotSample";

export function inspectAprLocalRuntime(rootDirectory: string, now = new Date()) {
  const root = path.resolve(rootDirectory); const journal = path.join(root, "HEAD"); const dashboard = path.join(root, "dashboard", "index.html");
  const crm = new PersistentAprCrmReadOnlyAdapter(root).snapshot(now); const readiness = new PersistentReadinessLease(root).snapshot(now);
  const genericAdapter = new PersistentReadOnlyAdapter(root).snapshot(now); const batch = new PersistentLocalDossierBatch(root).report();
  const rules = new PersistentRuleMatrixEvidence(root).snapshot(); let dashboardHtml = "";
  const pilot = new PersistentAprPilotSample(root).snapshot(now);
  try { dashboardHtml = readFileSync(dashboard, "utf8"); } catch { /* check rosso */ }
  const checks = [
    { id: "state_directory", ok: existsSync(root) && statSync(root).isDirectory(), detail: root },
    { id: "journal", ok: existsSync(journal), detail: journal },
    { id: "dashboard_static", ok: dashboardHtml.includes("Automazione PraticaRapida") && dashboardHtml.includes("Adapter CRM read-only"), detail: dashboard },
    { id: "crm_config_local", ok: crm.status === "fixture_verified" && crm.integration === "contract_only_not_real", detail: `${crm.status}; ${crm.integration}` },
    { id: "crm_capabilities", ok: crm.evidenceCount === 5, detail: `${crm.evidenceCount}/5 prove fixture` },
    { id: "crm_gate_closed", ok: crm.operationalGate === "blocked_adapters_unverified" && !crm.queueMayRun && !crm.externalActionAllowed, detail: crm.operationalGate },
    { id: "global_readiness_closed", ok: !readiness.queueMayRun, detail: `${readiness.status}; ${readiness.leaseState}` },
    { id: "generic_adapter_closed", ok: !genericAdapter.queueMayRun, detail: `${genericAdapter.status}; ${genericAdapter.operationalGate}` },
    { id: "batch_external_actions_closed", ok: !batch || batch.externalActionAllowed === false, detail: batch ? batch.externalGate : "batch assente" },
    { id: "pilot_fail_closed", ok: pilot.externalActionAllowed === false && pilot.selected.length <= pilot.sampleSize, detail: `${pilot.status}; ${pilot.selected.length}/${pilot.sampleSize}` },
  ];
  const dashboardCheckIds = new Set(["state_directory", "journal", "dashboard_static"]);
  const readyForDashboard = checks.filter((check) => dashboardCheckIds.has(check.id)).every((check) => check.ok);
  return { name: "APR — Automazione PraticaRapida", module: "ENEA", mode: "local_only", observedAt: now.toISOString(), stateDirectory: root,
    dashboardFile: dashboard, expectedUrl: "http://127.0.0.1:4317", readyForDashboard, readyForLocalDashboard: checks.every((check) => check.ok),
    realIntegrationAvailable: false, externalActionAllowed: false, operationalGate: "blocked_adapters_unverified", checks,
    ruleMatrix: { activeCount: rules.activeCount, totalCount: rules.totalCount, registryVersion: rules.registryVersion },
    nextAction: checks.every((check) => check.ok) ? "Avviare soltanto il dashboard locale APR; nessuna integrazione reale è autorizzata."
      : "Eseguire `npm run apr:enea -- init --root <directory>` e ripetere doctor." };
}
