import { useEffect, useMemo, useState } from "react";
import {
  catalogLine,
  convertQuote,
  createQuote,
  DEMO_CATALOG,
  DEMO_COMPANIES,
  DEMO_USERS,
  documentTotals,
  freeLine,
  missingPracticeRequestFields,
  simulatePracticeRequest,
  type DocumentLine,
  type InvoiceDraft,
  type Quote,
  type ScreeningData,
  type Workspace,
} from "@/features/fattura-rapida/domain";
import { emptyWorkspace, loadWorkspace, saveWorkspace } from "@/features/fattura-rapida/storage";

const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function updateAt<T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}

function Header({ onWorkspace }: { onWorkspace: () => void }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div><span className="text-xl font-bold text-slate-950">Fattura</span><span className="text-xl font-bold text-emerald-600">Rapida</span><p className="text-xs text-slate-500">Un progetto futuro di Impresa Leggera</p></div>
        <button onClick={onWorkspace} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Accedi all'area operativa</button>
      </div>
    </header>
  );
}

function Marketing({ onWorkspace }: { onWorkspace: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header onWorkspace={onWorkspace} />
      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">Pensato per micro-artigiani</span>
            <h1 className="mt-5 text-5xl font-bold leading-tight">Preventivi e bozze fattura, con più ordine e meno passaggi.</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">Prepara documenti chiari, usa articoli di catalogo o righe libere e porta i dati nel tuo gestionale. FatturaRapida non emette fatture e non invia documenti fiscali.</p>
            <div className="mt-8 flex gap-3"><button onClick={onWorkspace} className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white">Apri la demo locale</button><a href="#come-funziona" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold">Come funziona</a></div>
          </div>
          <div className="rounded-3xl bg-slate-950 p-8 text-white shadow-xl">
            <p className="text-sm text-emerald-300">Percorso guidato</p>
            <ol className="mt-5 space-y-4 text-lg"><li>1. Prepara il preventivo</li><li>2. Completa solo i dati mancanti</li><li>3. Trasforma in bozza fattura</li><li>4. Genera il PDF non fiscale</li><li>5. Riporta i dati nel tuo gestionale</li></ol>
          </div>
        </section>
        <section id="come-funziona" className="border-y border-slate-200 bg-white py-16">
          <div className="mx-auto grid max-w-6xl gap-5 px-5 md:grid-cols-3">
            {[['Catalogo e libertà', 'Articoli standard e righe libere possono convivere nello stesso documento.'], ['Controlli guidati', 'La conversione segnala soltanto le informazioni obbligatorie ancora mancanti.'], ['PraticaRapida, in futuro', 'Una richiesta precompilata potrà evitare la doppia digitazione, senza accedere direttamente a ENEA.']].map(([title, body]) => <article key={title} className="rounded-2xl border border-slate-200 p-6"><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm text-slate-600">{body}</p></article>)}
          </div>
        </section>
      </main>
    </div>
  );
}

function Access({ onEnter }: { onEnter: (userId: string) => void }) {
  const [userId, setUserId] = useState(DEMO_USERS[0].id);
  return (
    <div className="min-h-screen bg-slate-100 px-5 py-16">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">ACCESSO DEMO LOCALE</p>
        <h1 className="mt-2 text-2xl font-bold">Scegli un profilo sintetico</h1>
        <p className="mt-2 text-sm text-slate-600">Ogni profilo vede esclusivamente l'area della propria azienda. Nessuna autenticazione o servizio esterno viene contattato.</p>
        <label className="mt-6 block text-sm font-medium">Utente e azienda<select aria-label="Utente demo" value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-2 w-full rounded-lg border p-3">{DEMO_USERS.map((user) => <option key={user.id} value={user.id}>{user.name} — {DEMO_COMPANIES.find((company) => company.id === user.companyId)?.name}</option>)}</select></label>
        <button onClick={() => onEnter(userId)} className="mt-5 w-full rounded-lg bg-slate-950 p-3 font-semibold text-white">Entra nell'area riservata demo</button>
      </div>
    </div>
  );
}

function ScreeningFields({ value, onChange }: { value: ScreeningData; onChange: (value: ScreeningData) => void }) {
  const patch = (next: Partial<ScreeningData>) => onChange({ ...value, ...next });
  return (
    <div className="mt-3 grid gap-2 rounded-lg bg-emerald-50 p-3 md:grid-cols-4">
      <label className="text-xs">Tipo<select aria-label="Tipo schermatura" value={value.productType} onChange={(event) => patch({ productType: event.target.value as ScreeningData['productType'] })} className="mt-1 w-full rounded border bg-white p-2"><option value="">Seleziona</option><option value="tende_da_sole">Tenda da sole</option><option value="pergotenda">Pergotenda</option><option value="pergola">Pergola</option><option value="altro">Altro</option></select></label>
      <label className="text-xs">Direzione<select aria-label="Direzione schermatura" value={value.orientation} onChange={(event) => patch({ orientation: event.target.value as ScreeningData['orientation'] })} className="mt-1 w-full rounded border bg-white p-2"><option value="">Seleziona</option>{[['sud','Sud'],['sud_est','Sud-Est'],['sud_ovest','Sud-Ovest'],['est','Est'],['ovest','Ovest']].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs">Larghezza cm<input aria-label="Larghezza schermatura" type="number" value={value.widthCm ?? ''} onChange={(event) => patch({ widthCm: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded border bg-white p-2" /></label>
      <label className="text-xs">Altezza cm<input aria-label="Altezza schermatura" type="number" value={value.heightCm ?? ''} onChange={(event) => patch({ heightCm: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded border bg-white p-2" /></label>
      <label className="text-xs">Produttore<input value={value.manufacturer} onChange={(event) => patch({ manufacturer: event.target.value })} className="mt-1 w-full rounded border bg-white p-2" /></label>
      <label className="text-xs">Colore<input value={value.color} onChange={(event) => patch({ color: event.target.value })} className="mt-1 w-full rounded border bg-white p-2" /></label>
      <label className="text-xs">Motorizzata<select value={value.motorized === null ? '' : String(value.motorized)} onChange={(event) => patch({ motorized: event.target.value === '' ? null : event.target.value === 'true' })} className="mt-1 w-full rounded border bg-white p-2"><option value="">Da indicare</option><option value="true">Sì</option><option value="false">No</option></select></label>
    </div>
  );
}

function QuoteEditor({ quote, catalog, onChange, onConvert }: { quote: Quote; catalog: typeof DEMO_CATALOG; onChange: (quote: Quote) => void; onConvert: () => void }) {
  const totals = documentTotals(quote.lines);
  const nextLineSequence = quote.lines.reduce((highest, line) => {
    const sequence = Number(line.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(highest, sequence);
  }, 0) + 1;
  const patchCustomer = (patch: Partial<Quote['customer']>) => onChange({ ...quote, customer: { ...quote.customer, ...patch } });
  const patchLine = (id: string, patch: Partial<DocumentLine>) => onChange({ ...quote, lines: updateAt(quote.lines, id, patch) });
  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-emerald-700">PREVENTIVO</p><h2 className="text-xl font-bold">{quote.number}</h2></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs">{quote.status}</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{([['name','Cliente'],['taxId','CF / Partita IVA'],['address','Indirizzo'],['email','Email facoltativa']] as const).map(([key,label]) => <label key={key} className="text-sm">{label}<input aria-label={label} value={quote.customer[key]} onChange={(event) => patchCustomer({ [key]: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>)}</div>
      <div className="mt-6 flex flex-wrap gap-2"><select aria-label="Articolo catalogo" id="catalog-select" className="rounded-lg border p-2"><option value="">Articolo di catalogo…</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}</select><button onClick={() => { const select = document.getElementById('catalog-select') as HTMLSelectElement; const item = catalog.find((candidate) => candidate.id === select.value); if (item) onChange({ ...quote, lines: [...quote.lines, catalogLine(item, nextLineSequence)] }); }} className="rounded-lg border px-3 py-2">Aggiungi catalogo</button><button onClick={() => onChange({ ...quote, lines: [...quote.lines, freeLine(nextLineSequence)] })} className="rounded-lg border px-3 py-2">Aggiungi riga libera</button></div>
      <div className="mt-4 space-y-3">{quote.lines.map((line) => <div key={line.id} className="rounded-xl border p-3"><div className="grid gap-2 md:grid-cols-[2fr_.6fr_.8fr_.6fr_auto]"><input aria-label="Descrizione riga" value={line.description} onChange={(event) => patchLine(line.id, { description: event.target.value })} className="rounded border p-2" placeholder="Descrizione" /><input aria-label="Quantità" type="number" min="0" value={line.quantity} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} className="rounded border p-2" /><input aria-label="Prezzo unitario" type="number" min="0" value={line.unitPrice} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} className="rounded border p-2" /><input aria-label="IVA" type="number" min="0" value={line.vatRate} onChange={(event) => patchLine(line.id, { vatRate: Number(event.target.value) })} className="rounded border p-2" /><button aria-label="Rimuovi riga" onClick={() => onChange({ ...quote, lines: quote.lines.filter((candidate) => candidate.id !== line.id) })} className="rounded border px-3 text-red-700">×</button></div>{line.screening && <ScreeningFields value={line.screening} onChange={(screening) => patchLine(line.id, { screening })} />}</div>)}</div>
      {!quote.lines.length && <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aggiungi un articolo di catalogo o una riga libera.</p>}
      <div className="mt-5 flex items-end justify-between border-t pt-4"><div className="text-sm text-slate-600"><p>Imponibile {money.format(totals.net)}</p><p>IVA {money.format(totals.vat)}</p><p className="text-lg font-bold text-slate-950">Totale {money.format(totals.gross)}</p></div><button onClick={onConvert} className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white">Trasforma in bozza fattura</button></div>
    </section>
  );
}

function InvoiceCard({ invoice, onUpdate, onRequest }: { invoice: InvoiceDraft; onUpdate: (invoice: InvoiceDraft) => void; onRequest: () => void }) {
  const totals = documentTotals(invoice.lines);
  const missing = missingPracticeRequestFields(invoice);
  return (
    <article className="rounded-xl border bg-white p-4"><div className="flex justify-between"><div><p className="text-xs font-semibold text-sky-700">BOZZA NON FISCALE</p><h3 className="font-bold">{invoice.number}</h3></div><span className="text-xs">{invoice.status}</span></div><p className="mt-3 text-sm">{invoice.customer.name} · {money.format(totals.gross)}</p><p className="mt-1 text-xs text-slate-500">Da verificare e riportare nel proprio gestionale di fatturazione.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => { onUpdate({ ...invoice, status: 'pdf_generated' }); window.print(); }} className="rounded border px-3 py-2 text-sm">Stampa / PDF</button><button onClick={() => onUpdate({ ...invoice, status: 'copied_to_accounting' })} className="rounded border px-3 py-2 text-sm">Segna riportata nel gestionale</button><button onClick={onRequest} className="rounded bg-slate-950 px-3 py-2 text-sm text-white">Chiedi pratica ENEA</button></div>{missing.length > 0 && <p className="mt-3 text-xs text-amber-700">Per la richiesta PraticaRapida mancano: {missing.join('; ')}.</p>}</article>
  );
}

function WorkspaceView({ userId, onExit }: { userId: string; onExit: () => void }) {
  const user = DEMO_USERS.find((candidate) => candidate.id === userId)!;
  const company = DEMO_COMPANIES.find((candidate) => candidate.id === user.companyId)!;
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace(window.localStorage, company.id));
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(() => workspace.quotes[0]?.id ?? null);
  const [notice, setNotice] = useState("");
  const catalog = useMemo(() => DEMO_CATALOG.filter((item) => item.companyId === company.id), [company.id]);
  const selectedQuote = workspace.quotes.find((quote) => quote.id === selectedQuoteId);
  useEffect(() => { saveWorkspace(window.localStorage, workspace); }, [workspace]);
  const updateQuote = (quote: Quote) => setWorkspace((current) => ({ ...current, quotes: updateAt(current.quotes, quote.id, quote) }));
  const newQuote = () => { const quote = createQuote(company.id, workspace.quotes.length + 1); setWorkspace((current) => ({ ...current, quotes: [...current.quotes, quote] })); setSelectedQuoteId(quote.id); setNotice(""); };
  const convert = () => {
    if (!selectedQuote) return;
    if (workspace.invoices.some((invoice) => invoice.sourceQuoteId === selectedQuote.id)) {
      setNotice("Questo preventivo è già collegato a una bozza fattura: nessun duplicato creato.");
      return;
    }
    const result = convertQuote(selectedQuote, company, workspace.invoices.length + 1);
    if (!result.invoice) { setNotice(`Completa prima: ${result.missing.join('; ')}.`); return; }
    setWorkspace((current) => ({ ...current, quotes: updateAt(current.quotes, selectedQuote.id, { status: 'converted' }), invoices: [...current.invoices, result.invoice!] }));
    setNotice("Bozza fattura creata. Il preventivo originale è rimasto separato.");
  };
  const request = (invoice: InvoiceDraft) => {
    const result = simulatePracticeRequest(invoice);
    if (!result.request) { setNotice(`Richiesta non pronta: ${result.missing.join('; ')}.`); return; }
    if (workspace.requests.some((candidate) => candidate.invoiceDraftId === invoice.id)) { setNotice("La richiesta locale è già stata preparata: nessun duplicato creato."); return; }
    setWorkspace((current) => ({ ...current, requests: [...current.requests, result.request!] }));
    setNotice("Richiesta PraticaRapida simulata localmente. Nessun sistema esterno o portale ENEA è stato contattato.");
  };
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div><strong>FatturaRapida</strong><p className="text-xs text-slate-500">{company.name} · {user.name}</p></div><button onClick={onExit} className="rounded border px-3 py-2 text-sm">Esci dalla demo</button></div></header>
      <main className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4"><div className="rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs text-emerald-300">AREA AZIENDALE ISOLATA</p><p className="mt-2 font-semibold">{company.name}</p><p className="text-xs text-slate-300">Storage locale: {company.id}</p></div><button onClick={newQuote} className="w-full rounded-lg bg-emerald-600 p-3 font-semibold text-white">Nuovo preventivo</button><div className="rounded-xl bg-white p-3"><h2 className="text-sm font-bold">Preventivi</h2>{workspace.quotes.map((quote) => <button key={quote.id} onClick={() => setSelectedQuoteId(quote.id)} className={`mt-2 block w-full rounded p-2 text-left text-sm ${selectedQuoteId === quote.id ? 'bg-emerald-50' : 'bg-slate-50'}`}>{quote.number}<span className="block text-xs text-slate-500">{quote.customer.name || 'Cliente da indicare'}</span></button>)}{!workspace.quotes.length && <p className="mt-2 text-xs text-slate-500">Nessun preventivo.</p>}</div><div className="rounded-xl border border-dashed bg-white p-4"><p className="text-xs font-semibold">AREA INFISSI</p><p className="mt-1 text-xs text-slate-500">Predisposta come categoria estendibile. Nessun campo tecnico è assunto prima della sessione dedicata.</p></div></aside>
        <div className="space-y-5">{notice && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{notice}</div>}{selectedQuote ? <QuoteEditor quote={selectedQuote} catalog={catalog} onChange={updateQuote} onConvert={convert} /> : <div className="rounded-2xl bg-white p-10 text-center"><h1 className="text-2xl font-bold">Area operativa pronta</h1><p className="mt-2 text-slate-600">Crea il primo preventivo per iniziare.</p></div>}
          <section><h2 className="mb-3 text-lg font-bold">Bozze fattura</h2><div className="grid gap-3 md:grid-cols-2">{workspace.invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} onUpdate={(updated) => setWorkspace((current) => ({ ...current, invoices: updateAt(current.invoices, invoice.id, updated) }))} onRequest={() => request(invoice)} />)}{!workspace.invoices.length && <p className="text-sm text-slate-500">Nessuna bozza fattura.</p>}</div></section>
          <section className="rounded-xl bg-white p-4"><h2 className="font-bold">Richieste PraticaRapida simulate</h2><p className="mt-1 text-xs text-slate-500">Sono record locali di collaudo: non creano pratiche ENEA e non accedono a PraticaRapida.</p>{workspace.requests.map((item) => <p key={item.id} className="mt-2 rounded bg-emerald-50 p-2 text-sm">Richiesta locale per {item.customer.name} · comunicazioni e rete disattivate</p>)}</section>
        </div>
      </main>
    </div>
  );
}

export default function FatturaRapida() {
  const [view, setView] = useState<"marketing" | "access" | "workspace">("marketing");
  const [userId, setUserId] = useState<string | null>(null);
  if (view === "marketing") return <Marketing onWorkspace={() => setView("access")} />;
  if (view === "access") return <Access onEnter={(nextUserId) => { setUserId(nextUserId); setView("workspace"); }} />;
  return <WorkspaceView userId={userId!} onExit={() => { setUserId(null); setView("marketing"); }} />;
}
