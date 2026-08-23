import { useEffect, useRef, useState } from "react";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";
import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import {
  IMPORT_CONFIRMATION_PHRASE,
  clearImportedPractice,
  loadImportedPractice,
  prepareSinglePracticeImport,
  saveImportedPractice,
  toShadowQueuePractice,
  withVerifiedReseller,
  withVerifiedTechnicalSnapshot,
  type LocalTechnicalSnapshot,
  type CrmReadOnlySnapshot,
  type LocalImportedPractice,
} from "@/features/enea-shadow-crm/importBridge";
import {
  loadShadowCrmState,
  applyWorkCompletionDeadline,
  overrideHistoricalComparisonDeadline,
  addFixtureEmailDraft,
  addSyntheticAttachment,
  assignShadowCrm,
  clearShadowCrmState,
  EMPTY_SHADOW_CRM_STATE,
  INTERNAL_PILOT_PROCEDURE,
  internalPilotCriteria,
  prioritizeShadowCrm,
  requestOperatorIntervention,
  resolveOperatorIntervention,
  pilotSessionId,
  removeSyntheticAttachment,
  saveShadowCrmState,
  serializeShadowCrmAudit,
  serializeShadowCrmPractice,
  transitionShadowCrm,
  type ShadowCrmPracticeState,
} from "@/features/enea-shadow-crm/workflow";
import { dashboardHealth, dashboardItem, type OperationalStatus } from "@/features/enea-shadow-crm/operationsDashboard";
import { loadAuditedOperatorQueue, resumeOperationalQueue, saveAuditedOperatorQueue } from "@/features/enea-shadow-crm/auditedOperatorQueue";
import { loadSessionReadiness } from "@/features/enea-shadow-crm/sessionReadiness";
import { ENEA_OPERATIONAL_BASELINE, ENEA_OPERATIONAL_CHECKLIST, baselineGate } from "@/features/enea-shadow-crm/operationalBaseline";
import { loadEneaSessionLease, scheduleEneaKeepalive, stopOverdueEneaLease, saveEneaSessionLease } from "@/features/enea-shadow-crm/eneaSessionLease";
import { loadPersistentLabBrowser } from "@/features/enea-shadow-crm/persistentLabBrowser";
import {
  enqueueQueueExecutorCommand,
  loadQueueExecutorEvents,
  loadQueueExecutorRuntime,
  tickPersistentQueueExecutor,
  type QueueExecutorRuntime,
} from "@/features/enea-shadow-crm/persistentQueueExecutor";

const STAGE_LABELS: Record<ShadowCrmPracticeState["stage"], string> = {
  received: "Ricevuta", assigned: "Assegnata", processing: "In lavorazione", review: "In revisione", completed: "Conclusa",
};
const OPERATIONAL_LABELS: Record<OperationalStatus, string> = {
  automatic_active: "In lavorazione automatica",
  operator_required: "Richiesto intervento operatore",
  manual_work: "Da lavorare a mano",
  waiting_customer: "In attesa cliente",
  waiting_supplier: "In attesa fornitore",
  waiting_operator: "In attesa di intervento utente",
  completed: "Completata",
};

function Workspace({ practice, state, setState, importedSource, onImportedReset }: { practice: EneaLabSourcePractice; state: ShadowCrmPracticeState; setState: (state: ShadowCrmPracticeState) => void; importedSource?: LocalImportedPractice; onImportedReset?: () => void }) {
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [practiceExported, setPracticeExported] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [exceptionField, setExceptionField] = useState("");
  const [exceptionSource, setExceptionSource] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const skipNextSave = useRef(false);
  const analysis = ENEA_LAB_MOCK_ANALYSIS[practice.id];
  const syntheticDocumentsReady = state.attachments.length >= 2 && state.attachments.every((item) => item.validation === "valid");
  const checklist = [
    { label: importedSource ? "Anagrafica minimizzata disponibile" : "Anagrafica sintetica disponibile", ok: Boolean(importedSource) || practice.clienteCognome.startsWith("Demo") },
    { label: "Allegati fixture acquisiti", ok: practice.documentPaths.length > 0 || syntheticDocumentsReady },
    { label: "Analisi documentale fixture completata", ok: Boolean(analysis) || syntheticDocumentsReady },
    { label: "Dati sintetici pronti per istruttoria", ok: practice.queueStatus === "ready" || syntheticDocumentsReady },
  ];
  const pilot = internalPilotCriteria(state);
  const preflight = state.preflightRuns.at(-1);
  const sessionId = pilotSessionId(practice.id);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveShadowCrmState(window.localStorage, practice.id, state);
  }, [practice.id, state]);
  useEffect(() => {
    if (!importedSource?.workCompletedAt) return;
    const checked = applyWorkCompletionDeadline(state, importedSource.workCompletedAt);
    if (checked !== state) setState(checked);
  }, [importedSource?.workCompletedAt, setState, state]);
  const act = (action: Parameters<typeof transitionShadowCrm>[1]) => setState(transitionShadowCrm(state, action));
  const downloadJson = (payload: string | null, filename: string) => {
    if (!payload) return;
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const resetPilot = () => {
    if (!resetConfirmed || !practiceExported || !clearShadowCrmState(window.localStorage, practice.id)) return;
    if (importedSource && !clearImportedPractice(window.localStorage, practice.id)) return;
    skipNextSave.current = true;
    setState({ ...EMPTY_SHADOW_CRM_STATE, attachments: [], drafts: [], audit: [] });
    setResetConfirmed(false);
    setPracticeExported(false);
    onImportedReset?.();
  };

  return <main className="flex-1 space-y-6 p-6" data-testid="shadow-workspace">
    <header>
      <p className="text-sm font-medium text-amber-700">Demo esclusivamente locale · dati sintetici · nessun invio</p>
      <h1 className="text-2xl font-semibold">{practice.code} — {practice.clienteNome} {practice.clienteCognome}</h1>
      <p data-testid="pilot-session-id">Sessione pilot: {sessionId}</p>
      <p className="text-muted-foreground">Stato: {STAGE_LABELS[state.stage]} · Assegnatario: {state.assignee ?? "non assegnato"} · Operatore: {state.operatorStatus === "requested_operator" ? "Richiesto intervento operatore" : state.operatorStatus === "manual_work" ? "Da lavorare a mano" : "attivo"}</p>
    </header>

    <section aria-labelledby="ricezione" className="rounded-lg border p-4">
      <h2 id="ricezione" className="font-semibold">1. Ricezione e allegati</h2>
      <p>{practice.reseller} · {practice.prodottoInstallato} · {importedSource?.receivedAt === null ? "data ricezione sorgente non disponibile" : `ricevuta ${new Date(practice.ricevutaAt).toLocaleString("it-IT")}`}</p>
      {practice.documentPaths.length ? <ul className="mt-2 list-disc pl-5">{practice.documentPaths.map((doc) => <li key={doc.path}>{doc.kind}: {doc.path}</li>)}</ul> : <p className="mt-2 text-amber-700">Nessun allegato fixture disponibile.</p>}
      <p className="mt-3 text-sm">Acquisizione controllata: genera soltanto metadati PDF sintetici, massimo 10 file e 200 KB dichiarati per file.</p>
      <div className="mt-2 flex gap-2"><button onClick={() => setState(addSyntheticAttachment(state, "invoice"))} className="rounded border px-3 py-2">Aggiungi fattura DEMO</button><button onClick={() => setState(addSyntheticAttachment(state, "bank-transfer"))} className="rounded border px-3 py-2">Aggiungi bonifico DEMO</button></div>
      <ul aria-label="Allegati sintetici acquisiti" className="mt-2 list-disc pl-5">{state.attachments.map((item) => <li key={item.id}>{item.name} · {item.mimeType} · {item.size} byte · {item.validation} <button onClick={() => setState(removeSyntheticAttachment(state, item.id))} className="rounded border px-2 py-1">Rimuovi {item.name}</button><ul className="list-[circle] pl-5">{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></li>)}</ul>
    </section>

    <section aria-labelledby="eccezioni" className="rounded-lg border border-amber-300 p-4">
      <h2 id="eccezioni" className="font-semibold">Eccezioni operative</h2>
      <p className="text-sm text-muted-foreground">La data di ricezione è solo metadata interno e, se assente, non crea eccezioni né blocca la lavorazione.</p>
      <div className="mt-2 grid gap-2 md:grid-cols-3"><input aria-label="Campo eccezione" value={exceptionField} onChange={(event) => setExceptionField(event.target.value)} className="rounded border p-2" placeholder="campo.enea" /><input aria-label="Fonte eccezione" value={exceptionSource} onChange={(event) => setExceptionSource(event.target.value)} className="rounded border p-2" placeholder="Fonte consultata" /><input aria-label="Motivo eccezione" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} className="rounded border p-2" placeholder="Dato mancante o conflitto" /></div>
      <button onClick={() => { const next = requestOperatorIntervention(state, { field: exceptionField, sources: [exceptionSource], reason: exceptionReason, options: ["Definire una regola e riavviare la lavorazione", "Assegnare a Da lavorare a mano con motivo"] }); if (next !== state) { setState(next); setExceptionField(""); setExceptionSource(""); setExceptionReason(""); } }} className="mt-2 rounded border px-3 py-2">Richiedi intervento operatore</button>
      {state.exceptions.map((ticket) => <article key={ticket.id} className="mt-3 rounded border p-3"><strong>{ticket.field} · {ticket.status === "requested_operator" ? "Richiesto intervento operatore" : ticket.status === "manual_work" ? "Da lavorare a mano" : "Regola definita"}</strong><p>{ticket.reason}</p><p className="text-sm">Fonti: {ticket.sources.join(", ")}</p><ul className="list-disc pl-5 text-sm">{ticket.options.map((option) => <li key={option}>{option}</li>)}</ul>{ticket.status === "requested_operator" && <div className="mt-2"><input aria-label="Motivo risoluzione eccezione" value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} className="rounded border p-2" placeholder="Regola o motivo manuale" /><button onClick={() => setState(resolveOperatorIntervention(state, ticket.id, "rule_defined", resolutionReason))} className="ml-2 rounded border px-3 py-2">Definisci regola e riparti</button><button onClick={() => setState(resolveOperatorIntervention(state, ticket.id, "manual_work", resolutionReason))} className="ml-2 rounded border px-3 py-2">Da lavorare a mano</button></div>}</article>)}
      {importedSource && state.exceptions.some((ticket) => ticket.field === "intervento.data_fine_lavori" && ticket.status === "requested_operator") && <button onClick={() => setState(overrideHistoricalComparisonDeadline(state, "Caso storico autorizzato esclusivamente per rielaborazione locale e confronto finale.", "historical_comparison"))} className="mt-2 rounded border border-amber-500 px-3 py-2">Override test storico 90 giorni</button>}
    </section>

    <section aria-labelledby="checklist" className="rounded-lg border p-4">
      <h2 id="checklist" className="font-semibold">2. Checklist di validazione</h2>
      <ul className="mt-2 space-y-1">{checklist.map((item) => <li key={item.label}>{item.ok ? "✓" : "○"} {item.label}</li>)}</ul>
      <h3 className="mt-4 font-medium">Preflight ENEA · {preflight?.version ?? "enea-preflight-v1"} · {preflight?.outcome === "ready" ? "READY" : "INTERVENTO OPERATORE"}</h3>
      {preflight ? <ol aria-label="Checklist preflight ENEA" className="mt-2 list-decimal space-y-2 pl-5">{preflight.steps.map((step) => <li key={step.step}><strong>{step.ok ? "✓" : "✗"} {step.step}</strong><p>Fonte: {step.source} · Regola: {step.ruleVersion}</p><p>Motivo: {step.reason} · Prossima azione: {step.nextAction}</p></li>)}</ol> : <p className="mt-2 text-amber-700">Nessun run completo registrato: la pratica non può avanzare verso ENEA.</p>}
    </section>

    <section aria-labelledby="istruttoria" className="rounded-lg border p-4">
      <h2 id="istruttoria" className="font-semibold">3. Istruttoria</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <label>Assegnatario <select aria-label="Assegnatario" value={state.assignee ?? ""} disabled={state.stage === "completed"} onChange={(event) => setState(assignShadowCrm(state, event.target.value as "operatore-demo-anna" | "operatore-demo-luca"))} className="rounded border p-2"><option value="" disabled>Seleziona</option><option value="operatore-demo-anna">Anna Demo</option><option value="operatore-demo-luca">Luca Demo</option></select></label>
        <label>Priorità <select aria-label="Priorità" value={state.priority} disabled={state.stage === "completed"} onChange={(event) => setState(prioritizeShadowCrm(state, event.target.value as "low" | "normal" | "high"))} className="rounded border p-2"><option value="low">Bassa</option><option value="normal">Normale</option><option value="high">Alta</option></select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={state.stage !== "assigned"} onClick={() => act("start")} className="rounded border px-3 py-2 disabled:opacity-40">Avvia lavorazione</button>
        <button disabled={state.stage !== "processing"} onClick={() => act("review")} className="rounded border px-3 py-2 disabled:opacity-40">Invia a revisione</button>
      </div>
    </section>

    <section aria-labelledby="email" className="rounded-lg border p-4">
      <h2 id="email" className="font-semibold">4. Comunicazione controllata</h2>
      <p className="text-sm text-muted-foreground">Bozza locale: non esiste alcun pulsante di invio e non viene contattato alcun provider email.</p>
      <div className="mt-2 flex gap-2"><button disabled={state.stage !== "review"} onClick={() => setState(addFixtureEmailDraft(state, "status-update", practice.code))} className="rounded border px-3 py-2 disabled:opacity-40">Crea bozza aggiornamento</button><button disabled={state.stage !== "review"} onClick={() => setState(addFixtureEmailDraft(state, "missing-documents", practice.code))} className="rounded border px-3 py-2 disabled:opacity-40">Crea bozza documenti mancanti</button></div>
      <div aria-label="Bozze email locali">{state.drafts.map((draft) => <article key={draft.id} className="mt-3 rounded border p-3"><strong>{draft.subject} · versione {draft.version}</strong><p>{draft.body}</p></article>)}</div>
    </section>

    <section aria-labelledby="esito" className="rounded-lg border p-4">
      <h2 id="esito" className="font-semibold">5. Esito e audit append-only</h2>
      <button disabled={state.stage !== "review" || !state.emailDrafted} onClick={() => act("complete")} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Concludi pratica locale</button>
      <ol className="mt-3 list-decimal pl-5" aria-label="Audit locale">{state.audit.map((event) => <li key={event.id}>{event.type} · {new Date(event.at).toLocaleString("it-IT")}</li>)}</ol>
      <div className="mt-3 flex gap-2"><button onClick={() => downloadJson(serializeShadowCrmAudit(practice.id, state), `${practice.code}-audit-locale.json`)} className="rounded border px-3 py-2">Esporta audit locale JSON</button><button onClick={() => { downloadJson(serializeShadowCrmPractice(practice.id, state, importedSource ? { ...importedSource } : undefined), `${practice.code}-pratica-locale.json`); setPracticeExported(true); }} className="rounded border px-3 py-2">Esporta pratica locale JSON</button><button onClick={() => window.print()} className="rounded border px-3 py-2">Stampa riepilogo locale</button></div>
      <h3 className="mt-4 font-medium">Readiness pilot interno: {pilot.ready ? "PRONTA" : "NON PRONTA"}</h3>
      <ul aria-label="Criteri pilot interno">{pilot.checks.map((check) => <li key={check.label}>{check.ok ? "✓" : "○"} {check.label}</li>)}</ul>
      <section aria-labelledby="procedura-pilot" className="mt-4 rounded border p-3"><h3 id="procedura-pilot" className="font-medium">Procedura operativa del pilot</h3><ol className="list-decimal pl-5">{INTERNAL_PILOT_PROCEDURE.map((step) => <li key={step.order}><strong>{step.role}:</strong> {step.action}</li>)}</ol><p className="mt-2 text-sm">Accettazione: tutti i criteri di readiness devono risultare verdi, il riepilogo deve essere esportabile e nessun servizio esterno deve essere contattato.</p></section>
      <section aria-label="Riepilogo finale stampabile" className="mt-4 rounded border p-3"><h3 className="font-medium">Riepilogo finale stampabile</h3><p>{sessionId} · {practice.code} · {STAGE_LABELS[state.stage]} · priorità {state.priority}</p><p>{state.attachments.length} allegati fixture · {state.drafts.length} bozze non inviate · {state.audit.length} eventi audit · readiness {pilot.ready ? "PRONTA" : "NON PRONTA"}</p></section>
      <div className="mt-4 rounded border border-red-300 p-3"><h3 className="font-medium">Pulizia del singolo pilot</h3><p className="text-sm">Rimuove soltanto lo stato locale di {practice.code}; le altre pratiche fixture restano invariate. Prima è obbligatorio esportare la pratica locale.</p><p aria-live="polite">Export preventivo: {practiceExported ? "completato" : "richiesto"}</p><label className="mt-2 block"><input type="checkbox" checked={resetConfirmed} onChange={(event) => setResetConfirmed(event.target.checked)} /> Confermo la pulizia locale di questa pratica</label><button disabled={!resetConfirmed || !practiceExported} onClick={resetPilot} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Resetta singolo pilot locale</button></div>
    </section>
  </main>;
}

export default function EneaShadowCrm() {
  const [sessionReadiness] = useState(() => loadSessionReadiness(window.localStorage));
  const [eneaLease, setEneaLease] = useState(() => loadEneaSessionLease(window.localStorage));
  const [persistentBrowser] = useState(() => loadPersistentLabBrowser(window.localStorage));
  const [auditedQueue] = useState(() => resumeOperationalQueue(loadAuditedOperatorQueue(window.localStorage)));
  const executorOwner = useRef(`shadow-ui-${crypto.randomUUID()}`);
  const [executor, setExecutor] = useState<QueueExecutorRuntime>(() => loadQueueExecutorRuntime(window.localStorage));
  const [importedPractice, setImportedPractice] = useState(() => loadImportedPractice(window.localStorage));
  const [importSource, setImportSource] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [singleConfirmed, setSingleConfirmed] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [blockedConfirmed, setBlockedConfirmed] = useState(false);
  const [importError, setImportError] = useState("");
  const [verifiedReseller, setVerifiedReseller] = useState("");
  const [verifiedTechnicalSnapshot, setVerifiedTechnicalSnapshot] = useState("");
  const [selectedId, setSelectedId] = useState(ENEA_LAB_MOCK_PRACTICES[0].id);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [states, setStates] = useState<Record<string, ShadowCrmPracticeState>>(() => Object.fromEntries([
    ...ENEA_LAB_MOCK_PRACTICES.map((practice) => [practice.id, loadShadowCrmState(window.localStorage, practice.id)] as const),
    ...(importedPractice ? [[importedPractice.localId, loadShadowCrmState(window.localStorage, importedPractice.localId)] as const] : []),
  ]));
  const practices = importedPractice ? [...ENEA_LAB_MOCK_PRACTICES, toShadowQueuePractice(importedPractice)] : ENEA_LAB_MOCK_PRACTICES;
  const selected = practices.find((practice) => practice.id === selectedId) ?? ENEA_LAB_MOCK_PRACTICES[0];
  const visible = practices.filter((practice) => {
    const state = states[practice.id];
    const text = `${practice.code} ${practice.clienteNome} ${practice.clienteCognome} ${practice.reseller}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (stageFilter === "all" || state.stage === stageFilter) && (assigneeFilter === "all" || (assigneeFilter === "unassigned" ? !state.assignee : state.assignee === assigneeFilter));
  });
  const summary = Object.values(states).reduce((result, state) => ({ ...result, [state.stage]: (result[state.stage] ?? 0) + 1 }), {} as Record<string, number>);
  const operations = practices.map((practice) => dashboardItem(practice, states[practice.id]));
  const health = dashboardHealth(operations);
  const updateSelected = (state: ShadowCrmPracticeState) => setStates((current) => ({ ...current, [selected.id]: state }));
  const importSnapshot = () => {
    try {
      const snapshot = JSON.parse(importSource) as CrmReadOnlySnapshot;
      const result = prepareSinglePracticeImport([snapshot], {
        confirmationPhrase: importPhrase,
        singlePracticeConfirmed: singleConfirmed,
        localOnlyConfirmed: localConfirmed,
        communicationsBlockedConfirmed: blockedConfirmed,
      });
      if (result.ok === false) {
        setImportError(result.reason);
        return;
      }
      if (!saveImportedPractice(window.localStorage, result.practice)) {
        setImportError("Salvataggio locale non riuscito.");
        return;
      }
      setImportedPractice(result.practice);
      setStates((current) => ({ ...current, [result.practice.localId]: loadShadowCrmState(window.localStorage, result.practice.localId) }));
      setImportSource("");
      setImportPhrase("");
      setImportError("");
    } catch {
      setImportError("Snapshot JSON non valido.");
    }
  };
  useEffect(() => { saveAuditedOperatorQueue(window.localStorage, auditedQueue); }, [auditedQueue]);
  useEffect(() => {
    const tick = () => {
      const lease = stopOverdueEneaLease(loadEneaSessionLease(window.localStorage));
      if (lease) saveEneaSessionLease(window.localStorage, lease);
      setEneaLease(lease);
      setExecutor(tickPersistentQueueExecutor(window.localStorage, executorOwner.current));
    };
    tick();
    const timer = window.setInterval(tick, 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const startPersistentQueue = () => {
    const requestedAt = new Date().toISOString();
    enqueueQueueExecutorCommand(window.localStorage, {
      id: `ui-start-${requestedAt}`,
      type: executor.status === "paused" ? "resume" : "start",
      requestedAt,
      requestedBy: "ui",
      scope: "local_only",
    });
    setExecutor(tickPersistentQueueExecutor(window.localStorage, executorOwner.current));
  };
  return <div className="min-h-screen bg-background text-foreground md:flex">
    <nav aria-label="Pratiche fixture" className="border-b p-4 md:w-72 md:border-b-0 md:border-r">
      <h2 className="mb-3 font-semibold">CRM ombra ENEA</h2>
      <section aria-label="Esecutore persistente coda" className="mb-4 rounded border-2 border-indigo-500 bg-indigo-50 p-3 text-sm text-slate-950">
        <h3 className="font-semibold">Esecutore persistente · enea-queue-executor-v1</h3>
        <p><b>Stato:</b> {executor.status} · revisione {executor.revision}</p>
        <p><b>Pratica corrente:</b> {executor.currentPracticeId ?? "nessuna"}</p>
        <p><b>Ultimo ciclo:</b> {executor.lastTickAt ? new Date(executor.lastTickAt).toLocaleString("it-IT") : "mai"}</p>
        <p><b>Lease:</b> {executor.ownerId ? "attiva" : "non acquisita"} · recuperabile automaticamente alla scadenza</p>
        <p><b>Collegamento cabina↔laboratorio:</b> {loadQueueExecutorEvents(window.localStorage).at(-1)?.note ?? "in attesa del primo comando"}</p>
        <button type="button" onClick={startPersistentQueue} className="mt-2 rounded border px-3 py-2">{executor.status === "paused" ? "Riprendi coda" : "Rendi attiva la coda"}</button>
        <p className="mt-1 text-muted-foreground">Comandi idempotenti, checkpoint append-only e recupero automatico della lease: un nuovo turno riparte dallo stesso punto.</p>
      </section>
      <section aria-label="Stato sessioni coda" className={`mb-4 rounded border-2 p-3 text-sm ${sessionReadiness?.outcome === "ready" ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`}>
        <h3 className="font-semibold">Session readiness · enea-session-readiness-v1</h3>
        <p><b>Stato:</b> {sessionReadiness?.outcome === "ready" ? "Pronto a lavorare la coda" : "SESSIONE NON PRONTA · coda non avviabile"}</p>
        <p><b>Ultimo check:</b> {sessionReadiness ? new Date(sessionReadiness.checkedAt).toLocaleString("it-IT") : "mai eseguito"}</p>
        {sessionReadiness && <ul className="mt-2 list-disc pl-5">{sessionReadiness.checks.map(check=><li key={check.key}>{check.ok?"✓":"✗"} {check.key}{check.reason?` — ${check.reason}`:""}</li>)}</ul>}
        <button type="button" disabled={sessionReadiness?.outcome !== "ready"} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Pronto a lavorare la coda</button>
        <p className="mt-1 text-muted-foreground">Il check viene prodotto dal comando esterno autorizzato; questa UI non apre browser né sessioni.</p>
        <h4 className="mt-3 font-medium">Lease ENEA · enea-session-lease-v1</h4>
        <p>Sessione ENEA: {eneaLease?.status === "active" ? "attiva" : "non attiva"} · Ultimo keepalive: {eneaLease?.lastKeepaliveAt ? new Date(eneaLease.lastKeepaliveAt).toLocaleString("it-IT") : "nessuno"}</p>
        <p>Pianificatore: {scheduleEneaKeepalive(eneaLease).state} · prossima azione {scheduleEneaKeepalive(eneaLease).nextAction}</p>
        <p>Uso ENEA consentito: {scheduleEneaKeepalive(eneaLease).queueMayUseEnea ? "sì" : "no — fermo globale, nessun ticket cliente"}</p>
        {eneaLease?.stopReason && <p>Stop sicuro: {eneaLease.stopReason}</p>}
        <h4 className="mt-3 font-medium">Browser laboratorio unico · enea-persistent-browser-v1</h4>
        <p>Identità persistente: {persistentBrowser ? "registrata" : "non registrata"}</p>
        <p>Motivazione: {sessionReadiness?.checks.find(check=>check.key==="persistentBrowserIdentityVerified")?.reason ?? (persistentBrowser ? "istanza coerente" : "not_registered")}</p>
        <p>Prossimo passo: {persistentBrowser ? "Verificare la stessa istanza prima della coda." : "Avviare una volta il profilo isolato stabile e registrare le sole schede CRM/ENEA."}</p>
      </section>
      <section aria-label="Cruscotto operativo" className="mb-4 rounded border border-sky-300 p-3 text-sm">
        <h3 className="font-semibold">Cruscotto operativo</h3>
        <p aria-label="Salute operativa">Avanzano ora {health.advancing} · Bloccate {health.blocked} · In attesa operatore {health.waitingOperator} · Completate {health.completed}</p>
        {Object.keys(health.reasons).length > 0 && <p>Motivi blocco: {Object.entries(health.reasons).map(([reason, count]) => `${reason} ${count}`).join(" · ")}</p>}
        <p className="mt-1 text-muted-foreground">Nessun monitor ricorrente: “attiva” richiede un evento audit esplicito.</p>
        <div className="mt-2 space-y-2">{operations.map((item) => <article key={item.practiceId} className="rounded border p-2" data-testid={`operations-${item.practiceId}`}><strong>{item.code} · {OPERATIONAL_LABELS[item.status]}</strong><p>Ultimo evento: {item.lastEvent ?? "nessuno"} · {item.lastEventRelative} · {item.lastResponsible}</p><p>{item.activeBlock ? `Blocco: ${item.activeBlock}` : "Nessun dubbio attivo"}</p><p>Prossima azione: {item.nextAction}</p><p>Regole applicate: {item.appliedRules.length ? item.appliedRules.join(", ") : "nessuna"} · Test storico: {item.historicalTest ? "sì" : "no"}</p></article>)}</div>
      </section>
      <section aria-label="Intervento operatore richiesto" className="mb-4 rounded border-2 border-amber-500 bg-amber-50 p-3 text-sm text-slate-950">
        <h3 className="font-semibold">Intervento operatore richiesto</h3>
        <p className="mb-2">Coda operativa persistente · enea-operational-queue-v1 · {auditedQueue.length} snapshot minimizzati · comunicazioni bloccate.</p>
        <div className="space-y-2">{auditedQueue.map((practice) => <article key={practice.id} data-testid={`audited-ticket-${practice.id}`} className="rounded border border-amber-300 bg-white p-2">
          <strong>{practice.code} · {practice.displayName}</strong>
          <p><b>Stato:</b> {practice.status === "economically_verified" ? "Economicamente verificato · pratica ENEA non ancora dichiarata pronta" : practice.status === "submitted_manual_exception" ? "Invio manuale eccezionale · verifica server/CPID pendente" : "Richiesto intervento operatore"}</p>
          <p><b>Checkpoint:</b> {practice.currentStep} · revisione {practice.revision} · aggiornato {new Date(practice.updatedAt).toLocaleString("it-IT")}</p>
          <p><b>Passaggi completati:</b> {practice.completedSteps.length ? practice.completedSteps.join(" → ") : "nessuno"}</p>
          <p><b>Motivazione:</b> {practice.reason}</p>
          <p><b>Blocco attivo:</b> {practice.activeBlock ?? "nessuno"}</p>
          <p><b>Classificazione documentale:</b></p>
          <ul className="list-disc pl-5">{practice.documents.map((document) => <li key={`${practice.id}-${document.reference}`}>{document.reference}: {document.classification.replace("_", " ")} — {document.note}</li>)}</ul>
          <p><b>Fonti conservate:</b> {practice.sources.length} · verificate {practice.sources.filter((source) => source.verification === "verified").length}</p>
          <p><b>Regole applicate:</b> {practice.appliedRules.length ? practice.appliedRules.join(", ") : "nessuna registrata"}</p>
          <p><b>Ultimo audit:</b> {practice.audit.at(-1)?.note ?? "nessuno"}</p>
          <p><b>Prossima azione:</b> {practice.nextAction}</p>
        </article>)}</div>
      </section>
      <section aria-label="Baseline operativa ENEA" className="mb-4 rounded border-2 border-slate-500 p-3 text-sm">
        <h3 className="font-semibold">Baseline regressione · enea-operational-baseline-v1</h3>
        <p><b>Gate nuovi run:</b> {baselineGate().allowed ? "VERDE" : "BLOCCATO"}</p>
        <ol className="mb-3 list-decimal pl-5">{ENEA_OPERATIONAL_CHECKLIST.map(item=><li key={item.step}><b>{item.step}</b> — {item.rule}</li>)}</ol>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Caso</th><th>Atteso</th><th>Stato</th><th>Motivo</th></tr></thead><tbody>{ENEA_OPERATIONAL_BASELINE.map(item=><tr key={item.id}><td>{item.label}</td><td>{item.expected}</td><td>{item.status}</td><td>{item.reason}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-label="Ponte importazione read-only" className="mb-4 rounded border border-amber-300 p-3 text-sm">
        <h3 className="font-semibold">Ponte CRM reale</h3>
        <p>Disconnesso dal CRM: nessun record selezionato. L’import richiede una sola pratica, consenso esplicito e snapshot read-only minimizzato.</p>
        <p className="mt-1">Email, WhatsApp, scritture CRM/ENEA e upload: <strong>bloccati</strong>.</p>
        {!importedPractice && <div className="mt-2 space-y-2">
          <textarea aria-label="Snapshot CRM read-only" value={importSource} onChange={(event) => setImportSource(event.target.value)} className="w-full rounded border p-2" placeholder="Snapshot JSON autorizzato" />
          <input aria-label="Frase di conferma importazione" value={importPhrase} onChange={(event) => setImportPhrase(event.target.value)} className="w-full rounded border p-2" placeholder={IMPORT_CONFIRMATION_PHRASE} />
          <label className="block"><input type="checkbox" checked={singleConfirmed} onChange={(event) => setSingleConfirmed(event.target.checked)} /> Confermo una sola pratica</label>
          <label className="block"><input type="checkbox" checked={localConfirmed} onChange={(event) => setLocalConfirmed(event.target.checked)} /> Confermo persistenza solo locale</label>
          <label className="block"><input type="checkbox" checked={blockedConfirmed} onChange={(event) => setBlockedConfirmed(event.target.checked)} /> Confermo comunicazioni bloccate</label>
          <button type="button" onClick={importSnapshot} className="rounded border px-3 py-2">Carica snapshot locale</button>
          {importError && <p role="alert">{importError}</p>}
        </div>}
        {importedPractice && <div className="mt-2" data-testid="masked-import"><strong>{importedPractice.code}</strong><p>{importedPractice.customerLabel} · {importedPractice.maskedEmail ?? "email omessa"} · {importedPractice.maskedPhone ?? "telefono omesso"}</p><p>Rivenditore: {importedPractice.resellerIdentifier ?? "non verificato"}</p>{!importedPractice.resellerIdentifier && <div className="mt-2"><input aria-label="Identificatore rivenditore verificato" value={verifiedReseller} onChange={(event) => setVerifiedReseller(event.target.value)} className="w-full rounded border p-2" placeholder="identificatore-minimizzato" /><button type="button" className="mt-2 rounded border px-3 py-2" onClick={() => { const next = withVerifiedReseller(importedPractice, verifiedReseller); if (!next || !saveImportedPractice(window.localStorage, next)) { setImportError("Identificatore rivenditore non valido."); return; } setImportedPractice(next); setVerifiedReseller(""); setImportError(""); }}>Registra rivenditore verificato</button></div>}<p>Snapshot tecnico: {importedPractice.technicalSnapshot ? "verificato e minimizzato" : "non disponibile"}</p>{!importedPractice.technicalSnapshot && <div className="mt-2"><textarea aria-label="Snapshot tecnico minimizzato" value={verifiedTechnicalSnapshot} onChange={(event) => setVerifiedTechnicalSnapshot(event.target.value)} className="w-full rounded border p-2" /><button type="button" className="mt-2 rounded border px-3 py-2" onClick={() => { try { const next = withVerifiedTechnicalSnapshot(importedPractice, JSON.parse(verifiedTechnicalSnapshot) as LocalTechnicalSnapshot); if (!next || !saveImportedPractice(window.localStorage, next)) throw new Error(); setImportedPractice(next); setVerifiedTechnicalSnapshot(""); setImportError(""); } catch { setImportError("Snapshot tecnico minimizzato non valido."); } }}>Registra dati tecnici verificati</button></div>}</div>}
      </section>
      <p aria-label="Riepilogo stati" className="mb-3 text-sm">Ricevute {summary.received ?? 0} · Assegnate {summary.assigned ?? 0} · In corso {summary.processing ?? 0} · Revisione {summary.review ?? 0} · Concluse {summary.completed ?? 0}</p>
      <h3 className="mb-2 font-semibold">Fixture laboratorio</h3>
      <input aria-label="Cerca pratiche" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Codice, cliente, rivenditore" className="mb-2 w-full rounded border p-2" />
      <select aria-label="Filtra per stato" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="mb-2 w-full rounded border p-2"><option value="all">Tutti gli stati</option>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filtra per assegnatario" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="mb-3 w-full rounded border p-2"><option value="all">Tutti gli assegnatari</option><option value="unassigned">Non assegnate</option><option value="operatore-demo-anna">Anna Demo</option><option value="operatore-demo-luca">Luca Demo</option></select>
      <div className="space-y-2">{visible.map((practice) => <button key={practice.id} onClick={() => setSelectedId(practice.id)} aria-current={practice.id === selectedId ? "page" : undefined} className="block w-full rounded border p-3 text-left"><strong>{practice.code}</strong><br /><span className="text-sm">{practice.clienteNome} {practice.clienteCognome} · {STAGE_LABELS[states[practice.id].stage]} · priorità {states[practice.id].priority}</span></button>)}{visible.length === 0 && <p>Nessuna pratica fixture trovata.</p>}</div>
    </nav>
    <Workspace key={selected.id} practice={selected} state={states[selected.id]} setState={updateSelected} importedSource={selected.id === importedPractice?.localId ? importedPractice : undefined} onImportedReset={selected.id === importedPractice?.localId ? () => { setImportedPractice(null); setSelectedId(ENEA_LAB_MOCK_PRACTICES[0].id); } : undefined} />
  </div>;
}
