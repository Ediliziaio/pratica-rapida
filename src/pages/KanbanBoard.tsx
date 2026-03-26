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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Search, MessageCircle, Mail, AlertTriangle, SlidersHorizontal, Columns, Database } from "lucide-react";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";
import { PipelineSettingsDrawer } from "@/components/pratiche/PipelineSettingsDrawer";

type PracticeWithRelations = EneaPractice & {
  pipeline_stages: PipelineStage | null;
  companies: { id: string; ragione_sociale: string } | null;
};

export default function KanbanBoard() {
  const { user, isInternal } = useAuth();
  const { toast } = useToast();
  const moveStage = useMoveStage();

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca cliente..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="enea">ENEA</SelectItem>
            <SelectItem value="conto_termico">Conto Termico</SelectItem>
          </SelectContent>
        </Select>

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
              return (
                <div
                  key={stage.id}
                  className="flex flex-col w-72 flex-shrink-0 rounded-lg bg-muted/40 border"
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-t-lg"
                    style={{ borderTop: `3px solid ${stage.color}` }}
                  >
                    <span className="font-semibold text-sm">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 p-2 flex-1 min-h-[80px] overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : ""
                        }`}
                      >
                        {cards.map((practice, index) => (
                          <PracticeCard
                            key={practice.id}
                            practice={practice}
                            index={index}
                            isInternal={isInternal}
                          />
                        ))}
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

      <PipelineSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function PracticeCard({
  practice,
  index,
  isInternal,
}: {
  practice: PracticeWithRelations;
  index: number;
  isInternal: boolean;
}) {
  const daysInStage = practice.updated_at
    ? Math.floor((Date.now() - new Date(practice.updated_at).getTime()) / 86400000)
    : 0;

  const hasMissingDocs = practice.documenti_mancanti?.length > 0;

  return (
    <Draggable draggableId={practice.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`rounded-md bg-background border p-3 space-y-2 text-sm cursor-grab active:cursor-grabbing shadow-sm transition-shadow ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-primary" : "hover:shadow-md"
          }`}
        >
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold leading-tight">
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

          {isInternal && practice.companies && (
            <p className="text-xs text-muted-foreground">{practice.companies.ragione_sociale}</p>
          )}

          {practice.prodotto_installato && (
            <p className="text-xs text-muted-foreground truncate">{practice.prodotto_installato}</p>
          )}

          <div className="flex items-center justify-between gap-1">
            <span
              className={`text-xs ${daysInStage > 7 ? "text-destructive font-medium" : "text-muted-foreground"}`}
            >
              {daysInStage}g
            </span>
            <div className="flex items-center gap-1">
              {hasMissingDocs && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {practice.conteggio_solleciti > 0 && <MessageCircle className="h-3.5 w-3.5 text-blue-400" />}
              {practice.cliente_email && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
