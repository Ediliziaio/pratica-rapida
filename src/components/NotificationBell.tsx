import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TIPO_ICONS: Record<string, any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const unreadCount = notifications.filter((n) => !n.letto).length;

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ letto: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ letto: true })
        .eq("user_id", user.id)
        .eq("letto", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleClick = (n: typeof notifications[0]) => {
    if (!n.letto) markAsRead.mutate(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Notifiche</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={() => markAllRead.mutate()}>
              <Check className="mr-1 h-3 w-3" />Segna tutte lette
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nessuna notifica</p>
          ) : (
            notifications.map((n) => {
              const Icon = TIPO_ICONS[n.tipo] || Info;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors hover:bg-accent ${
                    !n.letto ? "bg-primary/5" : ""
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${
                    n.tipo === "success" ? "text-success" :
                    n.tipo === "warning" ? "text-warning" :
                    n.tipo === "error" ? "text-destructive" :
                    "text-primary"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${!n.letto ? "font-medium" : ""}`}>{n.titolo}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.messaggio}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {!n.letto && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
