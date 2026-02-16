import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, Clock, FileCheck, Wallet, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();

  const isInternalUser = roles.some(r => ["super_admin", "admin_interno", "operatore"].includes(r));

  // Fetch company data
  const { data: company } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.from("companies").select("wallet_balance, ragione_sociale").eq("id", companyId).single();
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch practices stats
  const { data: pratiche = [] } = useQuery({
    queryKey: ["pratiche-stats", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase.from("pratiche").select("stato, prezzo, created_at, categoria").eq("company_id", companyId);
      return data || [];
    },
    enabled: !!companyId,
  });

  // All practices for internal users
  const { data: allPratiche = [] } = useQuery({
    queryKey: ["all-pratiche-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("pratiche").select("stato, prezzo, created_at, categoria, company_id, pagamento_stato");
      return data || [];
    },
    enabled: isInternalUser,
  });

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const aperte = pratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;
  const attesaDoc = pratiche.filter(p => p.stato === "in_attesa_documenti").length;
  const completateMese = pratiche.filter(p => {
    const d = new Date(p.created_at);
    return p.stato === "completata" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const spesoMese = pratiche
    .filter(p => { const d = new Date(p.created_at); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((s, p) => s + (p.prezzo || 0), 0);

  // Internal KPIs
  const totalRevenue = allPratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
  const totalPratiche = allPratiche.length;
  const completate = allPratiche.filter(p => p.stato === "completata").length;
  const conversionRate = totalPratiche > 0 ? Math.round((completate / totalPratiche) * 100) : 0;
  const backlog = allPratiche.filter(p => !["completata", "annullata"].includes(p.stato)).length;

  // Category breakdown
  const byCat = allPratiche.reduce((acc, p) => {
    acc[p.categoria] = (acc[p.categoria] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const CATEGORY_LABELS: Record<string, string> = {
    fatturazione: "Fatturazione", enea_bonus: "ENEA / Bonus",
    finanziamenti: "Finanziamenti", pratiche_edilizie: "Pratiche Edilizie", altro: "Altro",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Bentornato{user?.user_metadata?.nome ? `, ${user.user_metadata.nome}` : ""}
        </h1>
        <p className="text-muted-foreground">Ecco cosa devi fare oggi.</p>
      </div>

      {/* Azienda KPIs */}
      {companyId && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Aperte</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{aperte}</div></CardContent>
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
              <CardContent><div className="text-3xl font-bold">{completateMese}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Credito Wallet</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">€ {(company?.wallet_balance ?? 0).toFixed(2)}</div></CardContent>
            </Card>
          </div>

          {/* Quick actions */}
          {aperte === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <h3 className="font-display text-lg font-semibold">Nessuna pratica attiva</h3>
                <p className="mt-1 text-sm text-muted-foreground">Inizia creando una nuova pratica per delegare la burocrazia.</p>
                <Button className="mt-4" onClick={() => navigate("/pratiche/nuova")}>Nuova Pratica</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Internal / Super Admin KPIs */}
      {isInternalUser && (
        <>
          <div className="border-t pt-6">
            <h2 className="font-display text-lg font-semibold mb-4">📊 KPI Interni</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Totale</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">€ {totalRevenue.toFixed(2)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
                <FolderOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{totalPratiche}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
                <FileCheck className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{conversionRate}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Backlog</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{backlog}</div></CardContent>
            </Card>
          </div>

          {/* Category breakdown */}
          {Object.keys(byCat).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Pratiche per Categoria</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(byCat).map(([cat, count]) => (
                    <div key={cat} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                      <Badge variant="outline">{CATEGORY_LABELS[cat] || cat}</Badge>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
