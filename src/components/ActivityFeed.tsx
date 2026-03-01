import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, UserCheck, FolderOpen, ArrowRightLeft, Wallet, Shield,
} from "lucide-react";

const ACTION_ICONS: Record<string, typeof FolderOpen> = {
  cambio_stato: ArrowRightLeft,
  assegnazione: UserCheck,
  wallet_topup: Wallet,
  default: Shield,
};

function getIcon(azione: string) {
  if (azione.includes("stato")) return ACTION_ICONS.cambio_stato;
  if (azione.includes("assegn")) return ACTION_ICONS.assegnazione;
  if (azione.includes("wallet")) return ACTION_ICONS.wallet_topup;
  return ACTION_ICONS.default;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

export function ActivityFeed() {
  const queryClient = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      return data || [];
    },
  });

  // Resolve user names
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))] as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["activity-feed-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, `${p.nome} ${p.cognome}`.trim()]));

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("activity-feed-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => {
        queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">🔴 Activity Feed</CardTitle>
        <Badge variant="outline" className="text-xs gap-1">
          <RefreshCw className="h-3 w-3" /> Live
        </Badge>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessuna attività recente</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => {
                const Icon = getIcon(log.azione);
                const userName = log.user_id ? (profileMap[log.user_id] || "Utente") : "Sistema";
                const dettagli = log.dettagli as Record<string, any> | null;
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{userName}</span>{" "}
                        <span className="text-muted-foreground">{log.azione}</span>
                      </p>
                      {dettagli && (dettagli.old_stato || dettagli.new_stato) && (
                        <p className="text-xs text-muted-foreground">
                          {dettagli.old_stato} → {dettagli.new_stato}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(log.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
