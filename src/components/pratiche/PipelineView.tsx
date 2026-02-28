import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, useDraggable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { STATO_ORDER, STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

function DroppableColumn({ stato, children }: { stato: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stato });
  const conf = STATO_CONFIG[stato as PraticaStato];
  const Icon = conf.icon;

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[250px] shrink-0 flex-col rounded-xl ${conf.bgColumn} border transition-all ${isOver ? "ring-2 ring-primary shadow-lg scale-[1.02]" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableCard({ pratica, navigate }: { pratica: any; navigate: (path: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pratica.id,
    data: { stato: pratica.stato },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:-translate-y-0.5 touch-none"
      onClick={() => !isDragging && navigate(`/pratiche/${pratica.id}`)}
    >
      <CardContent className="p-3 space-y-1.5">
        <p className="text-sm font-medium truncate">{pratica.titolo}</p>
        {pratica.clienti_finali && (
          <p className="text-xs text-muted-foreground truncate">
            {(pratica.clienti_finali as any).nome} {(pratica.clienti_finali as any).cognome}
          </p>
        )}
        <p className="text-sm font-semibold">€ {pratica.prezzo.toFixed(2)}</p>
      </CardContent>
    </Card>
  );
}

export function PipelineView({ pratiche, navigate }: { pratiche: any[]; navigate: (path: string) => void }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const allByStato = STATO_ORDER.reduce((acc, stato) => {
    acc[stato] = pratiche.filter(p => p.stato === stato);
    return acc;
  }, {} as Record<PraticaStato, any[]>);

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

    queryClient.setQueryData(["pratiche", companyId], (old: any[]) =>
      old?.map(p => p.id === praticaId ? { ...p, stato: newStato } : p)
    );

    const { error } = await supabase
      .from("pratiche")
      .update({ stato: newStato })
      .eq("id", praticaId);

    if (error) {
      queryClient.setQueryData(["pratiche", companyId], (old: any[]) =>
        old?.map(p => p.id === praticaId ? { ...p, stato: oldStato } : p)
      );
      toast.error("Errore nello spostamento della pratica");
    } else {
      toast.success(`Pratica spostata in ${STATO_CONFIG[newStato].label}`);
      queryClient.invalidateQueries({ queryKey: ["pratiche", companyId] });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4" style={{ minWidth: STATO_ORDER.length * 260 }}>
          {STATO_ORDER.map(stato => {
            const conf = STATO_CONFIG[stato];
            const Icon = conf.icon;
            const items = allByStato[stato];

            return (
              <DroppableColumn key={stato} stato={stato}>
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
                      <DraggableCard key={p.id} pratica={p} navigate={navigate} />
                    ))
                  )}
                </div>
              </DroppableColumn>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <DragOverlay>
        {activePratica && (
          <Card className="w-[230px] shadow-xl rotate-2">
            <CardContent className="p-3 space-y-1.5">
              <p className="text-sm font-medium truncate">{activePratica.titolo}</p>
              <p className="text-sm font-semibold">€ {activePratica.prezzo.toFixed(2)}</p>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
