import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, CheckCheck, Info, AlertTriangle, CheckCircle2, XCircle,
  Inbox, Trash2, ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */
type Notification = {
  id: string;
  user_id: string;
  titolo: string;
  messaggio: string;
  tipo: "info" | "success" | "warning" | "error";
  link?: string | null;
  letto: boolean;
  created_at: string;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */
const TIPO_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; bg: string; text: string }> = {
  info:    { icon: Info,          bg: "bg-blue-100 dark:bg-blue-900/40",   text: "text-blue-600 dark:text-blue-400" },
  success: { icon: CheckCircle2,  bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-600 dark:text-green-400" },
  warning: { icon: AlertTriangle, bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-600 dark:text-amber-400" },
  error:   { icon: XCircle,       bg: "bg-red-100 dark:bg-red-900/40",     text: "text-red-600 dark:text-red-400" },
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1)  return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (diffH < 24)   return `${diffH}h fa`;
  if (diffD === 1)  return "Ieri";
  if (diffD < 7)    return `${diffD} giorni fa`;
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function groupByDate(notifications: Notification[]): Array<{ label: string; items: Notification[] }> {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const older: Notification[] = [];
  const now = new Date();

  for (const n of notifications) {
    const d = new Date(n.created_at);
    const diffD = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffD === 0) today.push(n);
    else if (diffD === 1) yesterday.push(n);
    else older.push(n);
  }

  const groups = [];
  if (today.length)     groups.push({ label: "Oggi", items: today });
  if (yesterday.length) groups.push({ label: "Ieri", items: yesterday });
  if (older.length)     groups.push({ label: "Precedenti", items: older });
  return groups;
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);

  /* ── Query ──────────────────────────────────────────────────────────── */
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user,
    refetchInterval: 60_000, // fallback poll ogni minuto
  });

  const unreadCount = notifications.filter((n) => !n.letto).length;

  /* ── Realtime (INSERT + UPDATE) ─────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-rt-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        // Animate bell on new notification
        setAnimating(true);
        setTimeout(() => setAnimating(false), 1000);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  /* ── Mutations ──────────────────────────────────────────────────────── */
  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ letto: true })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = queryClient.getQueryData<Notification[]>(["notifications", user?.id]);
      queryClient.setQueryData<Notification[]>(["notifications", user?.id], (old = []) =>
        old.map((n) => n.id === id ? { ...n, letto: true } : n)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
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
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = queryClient.getQueryData<Notification[]>(["notifications", user?.id]);
      queryClient.setQueryData<Notification[]>(["notifications", user?.id], (old = []) =>
        old.map((n) => ({ ...n, letto: true }))
      );
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = queryClient.getQueryData<Notification[]>(["notifications", user?.id]);
      queryClient.setQueryData<Notification[]>(["notifications", user?.id], (old = []) =>
        old.filter((n) => n.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleClick = (n: Notification) => {
    if (!n.letto) markAsRead.mutate(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const groups = groupByDate(notifications);

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label="Notifiche"
        >
          <Bell
            className={cn(
              "h-5 w-5 transition-transform",
              animating && "animate-[wiggle_0.5s_ease-in-out]"
            )}
          />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[360px] p-0 shadow-xl"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-sm">Notifiche</h4>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Segna tutte lette
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Nessuna notifica</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sei in pari con tutto!</p>
              </div>
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <div key={group.label}>
                  {/* Group label */}
                  <div className="sticky top-0 z-10 border-b bg-muted/60 px-4 py-1.5 backdrop-blur-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                  </div>

                  {/* Notifications */}
                  {group.items.map((n) => {
                    const config = TIPO_CONFIG[n.tipo] ?? TIPO_CONFIG.info;
                    const Icon = config.icon;
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "group relative flex gap-3 px-4 py-3 transition-colors",
                          "border-b last:border-b-0",
                          n.link ? "cursor-pointer hover:bg-accent" : "cursor-default",
                          !n.letto && "bg-primary/[0.04]"
                        )}
                        onClick={() => handleClick(n)}
                      >
                        {/* Icon */}
                        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", config.bg)}>
                          <Icon className={cn("h-4 w-4", config.text)} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 pr-6">
                          <p className={cn("text-sm leading-snug", !n.letto ? "font-semibold" : "font-medium")}>
                            {n.titolo}
                          </p>
                          {n.messaggio && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {n.messaggio}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                            {n.link && (
                              <span className="flex items-center gap-0.5 text-[10px] text-primary">
                                <ExternalLink className="h-2.5 w-2.5" />
                                Apri
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Unread dot */}
                        {!n.letto && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                        )}

                        {/* Delete button (on hover) */}
                        <button
                          className="absolute right-3 top-2 hidden rounded p-0.5 text-muted-foreground/50 hover:text-destructive group-hover:flex"
                          onClick={(e) => { e.stopPropagation(); deleteNotification.mutate(n.id); }}
                          aria-label="Elimina notifica"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <p className="text-center text-[10px] text-muted-foreground">
              {notifications.length} notifiche · {unreadCount > 0 ? `${unreadCount} non lette` : "Tutte lette"}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
