import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, Search, Plus, Clock, CheckCircle2, AlertCircle, FileEdit, Ban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; icon: any }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", icon: Clock },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", icon: AlertCircle },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", icon: Ban },
};

export default function Pratiche() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<PraticaStato | "">("");

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["pratiche", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, clienti_finali(nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filtered = pratiche.filter((p) => {
    const matchSearch = `${p.titolo} ${p.descrizione}`.toLowerCase().includes(search.toLowerCase());
    const matchStato = !filterStato || p.stato === filterStato;
    return matchSearch && matchStato;
  });

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Pratiche ENEA</h1>
          <p className="text-muted-foreground">Tutte le tue pratiche ENEA</p>
        </div>
        <Button onClick={() => navigate("/pratiche/nuova")}>
          <Plus className="mr-2 h-4 w-4" />Nuova Pratica
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cerca pratiche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Stato filter badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={!filterStato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato("")}>Tutte</Badge>
          {(Object.keys(STATO_CONFIG) as PraticaStato[]).map((stato) => (
            <Badge key={stato} variant={filterStato === stato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato(stato)}>
              {STATO_CONFIG[stato].label}
            </Badge>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-display text-lg font-semibold">Nessuna pratica</h3>
            <p className="mt-1 text-sm text-muted-foreground">Crea la tua prima pratica ENEA per iniziare.</p>
            <Button className="mt-4" onClick={() => navigate("/pratiche/nuova")}>
              <Plus className="mr-2 h-4 w-4" />Nuova Pratica ENEA
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => {
            const statoConf = STATO_CONFIG[p.stato];
            const Icon = statoConf.icon;
            return (
              <Card key={p.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => navigate(`/pratiche/${p.id}`)}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${statoConf.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.titolo}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {p.clienti_finali && <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">€ {p.prezzo.toFixed(2)}</p>
                    <Badge className={`text-xs ${statoConf.color}`}>{statoConf.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
