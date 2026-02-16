import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";

interface PracticeChatProps {
  praticaId: string;
  companyId: string;
}

export function PracticeChat({ praticaId, companyId }: PracticeChatProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["practice-messages", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_messages")
        .select("*, profiles(nome, cognome)")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: true });
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
      const { error } = await supabase.from("practice_messages").insert({
        pratica_id: praticaId,
        company_id: companyId,
        user_id: user.id,
        messaggio: message.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["practice-messages", praticaId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) sendMessage.mutate();
  };

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
              const profile = m.profiles as any;
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
                    <p className="text-sm">{m.messaggio}</p>
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
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Scrivi un messaggio..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!message.trim() || sendMessage.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
