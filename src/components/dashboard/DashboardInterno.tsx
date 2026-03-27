import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen, Clock, FileCheck, TrendingUp, AlertCircle,
  ArrowRight, CreditCard, BarChart3, Trophy, Users as UsersIcon,
  Building2, User, AlertTriangle, DollarSign, Timer,
  Zap, Flame,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useSLASettings } from "@/hooks/usePlatformSettings";

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function DashboardInterno() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sla: slaSettings } = useSLASettings();

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const { data: allPratiche = [], isLoading: loadingAll } = useQuery({
    queryKey: ["all-pratiche-stats"],
    queryFn: async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, updated_at, company_id, pagamento_stato, assegnatario_id, dati_pratica")
        .gte("created_at", twelveMonthsAgo.toISOString())
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: allCompanies = [] } = useQuery({
    queryKey: ["all-companies-dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale");
      return data || [];
    },
  });

  const operatorIds = useMemo(() => {
    return [...new Set(allPratiche.map(p => p.assegnatario_id).filter(Boolean))] as string[];
  }, [allPratiche]);

  const { data: operatorProfiles = [] } = useQuery({
    queryKey: ["operator-profiles-dash", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  // ---- KPIs (single pass) ----
  const kpis = useMemo(() => {
    let totalRevenue = 0, totalPratiche = 0, completate = 0, backlog = 0;
    let revenueThisMonth = 0, revenueLastMonth = 0;
    let praticheThisMonth = 0, praticheLastMonth = 0;
    let completateThisMonth = 0, completateLastMonth = 0;
    let praticheInviate = 0, praticheAttesaDoc = 0;

    allPratiche.forEach(p => {
      const prezzo = p.prezzo || 0;
      const cM = new Date(p.created_at).getMonth(), cY = new Date(p.created_at).getFullYear();
      const uM = new Date(p.updated_at).getMonth(), uY = new Date(p.updated_at).getFullYear();

      totalRevenue += prezzo;
      totalPratiche++;

      if (cM === thisMonth && cY === thisYear) { revenueThisMonth += prezzo; praticheThisMonth++; }
      if (cM === lastMonth && cY === lastMonthYear) { revenueLastMonth += prezzo; praticheLastMonth++; }

      if (p.stato === "completata") {
        completate++;
        if (uM === thisMonth && uY === thisYear) completateThisMonth++;
        if (uM === lastMonth && uY === lastMonthYear) completateLastMonth++;
      } else if (p.stato !== "annullata") {
        backlog++;
        if (p.stato === "inviata") praticheInviate++;
        else if (p.stato === "in_attesa_documenti") praticheAttesaDoc++;
      }
    });

    return {
      totalRevenue, totalPratiche, completate, backlog,
      revenueDiff: revenueThisMonth - revenueLastMonth,
      praticheDiff: praticheThisMonth - praticheLastMonth,
      completateDiff: completateThisMonth - completateLastMonth,
      praticheInAttesa: praticheInviate + praticheAttesaDoc,
      praticheInviate, praticheAttesaDoc,
    };
  }, [allPratiche, thisMonth, thisYear, lastMonth, lastMonthYear]);

  // ---- Brand breakdown ----
  const brandStats = useMemo(() => {
    const active = allPratiche.filter(p => !["bozza", "annullata"].includes(p.stato));
    const enea = active.filter(p => {
      const brand = (p.dati_pratica as any)?.brand;
      return !brand || brand === "enea";
    }).length;
    const ct = active.filter(p => (p.dati_pratica as any)?.brand === "conto_termico").length;
    return { enea, ct, total: active.length };
  }, [allPratiche]);

  // ---- SLA ----
  const slaMetrics = useMemo(() => {
    if (allPratiche.length === 0) return null;
    const inLavorazione = allPratiche.filter(p => ["in_lavorazione", "completata", "in_attesa_documenti"].includes(p.stato));
    const takeoverTimes = inLavorazione
      .filter(p => p.updated_at && p.created_at)
      .map(p => (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 3600000);
    const avgTakeover = takeoverTimes.length > 0 ? takeoverTimes.reduce((a, b) => a + b, 0) / takeoverTimes.length : 0;

    const nowMs = Date.now();
    const overSLA = allPratiche.filter(p => {
      if (p.stato !== "inviata") return false;
      const hours = (nowMs - new Date(p.created_at).getTime()) / 3600000;
      return hours > slaSettings.presaInCaricoOre;
    }).length;

    const completed = allPratiche.filter(p => p.stato === "completata");
    const completionTimes = completed
      .filter(p => p.updated_at && p.created_at)
      .map(p => (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 3600000);
    const avgCompletion = completionTimes.length > 0 ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : 0;

    return { avgTakeover, avgCompletion, overSLA };
  }, [allPratiche, slaSettings]);

  // ---- Operator Workload ----
  const operatorWorkload = useMemo(() => {
    const openPratiche = allPratiche.filter(p => !["completata", "annullata"].includes(p.stato));
    const counts: Record<string, number> = {};
    openPratiche.forEach(p => {
      if (p.assegnatario_id) counts[p.assegnatario_id] = (counts[p.assegnatario_id] || 0) + 1;
    });
    const unassigned = openPratiche.filter(p => !p.assegnatario_id).length;
    const operators = Object.entries(counts).map(([id, count]) => {
      const profile = operatorProfiles.find(p => p.id === id);
      return {
        id,
        name: profile ? `${profile.nome} ${profile.cognome}`.trim() : "Operatore",
        count,
        status: count <= 5 ? "green" : count <= 10 ? "yellow" : "red",
      };
    }).sort((a, b) => b.count - a.count);
    return [
      { id: "unassigned", name: "Non assegnate", count: unassigned, status: unassigned > 0 ? "yellow" : "green" as string },
      ...operators,
    ];
  }, [allPratiche, operatorProfiles]);

  // ---- Unpaid ----
  const unpaid = useMemo(() => {
    const list = allPratiche
      .filter(p => p.stato === "completata" && p.pagamento_stato === "non_pagata")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    const total = list.reduce((s, p) => s + (p.prezzo || 0), 0);
    return { list: list.slice(0, 10), total };
  }, [allPratiche]);

  // ---- Charts ----
  const globalChartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      months.push({
        name: MONTH_NAMES[m],
        completate: allPratiche.filter(p => {
          const pd = new Date(p.updated_at);
          return p.stato === "completata" && pd.getMonth() === m && pd.getFullYear() === y;
        }).length,
        in_corso: allPratiche.filter(p => {
          const pd = new Date(p.created_at);
          return !["completata", "annullata"].includes(p.stato) && pd.getMonth() === m && pd.getFullYear() === y;
        }).length,
      });
    }
    return months;
  }, [allPratiche, thisMonth, thisYear]);

  const chartConfig = {
    completate: { label: "Completate", color: "hsl(var(--success))" },
    in_corso: { label: "In corso", color: "hsl(var(--primary))" },
  };

  const top5Aziende = useMemo(() => {
    const counts: Record<string, number> = {};
    allPratiche.forEach(p => { counts[p.company_id] = (counts[p.company_id] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id, count,
        name: allCompanies.find(c => c.id === id)?.ragione_sociale || "—",
      }));
  }, [allPratiche, allCompanies]);

  const DiffBadge = ({ diff, invert }: { diff: number; invert?: boolean }) => {
    if (diff === 0) return null;
    const positive = invert ? diff < 0 : diff > 0;
    return (
      <span className={`text-xs ${positive ? "text-success" : "text-destructive"}`}>
        {diff > 0 ? "+" : ""}{diff} vs mese prec.
      </span>
    );
  };

  const statusColor = (s: string) => s === "green" ? "text-success" : s === "yellow" ? "text-warning" : "text-destructive";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {user?.user_metadata?.nome ? `Ciao, ${user.user_metadata.nome} 👋` : "Panoramica"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Situazione operativa in tempo reale.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate("/coda-pratiche")}>
            <FolderOpen className="mr-2 h-4 w-4" />Coda Pratiche
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/pratiche")}>
            <BarChart3 className="mr-2 h-4 w-4" />Admin Pratiche
          </Button>
        </div>
      </div>

      {/* Alert pratiche in attesa */}
      {kpis.praticheInAttesa > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <AlertCircle className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {kpis.praticheInAttesa} pratiche richiedono attenzione
              </p>
              <p className="text-sm text-muted-foreground">
                {kpis.praticheInviate > 0 && <span>{kpis.praticheInviate} inviate (non prese in carico)</span>}
                {kpis.praticheInviate > 0 && kpis.praticheAttesaDoc > 0 && " · "}
                {kpis.praticheAttesaDoc > 0 && <span>{kpis.praticheAttesaDoc} in attesa documenti</span>}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/pratiche")}>
              Gestisci <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {loadingAll ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <DiffBadge diff={kpis.revenueDiff} />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue (12 mesi)</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">€ {kpis.totalRevenue.toFixed(0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <DiffBadge diff={kpis.praticheDiff} />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pratiche Totali</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.totalPratiche}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                  <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <DiffBadge diff={kpis.completateDiff} />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completate</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.completate}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={kpis.backlog > 20 ? "border-warning/40" : ""}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpis.backlog > 20 ? "bg-amber-100 dark:bg-amber-950" : "bg-muted"}`}>
                  <Clock className={`h-5 w-5 ${kpis.backlog > 20 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Backlog</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.backlog}</p>
                <p className="text-xs text-muted-foreground mt-0.5">pratiche aperte</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Brand breakdown + SLA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Volume per tipo pratica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">ENEA</p>
                  <span className="text-sm font-bold">{brandStats.enea}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: brandStats.total > 0 ? `${(brandStats.enea / brandStats.total) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                <Flame className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Conto Termico</p>
                  <span className="text-sm font-bold">{brandStats.ct}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: brandStats.total > 0 ? `${(brandStats.ct / brandStats.total) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{brandStats.total} pratiche attive totali (ultimi 12 mesi)</p>
          </CardContent>
        </Card>

        {slaMetrics && (
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Timer className="h-4 w-4" />Presa in carico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${slaMetrics.avgTakeover > slaSettings.presaInCaricoOre ? "text-destructive" : "text-success"}`}>
                  {slaMetrics.avgTakeover.toFixed(1)}h
                </div>
                <p className="text-xs text-muted-foreground">Target: {slaSettings.presaInCaricoOre}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Timer className="h-4 w-4" />Completamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${slaMetrics.avgCompletion > slaSettings.completamentoOre ? "text-destructive" : "text-success"}`}>
                  {slaMetrics.avgCompletion.toFixed(1)}h
                </div>
                <p className="text-xs text-muted-foreground">Target: {slaSettings.completamentoOre}h</p>
              </CardContent>
            </Card>
            <Card className={slaMetrics.overSLA > 0 ? "border-destructive/50" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />Oltre SLA
                </CardTitle>
                {slaMetrics.overSLA > 0 && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${slaMetrics.overSLA > 0 ? "text-destructive" : "text-success"}`}>
                  {slaMetrics.overSLA}
                </div>
                <p className="text-xs text-muted-foreground">non prese in carico</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Operator Workload + Activity Feed */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4 text-primary" /> Carico Operatori
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {operatorWorkload.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessun operatore attivo</p>
            ) : (
              operatorWorkload.map(op => (
                <div key={op.id} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium flex-1 truncate">{op.name}</span>
                  <Badge variant="outline" className={statusColor(op.status)}>
                    {op.count} pratiche
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <ActivityFeed />
      </div>

      {/* Unpaid Practices */}
      {unpaid.list.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-warning" /> Pratiche Completate Non Pagate
            </CardTitle>
            <Badge variant="outline" className="text-warning">
              € {unpaid.total.toFixed(2)} da riscuotere
            </Badge>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-2">
                {unpaid.list.map(p => {
                  const companyName = allCompanies.find(c => c.id === p.company_id)?.ragione_sociale || "—";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg p-2 cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => navigate(`/pratiche/${p.id}`)}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning/10">
                        <CreditCard className="h-4 w-4 text-warning" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.titolo}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />{companyName}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-warning">€ {p.prezzo.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Global chart + Top 5 aziende */}
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
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-primary" /> Top 5 Aziende per pratiche
            </CardTitle>
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
    </div>
  );
}
