import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { AlertTriangle, FolderOpen, Clock, CheckCircle, Archive, Euro } from "lucide-react";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";

type PracticeWithStage = EneaPractice & {
  pipeline_stage: PipelineStage | null;
  reseller_company: { ragione_sociale: string } | null;
};

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function AlertBox({ practices }: { practices: PracticeWithStage[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stale = practices.filter((p) => p.updated_at < sevenDaysAgo);
  if (!stale.length) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div>
        <p className="font-semibold">{stale.length} pratiche senza aggiornamento da oltre 7 giorni</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {stale.slice(0, 5).map((p) => (
            <li key={p.id}>
              {p.cliente_nome} {p.cliente_cognome} — ultimo aggiornamento:{" "}
              {new Date(p.updated_at).toLocaleDateString("it-IT")}
            </li>
          ))}
          {stale.length > 5 && <li>…e altre {stale.length - 5}</li>}
        </ul>
      </div>
    </div>
  );
}

function DashboardContent({ brand }: { brand: "enea" | "conto_termico" }) {
  const { isInternal } = useAuth();

  const { data: practices = [], isLoading } = useQuery<PracticeWithStage[]>({
    queryKey: ["enea_practices_dashboard", brand],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enea_practices")
        .select(
          "*, pipeline_stage:pipeline_stages(*), reseller_company:companies!reseller_id(ragione_sociale)"
        )
        .eq("brand", brand)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PracticeWithStage[];
    },
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const totaleAttive = practices.filter(
    (p) => !p.archived_at
  ).length;

  const inAttesaCompilazione = practices.filter(
    (p) => p.pipeline_stage?.stage_type === "attesa_compilazione" && !p.archived_at
  ).length;

  const pronteDaFare = practices.filter(
    (p) => p.pipeline_stage?.stage_type === "pronte_da_fare" && !p.archived_at
  ).length;

  const archiviateMesseCorrente = practices.filter(
    (p) => p.archived_at && p.archived_at >= startOfMonth
  ).length;

  const guadagnoMese = practices
    .filter((p) => p.created_at >= startOfMonth)
    .reduce((s, p) => s + (p.guadagno_netto ?? 0), 0);

  // Bar chart: pratiche per stage
  const stageCountMap: Record<string, number> = {};
  for (const p of practices) {
    if (!p.archived_at && p.pipeline_stage) {
      const name = p.pipeline_stage.name;
      stageCountMap[name] = (stageCountMap[name] ?? 0) + 1;
    }
  }
  const stageChartData = Object.entries(stageCountMap).map(([name, count]) => ({ name, count }));

  // Line chart: pratiche create per mese (ultimi 6 mesi)
  const monthlyData = useMemo(() => {
    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: MONTH_NAMES[d.getMonth()], count: 0 });
    }
    for (const p of practices) {
      const d = new Date(p.created_at);
      const diffMonths =
        (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diffMonths >= 0 && diffMonths < 6) {
        months[5 - diffMonths].count++;
      }
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practices]);

  // Last 10 practices
  const last10 = practices.slice(0, 10);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche attive</CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totaleAttive}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In attesa compilazione</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{inAttesaCompilazione}</div>
              {inAttesaCompilazione > 10 && (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pronte da fare</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{pronteDaFare}</div>
              {pronteDaFare > 0 && (
                <Badge className="bg-destructive text-destructive-foreground text-xs">
                  {pronteDaFare}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Archiviate (mese)</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{archiviateMesseCorrente}</div>
          </CardContent>
        </Card>

        {isInternal && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Guadagno (mese)</CardTitle>
              <Euro className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€ {guadagnoMese.toFixed(2)}</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Alert box */}
      <AlertBox practices={practices} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pratiche per stage</CardTitle>
          </CardHeader>
          <CardContent>
            {stageChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Pratiche" fill="hsl(220, 72%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-muted-foreground">Nessun dato</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pratiche create per mese (ultimi 6 mesi)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Pratiche"
                  stroke="hsl(152, 60%, 40%)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table last 10 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ultime 10 pratiche</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Cliente</th>
                  {isInternal && (
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Rivenditore</th>
                  )}
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stage</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Brand</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Data creazione</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {last10.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">
                      {p.cliente_nome} {p.cliente_cognome}
                    </td>
                    {isInternal && (
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {p.reseller_company?.ragione_sociale ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-2">
                      {p.pipeline_stage ? (
                        <Badge variant="outline" className="text-xs">
                          {p.pipeline_stage.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${p.brand === "enea" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}
                      >
                        {p.brand === "enea" ? "ENEA" : "Conto Termico"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("it-IT")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {last10.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">Nessuna pratica</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EneaDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard ENEA</h1>
        <p className="text-muted-foreground">Panoramica pratiche per brand</p>
      </div>

      <Tabs defaultValue="enea">
        <TabsList>
          <TabsTrigger value="enea">ENEA</TabsTrigger>
          <TabsTrigger value="conto_termico">Conto Termico</TabsTrigger>
        </TabsList>
        <TabsContent value="enea" className="mt-6">
          <DashboardContent brand="enea" />
        </TabsContent>
        <TabsContent value="conto_termico" className="mt-6">
          <DashboardContent brand="conto_termico" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
