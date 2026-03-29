import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ListChecks, Plus, Trash2, CalendarIcon, Flag,
  EyeOff, Eye, MoreHorizontal, ChevronDown, ChevronUp, User2,
} from "lucide-react";
import { format, isPast, isToday, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────

type Priorita = "bassa" | "media" | "alta" | "urgente";

interface ChecklistItem {
  id: string;
  pratica_id: string;
  company_id: string;
  titolo: string;
  completato: boolean;
  completato_at: string | null;
  completato_da: string | null;
  assegnatario_id: string | null;
  ordine: number;
  created_at: string;
  priorita: Priorita;
  scadenza: string | null;
  note: string | null;
}

interface ChecklistPanelProps {
  praticaId: string;
  companyId: string;
  serviceId?: string | null;
}

interface TemplateItem {
  titolo?: string;
  title?: string;
}

// ─── Priority config ────────────────────────────────────────────────────────

const PRIORITA: Record<Priorita, { label: string; dot: string; badge: string }> = {
  urgente: { label: "Urgente", dot: "bg-red-500",    badge: "bg-red-50 text-red-600 border-red-200" },
  alta:    { label: "Alta",    dot: "bg-orange-500", badge: "bg-orange-50 text-orange-600 border-orange-200" },
  media:   { label: "Media",   dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-600 border-yellow-200" },
  bassa:   { label: "Bassa",   dot: "bg-gray-300",   badge: "bg-gray-50 text-gray-500 border-gray-200" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function dueDateLabel(scadenza: string | null): { text: string; cls: string } | null {
  if (!scadenza) return null;
  const date = parseISO(scadenza);
  const today = startOfDay(new Date());
  if (isPast(date) && !isToday(date)) {
    return { text: `Scaduto ${format(date, "d MMM", { locale: it })}`, cls: "text-red-600 bg-red-50 border-red-200" };
  }
  if (isToday(date)) {
    return { text: "Scade oggi", cls: "text-orange-600 bg-orange-50 border-orange-200" };
  }
  return { text: format(date, "d MMM", { locale: it }), cls: "text-muted-foreground bg-muted border-border" };
}

// ─── TaskRow sub-component ──────────────────────────────────────────────────

function TaskRow({
  item,
  operators,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: ChecklistItem;
  operators: Array<{ id: string; nome: string; cognome: string }>;
  onToggle: (id: string, val: boolean) => void;
  onUpdate: (id: string, patch: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(item.titolo);
  const [showNote, setShowNote] = useState(false);
  const [noteVal, setNoteVal] = useState(item.note ?? "");
  const [calOpen, setCalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const saveTitle = () => {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== item.titolo) onUpdate(item.id, { titolo: trimmed });
    setEditing(false);
  };

  const saveNote = () => {
    const trimmed = noteVal.trim();
    if (trimmed !== (item.note ?? "")) onUpdate(item.id, { note: trimmed || null });
  };

  const dueLabel = dueDateLabel(item.scadenza);
  const assignee = operators.find(o => o.id === item.assegnatario_id);
  const pCfg = PRIORITA[item.priorita ?? "media"];

  return (
    <div className={`group rounded-lg border transition-colors ${item.completato ? "bg-muted/20 border-border/50" : "bg-card border-border hover:border-border/80"}`}>
      <div className="flex items-start gap-2.5 p-2.5">
        {/* Priority dot */}
        <div className={`mt-[14px] h-2 w-2 shrink-0 rounded-full ${pCfg.dot}`} title={pCfg.label} />

        {/* Checkbox */}
        <Checkbox
          checked={item.completato}
          onCheckedChange={(v) => onToggle(item.id, !!v)}
          className="mt-2 shrink-0"
        />

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") { setEditVal(item.titolo); setEditing(false); }
              }}
              className="w-full bg-transparent text-sm font-medium outline-none border-b border-primary pb-0.5"
            />
          ) : (
            <p
              onClick={() => !item.completato && setEditing(true)}
              className={`text-sm font-medium leading-snug cursor-pointer ${item.completato ? "line-through text-muted-foreground" : "hover:text-primary transition-colors"}`}
            >
              {item.titolo}
            </p>
          )}

          {/* Chips row */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {dueLabel && (
              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${dueLabel.cls}`}>
                <CalendarIcon className="h-2.5 w-2.5" />
                {dueLabel.text}
              </span>
            )}
            {assignee && (
              <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 border-blue-200">
                <User2 className="h-2.5 w-2.5" />
                {assignee.nome} {assignee.cognome}
              </span>
            )}
            {item.note && (
              <button
                onClick={() => setShowNote(v => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNote ? "Nascondi nota" : "Mostra nota"}
              </button>
            )}
          </div>
        </div>

        {/* Action menu */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {/* Due date */}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Imposta scadenza">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Scadenza</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={item.scadenza ? parseISO(item.scadenza) : undefined}
                onSelect={(date) => {
                  onUpdate(item.id, { scadenza: date ? format(date, "yyyy-MM-dd") : null });
                  setCalOpen(false);
                }}
                locale={it}
              />
              {item.scadenza && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    onClick={() => { onUpdate(item.id, { scadenza: null }); setCalOpen(false); }}
                  >
                    Rimuovi scadenza
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* More actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Altre opzioni">
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Priority */}
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Priorità</div>
              {(Object.entries(PRIORITA) as [Priorita, typeof PRIORITA[Priorita]][]).map(([key, cfg]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => onUpdate(item.id, { priorita: key })}
                  className={`gap-2 text-xs ${item.priorita === key ? "font-semibold" : ""}`}
                >
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                  {item.priorita === key && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
              ))}

              {/* Assignee */}
              {operators.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Assegna a</div>
                  <DropdownMenuItem
                    onClick={() => onUpdate(item.id, { assegnatario_id: null })}
                    className="gap-2 text-xs text-muted-foreground"
                  >
                    — Nessuno
                  </DropdownMenuItem>
                  {operators.map(op => (
                    <DropdownMenuItem
                      key={op.id}
                      onClick={() => onUpdate(item.id, { assegnatario_id: op.id })}
                      className={`gap-2 text-xs ${item.assegnatario_id === op.id ? "font-semibold" : ""}`}
                    >
                      <User2 className="h-3 w-3" />
                      {op.nome} {op.cognome}
                      {item.assegnatario_id === op.id && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Note */}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowNote(v => !v)} className="gap-2 text-xs">
                <Flag className="h-3 w-3" />
                {showNote ? "Nascondi nota" : "Aggiungi/modifica nota"}
              </DropdownMenuItem>

              {/* Delete */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(item.id)}
                className="gap-2 text-xs text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Note section */}
      {showNote && (
        <div className="px-2.5 pb-2.5">
          <Textarea
            value={noteVal}
            onChange={e => setNoteVal(e.target.value)}
            onBlur={saveNote}
            placeholder="Aggiungi una nota..."
            className="text-xs resize-none min-h-[60px] bg-muted/40"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ChecklistPanel({ praticaId, companyId, serviceId }: ChecklistPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const generatedRef = useRef(false);

  const [newTitle, setNewTitle] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // ── Query: items ─────────────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["checklist", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("ordine");
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });

  // ── Query: operators for assignee ─────────────────────────────────────────
  const { data: operators = [] } = useQuery({
    queryKey: ["internal-operators"],
    queryFn: async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["operatore", "admin_interno", "super_admin"]);
      if (!roleData?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", roleData.map(r => r.user_id));
      return profiles ?? [];
    },
  });

  // ── Auto-generate from service template ──────────────────────────────────
  const { data: service } = useQuery({
    queryKey: ["service-template", serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      const { data, error } = await supabase
        .from("service_catalog")
        .select("checklist_template")
        .eq("id", serviceId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!serviceId && items.length === 0,
  });

  const generateChecklist = useMutation({
    mutationFn: async (template: (string | TemplateItem)[]) => {
      const rows = template.map((item, i) => ({
        pratica_id: praticaId,
        company_id: companyId,
        titolo: typeof item === "string" ? item : item.titolo || item.title || `Task ${i + 1}`,
        ordine: i,
        priorita: "media" as Priorita,
      }));
      const { error } = await supabase.from("checklist_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] }),
  });

  const { mutate: generateChecklistMutate, isPending: isGeneratingChecklist } = generateChecklist;
  useEffect(() => {
    if (
      !generatedRef.current &&
      service?.checklist_template &&
      Array.isArray(service.checklist_template) &&
      service.checklist_template.length > 0 &&
      items.length === 0 &&
      !isGeneratingChecklist
    ) {
      generatedRef.current = true;
      generateChecklistMutate(service.checklist_template as (string | TemplateItem)[]);
    }
  }, [service, items.length, isGeneratingChecklist, generateChecklistMutate]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addItem = useMutation({
    mutationFn: async (titolo: string) => {
      const maxOrdine = items.length > 0 ? Math.max(...items.map(i => i.ordine)) + 1 : 0;
      const { error } = await supabase.from("checklist_items").insert({
        pratica_id: praticaId,
        company_id: companyId,
        titolo,
        ordine: maxOrdine,
        priorita: "media",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] });
      setNewTitle("");
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ChecklistItem> }) => {
      const { error } = await supabase.from("checklist_items").update(patch as Record<string, unknown>).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] }),
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, completato }: { id: string; completato: boolean }) => {
      const { error } = await supabase.from("checklist_items").update({
        completato,
        completato_da: completato ? user?.id : null,
        completato_at: completato ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] }),
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] });
      toast({ title: "Attività eliminata" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`checklist-${praticaId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "checklist_items",
        filter: `pratica_id=eq.${praticaId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [praticaId, queryClient]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTitle.trim()) {
      addItem.mutate(newTitle.trim());
    }
  };

  const { mutate: toggleMutate } = toggleItem;
  const { mutate: updateMutate } = updateItem;
  const { mutate: deleteMutate } = deleteItem;

  const handleToggle = useCallback((id: string, val: boolean) => {
    toggleMutate({ id, completato: val });
  }, [toggleMutate]);

  const handleUpdate = useCallback((id: string, patch: Partial<ChecklistItem>) => {
    updateMutate({ id, patch });
  }, [updateMutate]);

  const handleDelete = useCallback((id: string) => {
    deleteMutate(id);
  }, [deleteMutate]);

  // ── Sort & split ──────────────────────────────────────────────────────────
  const priorityOrder: Priorita[] = ["urgente", "alta", "media", "bassa"];

  const sortItems = (list: ChecklistItem[]) =>
    [...list].sort((a, b) => {
      const pa = priorityOrder.indexOf(a.priorita ?? "media");
      const pb = priorityOrder.indexOf(b.priorita ?? "media");
      if (pa !== pb) return pa - pb;
      // Overdue first
      if (a.scadenza && b.scadenza) return a.scadenza.localeCompare(b.scadenza);
      if (a.scadenza) return -1;
      if (b.scadenza) return 1;
      return a.ordine - b.ordine;
    });

  const incomplete = sortItems(items.filter(i => !i.completato));
  const completed = items.filter(i => i.completato);
  const total = items.length;
  const completedCount = completed.length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Attività</CardTitle>
            {total > 0 && (
              <Badge variant="outline" className="ml-auto tabular-nums text-xs">
                {completedCount}/{total}
              </Badge>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 space-y-1">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">{progressPct}% completato</p>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* ── Empty state ─────────────────────────────────────────── */}
              {total === 0 && (
                <div className="flex flex-col items-center py-6 text-center">
                  <ListChecks className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Nessuna attività</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Aggiungi la prima attività qui sotto
                  </p>
                </div>
              )}

              {/* ── Incomplete tasks ─────────────────────────────────────── */}
              {incomplete.length > 0 && (
                <div className="space-y-1.5">
                  {incomplete.map(item => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      operators={operators}
                      onToggle={handleToggle}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {/* ── Completed section ────────────────────────────────────── */}
              {completedCount > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    {showCompleted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showCompleted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {completedCount} completat{completedCount === 1 ? "a" : "e"}
                  </button>
                  {showCompleted && (
                    <div className="mt-1.5 space-y-1.5">
                      {completed.map(item => (
                        <TaskRow
                          key={item.id}
                          item={item}
                          operators={operators}
                          onToggle={handleToggle}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Add task input ───────────────────────────────────────── */}
              <div className="flex items-center gap-2 pt-1">
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={addInputRef}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={handleAddKey}
                  placeholder="Aggiungi attività… (Invio per salvare)"
                  className="h-8 text-sm border-dashed border-border/60 bg-transparent placeholder:text-muted-foreground/50 focus:border-solid"
                  disabled={addItem.isPending}
                />
                {newTitle.trim() && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => addItem.mutate(newTitle.trim())}
                    disabled={addItem.isPending}
                  >
                    Aggiungi
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
