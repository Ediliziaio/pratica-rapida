import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, Clock, Search, AlertTriangle, Building2, ChevronDown, ChevronUp, User, Headphones, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type TicketStato = "aperto" | "in_lavorazione" | "risolto" | "chiuso";

type TicketWithCompany = Tables<"support_tickets"> & {
  companies: { ragione_sociale: string } | null;
};

type ThreadMessage = {
  id: string;
  author_user_id: string;
  author_role: "client" | "staff";
  body: string;
  created_at: string;
  profiles: { nome: string | null; cognome: string | null; email: string | null } | null;
};

const STATO_COLORS: Record<TicketStato, string> = {
  aperto: "bg-blue-100 text-blue-800 border-blue-200",
  in_lavorazione: "bg-yellow-100 text-yellow-800 border-yellow-200",
  risolto: "bg-green-100 text-green-800 border-green-200",
  chiuso: "bg-muted text-muted-foreground border-border",
};

const STATO_LABELS: Record<TicketStato, string> = {
  aperto: "Aperto",
  in_lavorazione: "In Lavorazione",
  risolto: "Risolto",
  chiuso: "Chiuso",
};

const PRIORITA_CONFIG: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "text-destructive" },
  media: { label: "Media", color: "text-warning" },
  bassa: { label: "Bassa", color: "text-muted-foreground" },
};

const STATUS_TABS: Array<{ key: TicketStato | "tutti"; label: string }> = [
  { key: "tutti", label: "Tutti" },
  { key: "aperto", label: "Aperti" },
  { key: "in_lavorazione", label: "In Lavorazione" },
  { key: "risolto", label: "Risolti" },
  { key: "chiuso", label: "Chiusi" },
];

function authorLabel(m: ThreadMessage) {
  const p = m.profiles;
  if (p && (p.nome || p.cognome)) return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  if (p?.email) return p.email;
  return m.author_role === "staff" ? "Staff" : "Cliente";
}

function TicketThread({ ticketId }: { ticketId: string }) {
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["ticket-messages", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, author_user_id, author_role, body, created_at, profiles:author_user_id(nome, cognome, email)")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ThreadMessage[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
        Nessun messaggio nel thread.
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
      {messages.map((m) => {
        const isStaff = m.author_role === "staff";
        return (
          <div key={m.id} className={`flex gap-2 ${isStaff ? "justify-end" : "justify-start"}`}>
            {!isStaff && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
              isStaff ? "bg-primary text-primary-foreground" : "bg-background border"
            }`}>
              <div className={`mb-1 flex items-center gap-2 text-[11px] ${
                isStaff ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}>
                <span className="font-medium">{authorLabel(m)}</span>
                <span>·</span>
                <span>{format(new Date(m.created_at), "dd MMM HH:mm", { locale: it })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
            {isStaff && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Headphones className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminTicket() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [stato, setStato] = useState<TicketStato>("aperto");
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState<TicketStato | "tutti">("tutti");

  const { data: tickets = [], isLoading, isError, refetch } = useQuery({
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

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, newStato }: { id: string; newStato: TicketStato }) => {
      const { error } = await supabase.from("support_tickets").update({ stato: newStato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato.", variant: "destructive" });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_user_id: user!.id,
        author_role: "staff",
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", vars.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      setReply("");
      toast({ title: "Risposta inviata", description: "Email automatica al cliente in corso." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile inviare la risposta.", variant: "destructive" });
    },
  });

  const handleExpand = (ticket: TicketWithCompany) => {
    if (expandedId === ticket.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ticket.id);
    setReply("");
    setStato(ticket.stato as TicketStato);
  };

  const filtered = tickets.filter(t => {
    const matchSearch = `${t.oggetto} ${t.descrizione} ${t.companies?.ragione_sociale || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStato = filterStato === "tutti" || t.stato === filterStato;
    return matchSearch && matchStato;
  });

  const countByStato = (s: TicketStato) => tickets.filter(t => t.stato === s).length;
  const openCount = countByStato("aperto");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive/60" />
          <div>
            <p className="font-semibold">Impossibile caricare i ticket</p>
            <p className="text-sm text-muted-foreground mt-1">Controlla la connessione o riprova.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gestione Ticket</h1>
            <p className="text-muted-foreground text-sm">Supporto clienti e richieste</p>
          </div>
        </div>
        {openCount > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {openCount} aperti
          </Badge>
        )}
      </div>

      {/* Stats bar */}
      {tickets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.filter(t => t.key !== "tutti").map(({ key, label }) => {
            const count = countByStato(key as TicketStato);
            if (count === 0) return null;
            return (
              <Badge
                key={key}
                variant="outline"
                className={`cursor-pointer hover:opacity-80 ${STATO_COLORS[key as TicketStato]} ${filterStato === key ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                onClick={() => setFilterStato(filterStato === key ? "tutti" : key as TicketStato)}
              >
                {label}: {count}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca ticket, azienda..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStato} onValueChange={v => setFilterStato(v as TicketStato | "tutti")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato..." />
          </SelectTrigger>
          <SelectContent>
            {STATUS_TABS.map(({ key, label }) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <LifeBuoy className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-semibold">Nessun ticket ricevuto</p>
              <p className="text-sm text-muted-foreground mt-1">I ticket di supporto delle aziende appariranno qui.</p>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nessun ticket corrisponde ai filtri selezionati.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const isExpanded = expandedId === t.id;
            const priorita = PRIORITA_CONFIG[t.priorita] || PRIORITA_CONFIG.bassa;
            return (
              <Card
                key={t.id}
                className={`transition-shadow hover:shadow-md ${isExpanded ? "ring-2 ring-primary/30" : ""}`}
              >
                <CardContent className="p-4">
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => handleExpand(t)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{t.oggetto}</p>
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${priorita.color}`}>
                          {t.priorita === "alta" && <AlertTriangle className="h-3 w-3" />}
                          {priorita.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(t.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Building2 className="h-3 w-3" />
                          {t.companies?.ragione_sociale || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${STATO_COLORS[t.stato as TicketStato] || ""}`}>
                        {STATO_LABELS[t.stato as TicketStato] || t.stato}
                      </Badge>
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t pt-4" onClick={(e) => e.stopPropagation()}>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Messaggio iniziale del cliente</p>
                        <p className="whitespace-pre-wrap text-sm">{t.descrizione}</p>
                      </div>

                      {/* Thread */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Conversazione</p>
                        <TicketThread ticketId={t.id} />
                      </div>

                      {/* Stato */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Aggiorna stato</p>
                          <div className="flex gap-2">
                            <Select
                              value={stato}
                              onValueChange={(v) => setStato(v as TicketStato)}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aperto">Aperto</SelectItem>
                                <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
                                <SelectItem value="risolto">Risolto</SelectItem>
                                <SelectItem value="chiuso">Chiuso</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updateStatoMutation.isPending || stato === t.stato}
                              onClick={() => updateStatoMutation.mutate({ id: t.id, newStato: stato })}
                            >
                              {updateStatoMutation.isPending ? "..." : "Salva"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Reply */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Nuova risposta al cliente</p>
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={4}
                          placeholder="Scrivi una risposta al cliente..."
                          maxLength={5000}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{reply.length}/5000 — il cliente riceverà l'email automaticamente</p>
                          <Button
                            size="sm"
                            disabled={sendReplyMutation.isPending || !reply.trim()}
                            onClick={() => sendReplyMutation.mutate({ ticketId: t.id, body: reply.trim() })}
                          >
                            {sendReplyMutation.isPending ? "Invio..." : "Invia risposta"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
