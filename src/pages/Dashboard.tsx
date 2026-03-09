import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isInternal } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen, Clock, FileCheck, Wallet, TrendingUp, AlertCircle,
  ArrowRight, Plus, CreditCard, BarChart3, Trophy, Users as UsersIcon,
  Building2, Send, User, AlertTriangle, DollarSign, Timer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useSLASettings } from "@/hooks/usePlatformSettings";

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const isInternalUser = isInternal(roles);
  const { sla: slaSettings } = useSLASettings();

  const { data: company } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.from("companies").select("wallet_balance, ragione_sociale").eq("id", companyId).single();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: pratiche = [], isLoading: loadingPratiche } = useQuery({
    queryKey: ["pratiche-dashboard", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, updated_at, clienti_finali(nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: allPratiche = [], isLoading: loadingAll } = useQuery({
    queryKey: ["all-pratiche-stats"],
    queryFn: async () => {
      // Limit to last 12 months for performance
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, updated_at, company_id, pagamento_stato, assegnatario_id")
        .gte("created_at", twelveMonthsAgo.toISOString())
        .order("created_at", { ascending: false });
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

  // Operator profiles for workload
  const operatorIds = useMemo(() => {
    if (!isInternalUser) return [];
    return [...new Set(allPratiche.map(p => p.assegnatario_id).filter(Boolean))] as string[];
  }, [allPratiche, isInternalUser]);

  const { data: operatorProfiles = [] } = useQuery({
    queryKey: ["operator-profiles-dash", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  // Company KPIs — use updated_at for "completate" stats, created_at for "create nel mese"
  const companyKPIs = useMemo(() => {
    const aperte = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;
    const attesaDoc = pratiche.filter(p => p.stato === "in_attesa_documenti").length;

    const completateMese = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    const completateMesePrec = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    const createMese = pratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const aperteMesePrec = pratiche.filter(p => {
      const d = new Date(p.created_at);
      return !["completata", "annullata"].includes(p.stato) && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    const completateProgress = createMese > 0 ? (completateMese / createMese) * 100 : 0;
    const diffAperte = aperte - aperteMesePrec;
    const diffCompletate = completateMese - completateMesePrec;

    return { aperte, attesaDoc, completateMese, createMese, completateProgress, diffAperte, diffCompletate };
  }, [pratiche, thisMonth, thisYear, lastMonth, lastMonthYear]);

  const chartData = useMemo(() => {
    const months: { name: string; completate: number; in_corso: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      months.push({
        name: MONTH_NAMES[m],
        completate: pratiche.filter(p => {
          const pd = new Date(p.updated_at);
          return p.stato === "completata" && pd.getMonth() === m && pd.getFullYear() === y;
        }).length,
        in_corso: pratiche.filter(p => {
          const pd = new Date(p.created_at);
          return !["completata", "annullata"].includes(p.stato) && pd.getMonth() === m && pd.getFullYear() === y;
        }).length,
      });
    }
    return months;
  }, [pratiche, thisMonth, thisYear]);

  const chartConfig = {
    completate: { label: "Completate", color: "hsl(var(--success))" },
    in_corso: { label: "In corso", color: "hsl(var(--primary))" },
  };

  const recentPratiche = pratiche.slice(0, 5);

  // ---- Internal KPIs (consolidated) ----
  const internalKPIs = useMemo(() => {
    if (!isInternalUser || allPratiche.length === 0) return null;

    const totalRevenue = allPratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
    const totalPratiche = allPratiche.length;
    const completate = allPratiche.filter(p => p.stato === "completata").length;
    const backlog = allPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;

    const revenueThisMonth = allPratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).reduce((s, p) => s + (p.prezzo || 0), 0);
    const revenueLastMonth = allPratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).reduce((s, p) => s + (p.prezzo || 0), 0);

    const praticheThisMonth = allPratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    const praticheLastMonth = allPratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    const completateThisMonth = allPratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    const completateLastMonth = allPratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    const praticheInviate = allPratiche.filter(p => p.stato === "inviata").length;
    const praticheAttesaDoc = allPratiche.filter(p => p.stato === "in_attesa_documenti").length;
    const praticheInAttesa = praticheInviate + praticheAttesaDoc;

    return {
      totalRevenue, totalPratiche, completate, backlog,
      revenueDiff: revenueThisMonth - revenueLastMonth,
      praticheDiff: praticheThisMonth - praticheLastMonth,
      completateDiff: completateThisMonth - completateLastMonth,
      praticheInAttesa, praticheInviate, praticheAttesaDoc,
    };
  }, [allPratiche, isInternalUser, thisMonth, thisYear, lastMonth, lastMonthYear]);

  // ---- SLA Tracking ----
  const slaMetrics = useMemo(() => {
    if (!isInternalUser || allPratiche.length === 0) return null;

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
  }, [allPratiche, isInternalUser, slaSettings]);

  // ---- Operator Workload ----
  const operatorWorkload = useMemo(() => {
    if (!isInternalUser) return [];
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

    return [{ id: "unassigned", name: "Non assegnate", count: unassigned, status: unassigned > 0 ? "yellow" : "green" as string }, ...operators];
  }, [allPratiche, operatorProfiles, isInternalUser]);

  // ---- Unpaid practices ----
  const unpaidPratiche = useMemo(() => {
    if (!isInternalUser) return [];
    return allPratiche
      .filter(p => p.stato === "completata" && p.pagamento_stato === "non_pagata")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10);
  }, [allPratiche, isInternalUser]);

  const totalUnpaid = useMemo(() => {
    return allPratiche
      .filter(p => p.stato === "completata" && p.pagamento_stato === "non_pagata")
      .reduce((s, p) => s + (p.prezzo || 0), 0);
  }, [allPratiche]);

  const globalChartData = useMemo(() => {
    const months: { name: string; completate: number; in_corso: number }[] = [];
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

  const dashboardSubtitle = isInternalUser && !companyId
    ? "Panoramica operativa della piattaforma."
    : "Ecco la situazione delle tue pratiche ENEA.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Bentornato{user?.user_metadata?.nome ? `, ${user.user_metadata.nome}` : ""}
          </h1>
          <p className="text-muted-foreground">{dashboardSubtitle}</p>
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
          {loadingPratiche ? (
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
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Aperte</CardTitle>
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{companyKPIs.aperte}</div>
                  {companyKPIs.diffAperte !== 0 && (
                    <p className={`text-xs mt-1 ${companyKPIs.diffAperte > 0 ? "text-warning" : "text-success"}`}>
                      {companyKPIs.diffAperte > 0 ? "+" : ""}{companyKPIs.diffAperte} vs mese scorso
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className={companyKPIs.attesaDoc > 0 ? "border-warning/50" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Attesa Documenti</CardTitle>
                  <AlertCircle className={`h-4 w-4 ${companyKPIs.attesaDoc > 0 ? "text-warning" : "text-muted-foreground"}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{companyKPIs.attesaDoc}</div>
                  {companyKPIs.attesaDoc > 0 && (
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
                  <div className="text-3xl font-bold">{companyKPIs.completateMese}</div>
                  <Progress value={companyKPIs.completateProgress} className="mt-2 h-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {companyKPIs.completateMese}/{companyKPIs.createMese} questo mese
                    {companyKPIs.diffCompletate !== 0 && <span className={companyKPIs.diffCompletate > 0 ? " text-success" : " text-destructive"}> ({companyKPIs.diffCompletate > 0 ? "+" : ""}{companyKPIs.diffCompletate})</span>}
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
          )}

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

          {companyKPIs.aperte === 0 && pratiche.length === 0 && (
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
            <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> KPI Interni
            </h2>
          </div>

          {/* KPI con variazioni */}
          {loadingAll ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                  <CardContent><Skeleton className="h-8 w-16" /></CardContent>
                </Card>
              ))}
            </div>
          ) : internalKPIs && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Totale</CardTitle>
                  <TrendingUp className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">€ {internalKPIs.totalRevenue.toFixed(2)}</div>
                  <DiffBadge diff={internalKPIs.revenueDiff} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
                  <FolderOpen className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{internalKPIs.totalPratiche}</div>
                  <DiffBadge diff={internalKPIs.praticheDiff} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Completate</CardTitle>
                  <FileCheck className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{internalKPIs.completate}</div>
                  <DiffBadge diff={internalKPIs.completateDiff} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Backlog</CardTitle>
                  <Clock className="h-4 w-4 text-warning" />
                </CardHeader>
                <CardContent><div className="text-3xl font-bold">{internalKPIs.backlog}</div></CardContent>
              </Card>
            </div>
          )}

          {/* SLA Tracking */}
          {slaMetrics && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Timer className="h-4 w-4" /> Tempo medio presa in carico
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
                    <Timer className="h-4 w-4" /> Tempo medio completamento
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
                    <AlertTriangle className="h-4 w-4" /> Oltre SLA
                  </CardTitle>
                  {slaMetrics.overSLA > 0 && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${slaMetrics.overSLA > 0 ? "text-destructive" : "text-success"}`}>
                    {slaMetrics.overSLA}
                  </div>
                  <p className="text-xs text-muted-foreground">Pratiche inviate non prese in carico</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Alert pratiche in attesa */}
          {internalKPIs && internalKPIs.praticheInAttesa > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <AlertCircle className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-warning" /> {internalKPIs.praticheInAttesa} pratiche richiedono attenzione
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {internalKPIs.praticheInviate > 0 && <span>{internalKPIs.praticheInviate} inviate (non ancora prese in carico)</span>}
                    {internalKPIs.praticheInviate > 0 && internalKPIs.praticheAttesaDoc > 0 && " · "}
                    {internalKPIs.praticheAttesaDoc > 0 && <span>{internalKPIs.praticheAttesaDoc} in attesa documenti</span>}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/pratiche")}>
                  Gestisci <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          )}

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
                  <p className="text-sm text-muted-foreground text-center py-4">Nessun operatore</p>
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
          {unpaidPratiche.length > 0 && (
            <Card className="border-warning/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-warning" /> Pratiche Completate Non Pagate
                </CardTitle>
                <Badge variant="outline" className="text-warning">
                  € {totalUnpaid.toFixed(2)} da riscuotere
                </Badge>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[250px]">
                  <div className="space-y-2">
                    {unpaidPratiche.map(p => {
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
        </>
      )}
    </div>
  );
}
