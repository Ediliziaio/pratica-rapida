import { useState, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages, useEneaPractices, useMoveStage } from "@/hooks/useEneaPractices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  MessageCircle,
  Mail,
  AlertTriangle,
  SlidersHorizontal,
  Columns,
  Tag,
  GripVertical,
  MoveHorizontal,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";
import { PipelineSettingsDrawer } from "@/components/pratiche/PipelineSettingsDrawer";

type PracticeWithRelations = EneaPractice & {
  pipeline_stages: PipelineStage | null;
  companies: { id: string; ragione_sociale: string } | null;
};

// ── PracticeDetailSheet ───────────────────────────────────────────────────────

function PracticeDetailSheet({
  practice,
  isInternal,
  onClose,
}: {
  practice: PracticeWithRelations | null;
  isInternal: boolean;
  onClose: () => void;
}) {
  const formatDate = (val: string | null | undefined) => {
    if (!val) return "—";
    try {
      return format(new Date(val), "d MMMM yyyy", { locale: it });
    } catch {
      return val;
    }
  };

  const formatDateTime = (val: string | null | undefined) => {
    if (!val) return "—";
    try {
      return format(new Date(val), "d MMM yyyy, HH:mm", { locale: it });
    } catch {
      return val;
    }
  };

  return (
    <Sheet open={!!practice} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {practice && (
          <>
            <SheetHeader className="mb-6">
              <div className="flex items-center gap-2 mb-1">
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

            <div className="space-y-5">
              {/* Cliente info */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Dati cliente
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Codice fiscale</p>
                    <p className="font-medium">{practice.codice_fiscale || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefono</p>
                    <p className="font-medium">{practice.cliente_telefono || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{practice.cliente_email || "—"}</p>
                  </div>
                  {(practice as Record<string, unknown>).indirizzo_installazione && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Indirizzo installazione</p>
                      <p className="font-medium">{String((practice as Record<string, unknown>).indirizzo_installazione)}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Installazione */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Installazione
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Prodotto installato</p>
                    <p className="font-medium">{practice.prodotto_installato || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data installazione</p>
                    <p className="font-medium">{formatDate(practice.data_installazione)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Importo lavori</p>
                    <p className="font-medium">
                      {practice.importo_lavori != null
                        ? `€ ${Number(practice.importo_lavori).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Documenti mancanti */}
              {practice.documenti_mancanti?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Documenti mancanti
                  </h3>
                  <ul className="space-y-1">
                    {practice.documenti_mancanti.map((doc: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
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
  onOpen,
}: {
  practice: PracticeWithRelations;
  index: number;
  isInternal: boolean;
  onOpen: (p: PracticeWithRelations) => void;
}) {
  const daysInStage = practice.updated_at
    ? Math.floor((Date.now() - new Date(practice.updated_at).getTime()) / 86400000)
    : 0;

  const hasMissingDocs = practice.documenti_mancanti?.length > 0;

  const agingClassName =
    daysInStage > 7
      ? "text-destructive font-bold"
      : daysInStage >= 4
      ? "text-amber-600 font-medium"
      : "text-muted-foreground";

  const agingPrefix = daysInStage > 7 ? "⚠ " : "";

  return (
    <Draggable draggableId={practice.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`group rounded-md bg-background border p-3 space-y-2 text-sm shadow-sm transition-shadow ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-primary" : "hover:shadow-md"
          }`}
        >
          {/* Drag handle row */}
          <div className="flex items-start justify-between gap-1">
            <div
              {...provided.dragHandleProps}
              className="flex items-center gap-1.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                className="font-semibold leading-tight text-left truncate hover:text-primary transition-colors"
                onClick={() => onOpen(practice)}
              >
                {practice.cliente_nome} {practice.cliente_cognome}
              </button>
            </div>
            <Badge
              className="text-xs flex-shrink-0 cursor-pointer"
              style={{
                backgroundColor: practice.brand === "enea" ? "#3b82f6" : "#f97316",
                color: "white",
              }}
              onClick={() => onOpen(practice)}
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

          {/* Product */}
          {practice.prodotto_installato && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Tag className="h-3 w-3 flex-shrink-0" />
              {practice.prodotto_installato}
            </p>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between gap-1">
            <span className={`text-xs ${agingClassName}`}>
              {agingPrefix}{daysInStage}g
            </span>
            <div className="flex items-center gap-1.5">
              {hasMissingDocs && (
                <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Documenti mancanti
                </span>
              )}
              {!hasMissingDocs && practice.conteggio_solleciti > 0 && (
                <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
              )}
              {practice.cliente_email && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
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

  const activePracticesCount = practices.filter((p) => !p.archived_at).length;

  const byStage = useCallback(
    (stageId: string) => practices.filter((p) => p.current_stage_id === stageId),
    [practices]
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b bg-background">
        {/* Title + count */}
        <div className="flex items-baseline gap-2 mr-2">
          <span className="font-semibold text-sm">Pipeline</span>
          <span className="text-xs text-muted-foreground">{activePracticesCount} pratiche attive</span>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca cliente..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Pill brand filter */}
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

        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Nascondi archiviate" : "Mostra archiviate"}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal className="h-4 w-4 mr-1" />
          Impostazioni pipeline
        </Button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : deduped.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
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
            <SlidersHorizontal className="mr-2 h-4 w-4" />Configura pipeline
          </Button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {deduped.map((stage) => {
              const cards = byStage(stage.id);
              const isArchived = stage.stage_type === "archiviate";
              return (
                <div
                  key={stage.id}
                  className={`flex flex-col w-72 flex-shrink-0 rounded-lg border transition-opacity ${
                    isArchived ? "bg-muted/20 opacity-60" : "bg-muted/40"
                  }`}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-t-lg"
                    style={{ borderTop: `3px solid ${isArchived ? "#9ca3af" : stage.color}` }}
                  >
                    <span className={`font-semibold text-sm ${isArchived ? "text-muted-foreground" : ""}`}>
                      {stage.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${isArchived ? "bg-muted text-muted-foreground" : ""}`}
                    >
                      {cards.length}
                    </Badge>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 p-2 flex-1 min-h-[80px] max-h-[calc(100vh-14rem)] overflow-y-auto transition-colors ${
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
        onClose={() => setSelectedPractice(null)}
      />

      <PipelineSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
