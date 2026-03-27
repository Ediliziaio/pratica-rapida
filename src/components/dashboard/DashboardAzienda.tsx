import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  FolderOpen, FileCheck, AlertCircle,
  ArrowRight, Plus, Receipt, Zap, Flame, LifeBuoy,
  CheckCircle2, TrendingUp, TrendingDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function DashboardAzienda() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ["company-info", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("companies")
        .select("ragione_sociale")
        .eq("id", companyId)
        .single();
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
        .select("id, titolo, stato, prezzo, pagamento_stato, created_at, updated_at, dati_pratica, clienti_finali(nome, cognome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!companyId,
  });

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const aperte = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;
    const attesaDoc = pratiche.filter(p => p.stato === "in_attesa_documenti");
    const inLavorazione = pratiche.filter(p => p.stato === "in_lavorazione").length;

    const completateMese = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    const completateMesePrec = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).length;

    // Da fatturare = pratiche completate non ancora pagate (tutto il periodo, non solo il mese)
    const daFatturare = pratiche
      .filter(p => p.stato === "completata" && (p as any).pagamento_stato === "non_pagata")
      .reduce((s, p) => s + (p.prezzo || 0), 0);
    // Spesa mese corrente (completate questo mese) per confronto trend
    const spesaMese = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).reduce((s, p) => s + (p.prezzo || 0), 0);
    const spesaMesePrec = pratiche.filter(p => {
      const d = new Date(p.updated_at);
      return p.stato === "completata" && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).reduce((s, p) => s + (p.prezzo || 0), 0);

    const createMese = pratiche.filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const completateProgress = createMese > 0 ? (completateMese / createMese) * 100 : 0;
    const diffCompletate = completateMese - completateMesePrec;
    const diffSpesa = spesaMese - spesaMesePrec;
    return {
      aperte, attesaDoc, inLavorazione,
      completateMese, completateMesePrec, createMese,
      completateProgress, diffCompletate,
      daFatturare, spesaMese, spesaMesePrec, diffSpesa,
    };
  }, [pratiche, thisMonth, thisYear, lastMonth, lastMonthYear]);

  // ---- Brand breakdown ----
  const brandStats = useMemo(() => {
    const inviate = pratiche.filter(p => p.stato !== "bozza" && p.stato !== "annullata");
    const enea = inviate.filter(p => {
      const brand = (p.dati_pratica as any)?.brand;
      return !brand || brand === "enea";
    }).length;
    const ct = inviate.filter(p => (p.dati_pratica as any)?.brand === "conto_termico").length;
    return { enea, ct, total: inviate.length };
  }, [pratiche]);

  // ---- Chart data ----
  const chartData = useMemo(() => {
    const months = [];
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
          return !["completata", "annullata", "bozza"].includes(p.stato) && pd.getMonth() === m && pd.getFullYear() === y;
        }).length,
      });
    }
    return months;
  }, [pratiche, thisMonth, thisYear]);

  const chartConfig = {
    completate: { label: "Completate", color: "hsl(var(--success))" },
    in_corso: { label: "In corso", color: "hsl(var(--primary))" },
  };

  const recentPratiche = pratiche.slice(0, 6);
  const isLoading = loadingPratiche || loadingCompany;

  // ---- Empty state ----
  if (!isLoading && pratiche.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardHeader user={user} companyName={company?.ragione_sociale} navigate={navigate} />
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-10 w-10 text-primary" />
            </div>
            <h3 className="font-display text-xl font-bold">Benvenuto su Pratica Rapida</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Gestisci pratiche ENEA e Conto Termico per i tuoi clienti. Prezzi fissi, consegna garantita entro 24 ore.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Button onClick={() => navigate("/pratiche/nuova")} size="lg">
                <Plus className="mr-2 h-4 w-4" />Crea la tua prima pratica
              </Button>
            </div>
            <ul className="mt-8 space-y-2 text-sm text-left max-w-sm">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Consegna entro 24 ore lavorative</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Prezzo fisso e trasparente</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Zero burocrazia — pensiamo a tutto noi</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> ENEA + Conto Termico nella stessa piattaforma</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader user={user} companyName={company?.ragione_sociale} navigate={navigate} />

      {/* Action required: pratiche in attesa documenti */}
      {kpis.attesaDoc.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                {kpis.attesaDoc.length === 1
                  ? "1 pratica richiede documenti"
                  : `${kpis.attesaDoc.length} pratiche richiedono documenti`}
              </p>
              <Button variant="link" size="sm" className="text-warning h-auto p-0" onClick={() => navigate("/pratiche")}>
                Vedi tutte <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {kpis.attesaDoc.slice(0, 3).map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-background/60 p-2 cursor-pointer hover:bg-background/80 transition-colors"
                  onClick={() => navigate(`/pratiche/${p.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.titolo}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true, locale: it })}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {isLoading ? (
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pratiche Aperte</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.aperte}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {kpis.inLavorazione > 0 ? `${kpis.inLavorazione} in lavorazione` : "Nessuna in lavorazione"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={kpis.attesaDoc.length > 0 ? "border-warning/40" : ""}>
            <CardContent className="p-5">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpis.attesaDoc.length > 0 ? "bg-amber-100 dark:bg-amber-950" : "bg-muted"}`}>
                <AlertCircle className={`h-5 w-5 ${kpis.attesaDoc.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attesa Documenti</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.attesaDoc.length}</p>
                {kpis.attesaDoc.length > 0 && (
                  <Button variant="link" size="sm" className="mt-0.5 h-auto p-0 text-xs text-amber-600" onClick={() => navigate("/pratiche")}>
                    Carica ora <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completate (mese)</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{kpis.completateMese}</p>
                <Progress value={kpis.completateProgress} className="mt-1.5 h-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.completateMese}/{kpis.createMese} questo mese
                  {kpis.diffCompletate !== 0 && (
                    <span className={kpis.diffCompletate > 0 ? " text-success" : " text-destructive"}>
                      {" "}({kpis.diffCompletate > 0 ? "+" : ""}{kpis.diffCompletate})
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Da fatturare</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">€ {kpis.daFatturare.toFixed(0)}</p>
                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  {kpis.diffSpesa > 0 ? (
                    <><TrendingUp className="h-3 w-3 text-warning" /><span className="text-warning">+€ {kpis.diffSpesa.toFixed(0)} vs mese prec.</span></>
                  ) : kpis.diffSpesa < 0 ? (
                    <><TrendingDown className="h-3 w-3 text-success" /><span className="text-success">-€ {Math.abs(kpis.diffSpesa).toFixed(0)} vs mese prec.</span></>
                  ) : (
                    <span>Pagamento fine mese via bonifico</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Brand breakdown + Fatturazione */}
      {!isLoading && brandStats.total > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{brandStats.enea}</p>
                <p className="text-sm text-muted-foreground">Pratiche ENEA</p>
                {brandStats.total > 0 && (
                  <p className="text-xs text-muted-foreground">{Math.round((brandStats.enea / brandStats.total) * 100)}% del totale</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                <Flame className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{brandStats.ct}</p>
                <p className="text-sm text-muted-foreground">Conto Termico</p>
                {brandStats.total > 0 && (
                  <p className="text-xs text-muted-foreground">{Math.round((brandStats.ct / brandStats.total) * 100)}% del totale</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold">€ {kpis.daFatturare.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Da fatturare</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/wallet")}>
                  Estratto Conto <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart + Recent */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Andamento ultimi 6 mesi</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
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
            )}
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
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : recentPratiche.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessuna pratica ancora.</p>
            ) : (
              recentPratiche.map(p => {
                const conf = STATO_CONFIG[p.stato as PraticaStato];
                const Icon = conf?.icon || FolderOpen;
                const brand = (p.dati_pratica as any)?.brand;
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{p.titolo}</p>
                        <Badge className={`shrink-0 text-[10px] py-0 ${brand === "conto_termico" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {brand === "conto_termico" ? "CT" : "ENEA"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(p.clienti_finali as any)?.nome} {(p.clienti_finali as any)?.cognome}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
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

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Azioni rapide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction icon={Zap} label="Nuova Pratica ENEA" color="blue" onClick={() => navigate("/pratiche/nuova")} />
            <QuickAction icon={Flame} label="Nuova Pratica CT" color="orange" onClick={() => navigate("/pratiche/nuova")} />
            <QuickAction icon={Receipt} label="Estratto Conto" color="primary" onClick={() => navigate("/wallet")} />
            <QuickAction icon={LifeBuoy} label="Assistenza" color="muted" onClick={() => navigate("/assistenza")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardHeader({ user, companyName, navigate }: { user: any; companyName?: string; navigate: (p: string) => void }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          {companyName ?? "Dashboard"}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {user?.user_metadata?.nome ? `Ciao, ${user.user_metadata.nome} 👋` : "Bentornato"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {companyName
            ? "Ecco la situazione delle tue pratiche."
            : "Panoramica delle tue pratiche."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => navigate("/pratiche/nuova")} size="sm">
          <Plus className="mr-2 h-4 w-4" />Nuova Pratica
        </Button>
        <Button variant="outline" onClick={() => navigate("/wallet")} size="sm">
          <Receipt className="mr-2 h-4 w-4" />Estratto Conto
        </Button>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon, label, color, onClick,
}: {
  icon: React.ElementType;
  label: string;
  color: "blue" | "orange" | "primary" | "muted";
  onClick: () => void;
}) {
  const colorMap = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-700",
    orange: "bg-orange-50 hover:bg-orange-100 text-orange-700",
    primary: "bg-primary/10 hover:bg-primary/20 text-primary",
    muted: "bg-muted hover:bg-muted/80 text-muted-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl p-4 transition-colors text-center ${colorMap[color]}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-xs font-medium leading-tight">{label}</span>
    </button>
  );
}
