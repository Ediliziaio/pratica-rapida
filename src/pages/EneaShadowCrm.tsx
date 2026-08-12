import { useEffect, useRef, useState } from "react";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";
import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import { loadImportedPractice } from "@/features/enea-shadow-crm/importBridge";
import {
  loadShadowCrmState,
  addFixtureEmailDraft,
  addSyntheticAttachment,
  assignShadowCrm,
  clearShadowCrmState,
  EMPTY_SHADOW_CRM_STATE,
  INTERNAL_PILOT_PROCEDURE,
  internalPilotCriteria,
  prioritizeShadowCrm,
  pilotSessionId,
  removeSyntheticAttachment,
  saveShadowCrmState,
  serializeShadowCrmAudit,
  serializeShadowCrmPractice,
  transitionShadowCrm,
  type ShadowCrmPracticeState,
} from "@/features/enea-shadow-crm/workflow";

const STAGE_LABELS: Record<ShadowCrmPracticeState["stage"], string> = {
  received: "Ricevuta", assigned: "Assegnata", processing: "In lavorazione", review: "In revisione", completed: "Conclusa",
};

function Workspace({ practice, state, setState }: { practice: EneaLabSourcePractice; state: ShadowCrmPracticeState; setState: (state: ShadowCrmPracticeState) => void }) {
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [practiceExported, setPracticeExported] = useState(false);
  const skipNextSave = useRef(false);
  const analysis = ENEA_LAB_MOCK_ANALYSIS[practice.id];
  const syntheticDocumentsReady = state.attachments.length >= 2 && state.attachments.every((item) => item.validation === "valid");
  const checklist = [
    { label: "Anagrafica sintetica disponibile", ok: practice.clienteCognome.startsWith("Demo") },
    { label: "Allegati fixture acquisiti", ok: practice.documentPaths.length > 0 || syntheticDocumentsReady },
    { label: "Analisi documentale fixture completata", ok: Boolean(analysis) || syntheticDocumentsReady },
    { label: "Dati sintetici pronti per istruttoria", ok: practice.queueStatus === "ready" || syntheticDocumentsReady },
  ];
  const pilot = internalPilotCriteria(state);
  const sessionId = pilotSessionId(practice.id);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveShadowCrmState(window.localStorage, practice.id, state);
  }, [practice.id, state]);
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
    skipNextSave.current = true;
    setState({ ...EMPTY_SHADOW_CRM_STATE, attachments: [], drafts: [], audit: [] });
    setResetConfirmed(false);
    setPracticeExported(false);
  };

  return <main className="flex-1 space-y-6 p-6" data-testid="shadow-workspace">
    <header>
      <p className="text-sm font-medium text-amber-700">Demo esclusivamente locale · dati sintetici · nessun invio</p>
      <h1 className="text-2xl font-semibold">{practice.code} — {practice.clienteNome} {practice.clienteCognome}</h1>
      <p data-testid="pilot-session-id">Sessione pilot: {sessionId}</p>
      <p className="text-muted-foreground">Stato: {STAGE_LABELS[state.stage]} · Assegnatario: {state.assignee ?? "non assegnato"}</p>
    </header>

    <section aria-labelledby="ricezione" className="rounded-lg border p-4">
      <h2 id="ricezione" className="font-semibold">1. Ricezione e allegati</h2>
      <p>{practice.reseller} · {practice.prodottoInstallato} · ricevuta {new Date(practice.ricevutaAt).toLocaleString("it-IT")}</p>
      {practice.documentPaths.length ? <ul className="mt-2 list-disc pl-5">{practice.documentPaths.map((doc) => <li key={doc.path}>{doc.kind}: {doc.path}</li>)}</ul> : <p className="mt-2 text-amber-700">Nessun allegato fixture disponibile.</p>}
      <p className="mt-3 text-sm">Acquisizione controllata: genera soltanto metadati PDF sintetici, massimo 10 file e 200 KB dichiarati per file.</p>
      <div className="mt-2 flex gap-2"><button onClick={() => setState(addSyntheticAttachment(state, "invoice"))} className="rounded border px-3 py-2">Aggiungi fattura DEMO</button><button onClick={() => setState(addSyntheticAttachment(state, "bank-transfer"))} className="rounded border px-3 py-2">Aggiungi bonifico DEMO</button></div>
      <ul aria-label="Allegati sintetici acquisiti" className="mt-2 list-disc pl-5">{state.attachments.map((item) => <li key={item.id}>{item.name} · {item.mimeType} · {item.size} byte · {item.validation} <button onClick={() => setState(removeSyntheticAttachment(state, item.id))} className="rounded border px-2 py-1">Rimuovi {item.name}</button><ul className="list-[circle] pl-5">{item.checks.map((check) => <li key={check}>{check}</li>)}</ul></li>)}</ul>
    </section>

    <section aria-labelledby="checklist" className="rounded-lg border p-4">
      <h2 id="checklist" className="font-semibold">2. Checklist di validazione</h2>
      <ul className="mt-2 space-y-1">{checklist.map((item) => <li key={item.label}>{item.ok ? "✓" : "○"} {item.label}</li>)}</ul>
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
      <button disabled={state.stage !== "review" || !state.emailDrafted} onClick={() => act("complete")} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Concludi pratica fixture</button>
      <ol className="mt-3 list-decimal pl-5" aria-label="Audit locale">{state.audit.map((event) => <li key={event.id}>{event.type} · {new Date(event.at).toLocaleString("it-IT")}</li>)}</ol>
      <div className="mt-3 flex gap-2"><button onClick={() => downloadJson(serializeShadowCrmAudit(practice.id, state), `${practice.code}-audit-fixture.json`)} className="rounded border px-3 py-2">Esporta audit fixture JSON</button><button onClick={() => { downloadJson(serializeShadowCrmPractice(practice.id, state), `${practice.code}-pratica-fixture.json`); setPracticeExported(true); }} className="rounded border px-3 py-2">Esporta pratica fixture JSON</button><button onClick={() => window.print()} className="rounded border px-3 py-2">Stampa riepilogo fixture</button></div>
      <h3 className="mt-4 font-medium">Readiness pilot interno: {pilot.ready ? "PRONTA" : "NON PRONTA"}</h3>
      <ul aria-label="Criteri pilot interno">{pilot.checks.map((check) => <li key={check.label}>{check.ok ? "✓" : "○"} {check.label}</li>)}</ul>
      <section aria-labelledby="procedura-pilot" className="mt-4 rounded border p-3"><h3 id="procedura-pilot" className="font-medium">Procedura operativa del pilot</h3><ol className="list-decimal pl-5">{INTERNAL_PILOT_PROCEDURE.map((step) => <li key={step.order}><strong>{step.role}:</strong> {step.action}</li>)}</ol><p className="mt-2 text-sm">Accettazione: tutti i criteri di readiness devono risultare verdi, il riepilogo deve essere esportabile e nessun servizio esterno deve essere contattato.</p></section>
      <section aria-label="Riepilogo finale stampabile" className="mt-4 rounded border p-3"><h3 className="font-medium">Riepilogo finale stampabile</h3><p>{sessionId} · {practice.code} · {STAGE_LABELS[state.stage]} · priorità {state.priority}</p><p>{state.attachments.length} allegati fixture · {state.drafts.length} bozze non inviate · {state.audit.length} eventi audit · readiness {pilot.ready ? "PRONTA" : "NON PRONTA"}</p></section>
      <div className="mt-4 rounded border border-red-300 p-3"><h3 className="font-medium">Pulizia del singolo pilot</h3><p className="text-sm">Rimuove soltanto lo stato locale di {practice.code}; le altre pratiche fixture restano invariate. Prima è obbligatorio esportare la pratica fixture.</p><p aria-live="polite">Export preventivo: {practiceExported ? "completato" : "richiesto"}</p><label className="mt-2 block"><input type="checkbox" checked={resetConfirmed} onChange={(event) => setResetConfirmed(event.target.checked)} /> Confermo la pulizia locale di questa pratica fixture</label><button disabled={!resetConfirmed || !practiceExported} onClick={resetPilot} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Resetta singolo pilot fixture</button></div>
    </section>
  </main>;
}

export default function EneaShadowCrm() {
  const [importedPractice] = useState(() => loadImportedPractice(window.localStorage));
  const [selectedId, setSelectedId] = useState(ENEA_LAB_MOCK_PRACTICES[0].id);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [states, setStates] = useState<Record<string, ShadowCrmPracticeState>>(() => Object.fromEntries(ENEA_LAB_MOCK_PRACTICES.map((practice) => [practice.id, loadShadowCrmState(window.localStorage, practice.id)])));
  const selected = ENEA_LAB_MOCK_PRACTICES.find((practice) => practice.id === selectedId) ?? ENEA_LAB_MOCK_PRACTICES[0];
  const visible = ENEA_LAB_MOCK_PRACTICES.filter((practice) => {
    const state = states[practice.id];
    const text = `${practice.code} ${practice.clienteNome} ${practice.clienteCognome} ${practice.reseller}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (stageFilter === "all" || state.stage === stageFilter) && (assigneeFilter === "all" || (assigneeFilter === "unassigned" ? !state.assignee : state.assignee === assigneeFilter));
  });
  const summary = Object.values(states).reduce((result, state) => ({ ...result, [state.stage]: (result[state.stage] ?? 0) + 1 }), {} as Record<string, number>);
  const updateSelected = (state: ShadowCrmPracticeState) => setStates((current) => ({ ...current, [selected.id]: state }));
  return <div className="min-h-screen bg-background text-foreground md:flex">
    <nav aria-label="Pratiche fixture" className="border-b p-4 md:w-72 md:border-b-0 md:border-r">
      <h2 className="mb-3 font-semibold">CRM ombra ENEA</h2>
      <section aria-label="Ponte importazione read-only" className="mb-4 rounded border border-amber-300 p-3 text-sm">
        <h3 className="font-semibold">Ponte CRM reale</h3>
        <p>Disconnesso dal CRM: nessun record selezionato. L’import richiede una sola pratica, consenso esplicito e snapshot read-only minimizzato.</p>
        <p className="mt-1">Email, WhatsApp, scritture CRM/ENEA e upload: <strong>bloccati</strong>.</p>
        {importedPractice && <div className="mt-2" data-testid="masked-import"><strong>{importedPractice.code}</strong><p>{importedPractice.customerLabel} · {importedPractice.maskedEmail ?? "email omessa"} · {importedPractice.maskedPhone ?? "telefono omesso"}</p></div>}
      </section>
      <p aria-label="Riepilogo stati" className="mb-3 text-sm">Ricevute {summary.received ?? 0} · Assegnate {summary.assigned ?? 0} · In corso {summary.processing ?? 0} · Revisione {summary.review ?? 0} · Concluse {summary.completed ?? 0}</p>
      <input aria-label="Cerca pratiche" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Codice, cliente, rivenditore" className="mb-2 w-full rounded border p-2" />
      <select aria-label="Filtra per stato" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="mb-2 w-full rounded border p-2"><option value="all">Tutti gli stati</option>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filtra per assegnatario" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="mb-3 w-full rounded border p-2"><option value="all">Tutti gli assegnatari</option><option value="unassigned">Non assegnate</option><option value="operatore-demo-anna">Anna Demo</option><option value="operatore-demo-luca">Luca Demo</option></select>
      <div className="space-y-2">{visible.map((practice) => <button key={practice.id} onClick={() => setSelectedId(practice.id)} aria-current={practice.id === selectedId ? "page" : undefined} className="block w-full rounded border p-3 text-left"><strong>{practice.code}</strong><br /><span className="text-sm">{practice.clienteNome} {practice.clienteCognome} · {STAGE_LABELS[states[practice.id].stage]} · priorità {states[practice.id].priority}</span></button>)}{visible.length === 0 && <p>Nessuna pratica fixture trovata.</p>}</div>
    </nav>
    <Workspace key={selected.id} practice={selected} state={states[selected.id]} setState={updateSelected} />
  </div>;
}
