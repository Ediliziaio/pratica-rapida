import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderOpen, Search, Building2, ArrowRight, User,
  Download, Trash2, Table2, LayoutList, SlidersHorizontal,
  CheckCircle2, Clock, Euro, X, ChevronDown, Kanban,
} from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOperatorPermissions } from "@/hooks/useOperatorPermissions";
import { STATO_CONFIG, STATO_ORDER, PAGAMENTO_BADGE, getAgingDot } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { BulkActionsBar } from "@/components/pratiche/BulkActionsBar";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  useDroppable, useDraggable, PointerSensor, useSensor, useSensors,
  pointerWithin, MeasuringStrategy,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";

// Keeps the DragOverlay card centered under the cursor regardless of
// scroll containers or sidebar offsets (replaces @dnd-kit/modifiers snapCenterToCursor)
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (draggingNodeRect && activatorEvent) {
    const coords = getEventCoordinates(activatorEvent);
    if (coords) {
      return {
        ...transform,
        x: transform.x + coords.x - draggingNodeRect.left - draggingNodeRect.width / 2,
        y: transform.y + coords.y - draggingNodeRect.top - draggingNodeRect.height / 2,
      };
    }
  }
  return transform;
};
import { toast as sonnerToast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import { PraticheTableView } from "@/components/pratiche/PraticheTableView";
import { PaginationControls } from "@/components/ui/PaginationControls";
import {
  usePratichePagedQuery,
  usePraticheAllQuery,
  useAdminPraticheKpi,
  type PraticheServerFilters,
  type AdminKpi,
  type AllResult,
} from "@/hooks/usePraticheServerQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "pipeline" | "table";

interface FiltersState {
  search: string;
  stato: string;
  azienda: string;
  brand: "all" | "enea" | "conto_termico";
  pagamento: string;
  operatore: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: FiltersState = {
  search: "",
  stato: "all",
  azienda: "all",
  brand: "all",
  pagamento: "all",
  operatore: "all",
  dateFrom: "",
  dateTo: "",
};

// ─── DnD Card ─────────────────────────────────────────────────────────────────

function DraggableCard({
  pratica,
  navigate,
  assigneeMap,
  showPricing = true,
}: {
  pratica: any;
  navigate: (path: string) => void;
  assigneeMap: Record<string, { nome: string; cognome: string }>;
  showPricing?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pratica.id,
    data: { stato: pratica.stato },
  });
  const dragActivated = useRef(false);
  useEffect(() => { if (isDragging) dragActivated.current = true; }, [isDragging]);

  const style = {
    // When DragOverlay is active, don't move the source — just hide it
    opacity: isDragging ? 0 : 1,
    touchAction: "none" as const,
    userSelect: "none" as const,
    // Preserve layout space so columns don't collapse during drag
    visibility: isDragging ? ("hidden" as const) : ("visible" as const),
  };

  const assignee = pratica.assegnatario_id ? assigneeMap[pratica.assegnatario_id] : null;
  const aging = getAgingDot(pratica);
  const pagamento = PAGAMENTO_BADGE[pratica.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
  const brandDati = (pratica.dati_pratica as any)?.brand;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing select-none bg-card hover:shadow-md transition-shadow"
      onClick={() => {
        if (dragActivated.current) { dragActivated.current = false; return; }
        navigate(`/pratiche/${pratica.id}`);
      }}
    >
      <CardContent className="p-2.5 space-y-1">
        {/* Title + aging dot */}
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-semibold leading-snug line-clamp-2 flex-1 min-w-0">{pratica.titolo}</p>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {aging && <span className={`h-1.5 w-1.5 rounded-full ${aging.color}`} title={aging.label} />}
            {brandDati && (
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${brandDati === "enea" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                {brandDati === "enea" ? "ENEA" : "CT"}
              </span>
            )}
          </div>
        </div>
        {/* Azienda */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
          <Building2 className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{(pratica.companies as any)?.ragione_sociale}</span>
        </div>
        {/* Footer: price + assignee */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
          {showPricing
            ? <p className="text-[11px] font-bold">€ {(pratica.prezzo ?? 0).toFixed(0)}</p>
            : <span className="text-[10px] text-muted-foreground">—</span>
          }
          <div className="flex items-center gap-1">
            {assignee && (
              <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded font-medium truncate max-w-[60px]">
                {assignee.nome}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

const COL_CARDS_PAGE = 20; // cards per "page" per column

function DroppableColumn({
  stato,
  children,
  isOver,
}: {
  stato: string;
  children: React.ReactNode;
  isOver: boolean;
}) {
  const conf = STATO_CONFIG[stato as PraticaStato];
  return (
    <div
      className={`flex w-[272px] shrink-0 flex-col rounded-xl border transition-all duration-150 ${conf.bgColumn} ${
        isOver ? "ring-2 ring-primary/70 shadow-lg scale-[1.01]" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─── Pipeline View ────────────────────────────────────────────────────────────

function PipelineView({
  filtered,
  assigneeMap,
  navigate,
  showPricing = true,
  cacheKey,
}: {
  filtered: any[];
  assigneeMap: Record<string, { nome: string; cognome: string }>;
  navigate: (p: string) => void;
  showPricing?: boolean;
  /** Full React Query key for the all-records query — used for optimistic updates */
  cacheKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Per-column: how many pages of COL_CARDS_PAGE are shown
  const [colPages, setColPages] = useState<Record<string, number>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activePratica = activeId ? filtered.find((p) => p.id === activeId) : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const praticaId = active.id as string;
    const newStato = over.id as PraticaStato;
    const oldStato = (active.data.current as any)?.stato as PraticaStato;
    if (oldStato === newStato) return;

    // Optimistic update on the server-query cache
    const patchItems = (items: any[], stato: string) =>
      items.map((p) => (p.id === praticaId ? { ...p, stato } : p));

    queryClient.setQueryData(cacheKey, (old: AllResult | undefined) =>
      old ? { ...old, items: patchItems(old.items, newStato) } : old
    );

    const { error } = await supabase.from("pratiche").update({ stato: newStato }).eq("id", praticaId);
    if (error) {
      // Roll back
      queryClient.setQueryData(cacheKey, (old: AllResult | undefined) =>
        old ? { ...old, items: patchItems(old.items, oldStato) } : old
      );
      sonnerToast.error("Errore nello spostamento");
    } else {
      sonnerToast.success(`Spostata in ${STATO_CONFIG[newStato].label}`);
      queryClient.invalidateQueries({ queryKey: ["pratiche-server"] });
      queryClient.invalidateQueries({ queryKey: ["pratiche-kpi"] });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Horizontal scroll wrapper — plain div, no ScrollArea */}
      <div style={{ overflowX: "auto", overflowY: "visible", paddingBottom: 12 }}>
        <div className="flex gap-3 pb-1" style={{ minWidth: STATO_ORDER.length * 284 }}>
          {STATO_ORDER.map((stato) => {
            const conf = STATO_CONFIG[stato];
            const Icon = conf.icon;
            const items = filtered.filter((p) => p.stato === stato);
            const pageCount = colPages[stato] ?? 1;
            const visibleItems = items.slice(0, pageCount * COL_CARDS_PAGE);
            const remaining = items.length - visibleItems.length;
            const totalRevenue = items.reduce((s, p) => s + (p.prezzo || 0), 0);

            return (
              <ColumnWithDroppable
                key={stato}
                stato={stato}
                items={visibleItems}
                allItemsCount={items.length}
                remaining={remaining}
                totalRevenue={totalRevenue}
                Icon={Icon}
                conf={conf}
                navigate={navigate}
                assigneeMap={assigneeMap}
                onLoadMore={() => setColPages(prev => ({ ...prev, [stato]: (prev[stato] ?? 1) + 1 }))}
                showPricing={showPricing}
              />
            );
          })}
        </div>
      </div>

      {/* Drag overlay — renders outside all scroll contexts */}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]} style={{ cursor: "grabbing" }}>
        {activePratica && (
          <Card className="w-[264px] shadow-2xl border-primary/30" style={{ transform: "rotate(1.5deg)" }}>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-sm font-semibold truncate">{activePratica.titolo}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{(activePratica.companies as any)?.ragione_sociale}</span>
              </div>
              <p className="text-sm font-bold text-primary">€ {(activePratica.prezzo ?? 0).toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Column with its own useDroppable ─────────────────────────────────────────
// Extracted so each column has its own droppable registration

function ColumnWithDroppable({
  stato,
  items,
  allItemsCount,
  remaining,
  totalRevenue,
  Icon,
  conf,
  navigate,
  assigneeMap,
  onLoadMore,
  showPricing = true,
}: {
  stato: string;
  items: any[];
  allItemsCount: number;
  remaining: number;
  totalRevenue: number;
  Icon: React.ComponentType<{ className?: string }>;
  conf: any;
  navigate: (p: string) => void;
  assigneeMap: Record<string, { nome: string; cognome: string }>;
  onLoadMore: () => void;
  showPricing?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stato });

  return (
    <DroppableColumn stato={stato} isOver={isOver}>
      {/* Column ref wraps the entire column — pointer-within checks this rect */}
      <div ref={setNodeRef} className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b rounded-t-xl bg-inherit">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${conf.color}`}>
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-xs font-semibold flex-1 truncate">{conf.label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {showPricing && (
              <span className="text-[10px] font-bold text-muted-foreground">
                € {totalRevenue > 999 ? `${(totalRevenue / 1000).toFixed(1)}k` : totalRevenue.toFixed(0)}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 min-w-[20px] text-center font-bold">
              {allItemsCount}
            </Badge>
          </div>
        </div>

        {/* Scrollable cards area — fixed height, independent scroll per column */}
        <div
          className="flex flex-col gap-1.5 p-2 overflow-y-auto overflow-x-hidden"
          style={{ height: "calc(100vh - 320px)", minHeight: 200 }}
        >
          {allItemsCount === 0 ? (
            <div className="flex flex-1 items-center justify-center py-8 m-1">
              <p className="text-xs text-muted-foreground/40 text-center">Nessuna pratica</p>
            </div>
          ) : (
            items.map((p) => (
              <DraggableCard key={p.id} pratica={p} navigate={navigate} assigneeMap={assigneeMap} showPricing={showPricing} />
            ))
          )}

          {remaining > 0 && (
            <button
              onClick={onLoadMore}
              className="mt-1 w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-dashed transition-colors"
            >
              + {remaining} altre pratiche
            </button>
          )}
        </div>
      </div>
    </DroppableColumn>
  );
}

// ─── Filter Sheet ─────────────────────────────────────────────────────────────

function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onClear,
  companies,
  operators,
}: {
  open: boolean;
  onClose: () => void;
  filters: FiltersState;
  onChange: (f: Partial<FiltersState>) => void;
  onClear: () => void;
  companies: { id: string; ragione_sociale: string }[];
  operators: { id: string; nome: string; cognome: string }[];
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtri avanzati
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* Brand */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</Label>
            <div className="flex gap-1.5">
              {(["all", "enea", "conto_termico"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => onChange({ brand: b })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    filters.brand === b
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {b === "all" ? "Tutti" : b === "enea" ? "ENEA" : "Conto Termico"}
                </button>
              ))}
            </div>
          </div>

          {/* Stato */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stato pratica</Label>
            <div className="flex flex-col gap-1">
              {[["all", "Tutti gli stati"], ...STATO_ORDER.map((s) => [s, STATO_CONFIG[s].label])].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => onChange({ stato: val })}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    filters.stato === val
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span>{label}</span>
                  {filters.stato === val && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Pagamento */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stato pagamento</Label>
            <div className="flex flex-col gap-1">
              {[
                ["all", "Tutti"],
                ["non_pagata", "Da fatturare"],
                ["in_verifica", "Fatturata"],
                ["pagata", "Pagata"],
                ["rimborsata", "Rimborsata"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => onChange({ pagamento: val })}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    filters.pagamento === val
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span>{label}</span>
                  {filters.pagamento === val && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Azienda */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Azienda</Label>
            <Select value={filters.azienda} onValueChange={(v) => onChange({ azienda: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Tutte le aziende" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le aziende</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operatore */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operatore assegnato</Label>
            <Select value={filters.operatore} onValueChange={(v) => onChange({ operatore: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Tutti gli operatori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli operatori</SelectItem>
                <SelectItem value="unassigned">Non assegnato</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>{op.nome} {op.cognome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periodo creazione</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Dal</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.dateFrom}
                  onChange={(e) => onChange({ dateFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Al</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={filters.dateTo}
                  onChange={(e) => onChange({ dateTo: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="pt-4 border-t gap-2">
          <Button variant="outline" className="flex-1" onClick={onClear}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Reset filtri
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Applica
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ kpi }: { kpi: AdminKpi }) {
  const kpis = [
    { label: "Totali",       value: kpi.totale,                    icon: FolderOpen,  color: "text-foreground", bg: "bg-muted/60" },
    { label: "Attive",       value: kpi.attive,                    icon: Clock,       color: "text-warning",    bg: "bg-warning/10" },
    { label: "Completate",   value: kpi.completate,                icon: CheckCircle2,color: "text-success",    bg: "bg-success/10" },
    { label: "Da fatturare", value: `€ ${kpi.daFatturare.toFixed(2)}`, icon: Euro,   color: "text-primary",    bg: "bg-primary/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg} shrink-0`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className={`font-bold text-sm ${color}`}>{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Stato Chips ──────────────────────────────────────────────────────────────

function StatoChips({
  active,
  onChange,
  total,
}: {
  active: string;
  onChange: (s: string) => void;
  total: number;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange("all")}
        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
          active === "all"
            ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        Tutti {total > 0 ? `(${total})` : ""}
      </button>
      {STATO_ORDER.map((stato) => {
        const conf = STATO_CONFIG[stato];
        return (
          <button
            key={stato}
            onClick={() => onChange(active === stato ? "all" : stato)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active === stato
                ? "bg-foreground text-background border-foreground"
                : `border-border ${conf.color} hover:opacity-80`
            }`}
          >
            {conf.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── List View Card ───────────────────────────────────────────────────────────

function ListCard({
  p,
  isSelected,
  onToggle,
  onNavigate,
  assigneeMap,
  internalOperators,
  quickChangeStato,
  quickChangePagamento,
  assignOperator,
  bulkDelete,
  showPricing = true,
}: any) {
  const conf = STATO_CONFIG[p.stato];
  const Icon = conf.icon;
  const aging = getAgingDot(p);
  const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
  const assignee = p.assegnatario_id ? assigneeMap[p.assegnatario_id] : null;
  const brandDati = (p.dati_pratica as any)?.brand;

  return (
    <Card className={`transition-all ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-accent/30"}`}>
      <CardContent className="flex items-center gap-3 p-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={() => onToggle(p.id)} />
        </div>

        <div className="relative shrink-0">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${conf.color}`}>
            <Icon className="h-4 w-4" />
          </div>
          {aging && <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full border-2 border-background ${aging.color}`} />}
        </div>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onNavigate(`/pratiche/${p.id}`)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-medium text-sm truncate">{p.titolo}</p>
            {brandDati && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${brandDati === "enea" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                {brandDati === "enea" ? "ENEA" : "CT"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{(p.companies as any)?.ragione_sociale}</span>
            {p.clienti_finali && <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>}
            {assignee && <span className="text-primary flex items-center gap-1"><User className="h-3 w-3" />{assignee.nome} {assignee.cognome}</span>}
            <span>{formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: it })}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {showPricing && <span className="text-sm font-bold hidden md:inline">€ {(p.prezzo ?? 0).toFixed(2)}</span>}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cambia Stato</div>
              {STATO_ORDER.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => quickChangeStato.mutate({ praticaId: p.id, stato: s })}
                  className={`text-sm ${p.stato === s ? "bg-muted font-medium" : ""}`}
                >
                  {STATO_CONFIG[s].label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</div>
              {[["non_pagata", "Da fatturare"], ["in_verifica", "Fatturata"], ["pagata", "Pagata"]].map(([val, lbl]) => (
                <DropdownMenuItem
                  key={val}
                  onClick={() => quickChangePagamento.mutate({ praticaId: p.id, pagamentoStato: val })}
                  className={`text-sm ${p.pagamento_stato === val ? "bg-muted font-medium" : ""}`}
                >
                  {lbl}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Operatore</div>
              <DropdownMenuItem onClick={() => assignOperator.mutate({ praticaId: p.id, assegnatarioId: null })} className="text-sm text-muted-foreground">
                Nessuno
              </DropdownMenuItem>
              {internalOperators.map((op: any) => (
                <DropdownMenuItem key={op.id} onClick={() => assignOperator.mutate({ praticaId: p.id, assegnatarioId: op.id })} className={`text-sm ${p.assegnatario_id === op.id ? "bg-muted font-medium" : ""}`}>
                  {op.nome} {op.cognome}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive text-sm" onClick={() => bulkDelete.mutate([p.id])}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigate(`/pratiche/${p.id}`)}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPratiche() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const permissions = useOperatorPermissions();

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(0);

  const updateFilter = useCallback((f: Partial<FiltersState>) => {
    setFilters((prev) => ({ ...prev, ...f }));
    setSelectedIds(new Set());
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSelectedIds(new Set());
    setPage(0);
  }, []);

  // ── Build server-side filter bag ─────────────────────────────────────────

  const ADMIN_SELECT = "*, companies(ragione_sociale), clienti_finali(nome, cognome)";

  const serverFilters: PraticheServerFilters = useMemo(() => ({
    restrictToUserId: !permissions.see_all_pratiche && user?.id ? user.id : undefined,
    search:      filters.search     || undefined,
    stato:       filters.stato      !== "all" ? filters.stato      : undefined,
    brand:       filters.brand,
    dateFrom:    filters.dateFrom   || undefined,
    dateTo:      filters.dateTo     || undefined,
    aziendaId:   filters.azienda    !== "all" ? filters.azienda    : undefined,
    pagamento:   filters.pagamento  !== "all" ? filters.pagamento  : undefined,
    operatoreId: filters.operatore  !== "all" ? filters.operatore  : undefined,
  }), [filters, permissions.see_all_pratiche, user?.id]);

  // ── Queries ──────────────────────────────────────────────────────────────

  // Paginated (list / table)
  const {
    data: pagedData,
    isLoading: pagedLoading,
    isFetching: pagedFetching,
  } = usePratichePagedQuery(serverFilters, page, ADMIN_SELECT, viewMode !== "pipeline");

  // All records (pipeline — server-filtered, capped at 300)
  const {
    data: allData,
    isLoading: allLoading,
  } = usePraticheAllQuery(serverFilters, ADMIN_SELECT, viewMode === "pipeline");

  // Global KPI counters (independent of current filters)
  const { data: kpiData } = useAdminPraticheKpi(permissions.see_all_pratiche, user?.id ?? null);

  // Merge: use the right dataset based on viewMode
  const pratiche = viewMode === "pipeline"
    ? (allData?.items ?? [])
    : (pagedData?.items ?? []);
  const total     = viewMode === "pipeline" ? (allData?.total ?? 0) : (pagedData?.total ?? 0);
  const pageCount = pagedData?.pageCount ?? 1;
  const isLoading = viewMode === "pipeline" ? allLoading : pagedLoading;

  // In the new server-side approach, "filtered" IS the fetched set — no client-side filtering needed.
  // Keep the name `filtered` so the rest of the render tree stays intact.
  const filtered = pratiche;

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-select"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale").order("ragione_sociale");
      return data || [];
    },
  });

  const { data: internalOperators = [] } = useQuery({
    queryKey: ["admin-internal-operators"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["super_admin", "admin_interno", "operatore"]);
      const uniqueIds = [...new Set((roles || []).map((r) => r.user_id))];
      if (!uniqueIds.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, nome, cognome").in("id", uniqueIds);
      return profiles || [];
    },
  });

  const assigneeMap = useMemo(() => {
    const map: Record<string, { nome: string; cognome: string }> = {};
    internalOperators.forEach((p) => { map[p.id] = p; });
    return map;
  }, [internalOperators]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.stato !== "all") n++;
    if (filters.brand !== "all") n++;
    if (filters.azienda !== "all") n++;
    if (filters.pagamento !== "all") n++;
    if (filters.operatore !== "all") n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pratiche-server"] });
    queryClient.invalidateQueries({ queryKey: ["pratiche-kpi"] });
  }, [queryClient]);

  const quickChangeStato = useMutation({
    mutationFn: async ({ praticaId, stato }: { praticaId: string; stato: PraticaStato }) => {
      const { error } = await supabase.from("pratiche").update({ stato }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const quickChangePagamento = useMutation({
    mutationFn: async ({ praticaId, pagamentoStato }: { praticaId: string; pagamentoStato: string }) => {
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: pagamentoStato as any }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const assignOperator = useMutation({
    mutationFn: async ({ praticaId, assegnatarioId }: { praticaId: string; assegnatarioId: string | null }) => {
      const { error } = await supabase.from("pratiche").update({ assegnatario_id: assegnatarioId }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("pratiche").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); clearSelection(); toast({ title: "Pratiche eliminate" }); },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const bulkChangeStato = useMutation({
    mutationFn: async ({ ids, stato }: { ids: string[]; stato: string }) => {
      const { error } = await supabase.from("pratiche").update({ stato: stato as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); clearSelection(); toast({ title: "Stato aggiornato" }); },
  });

  const bulkChangePagamento = useMutation({
    mutationFn: async ({ ids, pagamento }: { ids: string[]; pagamento: string }) => {
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: pagamento as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); clearSelection(); toast({ title: "Pagamento aggiornato" }); },
  });

  // ── Selection ─────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
  }, []);
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)));
  }, [filtered, selectedIds.size]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Admin</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">Tutte le Pratiche</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => exportToCSV(
            filtered.map((p) => ({
              titolo: p.titolo,
              azienda: (p.companies as any)?.ragione_sociale || "",
              cliente: p.clienti_finali ? `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome}` : "",
              stato: p.stato,
              pagamento: p.pagamento_stato,
              prezzo: p.prezzo,
              data: format(new Date(p.created_at), "dd/MM/yyyy"),
            })),
            "pratiche-export",
            [
              { key: "titolo", label: "Titolo" },
              { key: "azienda", label: "Azienda" },
              { key: "cliente", label: "Cliente" },
              { key: "stato", label: "Stato" },
              { key: "pagamento", label: "Pagamento" },
              { key: "prezzo", label: "Prezzo" },
              { key: "data", label: "Data" },
            ]
          )}
          disabled={filtered.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">CSV</span>
        </Button>
      </div>

      {/* KPI */}
      {kpiData && <KpiCards kpi={kpiData} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca pratica, azienda, cliente..."
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            className="pl-8 h-9 text-sm bg-muted/40 border-transparent focus-visible:border-input focus-visible:bg-background"
          />
          {filters.search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => updateFilter({ search: "" })}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter sheet trigger */}
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 shrink-0 ${activeFilterCount > 0 ? "border-primary text-primary" : ""}`}
          onClick={() => setFilterSheetOpen(true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-xs">Filtri</span>
          {activeFilterCount > 0 && (
            <Badge className="h-4 w-4 p-0 text-[10px] flex items-center justify-center">{activeFilterCount}</Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground shrink-0" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Reset</span>
          </Button>
        )}

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
          {([
            { mode: "list", icon: LayoutList, label: "Lista" },
            { mode: "pipeline", icon: Kanban, label: "Pipeline" },
            { mode: "table", icon: Table2, label: "Tabella" },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              title={label}
              onClick={() => setViewMode(mode)}
              className={`p-1.5 rounded-md transition-all ${viewMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Stato chips (list/table only) */}
      {viewMode !== "pipeline" && (
        <StatoChips active={filters.stato} onChange={(s) => updateFilter({ stato: s })} total={total} />
      )}

      {/* Pipeline capped warning */}
      {viewMode === "pipeline" && allData?.capped && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Visualizzando le prime 300 pratiche. Usa i filtri per restringere la ricerca.
        </p>
      )}

      {/* Bulk selection row */}
      {(viewMode === "list" || viewMode === "table") && filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selezionate` : "Seleziona tutte"}
          </span>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={clearSelection}
          onDelete={() => bulkDelete.mutate(Array.from(selectedIds))}
          onChangeStato={(stato: string) => bulkChangeStato.mutate({ ids: Array.from(selectedIds), stato })}
          onChangePagamento={(pagamento: string) => bulkChangePagamento.mutate({ ids: Array.from(selectedIds), pagamento })}
          isAdmin
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-14">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : viewMode === "table" ? (
        <>
          <PraticheTableView
            pratiche={filtered}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            onChangeStato={(id: string, stato: PraticaStato) => quickChangeStato.mutate({ praticaId: id, stato })}
            onChangePagamento={(id: string, pag: string) => quickChangePagamento.mutate({ praticaId: id, pagamentoStato: pag })}
            onAssignOperator={(praticaId: string, value: string) => assignOperator.mutate({ praticaId, assegnatarioId: value === "unassigned" ? null : value })}
            onDelete={(ids: string[]) => bulkDelete.mutate(ids)}
            assigneeMap={assigneeMap}
            internalOperators={internalOperators}
          />
          <PaginationControls
            page={page}
            pageCount={pageCount}
            total={total}
            onPageChange={setPage}
            isLoading={pagedFetching}
          />
        </>
      ) : viewMode === "pipeline" ? (
        <PipelineView
          filtered={filtered}
          assigneeMap={assigneeMap}
          navigate={navigate}
          showPricing={permissions.see_pricing}
          cacheKey={["pratiche-server", "all", serverFilters, ADMIN_SELECT]}
        />
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <h3 className="font-semibold text-lg">Nessuna pratica trovata</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {activeFilterCount > 0 ? "Prova a modificare i filtri attivi" : "Nessuna pratica disponibile"}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Reset filtri</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-2">
            {filtered.map((p) => (
              <ListCard
                key={p.id}
                p={p}
                isSelected={selectedIds.has(p.id)}
                onToggle={toggleSelect}
                onNavigate={navigate}
                assigneeMap={assigneeMap}
                internalOperators={internalOperators}
                quickChangeStato={quickChangeStato}
                quickChangePagamento={quickChangePagamento}
                assignOperator={assignOperator}
                bulkDelete={bulkDelete}
                showPricing={permissions.see_pricing}
              />
            ))}
          </div>
          <PaginationControls
            page={page}
            pageCount={pageCount}
            total={total}
            onPageChange={setPage}
            isLoading={pagedFetching}
          />
        </>
      )}

      {/* Filter Sheet */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        onChange={updateFilter}
        onClear={clearFilters}
        companies={companies}
        operators={internalOperators}
      />
    </div>
  );
}
