import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages } from "@/hooks/useEneaPractices";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Save } from "lucide-react";
import type { PipelineStage } from "@/integrations/supabase/types";

interface PipelineSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function PipelineSettingsDrawer({ open, onClose }: PipelineSettingsDrawerProps) {
  const { resellerId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stages = [] } = usePipelineStages();

  // Filter to reseller-specific stages (or create copies from system stages)
  const resellerStages = stages.filter(
    (s) => s.reseller_id === resellerId || s.reseller_id === null
  );

  const [localStages, setLocalStages] = useState<PipelineStage[]>([]);

  useEffect(() => {
    setLocalStages(resellerStages);
  }, [resellerStages]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!resellerId) return;
      // Upsert reseller-specific copies with updated name/color/order
      const rows = localStages.map((s, i) => ({
        id: s.reseller_id === resellerId ? s.id : undefined,
        reseller_id: resellerId,
        name: s.name,
        stage_type: s.stage_type,
        order_index: i,
        color: s.color,
        brand: s.brand,
        is_visible: s.is_visible,
      }));
      const { error } = await supabase.from("pipeline_stages").upsert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages"] });
      toast({ title: "Pipeline salvata" });
      onClose();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Errore nel salvataggio" });
    },
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(localStages);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setLocalStages(items);
  };

  const updateStage = (index: number, patch: Partial<PipelineStage>) => {
    setLocalStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[400px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Impostazioni pipeline</SheetTitle>
        </SheetHeader>

        <p className="text-sm text-muted-foreground mt-1">
          Trascina per riordinare, modifica nome e colore degli stage.
        </p>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="stages">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-col gap-2 flex-1 overflow-y-auto mt-4"
              >
                {localStages.map((stage, index) => (
                  <Draggable key={stage.id} draggableId={stage.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex items-center gap-2 p-2 rounded-md border bg-background ${
                          snapshot.isDragging ? "shadow-lg" : ""
                        }`}
                      >
                        <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <input
                          type="color"
                          value={stage.color}
                          onChange={(e) => updateStage(index, { color: e.target.value })}
                          className="h-6 w-6 rounded cursor-pointer border-0 p-0"
                        />
                        <Input
                          value={stage.name}
                          onChange={(e) => updateStage(index, { name: e.target.value })}
                          className="flex-1 h-8 text-sm"
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Annulla
          </Button>
          <Button
            className="flex-1"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            Salva
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
