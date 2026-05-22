import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Settings, Building2, User, Phone, Mail, MapPin, Globe, PhoneCall,
  ChevronRight, Pencil, Trash2, X, MoreHorizontal, Sparkles, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ── Types ───────────────────────────────────────────────────────────────────

interface CrmStage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface CrmLead {
  id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  note: string | null;
  source: string;          // 'public_form' | 'manual' | 'whatsapp' | 'import'
  page_url: string | null;
  stage_id: string;
  contacted_at: string | null;
  contacted_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  ragione_sociale: string;
  email: string | null;
  telefono: string | null;
  settore: string | null;
  piva: string | null;
  is_active?: boolean;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_STAGES: CrmStage[] = [
  { id: "lead",       name: "Nuovo Lead",       color: "#6366f1", order: 0 },
  { id: "contatto",   name: "Primo Contatto",    color: "#f59e0b", order: 1 },
  { id: "demo",       name: "Demo Programmata",  color: "#8b5cf6", order: 2 },
  { id: "onboarding", name: "In Onboarding",     color: "#3b82f6", order: 3 },
  { id: "attivo",     name: "Cliente Attivo",    color: "#10b981", order: 4 },
];

const KEY_STAGES      = "crm_pipeline_stages";
const KEY_ASSIGNMENTS = "crm_company_stages";

const SOURCE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  public_form: { label: "Modulo web", bg: "hsla(152,80%,40%,0.12)", color: "hsl(152 80% 30%)" },
  whatsapp:    { label: "WhatsApp",   bg: "hsla(122,80%,40%,0.12)", color: "hsl(122 80% 30%)" },
  import:      { label: "Import",     bg: "hsla(220,80%,55%,0.12)", color: "hsl(220 80% 35%)" },
  manual:      { label: "Aggiunto",   bg: "hsla(0,0%,50%,0.12)",    color: "hsl(0 0% 35%)" },
};

// ── Helper ───────────────────────────────────────────────────────────────────

async function upsertSetting(key: string, value: unknown) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AziendePipeline() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showStageManager, setShowStageManager] = useState(false);
  const [showAddLead, setShowAddLead]           = useState(false);
  const [editingStage, setEditingStage]         = useState<CrmStage | null>(null);
  const [newStage, setNewStage]                 = useState({ name: "", color: "#6366f1" });
  const [leadForm, setLeadForm]                 = useState({
    nome: "", cognome: "", email: "", telefono: "", citta: "", note: "",
  });
  const [editingLead, setEditingLead]           = useState<CrmLead | null>(null);
  const [confirmDeleteLead, setConfirmDeleteLead] = useState<CrmLead | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  // staleTime alti su dati semi-statici (cambiano solo via admin UI):
  // - crm_stages: configurazione pipeline (raro)
  // - crm_assignments: assegnazioni azienda → stage (cambiano via drag&drop,
  //   ma quando cambia invalida via onSuccess della mutation → refresh
  //   forzato non serve)
  // - admin-companies: lista aziende (poche modifiche/giorno)
  // Senza staleTime, ogni mount del componente (apertura tab/dialog/route)
  // refetch immediato anche se i dati sono freschi → tempo morto UI.
  const { data: stages = DEFAULT_STAGES } = useQuery<CrmStage[]>({
    queryKey: ["crm_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_STAGES).single();
      return (data?.value as CrmStage[]) ?? DEFAULT_STAGES;
    },
    staleTime: 10 * 60 * 1000, // 10min
  });

  const { data: assignments = {} } = useQuery<Record<string, string>>({
    queryKey: ["crm_assignments"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_ASSIGNMENTS).single();
      return (data?.value as Record<string, string>) ?? {};
    },
    staleTime: 5 * 60 * 1000, // 5min — invalidato esplicitamente da moveCompany
  });

  const { data: leads = [] } = useQuery<CrmLead[]>({
    queryKey: ["crm_leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmLead[];
    },
    staleTime: 2 * 60 * 1000, // 2min — lead può arrivare via realtime/manuale
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("id, ragione_sociale, email, telefono, settore, piva, created_at")
        .order("ragione_sociale");
      if (error) throw error;
      return data as Company[];
    },
    staleTime: 10 * 60 * 1000, // 10min — aziende cambiano raramente
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const moveCompany = useMutation({
    mutationFn: async ({ companyId, stageId }: { companyId: string; stageId: string }) => {
      await upsertSetting(KEY_ASSIGNMENTS, { ...assignments, [companyId]: stageId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_assignments"] }),
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const moveLead = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const { error } = await supabase.from("leads").update({ stage_id: stageId }).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_leads"] }),
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const addLead = useMutation({
    mutationFn: async () => {
      if (!leadForm.nome.trim()) throw new Error("Il nome è obbligatorio");
      if (!leadForm.email.trim() && !leadForm.telefono.trim())
        throw new Error("Inserisci almeno email o telefono");
      const { error } = await supabase.from("leads").insert({
        nome: leadForm.nome.trim(),
        cognome: leadForm.cognome.trim() || null,
        email: leadForm.email.trim() || null,
        telefono: leadForm.telefono.trim() || null,
        citta: leadForm.citta.trim() || null,
        note: leadForm.note.trim() || null,
        source: "manual",
        stage_id: sortedStages[0]?.id ?? "lead",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_leads"] });
      setShowAddLead(false);
      setLeadForm({ nome: "", cognome: "", email: "", telefono: "", citta: "", note: "" });
      toast({ title: "Lead aggiunto" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteLead = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_leads"] }),
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  /** Mark a lead as contacted (set contacted_at = now). */
  const markContactedMut = useMutation({
    mutationFn: async (leadId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("leads")
        .update({ contacted_at: new Date().toISOString(), contacted_by: user?.id ?? null })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_leads"] });
      toast({ title: "Lead segnato come contattato" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  /** Update an existing lead — used by the edit dialog. */
  const updateLeadMut = useMutation({
    mutationFn: async (lead: CrmLead) => {
      if (!lead.nome.trim()) throw new Error("Il nome è obbligatorio");
      if (!lead.email?.trim() && !lead.telefono?.trim())
        throw new Error("Inserisci almeno email o telefono");
      const { error } = await supabase.from("leads").update({
        nome: lead.nome.trim(),
        cognome: lead.cognome?.trim() || null,
        email: lead.email?.trim() || null,
        telefono: lead.telefono?.trim() || null,
        citta: lead.citta?.trim() || null,
        note: lead.note?.trim() || null,
      }).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_leads"] });
      setEditingLead(null);
      toast({ title: "Lead aggiornato" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  /** Soft-archive a lead (hides from board but preserves the record). */
  const archiveLeadMut = useMutation({
    mutationFn: async (leadId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("leads")
        .update({ archived_at: new Date().toISOString(), archived_by: user?.id ?? null })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_leads"] });
      toast({ title: "Lead archiviato" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const saveStages = useMutation({
    mutationFn: async (newStages: CrmStage[]) => {
      await upsertSetting(KEY_STAGES, newStages);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast({ title: "Fasi aggiornate" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // ── Stage helpers ─────────────────────────────────────────────────────────

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const addStage = () => {
    if (!newStage.name.trim()) return;
    const stage: CrmStage = {
      id: crypto.randomUUID(),
      name: newStage.name.trim(),
      color: newStage.color,
      order: stages.length,
    };
    saveStages.mutate([...stages, stage]);
    setNewStage({ name: "", color: "#6366f1" });
  };

  const updateStage = (updated: CrmStage) => {
    saveStages.mutate(stages.map(s => s.id === updated.id ? updated : s));
    setEditingStage(null);
  };

  const deleteStage = (stageId: string) => {
    saveStages.mutate(stages.filter(s => s.id !== stageId));
  };

  // ── Per-column data ───────────────────────────────────────────────────────

  const getCompaniesForStage = (stageId: string) => {
    const isFirst = sortedStages[0]?.id === stageId;
    return companies.filter(c => {
      const assigned = assignments[c.id];
      return assigned ? assigned === stageId : isFirst;
    });
  };

  const getLeadsForStage = (stageId: string) =>
    leads.filter(l => l.stage_id === stageId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{companies.length} aziende</span>
          <span>·</span>
          <span>{leads.length} lead</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddLead(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Lead
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowStageManager(true)}>
            <Settings className="h-4 w-4 mr-1.5" />Gestisci fasi
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: "65vh" }}>
        {sortedStages.map(stage => {
          const stageCompanies = getCompaniesForStage(stage.id);
          const stageLeads     = getLeadsForStage(stage.id);
          const total          = stageCompanies.length + stageLeads.length;

          return (
            <div key={stage.id} className="flex-shrink-0 w-72 flex flex-col gap-2">
              {/* Column header */}
              <div className="flex items-center gap-2 px-1 mb-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                <span className="font-semibold text-sm flex-1 truncate">{stage.name}</span>
                <Badge variant="secondary" className="text-xs tabular-nums">{total}</Badge>
              </div>

              {/* Lead cards */}
              {stageLeads.map(lead => {
                const sb = SOURCE_BADGE[lead.source] ?? SOURCE_BADGE.manual;
                const isNew = lead.source === "public_form" && !lead.contacted_at;
                return (
                  <Card
                    key={lead.id}
                    className={`border-l-[3px] hover:shadow-sm transition-shadow ${
                      isNew ? "ring-1 ring-emerald-500/40 shadow-emerald-100" : ""
                    }`}
                    style={{ borderLeftColor: stage.color }}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isNew ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isNew ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">
                              {lead.nome} {lead.cognome ?? ""}
                            </p>
                            {lead.citta && (
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />{lead.citta}
                              </p>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 -mr-1">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[200px]">
                            <DropdownMenuItem onClick={() => setEditingLead(lead)}>
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifica dettagli
                            </DropdownMenuItem>
                            {!lead.contacted_at && (
                              <DropdownMenuItem onClick={() => markContactedMut.mutate(lead.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Segna come contattato
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {sortedStages.filter(s => s.id !== stage.id).map(s => (
                              <DropdownMenuItem
                                key={s.id}
                                onClick={() => moveLead.mutate({ leadId: lead.id, stageId: s.id })}
                              >
                                <ChevronRight className="h-3.5 w-3.5 mr-1.5" />Sposta in: {s.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => archiveLeadMut.mutate(lead.id)}>
                              <X className="h-3.5 w-3.5 mr-1.5" />Archivia
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setConfirmDeleteLead(lead)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Elimina definitivamente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Quick actions for calling — prominent so staff can call/email in 1 click */}
                      <div className="flex items-center gap-1.5">
                        {lead.telefono && (
                          <a
                            href={`tel:${lead.telefono}`}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span className="truncate">{lead.telefono}</span>
                          </a>
                        )}
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors min-w-0"
                            onClick={e => e.stopPropagation()}
                            title={lead.email}
                          >
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">Email</span>
                          </a>
                        )}
                      </div>

                      {lead.note && (
                        <p className="text-xs text-muted-foreground line-clamp-2 italic border-l-2 border-border pl-2">
                          “{lead.note}”
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{ backgroundColor: sb.bg, color: sb.color }}
                        >
                          {sb.label}
                        </span>
                        {lead.contacted_at ? (
                          <span className="text-[10px] text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Contattato {format(new Date(lead.contacted_at), "d MMM", { locale: it })}
                          </span>
                        ) : isNew ? (
                          <span className="text-[10px] font-bold text-emerald-700">DA CHIAMARE</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(lead.created_at), "d MMM", { locale: it })}
                          </span>
                        )}
                      </div>
                      {lead.page_url && (
                        <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1 truncate">
                          <Globe className="h-2.5 w-2.5 shrink-0" />Da: {lead.page_url.replace(/^https?:\/\//, "")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Company cards */}
              {stageCompanies.map(company => (
                <Card
                  key={company.id}
                  className="border-l-[3px] hover:shadow-sm transition-shadow"
                  style={{ borderLeftColor: stage.color }}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <p className="font-medium text-sm truncate">{company.ragione_sociale}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 -mr-1">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sortedStages.filter(s => s.id !== stage.id).map(s => (
                            <DropdownMenuItem
                              key={s.id}
                              onClick={() => moveCompany.mutate({ companyId: company.id, stageId: s.id })}
                            >
                              <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
                              {s.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {company.email && (
                      <a
                        href={`mailto:${company.email}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{company.email}</span>
                      </a>
                    )}
                    {company.telefono && (
                      <a
                        href={`tel:${company.telefono}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Phone className="h-3 w-3 shrink-0" />{company.telefono}
                      </a>
                    )}

                    <div className="flex items-center justify-between">
                      {company.settore ? (
                        <Badge variant="outline" className="text-[10px] px-1.5">{company.settore}</Badge>
                      ) : <span />}
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(company.created_at), "d MMM yyyy", { locale: it })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Empty column */}
              {total === 0 && (
                <div className="border border-dashed rounded-xl p-5 text-center flex-1">
                  <p className="text-xs text-muted-foreground">Nessun elemento</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stage manager */}
      <Dialog open={showStageManager} onOpenChange={setShowStageManager}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestisci Fasi Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {sortedStages.map(stage => (
              <div key={stage.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                {editingStage?.id === stage.id ? (
                  <>
                    <input
                      type="color"
                      value={editingStage.color}
                      onChange={e => setEditingStage({ ...editingStage, color: e.target.value })}
                      className="w-8 h-7 rounded cursor-pointer border border-border p-0.5 bg-transparent"
                    />
                    <Input
                      value={editingStage.name}
                      onChange={e => setEditingStage({ ...editingStage, name: e.target.value })}
                      className="h-7 text-sm flex-1"
                      onKeyDown={e => e.key === "Enter" && updateStage(editingStage)}
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => updateStage(editingStage)}>
                      Salva
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingStage(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                    <span className="text-sm flex-1">{stage.name}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingStage(stage)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteStage(stage.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2 border-t">
              <input
                type="color"
                value={newStage.color}
                onChange={e => setNewStage(s => ({ ...s, color: e.target.value }))}
                className="w-10 h-9 rounded cursor-pointer border border-border p-0.5 bg-transparent flex-shrink-0"
              />
              <Input
                placeholder="Nome nuova fase..."
                value={newStage.name}
                onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))}
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && addStage()}
              />
              <Button onClick={addStage} disabled={!newStage.name.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add lead dialog */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={leadForm.nome} onChange={e => setLeadForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <Label>Cognome</Label>
                <Input value={leadForm.cognome} onChange={e => setLeadForm(f => ({ ...f, cognome: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefono</Label>
                <Input value={leadForm.telefono} onChange={e => setLeadForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div>
                <Label>Città</Label>
                <Input value={leadForm.citta} onChange={e => setLeadForm(f => ({ ...f, citta: e.target.value }))} placeholder="Milano" />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={leadForm.note}
                onChange={e => setLeadForm(f => ({ ...f, note: e.target.value }))}
                rows={3}
                placeholder="Provenienza, interesse, dettagli..."
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Almeno email o telefono richiesti per ricontattare il lead.
            </p>
            <Button
              onClick={() => addLead.mutate()}
              disabled={!leadForm.nome.trim() || (!leadForm.email.trim() && !leadForm.telefono.trim()) || addLead.isPending}
            >
              {addLead.isPending ? "Aggiunta..." : "Aggiungi Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit lead dialog */}
      <Dialog open={!!editingLead} onOpenChange={(o) => !o && setEditingLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Lead</DialogTitle>
          </DialogHeader>
          {editingLead && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome *</Label>
                  <Input
                    value={editingLead.nome}
                    onChange={(e) => setEditingLead({ ...editingLead, nome: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cognome</Label>
                  <Input
                    value={editingLead.cognome ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, cognome: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingLead.email ?? ""}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefono</Label>
                  <Input
                    value={editingLead.telefono ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Città</Label>
                  <Input
                    value={editingLead.citta ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, citta: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Note</Label>
                <Textarea
                  rows={3}
                  value={editingLead.note ?? ""}
                  onChange={(e) => setEditingLead({ ...editingLead, note: e.target.value })}
                />
              </div>
              {editingLead.page_url && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" />Provenienza: {editingLead.page_url}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingLead(null)}>Annulla</Button>
                <Button
                  onClick={() => editingLead && updateLeadMut.mutate(editingLead)}
                  disabled={!editingLead.nome.trim() || (!editingLead.email?.trim() && !editingLead.telefono?.trim()) || updateLeadMut.isPending}
                >
                  {updateLeadMut.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDeleteLead} onOpenChange={(o) => !o && setConfirmDeleteLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente <strong>{confirmDeleteLead?.nome} {confirmDeleteLead?.cognome ?? ""}</strong>.
              Questa azione non è reversibile e perderai tutti i dati di contatto e cronologia.
              <span className="block mt-2 text-amber-700">
                💡 Considera di archiviare il lead invece di eliminarlo: rimane recuperabile.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteLead) {
                  deleteLead.mutate(confirmDeleteLead.id);
                  setConfirmDeleteLead(null);
                }
              }}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
