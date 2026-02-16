import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FolderOpen, Search, Plus, Clock, CheckCircle2, AlertCircle, FileEdit, Ban, List, Columns3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

const STATO_ORDER: PraticaStato[] = ["bozza", "inviata", "in_lavorazione", "in_attesa_documenti", "completata", "annullata"];

const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; bgColumn: string; icon: any }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/30", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", bgColumn: "bg-primary/5", icon: Clock },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", bgColumn: "bg-warning/5", icon: AlertCircle },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", bgColumn: "bg-destructive/5", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", bgColumn: "bg-success/5", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/20", icon: Ban },
};

type ViewMode = "list" | "pipeline";

export default function Pratiche() {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<PraticaStato | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca pratiche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex rounded-lg border bg-muted p-0.5">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "pipeline" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("pipeline")}
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {viewMode === "list" && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={!filterStato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato("")}>Tutte</Badge>
            {STATO_ORDER.map((stato) => (
              <Badge key={stato} variant={filterStato === stato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato(stato)}>
                {STATO_CONFIG[stato].label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : viewMode === "list" ? (
        <ListView pratiche={filtered} navigate={navigate} />
      ) : (
        <PipelineView pratiche={filtered} navigate={navigate} search={search} />
      )}
    </div>
  );
}

function ListView({ pratiche, navigate }: { pratiche: any[]; navigate: (path: string) => void }) {
  if (pratiche.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid gap-3">
      {pratiche.map((p) => {
        const statoConf = STATO_CONFIG[p.stato as PraticaStato];
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
  );
}

function PipelineView({ pratiche, navigate, search }: { pratiche: any[]; navigate: (path: string) => void; search: string }) {
  // In pipeline view, show all statuses regardless of filter
  const allByStato = STATO_ORDER.reduce((acc, stato) => {
    acc[stato] = pratiche.filter(p => p.stato === stato);
    return acc;
  }, {} as Record<PraticaStato, any[]>);

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 pb-4" style={{ minWidth: STATO_ORDER.length * 260 }}>
        {STATO_ORDER.map(stato => {
          const conf = STATO_CONFIG[stato];
          const Icon = conf.icon;
          const items = allByStato[stato];

          return (
            <div key={stato} className={`flex w-[250px] shrink-0 flex-col rounded-xl ${conf.bgColumn} border`}>
              {/* Column header */}
              <div className="flex items-center gap-2 p-3 border-b">
                <div className={`flex h-7 w-7 items-center justify-center rounded-md ${conf.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold flex-1">{conf.label}</span>
                <Badge variant="secondary" className="text-xs h-5 px-1.5">{items.length}</Badge>
              </div>

              {/* Column body */}
              <div className="flex flex-col gap-2 p-2 min-h-[120px] max-h-[60vh] overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    Nessuna pratica
                  </div>
                ) : (
                  items.map(p => (
                    <Card
                      key={p.id}
                      className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
                      onClick={() => navigate(`/pratiche/${p.id}`)}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-sm font-medium truncate">{p.titolo}</p>
                        {p.clienti_finali && (
                          <p className="text-xs text-muted-foreground truncate">
                            {(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}
                          </p>
                        )}
                        <p className="text-sm font-semibold">€ {p.prezzo.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
