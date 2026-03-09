import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ListChecks } from "lucide-react";

interface ChecklistPanelProps {
  praticaId: string;
  companyId: string;
  serviceId?: string | null;
}

interface TemplateItem {
  titolo?: string;
  title?: string;
}

export function ChecklistPanel({ praticaId, companyId, serviceId }: ChecklistPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const generatedRef = useRef(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["checklist", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("ordine");
      if (error) throw error;
      return data;
    },
  });

  // Auto-generate from service template if empty
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
      }));
      const { error } = await supabase.from("checklist_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] });
    },
  });

  // #9 Fix: use ref to prevent duplicate generation
  useEffect(() => {
    if (
      !generatedRef.current &&
      service?.checklist_template &&
      Array.isArray(service.checklist_template) &&
      service.checklist_template.length > 0 &&
      items.length === 0 &&
      !generateChecklist.isPending
    ) {
      generatedRef.current = true;
      generateChecklist.mutate(service.checklist_template as (string | TemplateItem)[]);
    }
  }, [service, items.length, generateChecklist.isPending]);

  const toggleItem = useMutation({
    mutationFn: async ({ id, completato }: { id: string; completato: boolean }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({
          completato,
          completato_da: completato ? user?.id : null,
          completato_at: completato ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`checklist-${praticaId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "checklist_items",
        filter: `pratica_id=eq.${praticaId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["checklist", praticaId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [praticaId, queryClient]);

  const completedCount = items.filter(i => i.completato).length;

  if (items.length === 0 && !isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4" /> Checklist
          <Badge variant="outline" className="ml-auto">
            {completedCount}/{items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <Checkbox
                  checked={item.completato}
                  onCheckedChange={(checked) =>
                    toggleItem.mutate({ id: item.id, completato: !!checked })
                  }
                  className="mt-0.5"
                />
                <span className={`text-sm ${item.completato ? "line-through text-muted-foreground" : ""}`}>
                  {item.titolo}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
