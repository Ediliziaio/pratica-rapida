import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, FolderOpen, Clock, Euro, AlertTriangle } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  enea_bonus: "ENEA / Bonus",
  finanziamenti: "Finanziamenti", pratiche_edilizie: "Pratiche Edilizie", altro: "Altro",
};

const COLORS = [
  "hsl(220, 72%, 50%)", "hsl(152, 60%, 40%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)",
];

export default function Analytics() {
  const { data: pratiche = [] } = useQuery({
    queryKey: ["analytics-pratiche"],
    queryFn: async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, updated_at, categoria, company_id, companies(ragione_sociale)")
        .gte("created_at", twelveMonthsAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      return data || [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["analytics-companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, ragione_sociale, wallet_balance");
      return data || [];
    },
  });

  // KPIs
  const totalRevenue = pratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
  const totalPratiche = pratiche.length;
  const completate = pratiche.filter(p => p.stato === "completata").length;
  const conversionRate = totalPratiche > 0 ? Math.round((completate / totalPratiche) * 100) : 0;
  const backlog = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;

  // Revenue by category
  const revByCat = pratiche.reduce((acc, p) => {
    const cat = CATEGORY_LABELS[p.categoria] || p.categoria;
    acc[cat] = (acc[cat] || 0) + (p.prezzo || 0);
    return acc;
  }, {} as Record<string, number>);
  const revByCatData = Object.entries(revByCat).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // Pratiche by category (pie)
  const byCat = pratiche.reduce((acc, p) => {
    const cat = CATEGORY_LABELS[p.categoria] || p.categoria;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byCatPie = Object.entries(byCat).map(([name, value]) => ({ name, value }));

  // Top companies by spend
  const byCompany = pratiche.reduce((acc, p) => {
    const name = p.companies?.ragione_sociale || "Sconosciuto";
    acc[name] = (acc[name] || 0) + (p.prezzo || 0);
    return acc;
  }, {} as Record<string, number>);
  const topCompanies = Object.entries(byCompany)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // Monthly trend
  const byMonth = pratiche.reduce((acc, p) => {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!acc[key]) acc[key] = { month: key, count: 0, revenue: 0 };
    acc[key].count++;
    acc[key].revenue += p.prezzo || 0;
    return acc;
  }, {} as Record<string, { month: string; count: number; revenue: number }>);
  const monthlyData = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  // Avg completion time
  const completedPratiche = pratiche.filter(p => p.stato === "completata");
  const avgDays = completedPratiche.length > 0
    ? Math.round(completedPratiche.reduce((s, p) => {
        const diff = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime();
        return s + diff / (1000 * 60 * 60 * 24);
      }, 0) / completedPratiche.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">KPI e metriche di business (ultimi 12 mesi)</p>
      </div>

      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Totale</CardTitle>
            <Euro className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">€ {totalRevenue.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalPratiche}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{conversionRate}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Medio</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{avgDays} gg</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Backlog</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{backlog}</div></CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Category */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Revenue per Categoria</CardTitle></CardHeader>
          <CardContent>
            {revByCatData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revByCatData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `€ ${v.toFixed(2)}`} />
                  <Bar dataKey="value" fill="hsl(220, 72%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-muted-foreground">Nessun dato</p>}
          </CardContent>
        </Card>

        {/* Pratiche per Categoria (Pie) */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Pratiche per Categoria</CardTitle></CardHeader>
          <CardContent>
            {byCatPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byCatPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {byCatPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-muted-foreground">Nessun dato</p>}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Trend Mensile</CardTitle></CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(220, 72%, 50%)" name="Pratiche" strokeWidth={2} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(152, 60%, 40%)" name="Revenue (€)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-muted-foreground">Nessun dato</p>}
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Aziende per Spesa</CardTitle></CardHeader>
          <CardContent>
            {topCompanies.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topCompanies} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v: number) => `€ ${v.toFixed(2)}`} />
                  <Bar dataKey="value" fill="hsl(152, 60%, 40%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="py-8 text-center text-muted-foreground">Nessun dato</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
