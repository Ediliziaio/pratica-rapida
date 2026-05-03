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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, Plus, Clock, Mail, User, Headphones, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ticketSchema } from "@/lib/validation-schemas";
import type { Tables } from "@/integrations/supabase/types";

const SUPPORT_EMAIL = "supporto@praticarapida.it";

async function sendTicketEmails({
  userEmail,
  userName,
  companyName,
  oggetto,
  descrizione,
  priorita,
  notificaUtente,
}: {
  userEmail: string;
  userName: string;
  companyName: string;
  oggetto: string;
  descrizione: string;
  priorita: string;
  notificaUtente: boolean;
}) {
  const prioritaLabel = { bassa: "Bassa", normale: "Normale", alta: "Alta" }[priorita] ?? priorita;
  const adminUrl = `${window.location.origin}/admin/assistenza`;

  // 1. Notifica al team interno — sempre
  supabase.functions
    .invoke("send-email", {
      body: {
        to: SUPPORT_EMAIL,
        template: "ticket_nuovo",
        data: {
          nome: userName,
          email: userEmail,
          company: companyName,
          oggetto,
          descrizione,
          priorita: prioritaLabel,
          priorita_upper: prioritaLabel.toUpperCase(),
          link: adminUrl,
        },
      },
    })
    .then(({ error }) => {
      if (error) console.warn("Ticket team notify failed:", error.message);
    });

  // 2. Conferma all'utente — solo se ha scelto di riceverla
  if (notificaUtente) {
    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        to: userEmail,
        template: "ticket_conferma",
        data: {
          nome: userName,
          oggetto,
          descrizione,
          priorita: prioritaLabel,
        },
      },
    });
    if (error) console.warn("Ticket confirm email failed:", error.message);
  }
}

type TicketStato = "aperto" | "in_lavorazione" | "risolto" | "chiuso";

type ThreadMessage = {
  id: string;
  author_user_id: string;
  author_role: "client" | "staff";
  body: string;
  created_at: string;
  profiles: { nome: string | null; cognome: string | null; email: string | null } | null;
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

const PRIORITA_LABELS: Record<string, string> = {
  bassa: "Bassa",
  normale: "Normale",
  alta: "Alta",
};

function authorLabel(m: ThreadMessage) {
  const p = m.profiles;
  if (p && (p.nome || p.cognome)) return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  if (p?.email) return p.email;
  return m.author_role === "staff" ? "Staff supporto" : "Tu";
}

function ClientTicketThread({ ticketId, currentUserId }: { ticketId: string; currentUserId: string | undefined }) {
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["client-ticket-messages", ticketId],
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
        Nessuna risposta ancora. Il team ti risponderà al più presto.
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
      {messages.map((m) => {
        const isMine = m.author_user_id === currentUserId || m.author_role === "client";
        const isStaff = m.author_role === "staff";
        return (
          <div key={m.id} className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
            {!isMine && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Headphones className="h-3.5 w-3.5" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
              isMine ? "bg-primary text-primary-foreground" : "bg-background border"
            }`}>
              <div className={`mb-1 flex items-center gap-2 text-[11px] ${
                isMine ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}>
                <span className="font-medium">{isStaff ? "Staff supporto" : authorLabel(m)}</span>
                <span>·</span>
                <span>{format(new Date(m.created_at), "dd MMM HH:mm", { locale: it })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
            {isMine && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Assistenza() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Tables<"support_tickets"> | null>(null);
  const [form, setForm] = useState({ oggetto: "", descrizione: "", priorita: "normale" as "bassa" | "normale" | "alta" });
  const [notificaEmail, setNotificaEmail] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reply, setReply] = useState("");

  const { data: tickets = [], isLoading, isError, refetch } = useQuery({
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

  // Query company name for email notification
  const { data: companyInfo } = useQuery({
    queryKey: ["company-name-assistenza", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("companies")
        .select("ragione_sociale")
        .eq("id", companyId)
        .single();
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

      return { oggetto: validated.oggetto, descrizione: validated.descrizione, priorita: validated.priorita };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets", companyId] });

      const userEmail = user?.email ?? "";
      const userName = user?.user_metadata?.nome
        ? `${user.user_metadata.nome} ${user.user_metadata.cognome ?? ""}`.trim()
        : userEmail;
      const companyName = companyInfo?.ragione_sociale ?? "Azienda";

      // Fire-and-forget email notifications (non-blocking)
      sendTicketEmails({
        userEmail,
        userName,
        companyName,
        oggetto: data.oggetto,
        descrizione: data.descrizione,
        priorita: data.priorita,
        notificaUtente: notificaEmail,
      }).catch((e) => console.warn("sendTicketEmails error:", e));

      toast({
        title: "Ticket inviato",
        description: notificaEmail && userEmail
          ? `Riceverai una conferma su ${userEmail}`
          : "Il tuo ticket di assistenza è stato inviato.",
      });
      setForm({ oggetto: "", descrizione: "", priorita: "normale" });
      setNotificaEmail(true);
      setErrors({});
      setOpen(false);
    },
    onError: (e) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_user_id: user!.id,
        author_role: "client",
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["client-ticket-messages", vars.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets", companyId] });
      setReply("");
      toast({ title: "Messaggio inviato", description: "Il team riceverà la tua risposta via email." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile inviare il messaggio.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Assistenza</h1>
        </div>
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
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setErrors({}); setNotificaEmail(true); } }}>
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

              {/* Notifica email */}
              <div
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  notificaEmail ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
                onClick={() => setNotificaEmail((v) => !v)}
              >
                <Checkbox
                  id="notifica-email"
                  checked={notificaEmail}
                  onCheckedChange={(v) => setNotificaEmail(!!v)}
                  className="mt-0.5 shrink-0"
                />
                <div className="space-y-0.5 select-none">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    <label htmlFor="notifica-email" className="text-sm font-medium cursor-pointer">
                      Ricevi conferma via email
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {user?.email
                      ? `Invieremo una conferma a ${user.email}`
                      : "Conferma inviata al tuo indirizzo email registrato"}
                  </p>
                </div>
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
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <LifeBuoy className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-semibold">Nessun ticket di assistenza</p>
              <p className="text-sm text-muted-foreground mt-1">Apri un nuovo ticket se hai bisogno di aiuto dal team di supporto.</p>
            </div>
            <Button onClick={() => setOpen(true)} className="mt-2">
              <Plus className="mr-2 h-4 w-4" />Apri il primo ticket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const isSelected = selectedTicket?.id === t.id;
            return (
              <Card
                key={t.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-primary/30" : ""}`}
                onClick={() => {
                  setSelectedTicket(isSelected ? null : t);
                  setReply("");
                }}
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
                      </div>
                    </div>
                    <Badge className={STATO_COLORS[t.stato as TicketStato] || ""}>
                      {STATO_LABELS[t.stato as TicketStato] || t.stato}
                    </Badge>
                  </div>
                  {isSelected && (
                    <div className="mt-4 space-y-4 border-t pt-4" onClick={(e) => e.stopPropagation()}>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Messaggio iniziale</p>
                        <p className="whitespace-pre-wrap text-sm">{t.descrizione}</p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Conversazione</p>
                        <ClientTicketThread ticketId={t.id} currentUserId={user?.id} />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Rispondi</p>
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={3}
                          placeholder="Scrivi un messaggio al team di supporto..."
                          maxLength={5000}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{reply.length}/5000</p>
                          <Button
                            size="sm"
                            disabled={sendReplyMutation.isPending || !reply.trim()}
                            onClick={() => sendReplyMutation.mutate({ ticketId: t.id, body: reply.trim() })}
                          >
                            {sendReplyMutation.isPending ? "Invio..." : "Rispondi"}
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
