import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Shield, Clock, User, Building2, FileText } from "lucide-react";

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

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["audit-companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale");
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, cognome, email");
      return data || [];
    },
  });

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.ragione_sociale]));
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, `${p.nome} ${p.cognome}`.trim() || p.email]));

  const uniqueAzioni = [...new Set(logs.map(l => l.azione))];

  const filtered = logs.filter(l => {
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
  });

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
                    const dettagli = log.dettagli as Record<string, any> | null;
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
