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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Settings, Building2, User, Phone, Mail,
  ChevronRight, Pencil, Trash2, X, MoreHorizontal,
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
  cognome: string;
  email: string;
  telefono: string;
  stage_id: string;
  note: string;
  created_at: string;
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
const KEY_LEADS       = "crm_leads";

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
    nome: "", cognome: "", email: "", telefono: "", note: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: stages = DEFAULT_STAGES } = useQuery<CrmStage[]>({
    queryKey: ["crm_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_STAGES).single();
      return (data?.value as CrmStage[]) ?? DEFAULT_STAGES;
    },
  });

  const { data: assignments = {} } = useQuery<Record<string, string>>({
    queryKey: ["crm_assignments"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_ASSIGNMENTS).single();
      return (data?.value as Record<string, string>) ?? {};
    },
  });

  const { data: leads = [] } = useQuery<CrmLead[]>({
    queryKey: ["crm_leads"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings")
        .select("value").eq("key", KEY_LEADS).single();
      return (data?.value as CrmLead[]) ?? [];
    },
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
      await upsertSetting(KEY_LEADS, leads.map(l => l.id === leadId ? { ...l, stage_id: stageId } : l));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_leads"] }),
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const addLead = useMutation({
    mutationFn: async () => {
      const newLead: CrmLead = {
        id: crypto.randomUUID(),
        ...leadForm,
        stage_id: sortedStages[0]?.id ?? "lead",
        created_at: new Date().toISOString(),
      };
      await upsertSetting(KEY_LEADS, [...leads, newLead]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_leads"] });
      setShowAddLead(false);
      setLeadForm({ nome: "", cognome: "", email: "", telefono: "", note: "" });
      toast({ title: "Lead aggiunto" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteLead = useMutation({
    mutationFn: async (leadId: string) => {
      await upsertSetting(KEY_LEADS, leads.filter(l => l.id !== leadId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm_leads"] }),
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
              {stageLeads.map(lead => (
                <Card
                  key={lead.id}
                  className="border-l-[3px] hover:shadow-sm transition-shadow"
                  style={{ borderLeftColor: stage.color }}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-sm truncate">
                          {lead.nome} {lead.cognome}
                        </p>
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
                              onClick={() => moveLead.mutate({ leadId: lead.id, stageId: s.id })}
                            >
                              <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
                              {s.name}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteLead.mutate(lead.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </a>
                    )}
                    {lead.telefono && (
                      <a
                        href={`tel:${lead.telefono}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Phone className="h-3 w-3 shrink-0" />{lead.telefono}
                      </a>
                    )}
                    {lead.note && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{lead.note}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] px-1.5">Lead</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(lead.created_at), "d MMM", { locale: it })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}

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
                <Label>Nome</Label>
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
            <div>
              <Label>Telefono</Label>
              <Input value={leadForm.telefono} onChange={e => setLeadForm(f => ({ ...f, telefono: e.target.value }))} />
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
            <Button
              onClick={() => addLead.mutate()}
              disabled={!leadForm.nome.trim() || addLead.isPending}
            >
              {addLead.isPending ? "Aggiunta..." : "Aggiungi Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
