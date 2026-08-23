#!/usr/bin/env node
import path from "node:path";
import { detectEneaAuthentication } from "../../src/features/enea-shadow-crm/eneaAuthenticationDetector";
import { PersistentReadinessLease, ReadinessLeaseBusyError } from "./readinessLease";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? "status";
const rootDirectory = path.resolve(option("--state-dir") ?? ".enea-shadow-runtime");
const readiness = new PersistentReadinessLease(rootDirectory);
const recoveredRootAuthentication = detectEneaAuthentication({
  originAllowed: true,
  serverDocumentLoaded: true,
  documentReady: true,
  observedPath: "/",
  connectedUserBannerVisible: false,
  logoutControlVisible: false,
  dashboardAccessVerified: false,
  loginControlVisible: true,
});

try {
  if (command === "block-document-capability-unverified") readiness.recordRealObservationBlocked(
    "chrome-readonly-readiness",
    {
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: true,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: false,
        eneaLeaseActive: true,
        persistentBrowserIdentityVerified: true,
      },
      keepalive: {
        ok: true,
        serverVerified: true,
        method: "GET",
        surface: "dashboard",
        action: "reload_existing_authenticated_dashboard",
      },
      reason: "Readiness browser reale verificata in sola lettura: identità persistente, schede uniche, origini allowlist, autenticazioni CRM/ENEA e GET innocuo della dashboard ENEA sono verdi. Manca soltanto una prova reale di lettura allegato, non acquisibile senza selezionare una pratica.",
      nextAction: "Mantenere il gate globale chiuso; autorizzare separatamente una prova read-only su un allegato già noto senza avviare o modificare la pratica, quindi ripetere il gate completo.",
    },
    option("--command-id") ?? `real-readiness-documents-blocked:${crypto.randomUUID()}`,
  );
  else if (command === "record-attachment-capability-verified") readiness.recordRealObservationBlocked(
    "chrome-readonly-readiness",
    {
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: true,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: true,
        // La prova allegato non rinnova la lease ENEA: a distanza di tempo dal
        // precedente GET innocuo il gate deve restare fail-closed.
        eneaLeaseActive: false,
        persistentBrowserIdentityVerified: true,
      },
      keepalive: {
        ok: false,
        serverVerified: false,
        method: "GET",
        surface: "dashboard",
        action: "no_keepalive_performed_during_attachment_gate",
      },
      reason: "Capability allegati reale verificata in sola lettura su un unico PDF originario, con provenienza storage e segregazione per pratica confermate. La lease ENEA precedente non viene riutilizzata né rinnovata da questa prova; il gate globale resta chiuso.",
      nextAction: "Prima di una futura autorizzazione esplicita della coda, riacquisire una lease ENEA read-only fresca e ripetere il gate completo; non avviare preflight o pratiche.",
    },
    option("--command-id") ?? `real-readiness-attachment-verified:${crypto.randomUUID()}`,
  );
  else if (command === "block-enea-renew-proof-unavailable") readiness.recordRealObservationBlocked(
    "chrome-readonly-readiness",
    {
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: true,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: true,
        eneaLeaseActive: false,
        persistentBrowserIdentityVerified: true,
      },
      keepalive: {
        ok: false,
        serverVerified: false,
        method: "GET",
        surface: "dashboard",
        action: "reload_existing_authenticated_dashboard",
        reason: "Il singolo renew GET è stato emesso, ma il controller ha perso il frame durante il completamento e non ha prodotto una prova server verificabile; il renew non viene ripetuto.",
      },
      reason: "Renew ENEA read-only tentato una sola volta sulla dashboard autenticata: il controller è scaduto durante il riaggancio al frame e la prova server non è verificabile. La lease resta inattiva e il blocco globale rimane fail-closed.",
      nextAction: "Ripristinare la connessione stabile del controller Chrome e autorizzare un nuovo gate separato con un solo renew GET/HEAD; non selezionare pratiche e non avviare la coda.",
    },
    option("--command-id") ?? `real-readiness-renew-proof-unavailable:${crypto.randomUUID()}`,
  );
  else if (command === "block-enea-renew-public-root" || command === "record-enea-auth-dom-evidence") readiness.recordRealObservationBlocked(
    "chrome-readonly-readiness",
    {
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: recoveredRootAuthentication.authenticated,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: true,
        eneaLeaseActive: false,
        persistentBrowserIdentityVerified: true,
      },
      keepalive: {
        ok: false,
        serverVerified: false,
        method: "GET",
        surface: "dashboard",
        action: "inspect_already_loaded_renew_result",
        reason: "Il singolo riaggancio read-only ha recuperato il frame già caricato sulla root pubblica ENEA, non sulla dashboard autenticata; nessuna nuova richiesta è stata emessa.",
      },
      reason: "Classificazione ENEA corretta su evidenza DOM/server, non sul percorso: documento server completo e origine allowlist, controlli espliciti 'Area riservata' e 'Accedi', nessun banner utente/logout e nessuna dashboard verificata. Detector: explicit_login_dom_evidence; blocco globale attivo.",
      nextAction: "Configurazione minima necessaria: mantenere la stessa scheda nel profilo Chrome Default/Giuliano e ottenere una prova DOM positiva di utente connesso oppure una dashboard server accessibile prima di qualsiasi lease; non aprire altre schede e non avviare pratiche o coda.",
    },
    option("--command-id") ?? `real-readiness-renew-public-root:${crypto.randomUUID()}`,
  );
  else if (command === "record-enea-authenticated-lease-verified") readiness.recordRealObservationVerifiedBeforeQueue(
    "chrome-readonly-readiness",
    {
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: true,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: true,
        eneaLeaseActive: true,
        persistentBrowserIdentityVerified: true,
      },
      keepalive: {
        ok: true,
        serverVerified: true,
        method: "GET",
        surface: "allowed_navigation",
        action: "reload_existing_authenticated_root",
      },
      reason: "Readiness browser reale completamente verde: il singolo keepalive GET ha restituito un documento server completo con controlli utente, uscita e dashboard; autenticazione e lease ENEA sono verificate. Il gate coda resta intenzionalmente chiuso.",
      nextAction: "Fermarsi prima della selezione pratica; richiedere un'autorizzazione separata ed esplicita prima di qualsiasi preflight o avvio coda.",
    },
    option("--command-id") ?? `real-readiness-authenticated-lease-verified:${crypto.randomUUID()}`,
  );
  else if (command === "record-authenticated-keepalive") readiness.recordAuthenticatedKeepalive(
    "chrome-readonly-keepalive",
    {
      authenticated: true,
      ok: true,
      serverVerified: true,
      method: "GET",
      surface: "dashboard",
      action: "read_existing_authenticated_dashboard",
      hasBody: false,
      mutativeIntent: false,
      readiness: {
        authorizedChromeVisible: true,
        crmDedicatedSessionVisible: true,
        crmAuthenticated: true,
        crmReadOnlyPageReachable: true,
        eneaSessionVisible: true,
        eneaAuthenticated: true,
        crmOriginAllowlisted: true,
        attachmentReadCapabilityVerified: true,
        eneaLeaseActive: true,
        persistentBrowserIdentityVerified: true,
      },
    },
    option("--command-id") ?? `authenticated-keepalive:${crypto.randomUUID()}`,
    option("--observed-at") ? new Date(option("--observed-at")!) : new Date(),
  );
  else if (command === "record-login-required") {
    const evidenceId = option("--evidence-id");
    if (!evidenceId?.trim()) throw new Error("record-login-required richiede --evidence-id da una prova server reale di logout.");
    readiness.recordAuthenticatedKeepalive(
    "chrome-readonly-keepalive",
    {
      authenticated: false,
      ok: false,
      serverVerified: true,
      method: "GET",
      surface: "dashboard",
      action: "inspect_existing_dashboard_authentication",
      reason: "Logout ENEA provato da risposta server esplicita: login_required globale.",
      logoutEvidence: {
        source: "enea_server_response",
        evidenceId,
      },
    },
    option("--command-id") ?? `login-required:${crypto.randomUUID()}`,
    option("--observed-at") ? new Date(option("--observed-at")!) : new Date(),
    );
  }
  else if (command === "repair-spurious-timeout-login-required") readiness.repairSpuriousTimeoutLoginRequired(
    option("--command-id") ?? "repair:spurious-timeout-login-required:v14",
    option("--observed-at") ? new Date(option("--observed-at")!) : new Date(),
  );
  else if (command !== "status") throw new Error("Comando readiness non valido. Usare: block-document-capability-unverified, record-attachment-capability-verified, block-enea-renew-proof-unavailable, record-enea-auth-dom-evidence, record-enea-authenticated-lease-verified, record-authenticated-keepalive, record-login-required, repair-spurious-timeout-login-required oppure status.");
  process.stdout.write(`${JSON.stringify(readiness.snapshot(), null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${error instanceof ReadinessLeaseBusyError ? "READINESS_BUSY" : "READINESS_ERROR"}: ${message}\n`);
  process.exitCode = 1;
}
