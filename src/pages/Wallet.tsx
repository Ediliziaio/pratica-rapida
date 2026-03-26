import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, CheckCircle2, Clock, FileText, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { PAGAMENTO_BADGE } from "@/lib/pratiche-config";

export default function EstrattoConto() {
  const { companyId } = useCompany();

  const { data: pratiche = [], isLoading } = useQuery({
    queryKey: ["estratto-conto", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, pagamento_stato, created_at")
        .eq("company_id", companyId)
        .in("stato", ["inviata", "in_lavorazione", "in_attesa_documenti", "completata"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const monthlyGroups = useMemo(() => {
    const groups: Record<string, { label: string; count: number; totale: number; stati: string[] }> = {};
    pratiche.forEach((p) => {
      const key = format(new Date(p.created_at), "yyyy-MM");
      const label = format(new Date(p.created_at), "MMMM yyyy", { locale: it });
      if (!groups[key]) groups[key] = { label, count: 0, totale: 0, stati: [] };
      groups[key].count += 1;
      groups[key].totale += p.prezzo || 0;
      groups[key].stati.push(p.pagamento_stato);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, val]) => ({ key, ...val }));
  }, [pratiche]);

  const currentMonthKey = format(new Date(), "yyyy-MM");

  const totDaFatturare = pratiche
    .filter((p) => p.stato === "completata" && p.pagamento_stato === "non_pagata")
    .reduce((s, p) => s + (p.prezzo || 0), 0);
  const totFatturate = pratiche
    .filter((p) => p.pagamento_stato === "in_verifica")
    .reduce((s, p) => s + (p.prezzo || 0), 0);
  const totPagate = pratiche
    .filter((p) => p.pagamento_stato === "pagata")
    .reduce((s, p) => s + (p.prezzo || 0), 0);

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Receipt className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Estratto Conto</h1>
        <p className="text-muted-foreground">Riepilogo pratiche e fatturazione mensile tramite bonifico</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Da fatturare</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">€ {totDaFatturare.toFixed(2)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Pratiche completate, prossima fattura</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fatturate</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">€ {totFatturate.toFixed(2)}</div>
            <p className="mt-1 text-xs text-muted-foreground">In attesa di bonifico</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pagate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">€ {totPagate.toFixed(2)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Bonifici confermati</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-primary">Come funziona la fatturazione</p>
            <p className="mt-1 text-muted-foreground">
              A fine mese riceverai una fattura con il riepilogo di tutte le pratiche completate.
              Il pagamento avviene tramite bonifico bancario entro il 15 del mese successivo.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Riepilogo per mese
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : monthlyGroups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Nessuna pratica ancora. Crea la tua prima pratica per iniziare.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mese</TableHead>
                  <TableHead className="text-center">Pratiche</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyGroups.map((group) => {
                  const allPaid = group.stati.every((s) => s === "pagata");
                  const anyInVerifica = group.stati.some((s) => s === "in_verifica");
                  const monthStatus = allPaid ? "pagata" : anyInVerifica ? "in_verifica" : "non_pagata";
                  const badge = PAGAMENTO_BADGE[monthStatus];
                  return (
                    <TableRow key={group.key}>
                      <TableCell className="font-medium capitalize">
                        {group.label}
                        {group.key === currentMonthKey && (
                          <Badge variant="outline" className="ml-2 text-xs">Mese corrente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{group.count}</TableCell>
                      <TableCell className="text-right font-semibold">€ {group.totale.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
