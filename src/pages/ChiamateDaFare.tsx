import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Phone, PhoneCall, PhoneOff, Search, ExternalLink, CheckCircle2,
  AlertTriangle, Clock, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEneaPractices } from "@/hooks/useEneaPractices";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ── Costanti ──────────────────────────────────────────────────────────────────

// Le prime due stage della pipeline: è qui che vivono i clienti da chiamare
// per ricordare di compilare il form. Appena il form è compilato la pratica
// avanza a "pronte_da_fare" e sparisce automaticamente da questa coda.
const CALL_STAGE_TYPES = ["inviata", "attesa_compilazione"] as const;

// Soglia settimanale: chi non è chiamato da ≥ 7 giorni (o mai) è "da richiamare".
const RICHIAMO_GIORNI = 7;

const CALLERS = [
  { value: "samuele", label: "Samuele" },
  { value: "giuliano", label: "Giuliano" },
] as const;

const CALLER_LABEL: Record<string, string> = {
  samuele: "Samuele",
  giuliano: "Giuliano",
};

type AssignFilter = "tutti" | "samuele" | "giuliano" | "non_assegnati";

// ── Tipi ──────────────────────────────────────────────────────────────────────

interface PhoneLogRow {
  practice_id: string;
  sent_at: string;
  outcome: string | null;
  notes: string | null;
}

interface CallStats {
  count: number;
  lastAt: string | null;
  lastOutcome: string | null;
}

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function ChiamateDaFare() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("tutti");
  const [onlyDue, setOnlyDue] = useState(false);
  const [callTarget, setCallTarget] = useState<null | {
    id: string; nome: string;
  }>(null);

  // Tutte le pratiche attive (non archiviate), tutti i brand. Il filtro sulle
  // prime due stage + form non compilato è client-side (sotto).
  const { data: practices = [], isLoading, isError } = useEneaPractices({
    includeArchived: false,
  });

  // Coda "da chiamare": prime due stage, form non ancora compilato, e non
  // "documenti_forniti" (quei clienti non vanno mai chiamati per il form).
  const queue = useMemo(() => {
    return practices.filter((p) => {
      const stageType = p.pipeline_stages?.stage_type;
      if (!stageType || !CALL_STAGE_TYPES.includes(stageType as typeof CALL_STAGE_TYPES[number])) return false;
      if (p.form_compilato_at) return false;
      if (p.tipo_servizio === "documenti_forniti") return false;
      return true;
    });
  }, [practices]);

  const practiceIds = useMemo(() => queue.map((p) => p.id), [queue]);

  // Storico chiamate (canale telefono) per le pratiche in coda. Una sola query
  // su communication_log_public: le stesse righe registrate/lette dalla card
  // cliente nel Kanban → coda e card restano sempre coordinate.
  const { data: phoneLog = [] } = useQuery<PhoneLogRow[]>({
    queryKey: ["chiamate-phone-log", practiceIds],
    enabled: practiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_log_public")
        .select("practice_id, sent_at, outcome, notes")
        .eq("channel", "phone")
        .in("practice_id", practiceIds)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PhoneLogRow[];
    },
  });

  // Aggrega per pratica: n° chiamate, ultima chiamata, ultimo esito.
  const statsByPractice = useMemo(() => {
    const map = new Map<string, CallStats>();
    for (const row of phoneLog) {
      const s = map.get(row.practice_id);
      if (!s) {
        // phoneLog è ordinato desc → la prima riga vista è la più recente.
        map.set(row.practice_id, { count: 1, lastAt: row.sent_at, lastOutcome: row.outcome });
      } else {
        s.count += 1;
      }
    }
    return map;
  }, [phoneLog]);

  function daysSince(dateIso: string | null): number | null {
    if (!dateIso) return null;
    return differenceInCalendarDays(new Date(), new Date(dateIso));
  }

  // Righe arricchite + ordinamento: "da richiamare" (mai chiamato prima, poi
  // più giorni di attesa) in cima.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const enriched = queue.map((p) => {
      const stats = statsByPractice.get(p.id) ?? { count: 0, lastAt: null, lastOutcome: null };
      const days = daysSince(stats.lastAt);
      const isDue = stats.lastAt == null || (days != null && days >= RICHIAMO_GIORNI);
      return { p, stats, days, isDue };
    });

    return enriched
      .filter(({ p, isDue }) => {
        if (assignFilter === "non_assegnati" && p.chiamate_assegnato_a) return false;
        if (assignFilter === "samuele" && p.chiamate_assegnato_a !== "samuele") return false;
        if (assignFilter === "giuliano" && p.chiamate_assegnato_a !== "giuliano") return false;
        if (onlyDue && !isDue) return false;
        if (term) {
          const hay = `${p.cliente_nome} ${p.cliente_cognome} ${p.cliente_telefono ?? ""} ${p.companies?.ragione_sociale ?? ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Mai chiamati in cima, poi per giorni di attesa decrescenti.
        const da = a.days == null ? Number.MAX_SAFE_INTEGER : a.days;
        const db = b.days == null ? Number.MAX_SAFE_INTEGER : b.days;
        return db - da;
      });
  }, [queue, statsByPractice, search, assignFilter, onlyDue]);

  const dueCount = useMemo(
    () => rows.filter((r) => r.isDue).length,
    [rows],
  );

  // Assegnazione chiamante (update diretto su enea_practices; la view espone
  // il campo solo agli interni). Non usiamo useUpdateEneaPractice per non
  // invalidare l'intera board: aggiorniamo solo la cache locale.
  async function assign(practiceId: string, value: string | null) {
    const { error } = await supabase
      .from("enea_practices")
      .update({ chiamate_assegnato_a: value })
      .eq("id", practiceId);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
  }

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: ["chiamate-phone-log"] });
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chiamate</h1>
            <p className="text-xs text-muted-foreground">
              Clienti nelle prime due fasi che non hanno ancora compilato il form —
              da richiamare una volta a settimana.
            </p>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard
          label="Da chiamare"
          value={queue.length}
          icon={<Phone className="h-4 w-4" />}
          tone="neutral"
        />
        <StatCard
          label="Da richiamare oggi"
          value={dueCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="danger"
        />
        <StatCard
          label="Non assegnati"
          value={queue.filter((p) => !p.chiamate_assegnato_a).length}
          icon={<User className="h-4 w-4" />}
          tone="neutral"
        />
      </div>

      {/* Filtri */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, telefono o azienda…"
            className="pl-9"
          />
        </div>
        <Select value={assignFilter} onValueChange={(v) => setAssignFilter(v as AssignFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i chiamanti</SelectItem>
            <SelectItem value="samuele">Samuele</SelectItem>
            <SelectItem value="giuliano">Giuliano</SelectItem>
            <SelectItem value="non_assegnati">Non assegnati</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={onlyDue ? "default" : "outline"}
          onClick={() => setOnlyDue((v) => !v)}
          className="gap-1.5 whitespace-nowrap"
        >
          <AlertTriangle className="h-4 w-4" />
          Solo da richiamare
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Caricamento…</p>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">Errore nel caricamento.</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium">Nessun cliente da chiamare</p>
          <p className="text-xs">Tutti i clienti delle prime due fasi hanno compilato il form o non rientrano nei filtri.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ p, stats, days, isDue }) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                isDue ? "border-red-300 bg-red-50/40" : ""
              }`}
            >
              {/* Cliente */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">
                    {p.cliente_nome} {p.cliente_cognome}
                  </span>
                  {p.pipeline_stages?.name && (
                    <Badge variant="outline" className="text-[10px]">
                      {p.pipeline_stages.name}
                    </Badge>
                  )}
                  {p.companies?.ragione_sociale && (
                    <span className="text-xs text-muted-foreground truncate">
                      · {p.companies.ragione_sociale}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  {p.cliente_telefono ? (
                    <a
                      href={`tel:${p.cliente_telefono}`}
                      className="inline-flex items-center gap-1 text-foreground hover:text-violet-600"
                    >
                      <Phone className="h-3 w-3" />
                      {p.cliente_telefono}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 italic">
                      <PhoneOff className="h-3 w-3" /> nessun telefono
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {stats.lastAt
                      ? `Ultima: ${days === 0 ? "oggi" : days === 1 ? "ieri" : `${days} giorni fa`}`
                      : "Mai chiamato"}
                  </span>
                  <span>
                    Chiamate: <span className="font-medium text-foreground">{stats.count}</span>
                  </span>
                  {stats.lastOutcome && (
                    <span className={stats.lastOutcome === "risposta_ottenuta" ? "text-emerald-600" : "text-amber-600"}>
                      {stats.lastOutcome === "risposta_ottenuta" ? "Ha risposto" : "Non ha risposto"}
                    </span>
                  )}
                </div>
              </div>

              {/* Indicatore da richiamare */}
              {isDue && (
                <Badge className="bg-red-500 hover:bg-red-500 text-white shrink-0">
                  Da richiamare
                </Badge>
              )}

              {/* Assegnazione */}
              <Select
                value={p.chiamate_assegnato_a ?? "nessuno"}
                onValueChange={(v) => assign(p.id, v === "nessuno" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-36 h-9">
                  <SelectValue placeholder="Chiamato da" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">— Non assegnato</SelectItem>
                  {CALLERS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Azioni */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCallTarget({ id: p.id, nome: `${p.cliente_nome} ${p.cliente_cognome}` })}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Registra
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
                  <Link to={`/kanban?practice=${p.id}`} title="Apri scheda cliente">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog registra chiamata */}
      <RegistraChiamataDialog
        target={callTarget}
        onClose={() => setCallTarget(null)}
        onSaved={() => { setCallTarget(null); refetchAll(); }}
      />
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, tone,
}: {
  label: string; value: number; icon: React.ReactNode; tone: "neutral" | "danger";
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={tone === "danger" && value > 0 ? "text-red-500" : "text-muted-foreground"}>
          {icon}
        </span>
      </div>
      <p className={`text-2xl font-bold mt-1 ${tone === "danger" && value > 0 ? "text-red-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ── Dialog registra chiamata ──────────────────────────────────────────────────
// Inserisce nella stessa tabella (communication_log, canale phone) usata dalla
// card cliente nel Kanban → esito e note compaiono anche lì.

function RegistraChiamataDialog({
  target, onClose, onSaved,
}: {
  target: null | { id: string; nome: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState("non_risposto");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if (!target) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("communication_log").insert({
        practice_id: target.id,
        channel: "phone",
        direction: "outbound",
        recipient: "manual",
        subject: outcome === "risposta_ottenuta" ? "Risposta ottenuta" : "Non risposto",
        body_preview: notes.trim() || null,
        status: "sent",
        sent_at: new Date().toISOString(),
        outcome,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Chiamata registrata" });
      setOutcome("non_risposto");
      setNotes("");
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore registrazione chiamata";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registra chiamata{target ? ` — ${target.nome}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Esito chiamata</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_risposto">Non risposto</SelectItem>
                <SelectItem value="risposta_ottenuta">Risposta ottenuta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Note (opzionale)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Es: ha detto che compila il form entro venerdì…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={submitting}>
            {submitting ? "Salvataggio…" : "Salva chiamata"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
