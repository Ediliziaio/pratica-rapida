import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  FolderOpen, Clock, FileCheck, Wallet, TrendingUp, AlertCircle,
  ArrowRight, Plus, CreditCard, FileEdit, Ban, CheckCircle2,
  Building2, Send,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; icon: any }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", icon: Clock },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", icon: AlertCircle },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", icon: Ban },
};

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();

  const isInternalUser = roles.some(r => ["super_admin", "admin_interno", "operatore"].includes(r));

  const { data: company } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.from("companies").select("wallet_balance, ragione_sociale").eq("id", companyId).single();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: pratiche = [] } = useQuery({
    queryKey: ["pratiche-dashboard", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, clienti_finali(nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: allPratiche = [] } = useQuery({
    queryKey: ["all-pratiche-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("pratiche").select("stato, prezzo, created_at, company_id, pagamento_stato");
      return data || [];
    },
    enabled: isInternalUser,
  });

  const { data: allCompanies = [] } = useQuery({
    queryKey: ["all-companies-dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale");
      return data || [];
    },
    enabled: isInternalUser,
  });

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const aperte = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;
  const attesaDoc = pratiche.filter(p => p.stato === "in_attesa_documenti").length;
  const completateMese = pratiche.filter(p => {
    const d = new Date(p.created_at);
    return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const completateMesePrec = pratiche.filter(p => {
    const d = new Date(p.created_at);
    return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  }).length;
  const aperteMesePrec = pratiche.filter(p => {
    const d = new Date(p.created_at);
    return !["completata", "annullata"].includes(p.stato) && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  }).length;

  const totalThisMonth = pratiche.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const completateProgress = totalThisMonth > 0 ? (completateMese / totalThisMonth) * 100 : 0;

  // Chart data: last 6 months
  const chartData = useMemo(() => {
    const months: { name: string; completate: number; in_corso: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthPratiche = pratiche.filter(p => {
        const pd = new Date(p.created_at);
        return pd.getMonth() === m && pd.getFullYear() === y;
      });
      months.push({
        name: MONTH_NAMES[m],
        completate: monthPratiche.filter(p => p.stato === "completata").length,
        in_corso: monthPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length,
      });
    }
    return months;
  }, [pratiche, thisMonth, thisYear]);

  const chartConfig = {
    completate: { label: "Completate", color: "hsl(var(--success))" },
    in_corso: { label: "In corso", color: "hsl(var(--primary))" },
  };

  const recentPratiche = pratiche.slice(0, 5);

  // ---- Internal KPIs ----
  const totalRevenue = allPratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
  const totalPratiche = allPratiche.length;
  const completate = allPratiche.filter(p => p.stato === "completata").length;
  const backlog = allPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;

  // Monthly variations for internal KPIs
  const revenueThisMonth = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).reduce((s, p) => s + (p.prezzo || 0), 0);
  const revenueLastMonth = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  }).reduce((s, p) => s + (p.prezzo || 0), 0);
  const revenueDiff = revenueThisMonth - revenueLastMonth;

  const praticheThisMonth = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const praticheLastMonth = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  }).length;
  const praticheDiff = praticheThisMonth - praticheLastMonth;

  const completateThisMonthGlobal = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const completateLastMonthGlobal = allPratiche.filter(p => {
    const d = new Date(p.created_at);
    return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  }).length;
  const completateDiffGlobal = completateThisMonthGlobal - completateLastMonthGlobal;

  // Global chart data
  const globalChartData = useMemo(() => {
    const months: { name: string; completate: number; in_corso: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthPratiche = allPratiche.filter(p => {
        const pd = new Date(p.created_at);
        return pd.getMonth() === m && pd.getFullYear() === y;
      });
      months.push({
        name: MONTH_NAMES[m],
        completate: monthPratiche.filter(p => p.stato === "completata").length,
        in_corso: monthPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length,
      });
    }
    return months;
  }, [allPratiche, thisMonth, thisYear]);

  // Top 5 aziende per pratiche
  const top5Aziende = useMemo(() => {
    const counts: Record<string, number> = {};
    allPratiche.forEach(p => { counts[p.company_id] = (counts[p.company_id] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        name: allCompanies.find(c => c.id === id)?.ragione_sociale || "—",
        count,
      }));
  }, [allPratiche, allCompanies]);

  // Pratiche in attesa (inviate + in_attesa_documenti) globali
  const praticheInAttesa = allPratiche.filter(p => p.stato === "inviata" || p.stato === "in_attesa_documenti").length;
  const praticheInviate = allPratiche.filter(p => p.stato === "inviata").length;
  const praticheAttesaDocGlobal = allPratiche.filter(p => p.stato === "in_attesa_documenti").length;

  const diffAperte = aperte - aperteMesePrec;
  const diffCompletate = completateMese - completateMesePrec;

  const DiffBadge = ({ diff, invert }: { diff: number; invert?: boolean }) => {
    if (diff === 0) return null;
    const positive = invert ? diff < 0 : diff > 0;
    return (
      <span className={`text-xs ${positive ? "text-success" : "text-destructive"}`}>
        {diff > 0 ? "+" : ""}{diff} vs mese prec.
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Bentornato{user?.user_metadata?.nome ? `, ${user.user_metadata.nome}` : ""}
          </h1>
          <p className="text-muted-foreground">Ecco la situazione delle tue pratiche ENEA.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/pratiche/nuova")} size="sm">
            <Plus className="mr-2 h-4 w-4" />Nuova Pratica
          </Button>
          <Button variant="outline" onClick={() => navigate("/wallet")} size="sm">
            <CreditCard className="mr-2 h-4 w-4" />Wallet
          </Button>
        </div>
      </div>

      {companyId && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Aperte</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{aperte}</div>
                {diffAperte !== 0 && (
                  <p className={`text-xs mt-1 ${diffAperte > 0 ? "text-warning" : "text-success"}`}>
                    {diffAperte > 0 ? "+" : ""}{diffAperte} vs mese scorso
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={attesaDoc > 0 ? "border-warning/50" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Attesa Documenti</CardTitle>
                <AlertCircle className={`h-4 w-4 ${attesaDoc > 0 ? "text-warning" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{attesaDoc}</div>
                {attesaDoc > 0 && (
                  <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs text-warning" onClick={() => navigate("/pratiche")}>
                    Carica ora <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completate (mese)</CardTitle>
                <FileCheck className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{completateMese}</div>
                <Progress value={completateProgress} className="mt-2 h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">
                  {completateMese}/{totalThisMonth} questo mese
                  {diffCompletate !== 0 && <span className={diffCompletate > 0 ? " text-success" : " text-destructive"}> ({diffCompletate > 0 ? "+" : ""}{diffCompletate})</span>}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Credito Wallet</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">€ {(company?.wallet_balance ?? 0).toFixed(2)}</div></CardContent>
            </Card>
          </div>

          {/* Chart + Recent practices */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Andamento ultimi 6 mesi</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="completate" fill="var(--color-completate)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="in_corso" fill="var(--color-in_corso)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Pratiche recenti</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/pratiche")}>
                  Vedi tutte <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentPratiche.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessuna pratica ancora.</p>
                ) : (
                  recentPratiche.map(p => {
                    const conf = STATO_CONFIG[p.stato as PraticaStato];
                    const Icon = conf?.icon || FolderOpen;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-lg p-2 cursor-pointer transition-colors hover:bg-accent/50"
                        onClick={() => navigate(`/pratiche/${p.id}`)}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${conf?.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.titolo}</p>
                          <p className="text-xs text-muted-foreground">
                            {(p.clienti_finali as any)?.nome} {(p.clienti_finali as any)?.cognome}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">€ {p.prezzo.toFixed(2)}</p>
                          <Badge variant="outline" className={`text-[10px] ${conf?.color}`}>{conf?.label}</Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {aperte === 0 && pratiche.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <h3 className="font-display text-lg font-semibold">Nessuna pratica attiva</h3>
                <p className="mt-1 text-sm text-muted-foreground">Inizia creando una nuova pratica ENEA.</p>
                <Button className="mt-4" onClick={() => navigate("/pratiche/nuova")}>Nuova Pratica ENEA</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {isInternalUser && (
        <>
          <div className="border-t pt-6">
            <h2 className="font-display text-lg font-semibold mb-4">📊 KPI Interni</h2>
          </div>

          {/* KPI con variazioni */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Totale</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">€ {totalRevenue.toFixed(2)}</div>
                <DiffBadge diff={revenueDiff} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
                <FolderOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalPratiche}</div>
                <DiffBadge diff={praticheDiff} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completate</CardTitle>
                <FileCheck className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{completate}</div>
                <DiffBadge diff={completateDiffGlobal} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Backlog</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{backlog}</div></CardContent>
            </Card>
          </div>

          {/* Alert pratiche in attesa */}
          {praticheInAttesa > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <AlertCircle className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">⚠️ {praticheInAttesa} pratiche richiedono attenzione</p>
                  <p className="text-sm text-muted-foreground">
                    {praticheInviate > 0 && <span>{praticheInviate} inviate (non ancora prese in carico)</span>}
                    {praticheInviate > 0 && praticheAttesaDocGlobal > 0 && " · "}
                    {praticheAttesaDocGlobal > 0 && <span>{praticheAttesaDocGlobal} in attesa documenti</span>}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/pratiche")}>
                  Gestisci <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Grafico globale + Top 5 aziende */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Andamento globale (tutte le aziende)</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <BarChart data={globalChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="completate" fill="var(--color-completate)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="in_corso" fill="var(--color-in_corso)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">🏆 Top 5 Aziende per pratiche</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {top5Aziende.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessun dato.</p>
                ) : (
                  top5Aziende.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                      </div>
                      <Badge variant="outline">{a.count} pratiche</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
