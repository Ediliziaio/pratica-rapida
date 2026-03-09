import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";

interface ChatProfile {
  nome: string;
  cognome: string;
}

interface PracticeChatProps {
  praticaId: string;
  companyId: string;
}

const MAX_MESSAGE_LENGTH = 2000;
const MIN_SEND_INTERVAL_MS = 1000;

export function PracticeChat({ praticaId, companyId }: PracticeChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<number>(0);

  const { data: messages = [] } = useQuery({
    queryKey: ["practice-messages", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_messages")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch profiles for message authors
      const authorIds = [...new Set(data.map(m => m.user_id))];
      const { data: profilesData } = authorIds.length > 0
        ? await supabase.from("profiles").select("id, nome, cognome").in("id", authorIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));

      return data.map(m => ({ ...m, profile: profileMap[m.user_id] as ChatProfile | undefined }));
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${praticaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "practice_messages", filter: `pratica_id=eq.${praticaId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["practice-messages", praticaId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [praticaId, queryClient]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    // Rate limit
    if (Date.now() - lastSentRef.current < MIN_SEND_INTERVAL_MS) return;
    sendMessage.mutate();
  }, [message, sendMessage]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Messaggi
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="mb-4 max-h-80 space-y-3 overflow-y-auto rounded-lg bg-muted/50 p-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nessun messaggio. Inizia la conversazione.
            </p>
          ) : (
            messages.map((m) => {
              const isMe = m.user_id === user?.id;
              const profile = m.profiles as ChatProfile | null;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isMe ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}>
                    {!isMe && profile && (
                      <p className="text-xs font-medium mb-1 opacity-70">
                        {profile.nome} {profile.cognome}
                      </p>
                    )}
                    <p className="text-sm break-words">{m.messaggio}</p>
                    <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Scrivi un messaggio..."
            className="flex-1"
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <Button type="submit" size="icon" disabled={!message.trim() || sendMessage.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {message.length > MAX_MESSAGE_LENGTH * 0.9 && (
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {message.length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
