import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Shield, Clock, User, Building2, CalendarIcon } from "lucide-react";
import { format, subMonths, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

const AZIONE_LABELS: Record<string, { label: string; color: string }> = {
  cambio_stato_pratica: { label: "Cambio Stato", color: "bg-primary/10 text-primary" },
  assegnazione_operatore: { label: "Assegnazione", color: "bg-accent text-accent-foreground" },
  wallet_topup: { label: "Ricarica Wallet", color: "bg-success/10 text-success" },
  creazione_utente: { label: "Nuovo Utente", color: "bg-warning/10 text-warning" },
  eliminazione_utente: { label: "Eliminazione Utente", color: "bg-destructive/10 text-destructive" },
};

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [filterAzione, setFilterAzione] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 3),
    to: new Date(),
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-log", dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (dateRange?.from) {
        query = query.gte("created_at", startOfDay(dateRange.from).toISOString());
      }
      if (dateRange?.to) {
        query = query.lte("created_at", endOfDay(dateRange.to).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Only fetch profiles/companies that appear in logs (avoid global scan)
  const { companyIds, userIds } = useMemo(() => {
    const cIds = new Set<string>();
    const uIds = new Set<string>();
    logs.forEach(l => {
      if (l.company_id) cIds.add(l.company_id);
      if (l.user_id) uIds.add(l.user_id);
    });
    return { companyIds: [...cIds], userIds: [...uIds] };
  }, [logs]);

  const { data: companies = [] } = useQuery({
    queryKey: ["audit-companies", companyIds],
    queryFn: async () => {
      if (companyIds.length === 0) return [];
      const { data } = await supabase.from("companies").select("id, ragione_sociale").in("id", companyIds);
      return data || [];
    },
    enabled: companyIds.length > 0,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["audit-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, nome, cognome, email").in("id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c.ragione_sociale])), [companies]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, `${p.nome} ${p.cognome}`.trim() || p.email])), [profiles]);

  const uniqueAzioni = useMemo(() => [...new Set(logs.map(l => l.azione))], [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (filterAzione !== "all" && l.azione !== filterAzione) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const companyName = l.company_id ? companyMap[l.company_id] || "" : "";
      const userName = l.user_id ? profileMap[l.user_id] || "" : "";
      const dettagli = JSON.stringify(l.dettagli || {});
      return (
        l.azione.toLowerCase().includes(searchLower) ||
        companyName.toLowerCase().includes(searchLower) ||
        userName.toLowerCase().includes(searchLower) ||
        dettagli.toLowerCase().includes(searchLower)
      );
    }
    return true;
  }), [logs, filterAzione, search, companyMap, profileMap]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Audit Log
        </h1>
        <p className="text-muted-foreground">Registro completo di tutte le azioni critiche sulla piattaforma</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per utente, azienda, dettagli..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterAzione} onValueChange={setFilterAzione}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filtra per azione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le azioni</SelectItem>
            {uniqueAzioni.map(a => (
              <SelectItem key={a} value={a}>
                {AZIONE_LABELS[a]?.label || a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, "dd/MM/yy", { locale: it })} – {format(dateRange.to, "dd/MM/yy", { locale: it })}</>
                ) : (
                  format(dateRange.from, "dd/MM/yy", { locale: it })
                )
              ) : (
                "Periodo"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              locale={it}
              numberOfMonths={2}
              defaultMonth={subMonths(new Date(), 1)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} eventi registrati
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun evento nel registro</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Azione</TableHead>
                    <TableHead>Utente</TableHead>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Dettagli</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(log => {
                    const cfg = AZIONE_LABELS[log.azione];
                    const dettagli = log.dettagli as Record<string, string> | null;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(log.created_at).toLocaleDateString("it-IT", {
                              day: "2-digit", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg?.color || ""}>
                            {cfg?.label || log.azione}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[150px]">
                              {log.user_id ? profileMap[log.user_id] || log.user_id.slice(0, 8) : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[150px]">
                              {log.company_id ? companyMap[log.company_id] || "—" : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {dettagli && (
                            <div className="flex flex-wrap gap-1">
                              {dettagli.stato_precedente && dettagli.stato_nuovo && (
                                <span className="text-xs text-muted-foreground">
                                  {dettagli.stato_precedente} → {dettagli.stato_nuovo}
                                </span>
                              )}
                              {dettagli.titolo && (
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  "{dettagli.titolo}"
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
