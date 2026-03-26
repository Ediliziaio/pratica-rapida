import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, FolderOpen, Clock, Euro, AlertTriangle, Minus } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  enea_bonus: "ENEA / Bonus",
  finanziamenti: "Finanziamenti",
  pratiche_edilizie: "Pratiche Edilizie",
  altro: "Altro",
  fatturazione: "Fatturazione",
};

const CATEGORY_COLORS: Record<string, string> = {
  "ENEA / Bonus": "hsl(152, 60%, 40%)",
  "Finanziamenti": "hsl(220, 72%, 50%)",
  "Pratiche Edilizie": "hsl(38, 92%, 50%)",
  "Altro": "hsl(280, 60%, 50%)",
  "Fatturazione": "hsl(0, 72%, 51%)",
};

const FALLBACK_COLORS = [
  "hsl(220, 72%, 50%)", "hsl(152, 60%, 40%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(180, 60%, 40%)",
];

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

type PeriodOption = "30" | "90" | "180" | "365";

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 3 mesi" },
  { value: "180", label: "Ultimi 6 mesi" },
  { value: "365", label: "Ultimi 12 mesi" },
];

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const pct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  subvalue,
  icon: Icon,
  current,
  previous,
  iconClass = "text-primary",
}: {
  label: string;
  value: string;
  subvalue?: string;
  icon: React.ElementType;
  current?: number;
  previous?: number;
  iconClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2">
          {subvalue && <span className="text-xs text-muted-foreground">{subvalue}</span>}
          {current !== undefined && previous !== undefined && (
            <TrendBadge current={current} previous={previous} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function Analytics() {
  const [period, setPeriod] = useState<PeriodOption>("180");

  const daysAgo = parseInt(period);
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  }, [daysAgo]);

  const prevSince = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo * 2);
    return d.toISOString();
  }, [daysAgo]);

  const { data: pratiche = [] } = useQuery({
    queryKey: ["analytics-pratiche", since],
    queryFn: async () => {
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, updated_at, categoria, company_id, pagamento_stato, companies(ragione_sociale)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      return data || [];
    },
  });

  const { data: prevPratiche = [] } = useQuery({
    queryKey: ["analytics-prev-pratiche", prevSince, since],
    queryFn: async () => {
      const { data } = await supabase
        .from("pratiche")
        .select("id, stato, prezzo, created_at, updated_at")
        .gte("created_at", prevSince)
        .lt("created_at", since)
        .limit(2000);
      return data || [];
    },
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalRevenue = pratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
  const prevRevenue = prevPratiche.reduce((s, p) => s + (p.prezzo || 0), 0);

  const totalPratiche = pratiche.length;
  const prevTotal = prevPratiche.length;

  const completate = pratiche.filter(p => p.stato === "completata").length;
  const prevCompletate = prevPratiche.filter(p => p.stato === "completata").length;

  const conversionRate = totalPratiche > 0 ? Math.round((completate / totalPratiche) * 100) : 0;
  const prevConvRate = prevTotal > 0 ? Math.round((prevCompletate / prevTotal) * 100) : 0;

  const backlog = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;
  const prevBacklog = prevPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;

  // Avg completion time — only if dates differ meaningfully
  const completedPratiche = pratiche.filter(p => {
    if (p.stato !== "completata") return false;
    const diff = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime();
    return diff > 60 * 60 * 1000; // at least 1 hour apart
  });
  const avgDays = completedPratiche.length > 0
    ? Math.round(completedPratiche.reduce((s, p) => {
        return s + (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / completedPratiche.length)
    : null;

  // Revenue pagata vs da incassare
  const revenuePagata = pratiche.filter(p => p.pagamento_stato === "pagata").reduce((s, p) => s + (p.prezzo || 0), 0);
  const revenueDaIncassare = totalRevenue - revenuePagata;

  // ── Charts data ────────────────────────────────────────────────────────────
  const revByCatData = useMemo(() => {
    const acc: Record<string, number> = {};
    pratiche.forEach(p => {
      const cat = CATEGORY_LABELS[p.categoria] || p.categoria || "Altro";
      acc[cat] = (acc[cat] || 0) + (p.prezzo || 0);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [pratiche]);

  const byCatPie = useMemo(() => {
    const acc: Record<string, number> = {};
    pratiche.forEach(p => {
      const cat = CATEGORY_LABELS[p.categoria] || p.categoria || "Altro";
      acc[cat] = (acc[cat] || 0) + 1;
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [pratiche]);

  const monthlyData = useMemo(() => {
    const acc: Record<string, { month: string; label: string; count: number; revenue: number }> = {};
    pratiche.forEach(p => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!acc[key]) acc[key] = { month: key, label: MONTH_NAMES[d.getMonth()], count: 0, revenue: 0 };
      acc[key].count++;
      acc[key].revenue += p.prezzo || 0;
    });
    return Object.values(acc).sort((a, b) => a.month.localeCompare(b.month));
  }, [pratiche]);

  const topCompanies = useMemo(() => {
    const acc: Record<string, number> = {};
    pratiche.forEach(p => {
      const name = (p.companies as any)?.ragione_sociale || "Sconosciuto";
      acc[name] = (acc[name] || 0) + (p.prezzo || 0);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [pratiche]);

  const statoBreakdown = useMemo(() => {
    const acc: Record<string, number> = {};
    pratiche.forEach(p => { acc[p.stato] = (acc[p.stato] || 0) + 1; });
    const labels: Record<string, string> = {
      bozza: "Bozza", inviata: "Inviata", in_lavorazione: "In Lavorazione",
      in_attesa_documenti: "Attesa Doc.", completata: "Completata", annullata: "Annullata",
    };
    return Object.entries(acc).map(([stato, count]) => ({ name: labels[stato] || stato, count }));
  }, [pratiche]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">KPI e metriche di business</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI row 1 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue Totale"
          value={`€ ${totalRevenue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`}
          subvalue={`Pagato: € ${revenuePagata.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`}
          icon={Euro}
          current={totalRevenue}
          previous={prevRevenue}
          iconClass="text-emerald-600"
        />
        <KpiCard
          label="Pratiche Totali"
          value={String(totalPratiche)}
          subvalue={`Completate: ${completate}`}
          icon={FolderOpen}
          current={totalPratiche}
          previous={prevTotal}
          iconClass="text-primary"
        />
        <KpiCard
          label="Tasso Completamento"
          value={`${conversionRate}%`}
          subvalue="pratiche → completata"
          icon={TrendingUp}
          current={conversionRate}
          previous={prevConvRate}
          iconClass="text-emerald-600"
        />
        <KpiCard
          label="Backlog Attivo"
          value={String(backlog)}
          subvalue="pratiche non concluse"
          icon={AlertTriangle}
          current={backlog}
          previous={prevBacklog}
          iconClass="text-orange-500"
        />
      </div>

      {/* KPI row 2 — sub-metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Tempo Medio Completamento</p>
              <p className="text-xl font-bold mt-1">{avgDays !== null ? `${avgDays} gg` : "N/D"}</p>
            </div>
            <Clock className="h-5 w-5 text-orange-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Da Incassare</p>
              <p className="text-xl font-bold mt-1 text-destructive">
                € {revenueDaIncassare.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <Euro className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Ticket Medio</p>
              <p className="text-xl font-bold mt-1">
                € {totalPratiche > 0 ? (totalRevenue / totalPratiche).toLocaleString("it-IT", { minimumFractionDigits: 2 }) : "0.00"}
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown badges */}
      {statoBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statoBreakdown.map(s => (
            <Badge key={s.name} variant="outline" className="gap-1.5 text-xs font-medium">
              <span className="font-semibold">{s.count}</span> {s.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Category */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue per Categoria</CardTitle></CardHeader>
          <CardContent>
            {revByCatData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revByCatData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v: number) => [`€ ${v.toFixed(2)}`, "Revenue"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {revByCatData.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>}
          </CardContent>
        </Card>

        {/* Pratiche per Categoria — Pie with legend */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Pratiche per Categoria</CardTitle></CardHeader>
          <CardContent>
            {byCatPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={byCatPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    labelLine={false}
                    label={<CustomPieLabel />}
                  >
                    {byCatPie.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, name]} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Trend Mensile</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                  <Tooltip />
                  <Legend iconSize={8} formatter={(value) => <span className="text-xs">{value}</span>} />
                  <Line yAxisId="left" type="monotone" dataKey="count" stroke="hsl(220, 72%, 50%)" name="Pratiche" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(152, 60%, 40%)" name="Revenue (€)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>}
          </CardContent>
        </Card>

        {/* Top Aziende */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Aziende per Spesa</CardTitle></CardHeader>
          <CardContent>
            {topCompanies.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topCompanies} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip formatter={(v: number) => [`€ ${v.toFixed(2)}`, "Revenue"]} />
                  <Bar dataKey="value" fill="hsl(152, 60%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
