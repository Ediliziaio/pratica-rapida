import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageCircle, ShieldCheck } from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { it } from "date-fns/locale";

interface ChatProfile {
  nome: string;
  cognome: string;
}

type MessageWithProfile = {
  id: string;
  pratica_id: string;
  company_id: string;
  user_id: string;
  messaggio: string;
  created_at: string;
  profile?: ChatProfile;
  isInternal?: boolean;
};

interface PracticeChatProps {
  praticaId: string;
  companyId: string;
  praticaTitle?: string;
}

const MAX_MESSAGE_LENGTH = 2000;
const MIN_SEND_INTERVAL_MS = 1000;
const INTERNAL_ROLES = ["super_admin", "admin_interno", "operatore"] as const;

function getInitials(nome?: string, cognome?: string): string {
  return `${(nome?.[0] ?? "").toUpperCase()}${(cognome?.[0] ?? "").toUpperCase()}` || "?";
}

function dateSeparatorLabel(date: Date): string {
  if (isToday(date)) return "Oggi";
  if (isYesterday(date)) return "Ieri";
  return format(date, "d MMMM yyyy", { locale: it });
}

export function PracticeChat({ praticaId, companyId, praticaTitle }: PracticeChatProps) {
  const { user, roles } = useAuth();
  const isInternalUser = roles.some((r) => INTERNAL_ROLES.includes(r as typeof INTERNAL_ROLES[number]));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<number>(0);

  const { data: messages = [] } = useQuery<MessageWithProfile[]>({
    queryKey: ["practice-messages", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_messages")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const authorIds = [...new Set(data.map((m) => m.user_id))];
      if (authorIds.length === 0) return data as MessageWithProfile[];

      const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
        supabase.from("profiles").select("id, nome, cognome").in("id", authorIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", authorIds),
      ]);

      const profileMap = Object.fromEntries((profilesData ?? []).map((p) => [p.id, p]));
      const internalIds = new Set(
        (rolesData ?? []).filter((r) => INTERNAL_ROLES.includes(r.role as typeof INTERNAL_ROLES[number])).map((r) => r.user_id)
      );

      return data.map((m) => ({
        ...m,
        profile: profileMap[m.user_id] as ChatProfile | undefined,
        isInternal: internalIds.has(m.user_id),
      }));
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${praticaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "practice_messages", filter: `pratica_id=eq.${praticaId}` },
        () => queryClient.invalidateQueries({ queryKey: ["practice-messages", praticaId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [praticaId, queryClient]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Send notifications to recipients
  const notifyRecipients = useCallback(async (trimmed: string, senderProfile?: { nome: string; cognome: string } | null) => {
    const senderName = senderProfile
      ? `${senderProfile.nome} ${senderProfile.cognome}`.trim()
      : isInternalUser ? "Pratica Rapida" : "Azienda";
    const msgExcerpt = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
    const notifBase = {
      tipo: "messaggio",
      messaggio: `${senderName}: ${msgExcerpt}`,
      pratica_id: praticaId,
      link: `/pratiche/${praticaId}`,
      letto: false,
    };

    if (isInternalUser) {
      // Internal reply → notify company users
      const { data: assignments } = await supabase
        .from("user_company_assignments")
        .select("user_id")
        .eq("company_id", companyId);
      const recipients = (assignments ?? []).map((a) => a.user_id).filter((id) => id !== user?.id);
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            ...notifBase,
            user_id: uid,
            titolo: praticaTitle ? `Risposta: ${praticaTitle}` : "Risposta alla tua pratica",
          }))
        );
      }
    } else {
      // Company message → notify all internal staff
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", [...INTERNAL_ROLES]);
      const recipients = (staffRoles ?? []).map((r) => r.user_id).filter((id) => id !== user?.id);
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            ...notifBase,
            user_id: uid,
            titolo: praticaTitle ? `Messaggio: ${praticaTitle}` : "Nuovo messaggio da azienda",
          }))
        );
      }
    }
  }, [isInternalUser, companyId, praticaId, praticaTitle, user?.id]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !message.trim()) return;
      const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);

      const { error } = await supabase.from("practice_messages").insert({
        pratica_id: praticaId,
        company_id: companyId,
        user_id: user.id,
        messaggio: trimmed,
      });
      if (error) throw error;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("nome, cognome")
        .eq("id", user.id)
        .maybeSingle();

      notifyRecipients(trimmed, profileData).catch(() => null);
    },
    onSuccess: () => {
      setMessage("");
      lastSentRef.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ["practice-messages", praticaId] });
    },
    onError: (e) => {
      toast({ title: "Errore invio messaggio", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim()) return;
    if (Date.now() - lastSentRef.current < MIN_SEND_INTERVAL_MS) return;
    sendMessage.mutate();
  }, [message, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Group messages by date
  const grouped = messages.reduce<{ date: Date; msgs: MessageWithProfile[] }[]>((acc, m) => {
    const d = new Date(m.created_at);
    const last = acc[acc.length - 1];
    if (!last || !isSameDay(last.date, d)) acc.push({ date: d, msgs: [m] });
    else last.msgs.push(m);
    return acc;
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Messaggi
          </span>
          {messages.length > 0 && (
            <Badge variant="secondary" className="text-xs tabular-nums">{messages.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Messages scroll area */}
        <div ref={scrollRef} className="h-80 overflow-y-auto bg-muted/30 px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground/25" />
              <p className="text-sm text-muted-foreground">Nessun messaggio ancora.</p>
              <p className="text-xs text-muted-foreground/60">Inizia la conversazione qui sotto.</p>
            </div>
          ) : (
            grouped.map(({ date, msgs }) => (
              <div key={date.toISOString()}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted/30 px-2">
                    {dateSeparatorLabel(date)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {msgs.map((m, idx) => {
                  const isMe = m.user_id === user?.id;
                  const prevMsg = msgs[idx - 1];
                  const showHeader = !isMe && (!prevMsg || prevMsg.user_id !== m.user_id);
                  const initials = getInitials(m.profile?.nome, m.profile?.cognome);

                  return (
                    <div
                      key={m.id}
                      className={`flex items-end gap-2 mb-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {/* Avatar placeholder (maintains alignment) */}
                      {!isMe && (
                        <div
                          className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white transition-opacity ${
                            m.isInternal ? "bg-primary" : "bg-blue-500"
                          } ${!showHeader ? "opacity-0 pointer-events-none" : ""}`}
                        >
                          {initials}
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                        {/* Sender name + badge */}
                        {showHeader && (
                          <div className="flex items-center gap-1.5 mb-1 ml-0.5">
                            <span className="text-xs font-semibold">
                              {m.profile ? `${m.profile.nome} ${m.profile.cognome}` : "—"}
                            </span>
                            {m.isInternal && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-3.5 border-primary/30 text-primary bg-primary/5 gap-0.5"
                              >
                                <ShieldCheck className="h-2 w-2" />
                                Pratica Rapida
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Bubble */}
                        <div
                          className={`rounded-2xl px-3.5 py-2 ${
                            isMe
                              ? "bg-primary text-primary-foreground rounded-br-none"
                              : "bg-card border shadow-sm rounded-bl-none"
                          }`}
                        >
                          <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">{m.messaggio}</p>
                          <p
                            className={`text-[10px] mt-1 text-right ${
                              isMe ? "text-primary-foreground/55" : "text-muted-foreground"
                            }`}
                          >
                            {format(new Date(m.created_at), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Input area */}
        <div className="border-t bg-background px-4 py-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio… (↵ invia, Shift+↵ a capo)"
              className="flex-1 min-h-[38px] max-h-32 resize-none text-sm leading-relaxed"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Invia messaggio"
              className="h-9 w-9 shrink-0"
              disabled={!message.trim() || sendMessage.isPending}
            >
              {sendMessage.isPending ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>
          {message.length > MAX_MESSAGE_LENGTH * 0.85 && (
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {message.length}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
