import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ListChecks, Search, Clock, CheckCircle2, AlertCircle, FileEdit, Ban, Send,
  User, Building2, ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; icon: any }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", icon: Send },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", icon: Clock },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", icon: Ban },
};

export default function CodaPratiche() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<string>("all");
  const [assignDialog, setAssignDialog] = useState<string | null>(null);
  const [selectedOperatore, setSelectedOperatore] = useState("");

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["coda-pratiche"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, companies(ragione_sociale), clienti_finali(nome, cognome)")
        .order("created_at", { ascending: false });
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

  const { data: assigneeProfiles = {} } = useQuery({
    queryKey: ["assignee-profiles", pratiche.map(p => p.assegnatario_id).filter(Boolean)],
    queryFn: async () => {
      const ids = [...new Set(pratiche.map(p => p.assegnatario_id).filter(Boolean))] as string[];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", ids);
      const map: Record<string, { nome: string; cognome: string }> = {};
      (data || []).forEach(p => { map[p.id] = p; });
      return map;
    },
    enabled: pratiche.length > 0,
  });

  const assignPratica = useMutation({
    mutationFn: async ({ praticaId, operatoreId }: { praticaId: string; operatoreId: string }) => {
      const { error } = await supabase.from("pratiche").update({ assegnatario_id: operatoreId }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coda-pratiche"] });
      setAssignDialog(null);
      setSelectedOperatore("");
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

  const filtered = pratiche.filter(p => {
    const matchSearch = `${p.titolo} ${(p.companies as any)?.ragione_sociale || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStato = filterStato === "all" || p.stato === filterStato;
    return matchSearch && matchStato;
  });

  const statoOrder: PraticaStato[] = ["inviata", "in_lavorazione", "in_attesa_documenti", "bozza", "completata", "annullata"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Coda Pratiche ENEA</h1>
        <p className="text-muted-foreground">Gestisci e assegna le pratiche in lavorazione</p>
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
            <Badge key={stato} variant="outline" className={`${conf.color} cursor-pointer`} onClick={() => setFilterStato(filterStato === stato ? "all" : stato)}>
              {conf.label}: {count}
            </Badge>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ListChecks className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-display text-lg font-semibold">Nessuna pratica trovata</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => {
            const conf = STATO_CONFIG[p.stato];
            const Icon = conf.icon;
            const assignee = p.assegnatario_id ? assigneeProfiles[p.assegnatario_id] : null;
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
                      {assignee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{assignee.nome} {assignee.cognome}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={p.stato} onValueChange={v => quickChangeStato.mutate({ praticaId: p.id, stato: v as PraticaStato })}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statoOrder.map(s => <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setAssignDialog(p.id)}>
                      <User className="mr-1 h-3 w-3" />Assegna
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/pratiche/${p.id}`)}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!assignDialog} onOpenChange={o => !o && setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assegna Operatore</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Operatore</Label>
              <Select value={selectedOperatore} onValueChange={setSelectedOperatore}>
                <SelectTrigger><SelectValue placeholder="Seleziona operatore..." /></SelectTrigger>
                <SelectContent>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>{op.nome} {op.cognome} ({op.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!selectedOperatore || assignPratica.isPending} onClick={() => {
              if (assignDialog && selectedOperatore) assignPratica.mutate({ praticaId: assignDialog, operatoreId: selectedOperatore });
            }}>
              {assignPratica.isPending ? "Assegnazione..." : "Conferma Assegnazione"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
