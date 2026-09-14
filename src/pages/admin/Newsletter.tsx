import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Send, Users, Eye, Mail, CheckCircle2, XCircle, Clock, Loader2, ChevronDown, Bold, Italic, Underline } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ── Tipi e costanti ───────────────────────────────────────────────────────────

interface CrmStage { id: string; name: string; color: string; order: number; }
interface Company { id: string; ragione_sociale: string; email: string | null; }

interface NewsletterRecord {
  id: string;
  subject: string;
  body: string;
  target: string;       // stageId | 'all'
  targetLabel: string;
  total: number;
  ok: number;
  fail: number;
  sentAt: string;
  sentBy?: string | null;
}

const DEFAULT_STAGES: CrmStage[] = [
  { id: "lead",       name: "Nuovo Lead",       color: "#6366f1", order: 0 },
  { id: "contatto",   name: "Primo Contatto",    color: "#f59e0b", order: 1 },
  { id: "demo",       name: "Demo Programmata",  color: "#8b5cf6", order: 2 },
  { id: "onboarding", name: "In Onboarding",     color: "#3b82f6", order: 3 },
  { id: "attivo",     name: "Cliente Attivo",    color: "#10b981", order: 4 },
];

const KEY_STAGES      = "crm_pipeline_stages";
const KEY_ASSIGNMENTS = "crm_company_stages";
const KEY_NEWSLETTERS = "crm_newsletters";
const TEMPLATE_EVENT  = "newsletter_custom";
const TARGET_ALL      = "all";

async function upsertSetting(key: string, value: unknown) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value: value as Json }, { onConflict: "key" });
  if (error) throw error;
}

/** Stesso wrapper del template DB (email_templates.newsletter_custom) per un'anteprima fedele. */
function wrapPreview(bodyHtml: string): string {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
      <div style="background:#00843D;padding:20px 24px;border-radius:12px 12px 0 0;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Pratica Rapida</span>
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </div>
    </div>`;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/** Verifica se un frammento HTML contiene testo reale (ignora tag e spazi). */
function htmlHasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

// ── Editor testo con toolbar (grassetto/corsivo/sottolineato/dimensione) ──────
function RichTextEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Inizializza il contenuto una sola volta (editor non controllato per non
  // spostare il cursore ad ogni keystroke).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, value?: string) => {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, value);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const btn = "h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground";

  return (
    <div className="rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
      <div className="flex items-center gap-0.5 border-b p-1 flex-wrap">
        <button type="button" className={btn} title="Grassetto"
          onMouseDown={e => e.preventDefault()} onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Corsivo"
          onMouseDown={e => e.preventDefault()} onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={btn} title="Sottolineato"
          onMouseDown={e => e.preventDefault()} onClick={() => exec("underline")}>
          <Underline className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <select
          className="h-8 rounded border border-input bg-background px-2 text-xs"
          value=""
          onMouseDown={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) exec("fontSize", e.target.value); e.target.value = ""; }}
          title="Dimensione carattere"
        >
          <option value="">Dimensione</option>
          <option value="1">Molto piccolo</option>
          <option value="2">Piccolo</option>
          <option value="3">Normale</option>
          <option value="5">Grande</option>
          <option value="6">Molto grande</option>
          <option value="7">Enorme</option>
        </select>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
        className="min-h-[220px] px-3 py-2 text-sm leading-relaxed focus:outline-none"
      />
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Newsletter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [stagesInit, setStagesInit] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: stages = DEFAULT_STAGES, isSuccess: stagesLoaded } = useQuery<CrmStage[]>({
    queryKey: ["crm_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_STAGES).single();
      return (data?.value as unknown as CrmStage[]) ?? DEFAULT_STAGES;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: assignments = {} } = useQuery<Record<string, string>>({
    queryKey: ["crm_assignments"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_ASSIGNMENTS).single();
      return (data?.value as Record<string, string>) ?? {};
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["admin-companies-newsletter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("id, ragione_sociale, email")
        .order("ragione_sociale");
      if (error) throw error;
      return data as Company[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: leads = [] } = useQuery<Array<{ id: string; nome: string | null; cognome: string | null; email: string | null; stage_id: string | null }>>({
    queryKey: ["admin-leads-newsletter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads")
        .select("id, nome, cognome, email, stage_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: history = [] } = useQuery<NewsletterRecord[]>({
    queryKey: ["crm_newsletters"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_NEWSLETTERS).single();
      return (data?.value as unknown as NewsletterRecord[]) ?? [];
    },
    staleTime: 60 * 1000,
  });

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);

  // Default: tutte le pipeline selezionate — solo dopo il caricamento REALE
  // delle fasi (non sui placeholder DEFAULT_STAGES).
  useEffect(() => {
    if (!stagesInit && stagesLoaded && sortedStages.length > 0) {
      setSelectedStages(sortedStages.map(s => s.id));
      setStagesInit(true);
    }
  }, [stagesLoaded, sortedStages, stagesInit]);

  const allSelected = sortedStages.length > 0 && selectedStages.length === sortedStages.length;

  const toggleStage = (id: string) =>
    setSelectedStages(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedStages(allSelected ? [] : sortedStages.map(s => s.id));

  const customEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail.trim());
  // Modalità prova attiva: quadratino spuntato E email valida inserita.
  const customActive = customMode && customEmailValid;

  // Pool = AZIENDE (fase = assegnazione) + LEAD (fase = stage_id), uniti.
  // La board pipeline mescola le due tabelle nelle stesse colonne, quindi la
  // newsletter deve fare lo stesso: selezionando le pipeline si scelgono
  // insieme clienti e lead (i clienti stanno in "Cliente Attivo", i lead
  // negli altri stage). Prima invece si leggevano SOLO le companies → i 745
  // lead non ricevevano mai nulla.
  const pool = useMemo(() => {
    const firstStageId = sortedStages[0]?.id;
    const fromCompanies = companies.map(c => ({
      id: c.id,
      ragione_sociale: c.ragione_sociale,
      email: c.email,
      stage: assignments[c.id] ?? firstStageId,
    }));
    const fromLeads = leads.map(l => ({
      id: l.id,
      ragione_sociale: `${l.nome ?? ""} ${l.cognome ?? ""}`.trim() || "Lead",
      email: l.email,
      stage: l.stage_id ?? firstStageId,
    }));
    return [...fromCompanies, ...fromLeads];
  }, [companies, leads, assignments, sortedStages]);

  // Destinatari senza email valida: non ricevibili, esclusi dal conteggio.
  const noEmailCount = pool.filter(p => !p.email || !p.email.includes("@")).length;

  // ── Destinatari ──────────────────────────────────────────────────────────────
  // Se è impostata un'email di prova valida, si invia SOLO a quella (modalità
  // test). Altrimenti = pool (aziende + lead) filtrato per pipeline, con email,
  // deduplicato per indirizzo (un'azienda e un lead potrebbero condividere l'email).
  const recipients = useMemo(() => {
    if (customActive) {
      return [{ id: "custom", ragione_sociale: customEmail.trim(), email: customEmail.trim() }];
    }
    if (selectedStages.length === 0) return [];
    const seen = new Set<string>();
    const out: { id: string; ragione_sociale: string; email: string }[] = [];
    for (const p of pool) {
      if (!p.email || !p.email.includes("@")) continue;
      if (!selectedStages.includes(p.stage as string)) continue;
      const key = p.email.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, ragione_sociale: p.ragione_sociale, email: p.email! });
    }
    return out;
  }, [pool, selectedStages, customActive, customEmail]);

  const targetLabel = customActive
    ? `Prova: ${customEmail.trim()}`
    : allSelected
      ? "Tutti i contatti"
      : sortedStages.filter(s => selectedStages.includes(s.id)).map(s => s.name).join(", ") || "Nessuna pipeline";

  // ── Invio ────────────────────────────────────────────────────────────────────
  const send = async () => {
    setSending(true);
    let ok = 0;
    const failed: string[] = [];

    for (const c of recipients) {
      try {
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: {
            to: c.email,
            template: TEMPLATE_EVENT,
            data: { subject: subject.trim(), body_html: body },
          },
        });
        const res = data as { success?: boolean; error?: string } | null;
        if (error || (res && res.success === false)) {
          failed.push(c.ragione_sociale);
        } else {
          ok++;
        }
      } catch {
        failed.push(c.ragione_sociale);
      }
      await sleep(300); // throttle per non saturare il provider email
    }

    // Salva nello storico
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const record: NewsletterRecord = {
        id: crypto.randomUUID(),
        subject: subject.trim(),
        body,
        target: customActive ? "custom" : allSelected ? TARGET_ALL : selectedStages.join(","),
        targetLabel,
        total: recipients.length,
        ok,
        fail: failed.length,
        sentAt: new Date().toISOString(),
        sentBy: user?.email ?? null,
      };
      await upsertSetting(KEY_NEWSLETTERS, [record, ...history]);
      queryClient.invalidateQueries({ queryKey: ["crm_newsletters"] });
    } catch (e) {
      // lo storico è best-effort: l'invio è già avvenuto
      console.error("Salvataggio storico newsletter fallito:", e);
    }

    setSending(false);
    setConfirmSend(false);
    if (failed.length === 0) {
      toast({ title: "Newsletter inviata ✓", description: `${ok} email inviate a "${targetLabel}"` });
      setSubject(""); setBody(""); setCustomEmail(""); setEditorKey(k => k + 1);
    } else {
      toast({
        title: `Inviata con ${failed.length} errori`,
        description: `${ok} ok · ${failed.length} falliti`,
        variant: "destructive",
      });
    }
  };

  const canSend = subject.trim().length > 0 && htmlHasText(body) && recipients.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Newsletter</h1>
          <p className="text-muted-foreground text-sm">Componi e invia una comunicazione alle aziende</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Composer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Componi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Destinatari</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <span className="line-clamp-1 text-left">
                      {customActive
                        ? `Prova: ${customEmail.trim()}`
                        : allSelected ? "Tutti i contatti" : selectedStages.length === 0 ? "Nessuna pipeline selezionata" : `${selectedStages.length} pipeline selezionate`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                  {/* Tutti i contatti (aziende + lead di tutte le pipeline) */}
                  <label className={`flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-accent cursor-pointer ${customMode ? "opacity-40" : ""}`}>
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} style={{ borderRadius: 3 }} disabled={customMode} />
                    <span className="text-sm font-medium">Tutti i contatti</span>
                  </label>
                  <div className="h-px bg-border my-1" />
                  {/* Pipeline con quadratino */}
                  {sortedStages.map(s => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-accent cursor-pointer ${customMode ? "opacity-40" : ""}`}
                    >
                      <Checkbox
                        checked={selectedStages.includes(s.id)}
                        onCheckedChange={() => toggleStage(s.id)}
                        style={{ borderRadius: 3 }}
                        disabled={customMode}
                      />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}

                  {/* Personalizzato — invio di prova a un singolo indirizzo */}
                  <div className="h-px bg-border my-1" />
                  <label className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={customMode}
                      onCheckedChange={(v) => {
                        const on = !!v;
                        setCustomMode(on);
                        if (on) setSelectedStages([]); // deseleziona tutte le pipeline
                      }}
                      style={{ borderRadius: 3 }}
                    />
                    <span className="text-sm font-medium">Personalizzato — email di prova</span>
                  </label>
                  {customMode && (
                    <div className="px-2 pb-2 pt-0.5">
                      <Input
                        type="email"
                        value={customEmail}
                        onChange={e => setCustomEmail(e.target.value)}
                        placeholder="inserisci indirizzo email"
                        className="h-8 text-sm"
                        autoFocus
                      />
                      {customEmail.trim() && !customEmailValid && (
                        <p className="text-[11px] text-destructive mt-1">Email non valida</p>
                      )}
                      {customActive && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Invio SOLO a questo indirizzo (le pipeline sono ignorate).
                        </p>
                      )}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                <Users className="h-3.5 w-3.5" />
                {customActive ? (
                  <span>Invio di prova a <strong className="text-foreground">1 indirizzo</strong> ({customEmail.trim()})</span>
                ) : (
                  <>
                    <strong className="text-foreground tabular-nums">{recipients.length}</strong>
                    contatti con email riceveranno questa newsletter
                    {selectedStages.length === 0 && (
                      <span className="text-destructive">· seleziona almeno una pipeline</span>
                    )}
                    {allSelected && noEmailCount > 0 && (
                      <span>· {noEmailCount} senza email escluse</span>
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Oggetto</Label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Es. Novità di settembre — Pratica Rapida"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Contenuto</Label>
              <RichTextEditor key={editorKey} html={body} onChange={setBody} />
              <p className="text-[11px] text-muted-foreground">
                Usa la barra per grassetto, corsivo, sottolineato e dimensione del testo.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!htmlHasText(body)}>
                <Eye className="h-4 w-4 mr-1.5" /> Anteprima
              </Button>
              <Button onClick={() => setConfirmSend(true)} disabled={!canSend} className="ml-auto">
                <Send className="h-4 w-4 mr-1.5" /> Invia newsletter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Anteprima live */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> Anteprima
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-4 overflow-auto max-h-[520px]">
              {subject.trim() && (
                <p className="text-sm font-semibold mb-3 pb-3 border-b">
                  <span className="text-muted-foreground font-normal">Oggetto: </span>{subject}
                </p>
              )}
              {htmlHasText(body) ? (
                <div dangerouslySetInnerHTML={{ __html: wrapPreview(body) }} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">
                  L'anteprima della newsletter apparirà qui.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Newsletter inviate
            <Badge variant="secondary" className="ml-1">{history.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessuna newsletter inviata finora.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map(n => (
                <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{n.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />{n.targetLabel}
                      </span>
                      <span>·</span>
                      <span>{format(new Date(n.sentAt), "d MMM yyyy 'alle' HH:mm", { locale: it })}</span>
                      {n.sentBy && (<><span>·</span><span>{n.sentBy}</span></>)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-emerald-700 border-emerald-200 gap-1">
                      <CheckCircle2 className="h-3 w-3" />{n.ok}
                    </Badge>
                    {n.fail > 0 && (
                      <Badge variant="outline" className="text-destructive border-destructive/30 gap-1">
                        <XCircle className="h-3 w-3" />{n.fail}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog anteprima full */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anteprima — {subject || "(nessun oggetto)"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            <div dangerouslySetInnerHTML={{ __html: wrapPreview(body) }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Conferma invio */}
      <Dialog open={confirmSend} onOpenChange={(o) => !sending && setConfirmSend(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confermi l'invio?</DialogTitle>
            <DialogDescription>
              Stai per inviare la newsletter <strong>"{subject}"</strong> a{" "}
              <strong>{recipients.length} aziende</strong> ({targetLabel}).
              L'operazione invia email reali e non è annullabile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)} disabled={sending}>
              Annulla
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending
                ? (<><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Invio in corso…</>)
                : (<><Send className="h-4 w-4 mr-1.5" /> Invia a {recipients.length}</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
