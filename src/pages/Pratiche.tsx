import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderOpen, Search, Plus, List, Columns3, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { STATO_ORDER, STATO_CONFIG } from "@/lib/pratiche-config";
import { ListView } from "@/components/pratiche/PraticaCard";
import { PipelineView } from "@/components/pratiche/PipelineView";
import { PraticheFilters } from "@/components/pratiche/PraticheFilters";
import { PraticheSummaryBar } from "@/components/pratiche/PraticheSummaryBar";
import { BulkActionsBar } from "@/components/pratiche/BulkActionsBar";
import { usePraticheRealtime } from "@/hooks/usePraticheRealtime";
import { exportToCSV } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];
type ViewMode = "list" | "pipeline";

export default function Pratiche() {
  const { companyId } = useCompany();
  usePraticheRealtime();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<PraticaStato | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterCliente, setFilterCliente] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["pratiche", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, clienti_finali(id, nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const uniqueClienti = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; cognome: string }>();
    pratiche.forEach((p) => {
      if (p.clienti_finali && (p.clienti_finali as any).id) {
        const c = p.clienti_finali as any;
        map.set(c.id, { id: c.id, nome: c.nome, cognome: c.cognome });
      }
    });
    return Array.from(map.values());
  }, [pratiche]);

  const filtered = pratiche.filter((p) => {
    const matchSearch = `${p.titolo} ${p.descrizione}`.toLowerCase().includes(search.toLowerCase());
    const matchStato = !filterStato || p.stato === filterStato;
    const matchCliente = !filterCliente || (p.clienti_finali as any)?.id === filterCliente;
    const createdAt = new Date(p.created_at);
    const matchDateFrom = !filterDateFrom || createdAt >= filterDateFrom;
    const matchDateTo = !filterDateTo || createdAt <= new Date(filterDateTo.getTime() + 86400000);
    return matchSearch && matchStato && matchCliente && matchDateFrom && matchDateTo;
  });

  const resetFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterCliente("");
  };

  const handleExport = () => {
    exportToCSV(
      filtered.map((p) => ({
        titolo: p.titolo,
        cliente: p.clienti_finali ? `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome}` : "",
        stato: p.stato,
        pagamento: p.pagamento_stato,
        prezzo: p.prezzo,
        data: new Date(p.created_at).toLocaleDateString("it-IT"),
      })),
      "pratiche-export",
      [
        { key: "titolo", label: "Titolo" },
        { key: "cliente", label: "Cliente" },
        { key: "stato", label: "Stato" },
        { key: "pagamento", label: "Pagamento" },
        { key: "prezzo", label: "Prezzo" },
        { key: "data", label: "Data" },
      ]
    );
  };

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  }, [filtered, selectedIds.size]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Bulk delete (company users can only delete bozza)
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("pratiche").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      clearSelection();
      toast({ title: "Pratiche eliminate" });
    },
    onError: () => toast({ title: "Errore nell'eliminazione", variant: "destructive" }),
  });

  const handleBulkDelete = () => {
    // Company users can only delete drafts
    const deletableIds = Array.from(selectedIds).filter(id => {
      const p = pratiche.find(pr => pr.id === id);
      return p?.stato === "bozza";
    });
    if (deletableIds.length > 0) bulkDelete.mutate(deletableIds);
  };

  const handleSingleDelete = (id: string) => {
    bulkDelete.mutate([id]);
  };

  const canDelete = (p: any) => p.stato === "bozza";

  // Bulk change stato
  const bulkChangeStato = useMutation({
    mutationFn: async ({ ids, stato }: { ids: string[]; stato: string }) => {
      const { error } = await supabase.from("pratiche").update({ stato: stato as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      clearSelection();
      toast({ title: "Stato aggiornato" });
    },
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

      {!isLoading && pratiche.length > 0 && <PraticheSummaryBar pratiche={pratiche} />}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca pratiche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
          <div className="flex rounded-lg border bg-muted p-0.5">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "pipeline" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("pipeline")}>
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <PraticheFilters
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          filterCliente={filterCliente}
          onDateFromChange={setFilterDateFrom}
          onDateToChange={setFilterDateTo}
          onClienteChange={setFilterCliente}
          onReset={resetFilters}
          clienti={uniqueClienti}
        />

        {viewMode === "list" && (
          <div className="flex flex-wrap items-center gap-2">
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 mr-2" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs text-muted-foreground">Tutte</span>
              </div>
            )}
            <Badge variant={!filterStato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato("")}>Tutte</Badge>
            {STATO_ORDER.map((stato) => (
              <Badge key={stato} variant={filterStato === stato ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterStato(stato)}>
                {STATO_CONFIG[stato].label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={clearSelection}
          onDelete={handleBulkDelete}
          onChangeStato={(stato) => bulkChangeStato.mutate({ ids: Array.from(selectedIds), stato })}
          deleteLabel="Elimina bozze selezionate"
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : viewMode === "list" ? (
        <ListView
          pratiche={filtered}
          navigate={navigate}
          selectable
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onDelete={handleSingleDelete}
          canDelete={canDelete}
        />
      ) : (
        <PipelineView pratiche={filtered} navigate={navigate} />
      )}
    </div>
  );
}
