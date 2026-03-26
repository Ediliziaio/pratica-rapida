import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ListChecks, Search, User, Building2, ArrowRight, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { useSLASettings } from "@/hooks/usePlatformSettings";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { it } from "date-fns/locale";

function SLAIndicator({ createdAt, stato, slaOre }: { createdAt: string; stato: string; slaOre: number }) {
  const hours = differenceInHours(new Date(), new Date(createdAt));
  const days = Math.floor(hours / 24);

  let color = "text-emerald-600 bg-emerald-50 border-emerald-200";
  let icon = <CheckCircle2 className="h-3 w-3" />;

  if (hours > slaOre * 1.5) {
    color = "text-destructive bg-destructive/10 border-destructive/20";
    icon = <AlertTriangle className="h-3 w-3" />;
  } else if (hours > slaOre) {
    color = "text-orange-600 bg-orange-50 border-orange-200";
    icon = <Clock className="h-3 w-3" />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium cursor-default ${color}`}>
          {icon}
          {days > 0 ? `${days}g` : `${hours}h`}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>In coda da {formatDistanceToNow(new Date(createdAt), { locale: it, addSuffix: false })}</p>
        <p className="text-xs text-muted-foreground">SLA: {slaOre}h</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function CodaPratiche() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<string>("all");
  const { sla: slaSettings } = useSLASettings();

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["coda-pratiche"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, companies(ragione_sociale), clienti_finali(nome, cognome)")
        .in("stato", ["inviata", "in_lavorazione", "in_attesa_documenti"])
        .order("created_at", { ascending: true }) // oldest first for priority
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: operators = [] } = useQuery({
    queryKey: ["internal-operators"],
    queryFn: async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["operatore", "admin_interno", "super_admin"]);
      if (!roleData?.length) return [];
      const userIds = roleData.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, cognome, email")
        .in("id", userIds);
      return profiles || [];
    },
  });

  const assigneeIds = useMemo(
    () => [...new Set(pratiche.map(p => p.assegnatario_id).filter(Boolean) as string[])].sort(),
    [pratiche],
  );

  const { data: assigneeProfiles = {} } = useQuery({
    queryKey: ["assignee-profiles", assigneeIds],
    queryFn: async () => {
      if (!assigneeIds.length) return {};
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", assigneeIds);
      const map: Record<string, { nome: string; cognome: string }> = {};
      (data || []).forEach(p => { map[p.id] = p; });
      return map;
    },
    enabled: assigneeIds.length > 0,
  });

  const assignPratica = useMutation({
    mutationFn: async ({ praticaId, operatoreId }: { praticaId: string; operatoreId: string }) => {
      const { error } = await supabase.from("pratiche").update({ assegnatario_id: operatoreId || null }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coda-pratiche"] });
      toast({ title: "Pratica assegnata" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const quickChangeStato = useMutation({
    mutationFn: async ({ praticaId, stato }: { praticaId: string; stato: PraticaStato }) => {
      const { error } = await supabase.from("pratiche").update({ stato }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coda-pratiche"] });
      toast({ title: "Stato aggiornato" });
    },
  });

  const statoOrder: PraticaStato[] = ["inviata", "in_lavorazione", "in_attesa_documenti"];

  const filtered = pratiche.filter(p => {
    const matchSearch = `${p.titolo} ${(p.companies as any)?.ragione_sociale || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStato = filterStato === "all" || p.stato === filterStato;
    return matchSearch && matchStato;
  });

  // Sort: SLA exceeded first, then by created_at asc
  const slaHours = slaSettings?.presaInCaricoOre ?? 24;
  const sorted = [...filtered].sort((a, b) => {
    const aHours = differenceInHours(new Date(), new Date(a.created_at));
    const bHours = differenceInHours(new Date(), new Date(b.created_at));
    const aOver = aHours > slaHours;
    const bOver = bHours > slaHours;
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    return bHours - aHours;
  });

  const slaExceeded = filtered.filter(p => differenceInHours(new Date(), new Date(p.created_at)) > slaHours).length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Coda Pratiche</h1>
            <p className="text-muted-foreground">Gestisci e assegna le pratiche in lavorazione</p>
          </div>
          {slaExceeded > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {slaExceeded} pratiche oltre SLA
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca pratica o azienda..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterStato} onValueChange={v => setFilterStato(v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filtra stato..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {statoOrder.map(s => <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-2">
          {statoOrder.map(stato => {
            const count = pratiche.filter(p => p.stato === stato).length;
            if (count === 0) return null;
            const conf = STATO_CONFIG[stato];
            return (
              <Badge
                key={stato}
                variant="outline"
                className={`${conf.color} cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={() => setFilterStato(filterStato === stato ? "all" : stato)}
              >
                {conf.label}: {count}
              </Badge>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sorted.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <ListChecks className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="font-display text-lg font-semibold">Nessuna pratica trovata</h3>
              <p className="text-sm text-muted-foreground mt-1">La coda è vuota o i filtri non producono risultati.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sorted.map(p => {
              const conf = STATO_CONFIG[p.stato];
              const Icon = conf.icon;
              const assignee = p.assegnatario_id ? assigneeProfiles[p.assegnatario_id] : null;
              const hours = differenceInHours(new Date(), new Date(p.created_at));
              const isCritical = hours > slaHours * 1.5;

              return (
                <Card
                  key={p.id}
                  className={`transition-colors hover:bg-accent/40 ${isCritical ? "border-destructive/40" : ""}`}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${conf.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/pratiche/${p.id}`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{p.titolo}</p>
                        <SLAIndicator createdAt={p.created_at} stato={p.stato} slaOre={slaHours} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {(p.companies as any)?.ragione_sociale}
                        </span>
                        {p.clienti_finali && (
                          <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>
                        )}
                        {assignee ? (
                          <span className="flex items-center gap-1 text-primary">
                            <User className="h-3 w-3" />{assignee.nome} {assignee.cognome}
                          </span>
                        ) : (
                          <span className="text-orange-500 flex items-center gap-1">
                            <User className="h-3 w-3" />Non assegnata
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stato inline */}
                    <Select value={p.stato} onValueChange={v => quickChangeStato.mutate({ praticaId: p.id, stato: v as PraticaStato })}>
                      <SelectTrigger className="h-8 w-40 text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statoOrder.map(s => <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Assegna operatore — inline select */}
                    <Select
                      value={p.assegnatario_id ?? "__none__"}
                      onValueChange={v => assignPratica.mutate({ praticaId: p.id, operatoreId: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs shrink-0">
                        <SelectValue placeholder="Assegna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Nessuno —</SelectItem>
                        {operators.map(op => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.nome} {op.cognome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => navigate(`/pratiche/${p.id}`)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
