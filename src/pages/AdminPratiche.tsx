import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderOpen, Search,
  Building2, ArrowRight, User, List, Columns3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STATO_CONFIG, STATO_ORDER } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

type ViewMode = "list" | "pipeline";

export default function AdminPratiche() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<string>("all");
  const [filterAzienda, setFilterAzienda] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["admin-all-pratiche"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, companies(ragione_sociale), clienti_finali(nome, cognome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-select"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale").order("ragione_sociale");
      return data || [];
    },
  });

  // Fetch internal operators (super_admin, admin_interno, operatore)
  const { data: internalOperators = [] } = useQuery({
    queryKey: ["admin-internal-operators"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "admin_interno", "operatore"]);
      if (error) throw error;
      const uniqueIds = [...new Set((roles || []).map(r => r.user_id))];
      if (!uniqueIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", uniqueIds);
      return profiles || [];
    },
  });

  const assigneeMap = useMemo(() => {
    const map: Record<string, { nome: string; cognome: string }> = {};
    internalOperators.forEach(p => { map[p.id] = p; });
    return map;
  }, [internalOperators]);

  const quickChangeStato = useMutation({
    mutationFn: async ({ praticaId, stato }: { praticaId: string; stato: PraticaStato }) => {
      const { error } = await supabase.from("pratiche").update({ stato }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      toast({ title: "Stato aggiornato" });
    },
  });

  const assignOperator = useMutation({
    mutationFn: async ({ praticaId, assegnatarioId }: { praticaId: string; assegnatarioId: string | null }) => {
      const { error } = await supabase.from("pratiche").update({ assegnatario_id: assegnatarioId }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      toast({ title: "Operatore assegnato" });
    },
  });

  const filtered = useMemo(() => {
    return pratiche.filter(p => {
      const matchSearch = `${p.titolo} ${(p.companies as any)?.ragione_sociale || ""} ${(p.clienti_finali as any)?.nome || ""} ${(p.clienti_finali as any)?.cognome || ""}`.toLowerCase().includes(search.toLowerCase());
      const matchStato = filterStato === "all" || p.stato === filterStato;
      const matchAzienda = filterAzienda === "all" || p.company_id === filterAzienda;
      return matchSearch && matchStato && matchAzienda;
    });
  }, [pratiche, search, filterStato, filterAzienda]);

  const pipelineData = useMemo(() => {
    const cols: Record<PraticaStato, typeof filtered> = {} as any;
    STATO_ORDER.forEach(s => { cols[s] = []; });
    filtered.forEach(p => { if (cols[p.stato]) cols[p.stato].push(p); });
    return cols;
  }, [filtered]);

  const handleAssignOperator = (praticaId: string, value: string) => {
    assignOperator.mutate({
      praticaId,
      assegnatarioId: value === "unassigned" ? null : value,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Tutte le Pratiche</h1>
        <p className="text-muted-foreground">Vista globale di tutte le pratiche di tutte le aziende</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca pratica, azienda o cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterStato} onValueChange={setFilterStato}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {STATO_ORDER.map(s => <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAzienda} onValueChange={setFilterAzienda}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Azienda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le aziende</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border bg-muted p-0.5">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "pipeline" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("pipeline")}>
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          {STATO_ORDER.map(stato => {
            const count = pratiche.filter(p => p.stato === stato).length;
            if (count === 0) return null;
            const conf = STATO_CONFIG[stato];
            return (
              <Badge key={stato} variant={filterStato === stato ? "default" : "outline"} className={`cursor-pointer ${filterStato !== stato ? conf.color : ""}`}
                onClick={() => setFilterStato(filterStato === stato ? "all" : stato)}>
                {conf.label}: {count}
              </Badge>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : viewMode === "list" ? (
        filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="font-display text-lg font-semibold">Nessuna pratica trovata</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(p => {
              const conf = STATO_CONFIG[p.stato];
              const Icon = conf.icon;
              const assignee = p.assegnatario_id ? assigneeMap[p.assegnatario_id] : null;
              return (
                <Card key={p.id} className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${conf.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/pratiche/${p.id}`)}>
                      <p className="font-medium truncate">{p.titolo}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {(p.companies as any)?.ragione_sociale}
                        </span>
                        {p.clienti_finali && (
                          <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>
                        )}
                        <span className="text-xs">€ {p.prezzo.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={p.assegnatario_id || "unassigned"}
                        onValueChange={v => handleAssignOperator(p.id, v)}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Non assegnato" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Non assegnato</SelectItem>
                          {internalOperators.map(op => (
                            <SelectItem key={op.id} value={op.id}>
                              {op.nome} {op.cognome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={p.stato} onValueChange={v => quickChangeStato.mutate({ praticaId: p.id, stato: v as PraticaStato })}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATO_ORDER.map(s => <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/pratiche/${p.id}`)}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* Pipeline view */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATO_ORDER.map(stato => {
            const conf = STATO_CONFIG[stato];
            const Icon = conf.icon;
            const items = pipelineData[stato];
            return (
              <div key={stato} className={`flex min-w-[260px] flex-1 flex-col rounded-xl border p-3 ${conf.bgColumn}`}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${conf.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold">{conf.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map(p => {
                    const assignee = p.assegnatario_id ? assigneeMap[p.assegnatario_id] : null;
                    return (
                      <Card key={p.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => navigate(`/pratiche/${p.id}`)}>
                        <CardContent className="p-3">
                          <p className="text-sm font-medium truncate">{p.titolo}</p>
                          <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{(p.companies as any)?.ragione_sociale}</span>
                            {p.clienti_finali && <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>}
                            {assignee && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />{assignee.nome} {assignee.cognome}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs font-semibold">€ {p.prezzo.toFixed(2)}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nessuna</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
