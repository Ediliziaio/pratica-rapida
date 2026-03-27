import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
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
type BrandFilter = "all" | "enea" | "conto_termico";

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
  const [filterBrand, setFilterBrand] = useState<BrandFilter>("all");

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["pratiche", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, clienti_finali(id, nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
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
    const matchBrand = filterBrand === "all" || (p.dati_pratica as any)?.brand === filterBrand ||
      (filterBrand === "enea" && !(p.dati_pratica as any)?.brand); // legacy ENEA without brand field
    return matchSearch && matchStato && matchCliente && matchDateFrom && matchDateTo && matchBrand;
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Gestione</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">Le mie Pratiche</h1>
        </div>
        <Button onClick={() => navigate("/pratiche/nuova")} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />Nuova Pratica
        </Button>
      </div>

      {!isLoading && pratiche.length > 0 && <PraticheSummaryBar pratiche={pratiche} />}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per titolo, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm bg-muted/50 border-transparent focus-visible:border-input focus-visible:bg-background transition-all"
          />
        </div>

        <div className="inline-flex items-center gap-0.5 bg-muted rounded-md p-0.5 shrink-0">
          {(["all", "enea", "conto_termico"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setFilterBrand(b)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 ${
                filterBrand === b
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b === "all" ? "Tutti" : b === "enea" ? "ENEA" : "Conto Termico"}
            </button>
          ))}
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

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 shrink-0"
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">CSV</span>
        </Button>

        <div className="inline-flex items-center gap-0.5 bg-muted rounded-md p-0.5 shrink-0">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-all ${viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Vista lista"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("pipeline")}
            className={`p-1.5 rounded transition-all ${viewMode === "pipeline" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Vista pipeline"
          >
            <Columns3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stato chips (list mode) */}
      {viewMode === "list" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {filtered.length > 0 && (
            <div className="flex items-center gap-1.5 mr-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleSelectAll}
              />
            </div>
          )}
          {(["", ...STATO_ORDER] as const).map((stato) => {
            const label = stato === "" ? "Tutti" : STATO_CONFIG[stato as PraticaStato].label;
            const active = filterStato === stato;
            return (
              <button
                key={stato || "all"}
                onClick={() => setFilterStato(stato as PraticaStato | "")}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                {label}
              </button>
            );
          })}
          {filtered.length !== pratiche.length && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {filtered.length}/{pratiche.length}
            </span>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={clearSelection}
          onDelete={handleBulkDelete}
          onChangeStato={(stato) => bulkChangeStato.mutate({ ids: Array.from(selectedIds), stato })}
          deleteLabel="Elimina bozze selezionate"
        />
      )}

      {/* List or pipeline */}
      {viewMode === "list" ? (
        <ListView
          pratiche={filtered}
          navigate={navigate}
          selectable
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onDelete={handleSingleDelete}
          canDelete={canDelete}
          isLoading={isLoading}
        />
      ) : (
        <PipelineView pratiche={filtered} navigate={navigate} />
      )}
    </div>
  );
}
