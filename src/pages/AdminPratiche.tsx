import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderOpen, Search,
  Building2, ArrowRight, User, List, Columns3, Download, Trash2, Table2,
} from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { useNavigate } from "react-router-dom";
import { STATO_CONFIG, STATO_ORDER, PAGAMENTO_BADGE, getAgingDot } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { PraticheSummaryBar } from "@/components/pratiche/PraticheSummaryBar";
import { BulkActionsBar } from "@/components/pratiche/BulkActionsBar";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, useDraggable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast as sonnerToast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { PraticheTableView } from "@/components/pratiche/PraticheTableView";

type ViewMode = "list" | "pipeline" | "table";

import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";


function AdminDraggableCard({ pratica, navigate, assigneeMap }: { pratica: any; navigate: (path: string) => void; assigneeMap: Record<string, { nome: string; cognome: string }> }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pratica.id,
    data: { stato: pratica.stato },
  });
  const dragActivated = React.useRef(false);

  React.useEffect(() => {
    if (isDragging) dragActivated.current = true;
  }, [isDragging]);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const assignee = pratica.assegnatario_id ? assigneeMap[pratica.assegnatario_id] : null;
  const aging = getAgingDot(pratica);
  const pagamento = PAGAMENTO_BADGE[pratica.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;

  const handleClick = () => {
    if (dragActivated.current) {
      dragActivated.current = false;
      return;
    }
    navigate(`/pratiche/${pratica.id}`);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:-translate-y-0.5 touch-none"
      onClick={handleClick}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate flex-1">{pratica.titolo}</p>
          {aging && <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${aging.color}`} title={aging.label} />}
        </div>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{(pratica.companies as any)?.ragione_sociale}</span>
          {pratica.clienti_finali && <span>{(pratica.clienti_finali as any).nome} {(pratica.clienti_finali as any).cognome}</span>}
          {assignee && (
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{assignee.nome} {assignee.cognome}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">€ {pratica.prezzo.toFixed(2)}</p>
          <Badge variant="outline" className={`text-[10px] h-4 px-1 ${pagamento.className}`}>{pagamento.label}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(pratica.created_at), { addSuffix: true, locale: it })}
        </p>
      </CardContent>
    </Card>
  );
}

function AdminDroppableColumn({ stato, children }: { stato: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stato });
  const conf = STATO_CONFIG[stato as PraticaStato];

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[250px] shrink-0 flex-col rounded-xl ${conf.bgColumn} border transition-all ${isOver ? "ring-2 ring-primary shadow-lg scale-[1.02]" : ""}`}
    >
      {children}
    </div>
  );
}

export default function AdminPratiche() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<string>("all");
  const [filterAzienda, setFilterAzienda] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["admin-all-pratiche"],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, companies(ragione_sociale), clienti_finali(nome, cognome)")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
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

  const quickChangePagamento = useMutation({
    mutationFn: async ({ praticaId, pagamentoStato }: { praticaId: string; pagamentoStato: string }) => {
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: pagamentoStato as any }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      toast({ title: "Stato pagamento aggiornato" });
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

  const handleAssignOperator = (praticaId: string, value: string) => {
    assignOperator.mutate({
      praticaId,
      assegnatarioId: value === "unassigned" ? null : value,
    });
  };

  // Selection
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

  // Bulk mutations
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("pratiche").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      clearSelection();
      toast({ title: "Pratiche eliminate" });
    },
    onError: () => toast({ title: "Errore nell'eliminazione", variant: "destructive" }),
  });

  const bulkChangeStato = useMutation({
    mutationFn: async ({ ids, stato }: { ids: string[]; stato: string }) => {
      const { error } = await supabase.from("pratiche").update({ stato: stato as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      clearSelection();
      toast({ title: "Stato aggiornato" });
    },
  });

  const bulkChangePagamento = useMutation({
    mutationFn: async ({ ids, pagamento }: { ids: string[]; pagamento: string }) => {
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: pagamento as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
      clearSelection();
      toast({ title: "Stato pagamento aggiornato" });
    },
  });

  const activePratica = activeId ? pratiche.find(p => p.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const praticaId = active.id as string;
    const newStato = over.id as PraticaStato;
    const oldStato = (active.data.current as any)?.stato;

    if (oldStato === newStato) return;

    // Admin pipeline — all transitions allowed for internal users
    queryClient.setQueryData(["admin-all-pratiche"], (old: any[]) =>
      old?.map(p => p.id === praticaId ? { ...p, stato: newStato } : p)
    );

    const { error } = await supabase
      .from("pratiche")
      .update({ stato: newStato })
      .eq("id", praticaId);

    if (error) {
      queryClient.setQueryData(["admin-all-pratiche"], (old: any[]) =>
        old?.map(p => p.id === praticaId ? { ...p, stato: oldStato } : p)
      );
      sonnerToast.error("Errore nello spostamento della pratica");
    } else {
      sonnerToast.success(`Pratica spostata in ${STATO_CONFIG[newStato].label}`);
      queryClient.invalidateQueries({ queryKey: ["admin-all-pratiche"] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Tutte le Pratiche</h1>
        <p className="text-muted-foreground">Vista globale di tutte le pratiche di tutte le aziende</p>
      </div>

      {!isLoading && pratiche.length > 0 && <PraticheSummaryBar pratiche={pratiche} />}

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
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered.map(p => ({
            titolo: p.titolo,
            azienda: (p.companies as any)?.ragione_sociale || "",
            cliente: p.clienti_finali ? `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome}` : "",
            stato: p.stato,
            prezzo: p.prezzo,
            data: new Date(p.created_at).toLocaleDateString("it-IT"),
          })), "pratiche-export", [
            { key: "titolo", label: "Titolo" },
            { key: "azienda", label: "Azienda" },
            { key: "cliente", label: "Cliente" },
            { key: "stato", label: "Stato" },
            { key: "prezzo", label: "Prezzo" },
            { key: "data", label: "Data" },
          ])}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
          <div className="flex rounded-lg border bg-muted p-0.5">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "pipeline" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("pipeline")}>
              <Columns3 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}>
              <Table2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats + select all */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "list" && filtered.length > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <Checkbox
                checked={selectedIds.size === filtered.length && filtered.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Tutte</span>
            </div>
          )}
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

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={clearSelection}
          onDelete={() => bulkDelete.mutate(Array.from(selectedIds))}
          onChangeStato={(stato) => bulkChangeStato.mutate({ ids: Array.from(selectedIds), stato })}
          onChangePagamento={(pagamento) => bulkChangePagamento.mutate({ ids: Array.from(selectedIds), pagamento })}
          isAdmin
        />
      )}

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
              const aging = getAgingDot(p);
              const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
              const isSelected = selectedIds.has(p.id);
              return (
                <Card key={p.id} className={`transition-colors hover:bg-accent/50 ${isSelected ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(p.id)}
                      />
                    </div>
                    <div className="relative">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${conf.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {aging && (
                        <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background ${aging.color}`} title={aging.label} />
                      )}
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
                        <span className="text-xs">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: it })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={p.pagamento_stato}
                        onValueChange={v => quickChangePagamento.mutate({ praticaId: p.id, pagamentoStato: v })}
                      >
                        <SelectTrigger className={`h-7 w-32 text-xs ${pagamento.className}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="non_pagata">Non pagata</SelectItem>
                          <SelectItem value="in_verifica">In verifica</SelectItem>
                          <SelectItem value="pagata">Pagata</SelectItem>
                          <SelectItem value="rimborsata">Rimborsata</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm font-semibold">€ {p.prezzo.toFixed(2)}</span>
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Elimina pratica</AlertDialogTitle>
                            <AlertDialogDescription>
                              Stai per eliminare la pratica "{p.titolo}". Questa azione è irreversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => bulkDelete.mutate([p.id])}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
        /* Pipeline view with DnD */
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-4" style={{ minWidth: STATO_ORDER.length * 260 }}>
              {STATO_ORDER.map(stato => {
                const conf = STATO_CONFIG[stato];
                const Icon = conf.icon;
                const items = filtered.filter(p => p.stato === stato);

                return (
                  <AdminDroppableColumn key={stato} stato={stato}>
                    <div className="flex items-center gap-2 p-3 border-b">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${conf.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm font-semibold flex-1">{conf.label}</span>
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">{items.length}</Badge>
                    </div>
                    <div className="flex flex-col gap-2 p-2 min-h-[120px] max-h-[60vh] overflow-y-auto">
                      {items.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                          Nessuna pratica
                        </div>
                      ) : (
                        items.map(p => (
                          <AdminDraggableCard key={p.id} pratica={p} navigate={navigate} assigneeMap={assigneeMap} />
                        ))
                      )}
                    </div>
                  </AdminDroppableColumn>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <DragOverlay>
            {activePratica && (
              <Card className="w-[230px] shadow-xl rotate-2">
                <CardContent className="p-3 space-y-1">
                  <p className="text-sm font-medium truncate">{activePratica.titolo}</p>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />{(activePratica.companies as any)?.ragione_sociale}
                  </span>
                  <p className="text-xs font-semibold">€ {activePratica.prezzo.toFixed(2)}</p>
                </CardContent>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
