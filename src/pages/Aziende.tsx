import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Plus, Search, Receipt, Users, FolderOpen, LogIn,
  ChevronDown, BarChart3, TrendingUp, CircleDollarSign, CalendarDays, CheckCircle2, Clock,
  ShieldOff, ShieldCheck, LayoutDashboard, Eye, EyeOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { isSuperAdmin } from "@/hooks/useAuth";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface CompanyStats {
  statoCounts: Record<string, number>;
  totalPratiche: number;
  totalRevenue: number;
  revenuePagata: number;
  revenueDaIncassare: number;
  prezzoMedio: number;
}

type SortOption = "nome" | "pratiche" | "daIncassare" | "data";

export default function Aziende() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const { setImpersonatedCompany } = useCompany();
  const superAdmin = isSuperAdmin(roles);
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortOption>("nome");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");

  const [form, setForm] = useState({
    ragione_sociale: "", piva: "", codice_fiscale: "", email: "",
    telefono: "", indirizzo: "", citta: "", cap: "", provincia: "", settore: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("ragione_sociale");
      if (error) throw error;
      return data;
    },
  });

  const { data: companyStats = {} } = useQuery<Record<string, CompanyStats>>({
    queryKey: ["admin-pratiche-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("pratiche").select("company_id, stato, prezzo, pagamento_stato");
      const result: Record<string, CompanyStats> = {};
      (data || []).forEach(p => {
        if (!result[p.company_id]) {
          result[p.company_id] = { statoCounts: {}, totalPratiche: 0, totalRevenue: 0, revenuePagata: 0, revenueDaIncassare: 0, prezzoMedio: 0 };
        }
        const s = result[p.company_id];
        s.statoCounts[p.stato] = (s.statoCounts[p.stato] || 0) + 1;
        s.totalPratiche += 1;
        s.totalRevenue += Number(p.prezzo) || 0;
        if (p.pagamento_stato === "pagata") s.revenuePagata += Number(p.prezzo) || 0;
        if (p.stato === "completata" && p.pagamento_stato === "non_pagata") s.revenueDaIncassare += Number(p.prezzo) || 0;
      });
      Object.values(result).forEach(s => {
        s.prezzoMedio = s.totalPratiche > 0 ? s.totalRevenue / s.totalPratiche : 0;
      });
      return result;
    },
  });

  const { data: userCounts = {} } = useQuery({
    queryKey: ["admin-user-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("user_company_assignments").select("company_id");
      const counts: Record<string, number> = {};
      (data || []).forEach(a => { counts[a.company_id] = (counts[a.company_id] || 0) + 1; });
      return counts;
    },
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      const { ragione_sociale, email, password, piva, codice_fiscale, telefono, indirizzo, citta, cap, provincia, settore } = form;
      // Explicitly get session token to ensure it's passed (not anon key)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessione scaduta, rieffettua il login.");
      const response = await supabase.functions.invoke("create-company-user", {
        body: { ragione_sociale, email, password, piva, codice_fiscale, telefono, indirizzo, citta, cap, provincia, settore },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.error) {
        // Extract actual error message from function response body
        let msg = response.error.message;
        try {
          const ctx = (response.error as any).context;
          if (ctx) {
            const json = await ctx.json();
            if (json?.error) msg = json.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setShowCreate(false);
      setForm({ ragione_sociale: "", piva: "", codice_fiscale: "", email: "", telefono: "", indirizzo: "", citta: "", cap: "", provincia: "", settore: "", password: "" });
      setShowPassword(false);
      toast({ title: "Azienda creata", description: "Utente Auth e azienda creati con successo." });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const [showBlockDialog, setShowBlockDialog] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const blockCompany = useMutation({
    mutationFn: async ({ companyId, reason }: { companyId: string; reason: string }) => {
      if (!user) throw new Error("Utente non autenticato");
      const { error } = await supabase
        .from("companies")
        .update({
          is_active: false,
          blocked_at: new Date().toISOString(),
          blocked_by: user.id,
          blocked_reason: reason,
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setShowBlockDialog(null);
      setBlockReason("");
      toast({ title: "Account bloccato", description: "L'account è stato sospeso con successo." });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const unblockCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase
        .from("companies")
        .update({
          is_active: true,
          blocked_at: null,
          blocked_by: null,
          blocked_reason: null,
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Account sbloccato", description: "L'account è stato riattivato con successo." });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const list = companies.filter(c => {
      const matchSearch = `${c.ragione_sociale} ${c.piva} ${c.email}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && c.is_active !== false) ||
        (filterStatus === "suspended" && c.is_active === false);
      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      const statsA = companyStats[a.id] || { totalPratiche: 0 };
      const statsB = companyStats[b.id] || { totalPratiche: 0 };
      switch (sortBy) {
        case "pratiche":
          return statsB.totalPratiche - statsA.totalPratiche;
        case "daIncassare":
          return (companyStats[b.id]?.revenueDaIncassare || 0) - (companyStats[a.id]?.revenueDaIncassare || 0);
        case "data":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return a.ragione_sociale.localeCompare(b.ragione_sociale);
      }
    });

    return list;
  }, [companies, search, sortBy, companyStats, filterStatus]);

  // Aggregati
  const aggregates = useMemo(() => {
    const totalAziende = companies.length;
    const totalPratiche = Object.values(companyStats).reduce((s, c) => s + c.totalPratiche, 0);
    const totalDaIncassare = Object.values(companyStats).reduce((s, c) => s + c.revenueDaIncassare, 0);
    const totalUtenti = Object.values(userCounts).reduce((s, c) => s + c, 0);
    return { totalAziende, totalPratiche, totalDaIncassare, totalUtenti };
  }, [companies, companyStats, userCounts]);

  const togglePanel = (id: string) => {
    setOpenPanels(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Aziende</h1>
            <p className="text-muted-foreground">Gestisci tutte le aziende registrate</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nuova Azienda</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Crea Azienda</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Ragione Sociale *</Label><Input value={form.ragione_sociale} onChange={e => setForm(f => ({ ...f, ragione_sociale: e.target.value }))} /></div>
                  <div><Label>P.IVA</Label><Input value={form.piva} onChange={e => setForm(f => ({ ...f, piva: e.target.value }))} /></div>
                  <div><Label>Codice Fiscale</Label><Input value={form.codice_fiscale} onChange={e => setForm(f => ({ ...f, codice_fiscale: e.target.value }))} /></div>
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div>
                    <Label>Password *</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Min. 8 caratteri"
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div><Label>Telefono</Label><Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                  <div><Label>Settore</Label><Input value={form.settore} onChange={e => setForm(f => ({ ...f, settore: e.target.value }))} /></div>
                  <div><Label>Indirizzo</Label><Input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} /></div>
                  <div><Label>Città</Label><Input value={form.citta} onChange={e => setForm(f => ({ ...f, citta: e.target.value }))} /></div>
                  <div><Label>CAP</Label><Input value={form.cap} onChange={e => setForm(f => ({ ...f, cap: e.target.value }))} /></div>
                  <div><Label>Provincia</Label><Input value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} /></div>
                </div>
                <Button onClick={() => createCompany.mutate()} disabled={!form.ragione_sociale || !form.email || !form.password || form.password.length < 8 || createCompany.isPending}>
                  {createCompany.isPending ? "Creazione..." : "Crea Azienda"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={Building2} label="Aziende" value={String(aggregates.totalAziende)} />
          <SummaryCard icon={FolderOpen} label="Pratiche Totali" value={String(aggregates.totalPratiche)} />
          <SummaryCard icon={Receipt} label="Da Incassare" value={`€ ${aggregates.totalDaIncassare.toFixed(2)}`} />
          <SummaryCard icon={Users} label="Utenti Totali" value={String(aggregates.totalUtenti)} />
        </div>

        {/* Search + Sort + Count */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca aziende..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "all" | "active" | "suspended")}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="active">Solo attive</SelectItem>
              <SelectItem value="suspended">Solo sospese</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Ordina per" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome</SelectItem>
              <SelectItem value="pratiche">Pratiche</SelectItem>
              <SelectItem value="daIncassare">Da Incassare</SelectItem>
              <SelectItem value="data">Data registrazione</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          {filtered.length === companies.length
            ? `${companies.length} aziende`
            : `${filtered.length} di ${companies.length} aziende`}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="font-display text-lg font-semibold">Nessuna azienda</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map(c => {
              const stats = companyStats[c.id] || { statoCounts: {}, totalPratiche: 0, totalRevenue: 0, revenuePagata: 0, revenueDaIncassare: 0, prezzoMedio: 0 };
              const inCorso = (stats.statoCounts["bozza"] || 0) + (stats.statoCounts["inviata"] || 0) + (stats.statoCounts["in_lavorazione"] || 0) + (stats.statoCounts["in_attesa_documenti"] || 0);
              const isOpen = !!openPanels[c.id];
              return (
                <Collapsible key={c.id} open={isOpen} onOpenChange={() => togglePanel(c.id)}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/aziende/${c.id}`)}>
                              {c.ragione_sociale}
                            </p>
                            {c.is_active === false && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="destructive" className="shrink-0 text-xs cursor-default">Sospeso</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {c.blocked_at ? (
                                      <div>
                                        <p>Sospeso il {format(new Date(c.blocked_at), "dd MMM yyyy", { locale: it })}</p>
                                        {c.blocked_reason && <p className="text-xs opacity-80 mt-0.5">{c.blocked_reason}</p>}
                                      </div>
                                    ) : <p>Account sospeso</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            {c.piva && <span>P.IVA: {c.piva}</span>}
                            {c.email && <span>{c.email}</span>}
                            {c.settore && <Badge variant="outline" className="text-xs">{c.settore}</Badge>}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <StatWithTooltip icon={FolderOpen} value={stats.totalPratiche} label="Pratiche" />
                          <StatWithTooltip icon={CheckCircle2} value={stats.statoCounts["completata"] || 0} label="Completate" className="text-success" />
                          <StatWithTooltip icon={Clock} value={inCorso} label="In corso" className="text-warning" />
                          <StatWithTooltip icon={Users} value={userCounts[c.id] || 0} label="Utenti" />

                          {stats.revenueDaIncassare > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-warning cursor-default">
                                  <Receipt className="h-4 w-4" />
                                  <span className="text-sm font-semibold">€ {stats.revenueDaIncassare.toFixed(2)}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Da incassare</TooltipContent>
                            </Tooltip>
                          )}

                          {superAdmin && (
                            <Button variant="outline" size="sm" onClick={() => { setImpersonatedCompany(c.id, c.ragione_sociale); navigate("/pratiche"); }}>
                              <LogIn className="mr-1 h-4 w-4" />Accedi
                            </Button>
                          )}

                          {superAdmin && (
                            c.is_active !== false ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive border-destructive hover:bg-destructive/10"
                                onClick={() => { setShowBlockDialog(c.id); setBlockReason(""); }}
                              >
                                <ShieldOff className="mr-1 h-4 w-4" />Blocca
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-success border-success hover:bg-success/10"
                                onClick={() => unblockCompany.mutate(c.id)}
                                disabled={unblockCompany.isPending}
                              >
                                <ShieldCheck className="mr-1 h-4 w-4" />Sblocca
                              </Button>
                            )
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 gap-1 text-xs text-muted-foreground hover:text-primary"
                            title="Vedi pratiche"
                            onClick={() => navigate("/admin/pratiche")}
                          >
                            <LayoutDashboard className="h-3.5 w-3.5" />
                            Pipeline
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                              <span className="sr-only">Reportistica</span>
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent className="pt-4">
                        <div className="border-t pt-4 space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <KpiCard icon={TrendingUp} label="Revenue Totale" value={`€ ${stats.totalRevenue.toFixed(2)}`} />
                            <KpiCard icon={CircleDollarSign} label="Incassato" value={`€ ${stats.revenuePagata.toFixed(2)}`} className="text-success" />
                            <KpiCard icon={CircleDollarSign} label="Da Incassare" value={`€ ${stats.revenueDaIncassare.toFixed(2)}`} className="text-destructive" />
                            <KpiCard icon={BarChart3} label="Prezzo Medio" value={`€ ${stats.prezzoMedio.toFixed(2)}`} />
                            <KpiCard icon={Users} label="Utenti" value={String(userCounts[c.id] || 0)} />
                            <KpiCard icon={CalendarDays} label="Registrata" value={format(new Date(c.created_at), "dd MMM yyyy", { locale: it })} />
                          </div>

                          {stats.totalPratiche > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(Object.entries(STATO_CONFIG) as [PraticaStato, typeof STATO_CONFIG[PraticaStato]][]).map(([stato, cfg]) => {
                                const count = stats.statoCounts[stato] || 0;
                                if (count === 0) return null;
                                const Icon = cfg.icon;
                                return (
                                  <Badge key={stato} variant="outline" className={`text-[10px] gap-1 ${cfg.color}`}>
                                    <Icon className="h-3 w-3" />
                                    {cfg.label}: {count}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Block account dialog */}
        <Dialog open={!!showBlockDialog} onOpenChange={(o) => !o && setShowBlockDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Blocca Account Rivenditore</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                L'account verrà sospeso e il rivenditore non potrà più accedere alla piattaforma.
              </p>
              <div>
                <Label>Motivo del blocco</Label>
                <Textarea
                  placeholder="Inserisci il motivo del blocco..."
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => showBlockDialog && blockCompany.mutate({ companyId: showBlockDialog, reason: blockReason })}
                disabled={!blockReason.trim() || blockCompany.isPending}
              >
                {blockCompany.isPending ? "Blocco in corso..." : "Conferma Blocco"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatWithTooltip({ icon: Icon, value, label, className = "" }: { icon: React.ElementType; value: number; label: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 cursor-default ${className || "text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />{value}
        </div>
      </TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  );
}

function KpiCard({ icon: Icon, label, value, className = "" }: { icon: React.ElementType; label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${className}`}>{value}</p>
    </div>
  );
}
