import { useState, useEffect, useMemo, useCallback } from "react";
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
import { PaginationControls } from "@/components/ui/PaginationControls";
import { usePraticheRealtime } from "@/hooks/usePraticheRealtime";
import {
  usePratichePagedQuery,
  usePraticheAllQuery,
  useCompanyPraticheKpi,
  type PraticheServerFilters,
} from "@/hooks/usePraticheServerQuery";
import { exportToCSV } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];
type ViewMode = "list" | "pipeline";
type BrandFilter = "all" | "enea" | "conto_termico";

const COMPANY_SELECT = "*, clienti_finali(id, nome, cognome)";

export default function Pratiche() {
  const { companyId } = useCompany();
  usePraticheRealtime();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<PraticaStato | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterCliente, setFilterCliente] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterBrand, setFilterBrand] = useState<BrandFilter>("all");
  const [page, setPage] = useState(0);

  // ── Reset page when filters change ────────────────────────────────────────
  useEffect(() => { setPage(0); }, [search, filterStato, filterBrand, filterDateFrom, filterDateTo, filterCliente]);

  // ── Build server-side filter bag ──────────────────────────────────────────
  const serverFilters: PraticheServerFilters = useMemo(() => ({
    companyId,
    search:    search   || undefined,
    stato:     filterStato || undefined,
    brand:     filterBrand,
    dateFrom:  filterDateFrom ? filterDateFrom.toISOString().slice(0, 10) : undefined,
    dateTo:    filterDateTo   ? filterDateTo.toISOString().slice(0, 10)   : undefined,
    clienteId: filterCliente || undefined,
  }), [companyId, search, filterStato, filterBrand, filterDateFrom, filterDateTo, filterCliente]);

  // ── Paginated query (list view) ───────────────────────────────────────────
  const {
    data: pagedData,
    isLoading: pagedLoading,
    isFetching: pagedFetching,
    isError: pagedError,
  } = usePratichePagedQuery(serverFilters, page, COMPANY_SELECT, viewMode === "list" && !!companyId);

  // ── All-records query (pipeline view, capped at 300) ──────────────────────
  const {
    data: allData,
    isLoading: allLoading,
    isError: allError,
  } = usePraticheAllQuery(serverFilters, COMPANY_SELECT, viewMode === "pipeline" && !!companyId);

  // ── KPI counts (separate lightweight HEAD queries) ────────────────────────
  const { data: kpi } = useCompanyPraticheKpi(companyId);

  // ── Clients dropdown (for filter) ─────────────────────────────────────────
  // Load only clients that have at least one pratica belonging to this company
  const { data: clientiOptions = [] } = useQuery({
    queryKey: ["clienti-options", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pratiche")
        .select("clienti_finali!inner(id, nome, cognome)")
        .eq("company_id", companyId!)
        .not("cliente_finale_id", "is", null)
        .order("created_at", { ascending: false });
      if (!data) return [];
      // Deduplicate by client id
      const seen = new Set<string>();
      const unique: { id: string; nome: string; cognome: string }[] = [];
      data.forEach((row: any) => {
        const c = row.clienti_finali;
        if (c && !seen.has(c.id)) { seen.add(c.id); unique.push(c); }
      });
      return unique.sort((a, b) => a.cognome.localeCompare(b.cognome));
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Active data for the current view
  const items = viewMode === "list"
    ? (pagedData?.items ?? [])
    : (allData?.items ?? []);
  const total     = viewMode === "list" ? (pagedData?.total ?? 0) : (allData?.total ?? 0);
  const pageCount = pagedData?.pageCount ?? 1;
  const isLoading = viewMode === "list" ? pagedLoading : allLoading;
  const isError   = viewMode === "list" ? pagedError   : allError;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterCliente("");
  };

  const handleExport = () => {
    exportToCSV(
      items.map((p) => ({
        titolo:   p.titolo,
        cliente:  p.clienti_finali ? `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome}` : "",
        stato:    p.stato,
        pagamento: p.pagamento_stato,
        prezzo:   p.prezzo,
        data:     new Date(p.created_at).toLocaleDateString("it-IT"),
      })),
      "pratiche-export",
      [
        { key: "titolo",    label: "Titolo" },
        { key: "cliente",   label: "Cliente" },
        { key: "stato",     label: "Stato" },
        { key: "pagamento", label: "Pagamento" },
        { key: "prezzo",    label: "Prezzo" },
        { key: "data",      label: "Data" },
      ],
    );
  };

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((p) => p.id)));
    }
  }, [items, selectedIds.size]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pratiche-server"] });
    queryClient.invalidateQueries({ queryKey: ["pratiche-kpi"] });
  };

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("pratiche").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); clearSelection(); toast({ title: "Pratiche eliminate" }); },
    onError:   () => toast({ title: "Errore nell'eliminazione", variant: "destructive" }),
  });

  const handleBulkDelete = () => {
    const deletableIds = Array.from(selectedIds).filter((id) => {
      const p = items.find((pr) => pr.id === id);
      return p?.stato === "bozza";
    });
    if (deletableIds.length > 0) bulkDelete.mutate(deletableIds);
  };

  const handleSingleDelete = (id: string) => bulkDelete.mutate([id]);

  const canDelete = (p: any) => p.stato === "bozza";

  const duplicatePratica = useMutation({
    mutationFn: async (pratica: any) => {
      const { data, error } = await supabase.from("pratiche").insert({
        company_id:        pratica.company_id,
        service_id:        pratica.service_id ?? null,
        cliente_finale_id: pratica.cliente_finale_id ?? null,
        creato_da:         pratica.creato_da,
        titolo:            `Copia — ${pratica.titolo}`,
        descrizione:       pratica.descrizione ?? "",
        categoria:         pratica.categoria,
        stato:             "bozza",
        priorita:          pratica.priorita,
        pagamento_stato:   "non_pagata",
        prezzo:            pratica.prezzo,
        dati_pratica:      pratica.dati_pratica ?? {},
        is_free:           false,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast({ title: "Pratica duplicata", description: "La nuova bozza è pronta." });
      navigate(`/pratiche/${data.id}`);
    },
    onError: () => toast({ title: "Errore duplicazione", variant: "destructive" }),
  });

  const bulkChangeStato = useMutation({
    mutationFn: async ({ ids, stato }: { ids: string[]; stato: string }) => {
      const { error } = await supabase.from("pratiche").update({ stato: stato as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); clearSelection(); toast({ title: "Stato aggiornato" }); },
  });

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-12 w-12 text-destructive/40" />
        <h2 className="font-display text-lg font-semibold">Problema temporaneo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Impossibile caricare le pratiche. Ricarica la pagina.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* KPI summary (always shows global counts, not filtered) */}
      {kpi && <PraticheSummaryBar counts={kpi} />}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per titolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm bg-muted/50 border-transparent focus-visible:border-input focus-visible:bg-background transition-all"
          />
        </div>

        {/* Brand toggle */}
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
          clienti={clientiOptions}
        />

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 shrink-0"
          onClick={handleExport}
          disabled={items.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">CSV</span>
        </Button>

        {/* View mode */}
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

      {/* Stato chips (list mode only) */}
      {viewMode === "list" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {items.length > 0 && (
            <div className="flex items-center gap-1.5 mr-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.size === items.length && items.length > 0}
                onCheckedChange={toggleSelectAll}
              />
            </div>
          )}
          {(["", ...STATO_ORDER] as const).map((stato) => {
            const label  = stato === "" ? "Tutti" : STATO_CONFIG[stato as PraticaStato].label;
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
          {total > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {total} {total === 1 ? "pratica" : "pratiche"}
            </span>
          )}
        </div>
      )}

      {/* Pipeline capped warning */}
      {viewMode === "pipeline" && allData?.capped && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Visualizzando le prime 300 pratiche. Usa i filtri per restringere la ricerca.
        </p>
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

      {/* Main content */}
      {viewMode === "list" ? (
        <>
          <ListView
            pratiche={items}
            navigate={navigate}
            selectable
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onDelete={handleSingleDelete}
            canDelete={canDelete}
            onDuplicate={(p) => duplicatePratica.mutate(p)}
            isLoading={isLoading}
          />
          <PaginationControls
            page={page}
            pageCount={pageCount}
            total={total}
            onPageChange={setPage}
            isLoading={pagedFetching}
          />
        </>
      ) : (
        <PipelineView
          pratiche={items}
          navigate={navigate}
          cacheKey={["pratiche-server", "all", serverFilters, COMPANY_SELECT]}
        />
      )}
    </div>
  );
}
