import { useEffect, useMemo, useState } from "react";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";
import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import {
  loadShadowCrmState,
  saveShadowCrmState,
  transitionShadowCrm,
  type ShadowCrmPracticeState,
} from "@/features/enea-shadow-crm/workflow";

const STAGE_LABELS: Record<ShadowCrmPracticeState["stage"], string> = {
  received: "Ricevuta", assigned: "Assegnata", processing: "In lavorazione", review: "In revisione", completed: "Conclusa",
};

function Workspace({ practice }: { practice: EneaLabSourcePractice }) {
  const [state, setState] = useState(() => loadShadowCrmState(window.localStorage, practice.id));
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
  const act = (action: Parameters<typeof transitionShadowCrm>[1]) => setState((current) => transitionShadowCrm(current, action));

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
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={state.stage !== "received"} onClick={() => act("assign")} className="rounded border px-3 py-2 disabled:opacity-40">Assegna ad Anna (demo)</button>
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
  const selected = ENEA_LAB_MOCK_PRACTICES.find((practice) => practice.id === selectedId) ?? ENEA_LAB_MOCK_PRACTICES[0];
  return <div className="min-h-screen bg-background text-foreground md:flex">
    <nav aria-label="Pratiche fixture" className="border-b p-4 md:w-72 md:border-b-0 md:border-r">
      <h2 className="mb-3 font-semibold">CRM ombra ENEA</h2>
      <div className="space-y-2">{ENEA_LAB_MOCK_PRACTICES.map((practice) => <button key={practice.id} onClick={() => setSelectedId(practice.id)} aria-current={practice.id === selectedId ? "page" : undefined} className="block w-full rounded border p-3 text-left"><strong>{practice.code}</strong><br /><span className="text-sm">{practice.clienteNome} {practice.clienteCognome}</span></button>)}</div>
    </nav>
    <Workspace key={selected.id} practice={selected} />
  </div>;
}
