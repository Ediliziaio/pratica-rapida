import { useEffect, useMemo, useState } from "react";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";
import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import {
  loadShadowCrmState,
  assignShadowCrm,
  prioritizeShadowCrm,
  saveShadowCrmState,
  transitionShadowCrm,
  type ShadowCrmPracticeState,
} from "@/features/enea-shadow-crm/workflow";

const STAGE_LABELS: Record<ShadowCrmPracticeState["stage"], string> = {
  received: "Ricevuta", assigned: "Assegnata", processing: "In lavorazione", review: "In revisione", completed: "Conclusa",
};

function Workspace({ practice, state, setState }: { practice: EneaLabSourcePractice; state: ShadowCrmPracticeState; setState: (state: ShadowCrmPracticeState) => void }) {
  const analysis = ENEA_LAB_MOCK_ANALYSIS[practice.id];
  const checklist = [
    { label: "Anagrafica sintetica disponibile", ok: practice.clienteCognome.startsWith("Demo") },
    { label: "Allegati fixture acquisiti", ok: practice.documentPaths.length > 0 },
    { label: "Analisi documentale fixture completata", ok: Boolean(analysis) },
    { label: "Dati pratica pronti per istruttoria", ok: practice.queueStatus === "ready" },
  ];
  const draft = useMemo(() => ({
    subject: `[DEMO LOCALE] Aggiornamento pratica ${practice.code}`,
    body: `Gentile ${practice.clienteNome} ${practice.clienteCognome},\n\nla pratica sintetica ${practice.code} è stata lavorata nel CRM ombra locale. Questa bozza non è stata inviata.`,
  }), [practice]);

  useEffect(() => saveShadowCrmState(window.localStorage, practice.id, state), [practice.id, state]);
  const act = (action: Parameters<typeof transitionShadowCrm>[1]) => setState(transitionShadowCrm(state, action));

  return <main className="flex-1 space-y-6 p-6" data-testid="shadow-workspace">
    <header>
      <p className="text-sm font-medium text-amber-700">Demo esclusivamente locale · dati sintetici · nessun invio</p>
      <h1 className="text-2xl font-semibold">{practice.code} — {practice.clienteNome} {practice.clienteCognome}</h1>
      <p className="text-muted-foreground">Stato: {STAGE_LABELS[state.stage]} · Assegnatario: {state.assignee ?? "non assegnato"}</p>
    </header>

    <section aria-labelledby="ricezione" className="rounded-lg border p-4">
      <h2 id="ricezione" className="font-semibold">1. Ricezione e allegati</h2>
      <p>{practice.reseller} · {practice.prodottoInstallato} · ricevuta {new Date(practice.ricevutaAt).toLocaleString("it-IT")}</p>
      {practice.documentPaths.length ? <ul className="mt-2 list-disc pl-5">{practice.documentPaths.map((doc) => <li key={doc.path}>{doc.kind}: {doc.path}</li>)}</ul> : <p className="mt-2 text-amber-700">Nessun allegato fixture disponibile.</p>}
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
      <label className="mt-2 block text-sm">Oggetto<input readOnly value={draft.subject} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="mt-2 block text-sm">Corpo<textarea readOnly value={draft.body} rows={4} className="mt-1 block w-full rounded border p-2" /></label>
      <button disabled={state.stage !== "review" || state.emailDrafted} onClick={() => act("draft-email")} className="mt-3 rounded border px-3 py-2 disabled:opacity-40">{state.emailDrafted ? "Bozza preparata (non inviata)" : "Prepara bozza email"}</button>
    </section>

    <section aria-labelledby="esito" className="rounded-lg border p-4">
      <h2 id="esito" className="font-semibold">5. Esito e audit append-only</h2>
      <button disabled={state.stage !== "review" || !state.emailDrafted} onClick={() => act("complete")} className="mt-2 rounded border px-3 py-2 disabled:opacity-40">Concludi pratica fixture</button>
      <ol className="mt-3 list-decimal pl-5" aria-label="Audit locale">{state.audit.map((event) => <li key={event.id}>{event.type} · {new Date(event.at).toLocaleString("it-IT")}</li>)}</ol>
    </section>
  </main>;
}

export default function EneaShadowCrm() {
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
      <p aria-label="Riepilogo stati" className="mb-3 text-sm">Ricevute {summary.received ?? 0} · Assegnate {summary.assigned ?? 0} · In corso {summary.processing ?? 0} · Revisione {summary.review ?? 0} · Concluse {summary.completed ?? 0}</p>
      <input aria-label="Cerca pratiche" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Codice, cliente, rivenditore" className="mb-2 w-full rounded border p-2" />
      <select aria-label="Filtra per stato" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="mb-2 w-full rounded border p-2"><option value="all">Tutti gli stati</option>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filtra per assegnatario" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="mb-3 w-full rounded border p-2"><option value="all">Tutti gli assegnatari</option><option value="unassigned">Non assegnate</option><option value="operatore-demo-anna">Anna Demo</option><option value="operatore-demo-luca">Luca Demo</option></select>
      <div className="space-y-2">{visible.map((practice) => <button key={practice.id} onClick={() => setSelectedId(practice.id)} aria-current={practice.id === selectedId ? "page" : undefined} className="block w-full rounded border p-3 text-left"><strong>{practice.code}</strong><br /><span className="text-sm">{practice.clienteNome} {practice.clienteCognome} · {STAGE_LABELS[states[practice.id].stage]} · priorità {states[practice.id].priority}</span></button>)}{visible.length === 0 && <p>Nessuna pratica fixture trovata.</p>}</div>
    </nav>
    <Workspace key={selected.id} practice={selected} state={states[selected.id]} setState={updateSelected} />
  </div>;
}
