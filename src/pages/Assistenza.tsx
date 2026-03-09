import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, Plus, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ticketSchema } from "@/lib/validation-schemas";
import type { Tables } from "@/integrations/supabase/types";

type TicketStato = "aperto" | "in_lavorazione" | "risolto" | "chiuso";

const STATO_COLORS: Record<TicketStato, string> = {
  aperto: "bg-blue-100 text-blue-800",
  in_lavorazione: "bg-yellow-100 text-yellow-800",
  risolto: "bg-green-100 text-green-800",
  chiuso: "bg-muted text-muted-foreground",
};

const STATO_LABELS: Record<TicketStato, string> = {
  aperto: "Aperto",
  in_lavorazione: "In Lavorazione",
  risolto: "Risolto",
  chiuso: "Chiuso",
};

const PRIORITA_LABELS: Record<string, string> = {
  bassa: "Bassa",
  normale: "Normale",
  alta: "Alta",
};

export default function Assistenza() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Tables<"support_tickets"> | null>(null);
  const [form, setForm] = useState({ oggetto: "", descrizione: "", priorita: "normale" as const });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = ticketSchema.safeParse(form);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((e) => {
          fieldErrors[e.path[0]?.toString() || "form"] = e.message;
        });
        setErrors(fieldErrors);
        throw new Error("Dati non validi. Controlla i campi evidenziati.");
      }

      const validated = result.data;
      const { error } = await supabase.from("support_tickets").insert({
        company_id: companyId!,
        user_id: user!.id,
        oggetto: validated.oggetto,
        descrizione: validated.descrizione,
        priorita: validated.priorita,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets", companyId] });
      toast({ title: "Ticket creato", description: "Il tuo ticket di assistenza è stato inviato." });
      setForm({ oggetto: "", descrizione: "", priorita: "normale" });
      setErrors({});
      setOpen(false);
    },
    onError: (e) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const isTicketClosed = (stato: string) => stato === "risolto" || stato === "chiuso";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Assistenza</h1>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErrors({}); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuovo Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo Ticket di Assistenza</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Oggetto *</Label>
                <Input
                  value={form.oggetto}
                  onChange={(e) => { setForm((f) => ({ ...f, oggetto: e.target.value })); if (errors.oggetto) setErrors((p) => { const n = { ...p }; delete n.oggetto; return n; }); }}
                  placeholder="Descrivi brevemente il problema"
                  maxLength={200}
                  className={errors.oggetto ? "border-destructive" : ""}
                />
                {errors.oggetto && <p className="text-xs text-destructive">{errors.oggetto}</p>}
              </div>
              <div className="space-y-2">
                <Label>Descrizione *</Label>
                <Textarea
                  value={form.descrizione}
                  onChange={(e) => { setForm((f) => ({ ...f, descrizione: e.target.value })); if (errors.descrizione) setErrors((p) => { const n = { ...p }; delete n.descrizione; return n; }); }}
                  placeholder="Fornisci tutti i dettagli utili..."
                  rows={5}
                  maxLength={2000}
                  className={errors.descrizione ? "border-destructive" : ""}
                />
                {errors.descrizione && <p className="text-xs text-destructive">{errors.descrizione}</p>}
              </div>
              <div className="space-y-2">
                <Label>Priorità</Label>
                <Select value={form.priorita} onValueChange={(v) => setForm((f) => ({ ...f, priorita: v as "bassa" | "normale" | "alta" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bassa">Bassa</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Invio..." : "Invia Ticket"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <LifeBuoy className="h-10 w-10" />
            <p>Nessun ticket di assistenza. Apri un nuovo ticket se hai bisogno di aiuto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setSelectedTicket(selectedTicket?.id === t.id ? null : t)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.oggetto}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(t.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      <span>·</span>
                      <span>Priorità: {PRIORITA_LABELS[t.priorita] || t.priorita}</span>
                      {isTicketClosed(t.stato) && (
                        <span className="text-muted-foreground/60">· Chiuso</span>
                      )}
                    </div>
                  </div>
                  <Badge className={STATO_COLORS[t.stato as TicketStato] || ""}>
                    {STATO_LABELS[t.stato as TicketStato] || t.stato}
                  </Badge>
                </div>
                {selectedTicket?.id === t.id && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Descrizione</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{t.descrizione}</p>
                    </div>
                    {t.risposta && (
                      <div className="rounded-md bg-muted p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          Risposta del team
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{t.risposta}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
