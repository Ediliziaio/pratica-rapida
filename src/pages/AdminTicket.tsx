import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, Clock } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type TicketStato = "aperto" | "in_lavorazione" | "risolto" | "chiuso";

type TicketWithCompany = Tables<"support_tickets"> & {
  companies: { ragione_sociale: string } | null;
};

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

export default function AdminTicket() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [risposta, setRisposta] = useState("");
  const [stato, setStato] = useState<TicketStato>("aperto");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, companies(ragione_sociale)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as TicketWithCompany[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { stato: TicketStato; risposta: string } }) => {
      const { error } = await supabase.from("support_tickets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: "Ticket aggiornato" });
      setExpandedId(null);
      setRisposta("");
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare il ticket.", variant: "destructive" });
    },
  });

  const handleExpand = (ticket: TicketWithCompany) => {
    if (expandedId === ticket.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ticket.id);
    setRisposta(ticket.risposta || "");
    setStato(ticket.stato as TicketStato);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Gestione Ticket</h1>
        <Badge variant="secondary" className="ml-2">{tickets.length}</Badge>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <LifeBuoy className="h-10 w-10" />
            <p>Nessun ticket ricevuto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleExpand(t)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.oggetto}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(t.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      <span>·</span>
                      <span className="font-medium text-foreground">
                        {t.companies?.ragione_sociale || "—"}
                      </span>
                      <span>·</span>
                      <span>Priorità: {t.priorita}</span>
                    </div>
                  </div>
                  <Badge className={STATO_COLORS[t.stato as TicketStato] || ""}>
                    {STATO_LABELS[t.stato as TicketStato] || t.stato}
                  </Badge>
                </div>

                {expandedId === t.id && (
                  <div className="mt-4 space-y-4 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Descrizione</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{t.descrizione}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Stato</p>
                      <Select value={stato} onValueChange={(v) => setStato(v as TicketStato)}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aperto">Aperto</SelectItem>
                          <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
                          <SelectItem value="risolto">Risolto</SelectItem>
                          <SelectItem value="chiuso">Chiuso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Risposta</p>
                      <Textarea
                        value={risposta}
                        onChange={(e) => setRisposta(e.target.value)}
                        rows={4}
                        placeholder="Scrivi una risposta..."
                        maxLength={5000}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            id: t.id,
                            updates: { stato, risposta },
                          })
                        }
                      >
                        {updateMutation.isPending ? "Salvataggio..." : "Salva"}
                      </Button>
                    </div>
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
