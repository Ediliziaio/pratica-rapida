import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  AlertTriangle, FolderOpen, Clock, CheckCircle, Archive, Euro,
  Plus, TrendingUp, TrendingDown, LayoutDashboard, ChevronRight,
} from "lucide-react";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";

type PracticeWithStage = EneaPractice & {
  pipeline_stage: PipelineStage | null;
  reseller_company: { ragione_sociale: string } | null;
};

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

// Custom tooltip for recharts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-sm">
      <p className="font-medium mb-1 text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted-foreground">
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

function AlertBox({ practices }: { practices: PracticeWithStage[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stale = practices.filter((p) => p.updated_at < sevenDaysAgo && !p.archived_at);
  if (!stale.length) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription>
        <p className="font-semibold">
          {stale.length} {stale.length === 1 ? "pratica senza" : "pratiche senza"} aggiornamento da oltre 7 giorni
        </p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {stale.slice(0, 5).map((p) => (
            <li key={p.id}>
              {p.cliente_nome} {p.cliente_cognome} —{" "}
              {new Date(p.updated_at).toLocaleDateString("it-IT")}
            </li>
          ))}
          {stale.length > 5 && <li className="text-amber-600 dark:text-amber-400">…e altre {stale.length - 5}</li>}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <p className="text-xs text-muted-foreground mt-0.5">= vs mese prec.</p>;
  const isUp = diff > 0;
  return (
    <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${isUp ? "text-emerald-600" : "text-destructive"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}{diff} vs mese prec.
    </p>
  );
}

function DashboardContent({ brand }: { brand: "enea" | "conto_termico" }) {
  const { isInternal } = useAuth();
  const navigate = useNavigate();

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
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  // Current month counts
  const totaleAttive = practices.filter((p) => !p.archived_at).length;
  const totaleAttiviMese = practices.filter((p) => !p.archived_at && p.created_at >= startOfMonth).length;
  const totaleAttiviPrevMese = practices.filter(
    (p) => !p.archived_at && p.created_at >= startOfPrevMonth && p.created_at < startOfMonth
  ).length;

  const inAttesaCompilazione = practices.filter(
    (p) => p.pipeline_stage?.stage_type === "attesa_compilazione" && !p.archived_at
  ).length;
  const inAttesaCompilazionePrev = practices.filter(
    (p) =>
      p.pipeline_stage?.stage_type === "attesa_compilazione" &&
      !p.archived_at &&
      p.created_at >= startOfPrevMonth &&
      p.created_at < startOfMonth
  ).length;

  const pronteDaFare = practices.filter(
    (p) => p.pipeline_stage?.stage_type === "pronte_da_fare" && !p.archived_at
  ).length;
  const pronteDaFarePrev = practices.filter(
    (p) =>
      p.pipeline_stage?.stage_type === "pronte_da_fare" &&
      !p.archived_at &&
      p.created_at >= startOfPrevMonth &&
      p.created_at < startOfMonth
  ).length;

  const archiviateMesseCorrente = practices.filter(
    (p) => p.archived_at && p.archived_at >= startOfMonth
  ).length;
  const archiviateMessePrev = practices.filter(
    (p) => p.archived_at && p.archived_at >= startOfPrevMonth && p.archived_at < startOfMonth
  ).length;

  const guadagnoMese = practices
    .filter((p) => p.created_at >= startOfMonth)
    .reduce((s, p) => s + (p.guadagno_netto ?? 0), 0);
  const guadagnoPrevMese = practices
    .filter((p) => p.created_at >= startOfPrevMonth && p.created_at < startOfMonth)
    .reduce((s, p) => s + (p.guadagno_netto ?? 0), 0);
  const guadagnoTrend = guadagnoMese - guadagnoPrevMese;

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
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
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
            <TrendIndicator current={totaleAttiviMese} previous={totaleAttiviPrevMese} />
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
            <TrendIndicator current={inAttesaCompilazione} previous={inAttesaCompilazionePrev} />
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
            <TrendIndicator current={pronteDaFare} previous={pronteDaFarePrev} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Archiviate (mese)</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{archiviateMesseCorrente}</div>
            <TrendIndicator current={archiviateMesseCorrente} previous={archiviateMessePrev} />
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
              <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${guadagnoTrend >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {guadagnoTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {guadagnoTrend >= 0 ? "+" : ""}€{guadagnoTrend.toFixed(2)} vs mese prec.
              </p>
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
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Pratiche" fill="hsl(220, 72%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                <LayoutDashboard className="h-8 w-8" />
                <p className="text-sm">Nessun dato da visualizzare</p>
              </div>
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
                <Tooltip content={<CustomTooltip />} />
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Ultime 10 pratiche</CardTitle>
          <button
            onClick={() => navigate(brand === "enea" ? "/enea" : "/conto-termico")}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            Vedi tutte <ChevronRight className="h-3 w-3" />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          {last10.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nessuna pratica</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  {isInternal && <TableHead>Rivenditore</TableHead>}
                  <TableHead>Stage</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Creazione</TableHead>
                  <TableHead>Aggiornato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {last10.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/enea/${p.id}`)}
                  >
                    <TableCell className="font-medium">
                      {p.cliente_nome} {p.cliente_cognome}
                    </TableCell>
                    {isInternal && (
                      <TableCell className="text-muted-foreground text-xs">
                        {p.reseller_company?.ragione_sociale ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      {p.pipeline_stage ? (
                        <Badge variant="outline" className="text-xs">
                          {p.pipeline_stage.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${p.brand === "enea" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"}`}
                      >
                        {p.brand === "enea" ? "ENEA" : "Conto Termico"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("it-IT")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(p.updated_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Combined summary bar query (both brands)
function useCombinedSummary() {
  return useQuery<PracticeWithStage[]>({
    queryKey: ["enea_practices_all_summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enea_practices")
        .select("*, pipeline_stage:pipeline_stages(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PracticeWithStage[];
    },
    staleTime: 60_000,
  });
}

export default function EneaDashboard() {
  const { isReseller } = useAuth();
  const navigate = useNavigate();
  const { data: allPractices = [] } = useCombinedSummary();

  // Counts for each brand tab
  const eneaTotal = allPractices.filter((p) => p.brand === "enea" && !p.archived_at).length;
  const ctTotal = allPractices.filter((p) => p.brand === "conto_termico" && !p.archived_at).length;

  // Combined summary bar
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const totalAttive = allPractices.filter((p) => !p.archived_at).length;
  const totalPronteDaFare = allPractices.filter(
    (p) => p.pipeline_stage?.stage_type === "pronte_da_fare" && !p.archived_at
  ).length;
  const totalAlert = allPractices.filter(
    (p) => !p.archived_at && p.updated_at < sevenDaysAgo
  ).length;
  const totalArchiviateMese = allPractices.filter(
    (p) => p.archived_at && p.archived_at >= startOfMonth
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Panoramica pratiche ENEA e Conto Termico</p>
        </div>
        {isReseller && (
          <Button onClick={() => navigate("/enea/nuova")} size="sm" className="gap-1.5 flex-shrink-0">
            <Plus className="h-4 w-4" />
            Nuova pratica
          </Button>
        )}
      </div>

      {/* Combined summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Totale attive</p>
          <p className="text-xl font-bold">{totalAttive}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Pronte da fare</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{totalPronteDaFare}</p>
            {totalPronteDaFare > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-xs h-5">
                {totalPronteDaFare}
              </Badge>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Alert stale &gt;7g</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{totalAlert}</p>
            {totalAlert > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          </div>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">Archiviate (mese)</p>
          <p className="text-xl font-bold">{totalArchiviateMese}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="enea">
        <TabsList>
          <TabsTrigger value="enea" className="gap-2">
            ENEA
            <Badge variant="secondary" className="text-xs h-5 px-1.5">{eneaTotal}</Badge>
          </TabsTrigger>
          <TabsTrigger value="conto_termico" className="gap-2">
            Conto Termico
            <Badge variant="secondary" className="text-xs h-5 px-1.5">{ctTotal}</Badge>
          </TabsTrigger>
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
