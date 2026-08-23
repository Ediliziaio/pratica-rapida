export const ENEA_AUTOMATION_RUNBOOK_VERSION = "enea-cdp-zero-touch-v1";

export const ENEA_AUTOCOMPLETE_SELECTION_PROCEDURE = Object.freeze({
  version: "enea-autocomplete-selection-v1",
  steps: ["focus", "fill-prefix", "wait-menu", "inspect-visible-dom", "click-exact-menuitem", "verify-disabled-selected-value"],
  rule: "Non salvare finché il widget non mostra Comune + provincia e rende il campo disabilitato dopo la selezione.",
});

export interface EneaAutomationPreflight {
  cdpLoopbackUrl: string;
  datasetComplete: boolean;
  mappingComplete: boolean;
  calculationComplete: boolean;
  dialogSubscriptionInstalled: boolean;
  serverStatus: "draft" | "submitted" | "unknown";
  cpid: string | null;
}

export type EneaAutomationGate =
  | { allowed: true; runbookVersion: string }
  | { allowed: false; reasons: readonly string[] };

export type EneaSubmitAutomationState =
  | "available"
  | "automation_submit_unavailable"
  | "submit_uncertain"
  | "submitted";

export interface EneaSubmitRecoveryInput {
  automationState: EneaSubmitAutomationState;
  serverStatus: "draft" | "submitted" | "unknown";
  cpid: string | null;
  nativeConfirmationVerified: boolean;
}

export function submitRecoveryDecision(input: EneaSubmitRecoveryInput) {
  if (input.serverStatus === "submitted" && input.cpid?.trim()) return "complete" as const;
  if (input.serverStatus !== "draft" || input.cpid) return "server-verification-required" as const;
  if (input.automationState === "automation_submit_unavailable" || !input.nativeConfirmationVerified) {
    return "keep-draft-no-user-action" as const;
  }
  if (input.automationState === "available") return "single-submit-allowed" as const;
  return "no-retry" as const;
}

export const ENEA_SUBMIT_AUTOMATION_UNAVAILABLE = Object.freeze({
  status: "automation_submit_unavailable" as const,
  reason: "Il canale Chrome autorizzato espone il dialogo JavaScript ma blocca le primitive UI della scheda; l'accessibilità macOS non espone il dialogo della fixture come finestra azionabile in modo affidabile.",
  recovery: "Conservare la pratica in bozza, verificare sempre stato server e CPID, e riabilitare il submit solo dopo una fixture locale con click singolo, conferma nativa e risultato server osservabile.",
  requiresUserAction: false,
});

export function validateEneaAutomationPreflight(input: EneaAutomationPreflight): EneaAutomationGate {
  const reasons: string[] = [];
  let url: URL | null = null;
  try { url = new URL(input.cdpLoopbackUrl); } catch { reasons.push("cdp-url-non-valido"); }
  if (url && !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) reasons.push("cdp-non-loopback");
  if (!input.datasetComplete) reasons.push("dataset-incompleto-prima-spid");
  if (!input.mappingComplete) reasons.push("mapping-incompleto-prima-spid");
  if (!input.calculationComplete) reasons.push("calcolo-incompleto-prima-spid");
  if (!input.dialogSubscriptionInstalled) reasons.push("dialog-listener-non-installato");
  if (input.serverStatus !== "draft" || input.cpid) reasons.push("precondizione-server-non-bozza");
  return reasons.length
    ? { allowed: false, reasons: Object.freeze(reasons) }
    : { allowed: true, runbookVersion: ENEA_AUTOMATION_RUNBOOK_VERSION };
}

export interface EneaAutomationPhaseTiming {
  phase: "preflight" | "spid_wait" | "create_fill" | "preview" | "submit" | "server_verify";
  startedAtMs: number;
  endedAtMs: number;
}

export function summarizeEneaAutomationTimings(phases: readonly EneaAutomationPhaseTiming[]) {
  if (phases.some((phase) => phase.endedAtMs < phase.startedAtMs)) throw new Error("Timing ENEA non valido");
  const rows = phases.map((phase) => Object.freeze({ ...phase, durationMs: phase.endedAtMs - phase.startedAtMs }));
  return Object.freeze({
    runbookVersion: ENEA_AUTOMATION_RUNBOOK_VERSION,
    phases: Object.freeze(rows),
    totalMs: rows.reduce((sum, phase) => sum + phase.durationMs, 0),
  });
}

export function retryDecision(input: { serverStatus: "draft" | "submitted" | "unknown"; cpid: string | null; submitAttempts: number }) {
  if (input.serverStatus === "submitted" && input.cpid?.trim()) return "complete" as const;
  if (input.serverStatus === "draft" && !input.cpid && input.submitAttempts === 0) return "single-submit-allowed" as const;
  return "no-retry-operator-review" as const;
}

export const PATRIZIA_SUBMIT_UNCERTAIN_AUDIT = Object.freeze({
  practiceId: "audit-patrizia-vaccani",
  status: "submit_uncertain",
  serverStatus: "draft",
  cpid: null,
  submitAttempts: 1,
  reason: "Dashboard ENEA verificata dopo il singolo submit: In bozza e CPID vuoto. Nessun retry consentito finché la procedura atomica non è verificata.",
  nextAction: "Riprendere la stessa bozza solo con listener dialog preventivo e prova atomica validata; verificare nuovamente il server prima dell'azione.",
});

export const ENEA_ZERO_TOUCH_SEQUENCE = Object.freeze([
  "Completare dataset, mapping e calcolo prima dello SPID.",
  "Avviare Chrome dedicato con profilo temporaneo e CDP su loopback; rifiutare sessioni non-CDP.",
  "Dopo SPID, collegare Playwright alla stessa pagina e installare page.on('dialog') prima del click.",
  "Creare/compilare, aprire e chiudere anteprima, eseguire un solo click e attendere la risposta server.",
  "Non ritentare su esito incerto; verificare dashboard e considerare successo solo Inviata + CPID.",
]);

export const ENEA_SESSION_LEASE_RULES = Object.freeze([
  "Prima della coda rilevare e riusare la sessione ENEA autenticata esistente; non sostituirla silenziosamente.",
  "Durante la coda eseguire keepalive GET/HEAD innocui ogni 4 minuti su dashboard, riepilogo o navigazione consentita.",
  "Ogni keepalive e prova server è append-only; submit, salvataggi, ricevute e mutazioni sono vietati al keeper.",
  "Su logout forzato sospendere ENEA e continuare soltanto il lavoro locale; richiedere un solo login personale.",
]);
