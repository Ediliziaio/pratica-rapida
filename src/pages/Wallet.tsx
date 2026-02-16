import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowUpCircle, ArrowDownCircle, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WalletPage() {
  const { companyId } = useCompany();

  const { data: company } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("wallet_balance, ragione_sociale")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["wallet-movements", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("wallet_movements")
        .select("*, pratiche(titolo)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalCrediti = movements.filter((m) => m.tipo === "credito").reduce((s, m) => s + m.importo, 0);
  const totalDebiti = movements.filter((m) => m.tipo === "debito").reduce((s, m) => s + m.importo, 0);

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Wallet className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-muted-foreground">Gestisci il tuo credito prepagato</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Disponibile</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">€ {(company?.wallet_balance ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totale Ricariche</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">€ {totalCrediti.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totale Speso</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">€ {totalDebiti.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Movimenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : movements.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Nessun movimento. Il credito verrà caricato dall'amministratore.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Causale</TableHead>
                  <TableHead>Pratica</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {new Date(m.created_at).toLocaleDateString("it-IT", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.tipo === "credito" ? "default" : "destructive"} className="text-xs">
                        {m.tipo === "credito" ? "Credito" : "Debito"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{m.causale}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.pratiche ? (m.pratiche as any).titolo : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${m.tipo === "credito" ? "text-success" : "text-destructive"}`}>
                      {m.tipo === "credito" ? "+" : "−"}€ {m.importo.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Per ricaricare il wallet, contatta l'amministratore di Impresa Leggera.
      </p>
    </div>
  );
}
