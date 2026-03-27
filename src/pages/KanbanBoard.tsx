import { useState, useCallback, useRef } from "react";
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
} from "@/components/ui/sheet";
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
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  MessageCircle,
  Mail,
  AlertTriangle,
  SlidersHorizontal,
  Columns,
  Tag,
  MoveHorizontal,
  ChevronDown,
  Phone,
  Link,
  Archive,
  RotateCcw,
  Pencil,
  X,
  Plus,
  Check,
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
                        key={i}
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
                      {practice.documenti_mancanti.map((doc: string, i: number) => (
                        <li
                          key={i}
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

  const agingClassName =
    days > 7
      ? "text-destructive font-bold"
      : days >= 4
      ? "text-amber-600 font-medium"
      : "text-muted-foreground";

  return (
    <Draggable draggableId={practice.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => !snapshot.isDragging && onOpen(practice)}
          className={`group rounded-md bg-background border p-3 space-y-2 text-sm cursor-grab active:cursor-grabbing shadow-sm transition-all ${
            snapshot.isDragging
              ? "shadow-lg ring-2 ring-primary"
              : "hover:shadow-md hover:-translate-y-0.5"
          }`}
        >
          {/* Top row: name + brand badge */}
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold leading-tight truncate">
              {practice.cliente_nome} {practice.cliente_cognome}
            </span>
            <Badge
              className="text-xs flex-shrink-0"
              style={{
                backgroundColor: practice.brand === "enea" ? "#3b82f6" : "#f97316",
                color: "white",
              }}
            >
              {practice.brand === "enea" ? "ENEA" : "CT"}
            </Badge>
          </div>

          {/* Company pill (internal only) */}
          {isInternal && practice.companies && (
            <span className="inline-block text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
              {practice.companies.ragione_sociale}
            </span>
          )}

          {/* Product tag */}
          {practice.prodotto_installato && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Tag className="h-3 w-3 flex-shrink-0" />
              {practice.prodotto_installato}
            </p>
          )}

          {/* Form status */}
          {practice.form_compilato_at ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-xs text-green-700 dark:text-green-400">Form compilato</span>
            </div>
          ) : stageType === "attesa_compilazione" ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">In attesa form</span>
            </div>
          ) : null}

          {/* Operator row (internal only) */}
          {isInternal && operatorName && (
            <div className="flex items-center gap-1.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {getInitials(operatorName)}
              </span>
              <span className="text-xs text-muted-foreground truncate">{operatorName}</span>
            </div>
          )}

          {/* Bottom row: aging + icons */}
          <div className="flex items-center justify-between gap-1">
            <span className={`text-xs ${agingClassName}`}>
              {days > 7 ? "⚠ " : ""}{days}g
            </span>
            <div className="flex items-center gap-1.5">
              {hasMissingDocs && (
                <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {practice.documenti_mancanti.length}
                </span>
              )}
              {practice.conteggio_solleciti > 0 && (
                <span className="text-xs text-blue-500 flex items-center gap-0.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {practice.conteggio_solleciti}
                </span>
              )}
              {practice.cliente_email && (
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
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

  // Stats
  const now = Date.now();
  const activePractices = practices.filter((p) => !p.archived_at);
  const pronteDaFare = activePractices.filter(
    (p) => p.pipeline_stages?.stage_type === "pronte_da_fare"
  ).length;
  const staleCount = activePractices.filter(
    (p) => daysAgo(p.updated_at) > 7
  ).length;
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const guadagnoMese = activePractices
    .filter((p) => p.created_at >= startOfMonth && p.guadagno_netto != null)
    .reduce((sum, p) => sum + (p.guadagno_netto ?? 0), 0);

  // Apply operatore filter (for internal users)
  const filteredPractices =
    isInternal && operatoreFilter !== "all"
      ? practices.filter((p) => p.operatore_id === operatoreFilter)
      : practices;

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b bg-background shrink-0">
        {/* Title */}
        <div className="flex items-baseline gap-2 mr-2">
          <span className="font-semibold text-sm">Pipeline</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca cliente..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Brand pills */}
        <div className="flex gap-1">
          {(["all", "enea", "conto_termico"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBrandFilter(b)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                brandFilter === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {b === "all" ? "Tutti" : b === "enea" ? "ENEA" : "Conto Termico"}
            </button>
          ))}
        </div>

        {/* Operatore filter (internal only) */}
        {isInternal && operators.length > 0 && (
          <Select value={operatoreFilter} onValueChange={setOperatoreFilter}>
            <SelectTrigger className="h-9 text-sm w-44">
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
        )}

        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 h-9">
              {sortLabels[sortOption]}
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOption("recenti")}>
              Più recenti
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("vecchie")}>
              Più vecchie
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("stage")}>
              Più in stage
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Show archived toggle */}
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Nascondi archiviate" : "Mostra archiviate"}
        </Button>

        {/* Pipeline settings */}
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal className="h-4 w-4 mr-1" />
          Impostazioni pipeline
        </Button>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs text-muted-foreground bg-background border rounded-full px-3 py-1">
          Totale attive: <strong>{activePractices.length}</strong>
        </span>
        <span
          className={`text-xs rounded-full px-3 py-1 border ${
            pronteDaFare > 0
              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800"
              : "bg-background text-muted-foreground"
          }`}
        >
          Pronte da fare: <strong>{pronteDaFare}</strong>
        </span>
        <span
          className={`text-xs rounded-full px-3 py-1 border ${
            staleCount > 0
              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
              : "bg-background text-muted-foreground"
          }`}
        >
          Stale &gt;7g: <strong>{staleCount}</strong>
        </span>
        {isInternal && (
          <span className="text-xs text-muted-foreground bg-background border rounded-full px-3 py-1">
            Guadagno mese:{" "}
            <strong>
              €{" "}
              {guadagnoMese.toLocaleString("it-IT", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </span>
        )}
      </div>

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
                    className="flex items-center justify-between px-3 py-2 rounded-t-lg"
                    style={{ borderTop: `3px solid ${isArchived ? "#9ca3af" : stage.color}` }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`font-semibold text-sm truncate ${
                          isArchived ? "text-muted-foreground" : ""
                        }`}
                      >
                        {stage.name}
                      </span>
                      {isInternal && columnRevenue > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          €{" "}
                          {columnRevenue.toLocaleString("it-IT", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-xs flex-shrink-0 ${
                        isArchived ? "bg-muted text-muted-foreground" : ""
                      }`}
                    >
                      {cards.length}
                    </Badge>
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
