import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, ArrowRight, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export default function ClientiAdmin() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("tutti");

  const { data: clienti = [], isLoading } = useQuery({
    queryKey: ["admin-clienti"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id, nome, cognome, email, telefono, company_name, city,
          last_login_at, created_at, onboarding_completed,
          total_pratiche_count, lifetime_value
        `)
        .in("id", (
          await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["azienda_admin", "azienda_user"])
        ).data?.map(r => r.user_id) ?? [])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Promo attive per cliente
  const { data: promoMap = {} } = useQuery({
    queryKey: ["admin-promos-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_promos")
        .select("client_id, status")
        .eq("status", "active");
      const map: Record<string, boolean> = {};
      data?.forEach(p => { map[p.client_id] = true; });
      return map;
    },
  });

  const isInactive = (last_login: string | null) =>
    !last_login || new Date(last_login) < new Date(Date.now() - 30 * 86400000);

  const filtered = useMemo(() => {
    return clienti.filter(c => {
      const matchSearch = `${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.company_name ?? ""}`.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === "tutti" ? true :
        filter === "inattivi" ? isInactive(c.last_login_at) :
        filter === "promo" ? promoMap[c.id] :
        filter === "onboarding" ? !c.onboarding_completed :
        true;
      return matchSearch && matchFilter;
    });
  }, [clienti, search, filter, promoMap]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-muted-foreground text-sm">Tutti i clienti della piattaforma</p>
        </div>
        <Badge variant="outline" className="ml-auto">{filtered.length} clienti</Badge>
      </div>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca per nome, email, azienda..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti</SelectItem>
            <SelectItem value="inattivi">Inattivi (&gt;30gg)</SelectItem>
            <SelectItem value="promo">Con promo attiva</SelectItem>
            <SelectItem value="onboarding">Onboarding incompleto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabella */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Azienda</TableHead>
                <TableHead>Pratiche</TableHead>
                <TableHead>LTV</TableHead>
                <TableHead>Ultimo accesso</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nessun cliente trovato
                  </TableCell>
                </TableRow>
              ) : filtered.map(c => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/admin/clienti/${c.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{c.nome} {c.cognome}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.company_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.total_pratiche_count ?? 0}</TableCell>
                  <TableCell className="text-sm">€ {(c.lifetime_value ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_login_at
                      ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDistanceToNow(new Date(c.last_login_at), { locale: it, addSuffix: true })}</span>
                      : "Mai"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {isInactive(c.last_login_at) && <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">INATTIVO</Badge>}
                      {promoMap[c.id] && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">PROMO</Badge>}
                      {!c.onboarding_completed && <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">ONBOARD</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
