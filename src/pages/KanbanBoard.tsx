import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  usePipelineStages,
  useEneaPractices,
  useMoveStage,
  useUpdateEneaPractice,
} from "@/hooks/useEneaPractices";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Building2,
  MessageCircle,
  Mail,
  AlertTriangle,
  SlidersHorizontal,
  Columns,
  Tag,
  MoveHorizontal,
  ChevronDown,
  ChevronsUpDown,
  Phone,
  Link,
  Archive,
  RotateCcw,
  Pencil,
  X,
  Plus,
  Check,
  Download,
  Filter,
  FilterX,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";
import { PipelineSettingsDrawer } from "@/components/pratiche/PipelineSettingsDrawer";

type PracticeWithRelations = EneaPractice & {
  pipeline_stages: PipelineStage | null;
  companies: { id: string; ragione_sociale: string } | null;
};

type SortOption = "recenti" | "vecchie" | "stage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(val: string | null | undefined) {
  if (!val) return "—";
  try {
    return format(new Date(val), "d MMMM yyyy", { locale: it });
  } catch {
    return val;
  }
}

function formatDateTime(val: string | null | undefined) {
  if (!val) return "—";
  try {
    return format(new Date(val), "d MMM yyyy, HH:mm", { locale: it });
  } catch {
    return val;
  }
}

function daysAgo(val: string | null | undefined) {
  if (!val) return 0;
  return Math.floor((Date.now() - new Date(val).getTime()) / 86400000);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── PracticeDetailSheet ───────────────────────────────────────────────────────

function PracticeDetailSheet({
  practice,
  isInternal,
  stages,
  operatorMap,
  allPractices,
  onClose,
  onMove,
}: {
  practice: PracticeWithRelations | null;
  isInternal: boolean;
  stages: PipelineStage[];
  operatorMap: Record<string, string>;
  allPractices: PracticeWithRelations[];
  onClose: () => void;
  onMove: (args: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => void;
}) {
  const { toast } = useToast();
  const updatePractice = useUpdateEneaPractice();
  const [editMode, setEditMode] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editNoteInterne, setEditNoteInterne] = useState("");
  const [editDocs, setEditDocs] = useState<string[]>([]);
  const [editOperatoreId, setEditOperatoreId] = useState<string>("");
  const [newDoc, setNewDoc] = useState("");

  const operatorIds = [
    ...new Set(allPractices.map((p) => p.operatore_id).filter(Boolean)),
  ] as string[];

  const { data: allOperators = [] } = useQuery({
    queryKey: ["sheet-operators", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  function enterEditMode() {
    if (!practice) return;
    setEditNote(practice.note ?? "");
    setEditNoteInterne(practice.note_interne ?? "");
    setEditDocs([...(practice.documenti_mancanti ?? [])]);
    setEditOperatoreId(practice.operatore_id ?? "");
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setNewDoc("");
  }

  async function handleSave() {
    if (!practice) return;
    await updatePractice.mutateAsync({
      id: practice.id,
      updates: {
        note: editNote || null,
        note_interne: isInternal ? editNoteInterne || null : undefined,
        documenti_mancanti: editDocs,
        operatore_id: isInternal ? editOperatoreId || null : undefined,
      },
    });
    toast({ title: "Pratica aggiornata" });
    setEditMode(false);
  }

  async function handleArchive() {
    if (!practice) return;
    if (practice.archived_at) {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { archived_at: null },
      });
      toast({ title: "Pratica ripristinata" });
    } else {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { archived_at: new Date().toISOString() },
      });
      toast({ title: "Pratica archiviata" });
    }
  }

  function copyFormLink() {
    if (!practice) return;
    const url = `${window.location.origin}/form/${practice.form_token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copiato!" });
    });
  }

  return (
    <Sheet
      open={!!practice}
      onOpenChange={(open) => {
        if (!open) {
          setEditMode(false);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {practice && (
          <>
            <SheetHeader className="mb-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  style={{
                    backgroundColor: practice.brand === "enea" ? "#3b82f6" : "#f97316",
                    color: "white",
                  }}
                  className="text-xs"
                >
                  {practice.brand === "enea" ? "ENEA" : "Conto Termico"}
                </Badge>
                {practice.pipeline_stages && (
                  <Badge variant="outline" className="text-xs">
                    {practice.pipeline_stages.name}
                  </Badge>
                )}
                {practice.tipo_servizio === "servizio_completo" ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                    ✦ Servizio Completo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    Self Service
                  </span>
                )}
                {practice.archived_at && (
                  <Badge variant="secondary" className="text-xs">
                    Archiviata
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-lg leading-tight">
                {practice.cliente_nome} {practice.cliente_cognome}
              </SheetTitle>
              {isInternal && practice.companies && (
                <SheetDescription className="text-xs">
                  {practice.companies.ragione_sociale}
                </SheetDescription>
              )}
            </SheetHeader>

            {/* Action buttons row */}
            {!editMode && (
              <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b">
                {/* Stage select */}
                <Select
                  value={practice.current_stage_id ?? ""}
                  onValueChange={(newStageId) => {
                    if (!newStageId || newStageId === practice.current_stage_id) return;
                    const newStage = stages.find((s) => s.id === newStageId);
                    const oldStage = stages.find((s) => s.id === practice.current_stage_id);
                    onMove({
                      practiceId: practice.id,
                      newStageId,
                      oldStageName: oldStage?.name ?? "—",
                      newStageName: newStage?.name ?? "—",
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-auto gap-1 pr-2">
                    <MoveHorizontal className="h-3.5 w-3.5 mr-1" />
                    <SelectValue placeholder="Sposta stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Email */}
                {practice.cliente_email ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a href={`mailto:${practice.cliente_email}`}>
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </Button>
                )}

                {/* WhatsApp */}
                {practice.cliente_telefono ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a
                      href={`https://wa.me/${practice.cliente_telefono.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled>
                    <Phone className="h-3.5 w-3.5" />
                    WhatsApp
                  </Button>
                )}

                {/* Copy form link */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={copyFormLink}
                >
                  <Link className="h-3.5 w-3.5" />
                  Copia link form
                </Button>

                {/* Archive / Restore */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={handleArchive}
                >
                  {practice.archived_at ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Ripristina
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5" />
                      Archivia
                    </>
                  )}
                </Button>

                {/* Edit */}
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={enterEditMode}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifica
                </Button>
              </div>
            )}

            {/* Edit mode */}
            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Note
                  </label>
                  <Textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                    placeholder="Note sulla pratica..."
                  />
                </div>

                {isInternal && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Note interne
                    </label>
                    <Textarea
                      value={editNoteInterne}
                      onChange={(e) => setEditNoteInterne(e.target.value)}
                      rows={3}
                      placeholder="Note interne (non visibili al rivenditore)..."
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Documenti mancanti
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editDocs.map((doc, i) => (
                      <span
                        key={doc}
                        className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5"
                      >
                        {doc}
                        <button
                          type="button"
                          onClick={() => setEditDocs(editDocs.filter((_, j) => j !== i))}
                          className="hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {editDocs.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nessun documento mancante</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newDoc}
                      onChange={(e) => setNewDoc(e.target.value)}
                      placeholder="Aggiungi documento..."
                      className="text-xs h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDoc.trim()) {
                          setEditDocs([...editDocs, newDoc.trim()]);
                          setNewDoc("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        if (newDoc.trim()) {
                          setEditDocs([...editDocs, newDoc.trim()]);
                          setNewDoc("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isInternal && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Operatore
                    </label>
                    <Select value={editOperatoreId} onValueChange={setEditOperatoreId}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Nessun operatore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nessun operatore</SelectItem>
                        {allOperators.map((op) => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.nome} {op.cognome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={updatePractice.isPending}
                    className="gap-1"
                  >
                    <Check className="h-4 w-4" />
                    Salva
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Dati cliente */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Dati cliente
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Codice fiscale</p>
                      <p className="font-medium">{practice.cliente_cf || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <p className="font-medium">{practice.cliente_telefono || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{practice.cliente_email || "—"}</p>
                    </div>
                    {practice.cliente_indirizzo && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Indirizzo</p>
                        <p className="font-medium">{practice.cliente_indirizzo}</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Info pratica */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Info pratica
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Prodotto installato</p>
                      <p className="font-medium">{practice.prodotto_installato || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fornitore</p>
                      <p className="font-medium">{practice.fornitore || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data invio pratica</p>
                      <p className="font-medium">{formatDate(practice.data_invio_pratica)}</p>
                    </div>
                  </div>
                </section>

                {/* Guadagno (internal only) */}
                {isInternal && (practice.guadagno_lordo != null || practice.guadagno_netto != null) && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Guadagno
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Lordo</p>
                        <p className="font-medium">
                          {practice.guadagno_lordo != null
                            ? `€ ${Number(practice.guadagno_lordo).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Netto</p>
                        <p className="font-medium">
                          {practice.guadagno_netto != null
                            ? `€ ${Number(practice.guadagno_netto).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Documenti mancanti */}
                {practice.documenti_mancanti?.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Documenti mancanti
                    </h3>
                    <ul className="space-y-1">
                      {practice.documenti_mancanti.map((doc: string) => (
                        <li
                          key={doc}
                          className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          {doc}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Note */}
                {practice.note && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Note
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{practice.note}</p>
                  </section>
                )}

                {/* Note interne (internal only) */}
                {isInternal && practice.note_interne && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Note interne
                    </h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {practice.note_interne}
                    </p>
                  </section>
                )}

                {/* Form status */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Form
                  </h3>
                  <p className="text-sm">
                    {practice.form_compilato_at ? (
                      <span className="text-green-700 dark:text-green-400">
                        Compilato il {formatDate(practice.form_compilato_at)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Non compilato</span>
                    )}
                  </p>
                </section>

                {/* Metadati */}
                <section className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <div>
                      <p>Solleciti inviati</p>
                      <p className="font-medium text-foreground">{practice.conteggio_solleciti ?? 0}</p>
                    </div>
                    <div>
                      <p>Creata il</p>
                      <p className="font-medium text-foreground">{formatDateTime(practice.created_at)}</p>
                    </div>
                    <div className="col-span-2">
                      <p>Ultimo aggiornamento</p>
                      <p className="font-medium text-foreground">{formatDateTime(practice.updated_at)}</p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  intent = "default",
}: {
  label: string;
  value: number | string;
  intent?: "default" | "warning" | "danger" | "success";
}) {
  const colors: Record<string, string> = {
    default: "bg-muted/60 text-foreground",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  };
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs whitespace-nowrap ${colors[intent]}`}
    >
      <span className="font-normal opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// ── PracticeCard ──────────────────────────────────────────────────────────────

function PracticeCard({
  practice,
  index,
  isInternal,
  operatorMap,
  onOpen,
}: {
  practice: PracticeWithRelations;
  index: number;
  isInternal: boolean;
  operatorMap: Record<string, string>;
  onOpen: (p: PracticeWithRelations) => void;
}) {
  const days = daysAgo(practice.updated_at);
  const hasMissingDocs = practice.documenti_mancanti?.length > 0;
  const stageType = practice.pipeline_stages?.stage_type;
  const operatorName = practice.operatore_id ? operatorMap[practice.operatore_id] : null;

  const agingIntent =
    days > 7 ? "text-destructive" : days >= 4 ? "text-amber-500" : "text-muted-foreground";

  return (
    <Draggable draggableId={practice.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => !snapshot.isDragging && onOpen(practice)}
          className={`group rounded-lg bg-background border p-3 space-y-2 text-sm cursor-grab active:cursor-grabbing transition-all duration-150 ${
            snapshot.isDragging
              ? "shadow-xl ring-2 ring-primary/30 rotate-1"
              : "shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
        >
          {/* Top: name + brand */}
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold leading-snug truncate text-[13px]">
              {practice.cliente_nome} {practice.cliente_cognome}
            </span>
            <span
              className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                practice.brand === "enea"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
              }`}
            >
              {practice.brand === "enea" ? "ENEA" : "CT"}
            </span>
          </div>

          {/* Company (internal only) */}
          {isInternal && practice.companies && (
            <p className="text-[11px] text-muted-foreground truncate">
              {practice.companies.ragione_sociale}
            </p>
          )}

          {/* Product */}
          {practice.prodotto_installato && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Tag className="h-3 w-3 shrink-0" />
              {practice.prodotto_installato}
            </p>
          )}

          {/* Form status dot */}
          {practice.form_compilato_at ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Form compilato</span>
            </div>
          ) : stageType === "attesa_compilazione" ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[11px] text-amber-600 dark:text-amber-400">In attesa form</span>
            </div>
          ) : null}

          {/* Operator (internal only) */}
          {isInternal && operatorName && (
            <div className="flex items-center gap-1.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                {getInitials(operatorName)}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{operatorName}</span>
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between pt-0.5">
            <span className={`text-[11px] font-medium ${agingIntent}`}>{days}g fa</span>
            <div className="flex items-center gap-1.5">
              {hasMissingDocs && (
                <span className="flex items-center gap-0.5 text-[11px] text-amber-600 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {practice.documenti_mancanti.length}
                </span>
              )}
              {practice.conteggio_solleciti > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-blue-500">
                  <MessageCircle className="h-3 w-3" />
                  {practice.conteggio_solleciti}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const { user, isInternal } = useAuth();
  const { toast } = useToast();
  const moveStage = useMoveStage();

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState<PracticeWithRelations | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("recenti");
  const [operatoreFilter, setOperatoreFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const location = useLocation();
  const [aziendaFilter, setAziendaFilter] = useState<string>(
    (location.state as { aziendaFilter?: string } | null)?.aziendaFilter ?? "all"
  );
  const [clienteFilter, setClienteFilter] = useState("");
  const [aziendaComboboxOpen, setAziendaComboboxOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [archiveConfirm, setArchiveConfirm] = useState<{
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  } | null>(null);

  const { data: stages = [] } = usePipelineStages(
    brandFilter !== "all" ? brandFilter : undefined
  );

  const { data: practices = [], isLoading } = useEneaPractices({
    brand: brandFilter !== "all" ? brandFilter : undefined,
    search: search.length > 1 ? search : undefined,
    includeArchived: showArchived,
  });

  // Operator map for cards and sheet
  const operatorIds = [
    ...new Set(practices.map((p) => p.operatore_id).filter(Boolean)),
  ] as string[];

  const { data: operators = [] } = useQuery({
    queryKey: ["kanban-operators", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  const operatorMap = Object.fromEntries(
    operators.map((o) => [o.id, `${o.nome} ${o.cognome}`.trim()])
  );

  // All companies from DB (for internal filter - loads all, not just from loaded practices)
  const { data: allCompaniesFromDB = [] } = useQuery({
    queryKey: ["kanban-all-companies"],
    enabled: isInternal,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .order("ragione_sociale");
      return data ?? [];
    },
  });

  // Stats
  const activePractices = practices.filter((p) => !p.archived_at);
  const pronteDaFare = activePractices.filter(
    (p) => p.pipeline_stages?.stage_type === "pronte_da_fare"
  ).length;
  const staleCount = activePractices.filter(
    (p) => daysAgo(p.updated_at) > 7
  ).length;

  // Apply all client-side filters
  const filteredPractices = practices.filter((p) => {
    if (isInternal && operatoreFilter !== "all" && p.operatore_id !== operatoreFilter) return false;
    if (isInternal && aziendaFilter !== "all" && p.companies?.id !== aziendaFilter) return false;
    if (stageFilter !== "all" && p.current_stage_id !== stageFilter) return false;
    if (dateFrom && p.created_at < dateFrom) return false;
    if (dateTo && p.created_at > dateTo + "T23:59:59") return false;
    if (clienteFilter.trim()) {
      const q = clienteFilter.trim().toLowerCase();
      const fullName = `${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""}`.toLowerCase();
      const email = (p.cliente_email ?? "").toLowerCase();
      const cf = (p.cliente_cf ?? "").toLowerCase();
      if (!fullName.includes(q) && !email.includes(q) && !cf.includes(q)) return false;
    }
    return true;
  });

  const activeFilterCount = [
    dateFrom, dateTo,
    aziendaFilter !== "all",
    operatoreFilter !== "all",
    stageFilter !== "all",
    clienteFilter.trim() !== "",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  // Export to CSV
  const exportCSV = () => {
    const headers = [
      "Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Brand",
      "Azienda", "Stage", "Prodotto", "Fornitore", "Note",
      "Guadagno Netto (€)", "Guadagno Lordo (€)", "Solleciti",
      "Form Compilato", "Operatore", "Archiviata", "Creata il", "Aggiornata il",
    ];
    const rows = filteredPractices.map((p) => [
      p.cliente_nome,
      p.cliente_cognome,
      p.cliente_email ?? "",
      p.cliente_telefono ?? "",
      p.cliente_cf ?? "",
      p.brand === "enea" ? "ENEA" : "Conto Termico",
      p.companies?.ragione_sociale ?? "",
      p.pipeline_stages?.name ?? "",
      p.prodotto_installato ?? "",
      p.fornitore ?? "",
      (p.note ?? "").replace(/[\r\n]+/g, " "),
      p.guadagno_netto != null ? p.guadagno_netto.toFixed(2) : "",
      p.guadagno_lordo != null ? p.guadagno_lordo.toFixed(2) : "",
      p.conteggio_solleciti ?? 0,
      p.form_compilato_at ? format(new Date(p.form_compilato_at), "dd/MM/yyyy") : "No",
      p.operatore_id ? (operatorMap[p.operatore_id] ?? "") : "",
      p.archived_at ? "Sì" : "No",
      format(new Date(p.created_at), "dd/MM/yyyy HH:mm"),
      format(new Date(p.updated_at), "dd/MM/yyyy HH:mm"),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Esportate ${filteredPractices.length} pratiche` });
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setAziendaFilter("all");
    setOperatoreFilter("all");
    setClienteFilter("");
    setStageFilter("all");
  };

  const byStage = useCallback(
    (stageId: string) => {
      let cards = filteredPractices.filter((p) => p.current_stage_id === stageId);
      if (sortOption === "recenti") {
        cards = cards.slice().sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortOption === "vecchie") {
        cards = cards.slice().sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      } else if (sortOption === "stage") {
        cards = cards.slice().sort(
          (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );
      }
      return cards;
    },
    [filteredPractices, sortOption]
  );

  const doMove = ({
    practiceId,
    newStageId,
    oldStageName,
    newStageName,
  }: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => {
    const newStage = stages.find((s) => s.id === newStageId);
    moveStage.mutate(
      { practiceId, newStageId, oldStageName, newStageName, userId: user?.id ?? "" },
      {
        onSuccess: () => {
          if (newStage?.stage_type === "pronte_da_fare") {
            toast({ title: "Pratica pronta!", description: "Assegna un operatore." });
          }
        },
      }
    );
  };

  const handleMoveFromSheet = ({
    practiceId,
    newStageId,
    oldStageName,
    newStageName,
  }: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => {
    const newStage = stages.find((s) => s.id === newStageId);
    if (newStage?.stage_type === "archiviate") {
      setArchiveConfirm({ practiceId, newStageId, oldStageName, newStageName });
      return;
    }
    doMove({ practiceId, newStageId, oldStageName, newStageName });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const practice = practices.find((p) => p.id === draggableId);
    if (!practice || practice.current_stage_id === newStageId) return;

    const newStage = stages.find((s) => s.id === newStageId);
    const oldStage = stages.find((s) => s.id === practice.current_stage_id);

    if (newStage?.stage_type === "archiviate") {
      setArchiveConfirm({
        practiceId: practice.id,
        newStageId,
        oldStageName: oldStage?.name ?? "—",
        newStageName: newStage?.name ?? "Archiviate",
      });
      return;
    }

    doMove({
      practiceId: practice.id,
      newStageId,
      oldStageName: oldStage?.name ?? "—",
      newStageName: newStage?.name ?? "—",
    });
  };

  const deduped =
    brandFilter === "all"
      ? stages.filter(
          (s, i, arr) => arr.findIndex((x) => x.stage_type === s.stage_type) === i
        )
      : stages;

  const sortLabels: Record<SortOption, string> = {
    recenti: "Più recenti",
    vecchie: "Più vecchie",
    stage: "Più in stage",
  };

  return (
    <div
      className="flex flex-col -m-4 md:-m-6 lg:-m-8 overflow-hidden"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* ── Toolbar row 1: title · search · actions ────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background shrink-0">
        {/* Title + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold text-sm tracking-tight">Pipeline</span>
          <span className="inline-flex h-5 min-w-[1.25rem] px-1.5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {filteredPractices.length}
          </span>
          {isInternal && aziendaFilter !== "all" && (
            <button
              onClick={() => setAziendaFilter("all")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
              title="Rimuovi filtro azienda"
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="max-w-[140px] truncate">
                {allCompaniesFromDB.find((c) => c.id === aziendaFilter)?.ragione_sociale ?? "Azienda"}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm mx-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca cliente, CF, email..."
            className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus-visible:border-input focus-visible:bg-background transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          <Button
            variant={hasActiveFilters ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5 gap-1.5 relative text-xs"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtri</span>
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 gap-1.5 text-xs"
            onClick={exportCSV}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Esporta</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}
            title="Impostazioni pipeline"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Toolbar row 2: brand segment · archive · sort ────────────────── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-background shrink-0">
        <div className="inline-flex items-center gap-0.5 bg-muted rounded-md p-0.5">
          {(["all", "enea", "conto_termico"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 ${
                brandFilter === b
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b === "all" ? "Tutti" : b === "enea" ? "ENEA" : "Conto Termico"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`text-xs transition-colors ${
              showArchived
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {showArchived ? "Nascondi archiviate" : "Archiviate"}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
                {sortLabels[sortOption]}
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortOption("recenti")}>Più recenti</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("vecchie")}>Più vecchie</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("stage")}>Più in stage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-background/80 border-b shrink-0 overflow-x-auto">
        <StatPill label="Attive" value={activePractices.length} />
        <StatPill
          label="Pronte da fare"
          value={pronteDaFare}
          intent={pronteDaFare > 0 ? "warning" : "default"}
        />
        <StatPill
          label="Stale >7g"
          value={staleCount}
          intent={staleCount > 0 ? "danger" : "default"}
        />
        {hasActiveFilters && (
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredPractices.length} filtrate
          </span>
        )}
      </div>

      {/* ── Filters Sheet (right side) ─────────────────────────────────── */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-80 flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b">
            <SheetTitle className="text-base">Filtri pipeline</SheetTitle>
            <SheetDescription className="text-xs">
              Filtra le pratiche per data, cliente, stage e operatore.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Nome, cognome, CF, email..."
                  className="pl-8 h-9 text-sm"
                  value={clienteFilter}
                  onChange={(e) => setClienteFilter(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Periodo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Periodo creazione
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Dal</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Al</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Stage */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stage
              </label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Tutti gli stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stage</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Azienda (internal only) */}
            {isInternal && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Azienda
                  </label>
                  <Popover open={aziendaComboboxOpen} onOpenChange={setAziendaComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={aziendaComboboxOpen}
                        className="w-full h-9 justify-between text-sm font-normal"
                      >
                        <span className="truncate">
                          {aziendaFilter === "all"
                            ? "Tutte le aziende"
                            : (allCompaniesFromDB.find((c) => c.id === aziendaFilter)?.ragione_sociale ?? "Azienda")}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca azienda..." className="h-9 text-sm" />
                        <CommandEmpty>Nessuna azienda trovata.</CommandEmpty>
                        <CommandGroup className="max-h-56 overflow-y-auto">
                          <CommandItem
                            value="__all__"
                            onSelect={() => { setAziendaFilter("all"); setAziendaComboboxOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", aziendaFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Tutte le aziende
                          </CommandItem>
                          {allCompaniesFromDB.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.ragione_sociale}
                              onSelect={() => { setAziendaFilter(c.id); setAziendaComboboxOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-3.5 w-3.5", aziendaFilter === c.id ? "opacity-100" : "opacity-0")} />
                              {c.ragione_sociale}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Operatore (internal only) */}
            {isInternal && operators.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Operatore
                  </label>
                  <Select value={operatoreFilter} onValueChange={setOperatoreFilter}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Tutti gli operatori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli operatori</SelectItem>
                      {operators.map((op) => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.nome} {op.cognome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <SheetFooter className="px-5 py-4 border-t flex-row gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => { clearFilters(); }}
              >
                <FilterX className="h-3.5 w-3.5" />
                Rimuovi ({activeFilterCount})
              </Button>
            )}
            <SheetClose asChild>
              <Button size="sm" className="flex-1">
                Mostra {filteredPractices.length} pratiche
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Board */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : deduped.length === 0 ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Columns className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Nessuno stage configurato</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Configura gli stage della pipeline per iniziare a gestire le pratiche nel Kanban.
            </p>
          </div>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Configura pipeline
          </Button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-1 min-h-0 gap-3 overflow-x-auto p-4 pb-6">
            {deduped.map((stage) => {
              const cards = byStage(stage.id);
              const isArchived = stage.stage_type === "archiviate";
              const columnRevenue = isInternal
                ? cards.reduce((sum, p) => sum + (p.guadagno_netto ?? 0), 0)
                : 0;

              return (
                <div
                  key={stage.id}
                  className={`flex flex-col w-72 flex-shrink-0 rounded-lg border transition-opacity ${
                    isArchived ? "bg-muted/20 opacity-60" : "bg-muted/40"
                  }`}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-t-lg"
                    style={{ borderTop: `3px solid ${isArchived ? "#9ca3af" : stage.color}` }}
                  >
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <span
                        className={`font-semibold text-xs uppercase tracking-wider truncate ${
                          isArchived ? "text-muted-foreground" : "text-foreground/80"
                        }`}
                      >
                        {stage.name}
                      </span>
                      {isInternal && columnRevenue > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          € {columnRevenue.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] px-1.5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                        isArchived
                          ? "bg-muted text-muted-foreground"
                          : "text-white"
                      }`}
                      style={isArchived ? {} : { backgroundColor: stage.color }}
                    >
                      {cards.length}
                    </span>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 p-2 flex-1 min-h-[80px] overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : ""
                        }`}
                      >
                        {cards.length === 0 && !snapshot.isDraggingOver ? (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/40 text-xs">
                            <MoveHorizontal className="h-6 w-6 mb-1" />
                            Nessuna pratica
                          </div>
                        ) : (
                          cards.map((practice, index) => (
                            <PracticeCard
                              key={practice.id}
                              practice={practice}
                              index={index}
                              isInternal={isInternal}
                              operatorMap={operatorMap}
                              onOpen={setSelectedPractice}
                            />
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Archive confirm dialog */}
      <AlertDialog
        open={!!archiveConfirm}
        onOpenChange={(o) => !o && setArchiveConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiviare la pratica?</AlertDialogTitle>
            <AlertDialogDescription>
              La pratica verrà spostata in "Archiviate". Puoi sempre ripristinarla in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveConfirm) doMove(archiveConfirm);
                setArchiveConfirm(null);
              }}
            >
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Practice detail sheet */}
      <PracticeDetailSheet
        practice={selectedPractice}
        isInternal={isInternal}
        stages={stages}
        operatorMap={operatorMap}
        allPractices={practices}
        onClose={() => setSelectedPractice(null)}
        onMove={handleMoveFromSheet}
      />

      <PipelineSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
