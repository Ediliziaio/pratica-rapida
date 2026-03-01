import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, ArrowLeft, FolderOpen, Wallet, Users, FileText, TrendingUp,
  Mail, Phone, MapPin, CreditCard, Clock,
} from "lucide-react";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

export default function AziendaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: company, isLoading } = useQuery({
    queryKey: ["company-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: pratiche = [] } = useQuery({
    queryKey: ["company-pratiche", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, created_at, pagamento_stato")
        .eq("company_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["company-wallet-movements", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_movements")
        .select("*")
        .eq("company_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["company-users", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_company_assignments")
        .select("user_id, created_at")
        .eq("company_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["company-user-profiles", users],
    queryFn: async () => {
      if (users.length === 0) return [];
      const userIds = users.map(u => u.user_id);
      const { data } = await supabase.from("profiles").select("id, nome, cognome, email").in("id", userIds);
      return data || [];
    },
    enabled: users.length > 0,
  });

  const { data: fatture = [] } = useQuery({
    queryKey: ["company-fatture", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("fatture")
        .select("id, numero, oggetto, totale, stato, data_emissione")
        .eq("company_id", id!)
        .order("data_emissione", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  // KPIs
  const kpis = useMemo(() => {
    const revenue = pratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
    const completate = pratiche.filter(p => p.stato === "completata").length;
    const nonPagate = pratiche.filter(p => p.pagamento_stato === "non_pagata" && p.stato === "completata").length;
    const statoCounts: Record<string, number> = {};
    pratiche.forEach(p => { statoCounts[p.stato] = (statoCounts[p.stato] || 0) + 1; });
    return { revenue, completate, nonPagate, total: pratiche.length, statoCounts };
  }, [pratiche]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Azienda non trovata</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/aziende")}>Torna alle Aziende</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/aziende")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{company.ragione_sociale}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {company.piva && <span>P.IVA: {company.piva}</span>}
            {company.settore && <Badge variant="outline">{company.settore}</Badge>}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Totale</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">€ {kpis.revenue.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">{kpis.completate} completate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wallet</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">€ {company.wallet_balance.toFixed(2)}</div></CardContent>
        </Card>
        <Card className={kpis.nonPagate > 0 ? "border-warning/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Non Pagate</CardTitle>
            <CreditCard className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.nonPagate}</div></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info"><Building2 className="mr-1.5 h-4 w-4" />Anagrafica</TabsTrigger>
          <TabsTrigger value="pratiche"><FolderOpen className="mr-1.5 h-4 w-4" />Pratiche</TabsTrigger>
          <TabsTrigger value="wallet"><Wallet className="mr-1.5 h-4 w-4" />Wallet</TabsTrigger>
          <TabsTrigger value="utenti"><Users className="mr-1.5 h-4 w-4" />Utenti</TabsTrigger>
          <TabsTrigger value="fatture"><FileText className="mr-1.5 h-4 w-4" />Fatture</TabsTrigger>
        </TabsList>

        {/* Anagrafica */}
        <TabsContent value="info">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Building2} label="Ragione Sociale" value={company.ragione_sociale} />
                <InfoRow icon={FileText} label="P.IVA" value={company.piva} />
                <InfoRow icon={FileText} label="Codice Fiscale" value={company.codice_fiscale} />
                <InfoRow icon={Mail} label="Email" value={company.email} />
                <InfoRow icon={Phone} label="Telefono" value={company.telefono} />
                <InfoRow icon={MapPin} label="Indirizzo" value={[company.indirizzo, company.cap, company.citta, company.provincia].filter(Boolean).join(", ")} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pratiche */}
        <TabsContent value="pratiche">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(STATO_CONFIG) as [PraticaStato, typeof STATO_CONFIG[PraticaStato]][]).map(([stato, cfg]) => {
                  const count = kpis.statoCounts[stato] || 0;
                  if (count === 0) return null;
                  const Icon = cfg.icon;
                  return (
                    <Badge key={stato} variant="outline" className={`gap-1 ${cfg.color}`}>
                      <Icon className="h-3 w-3" />{cfg.label}: {count}
                    </Badge>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titolo</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Prezzo</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pratiche.map(p => {
                      const cfg = STATO_CONFIG[p.stato as PraticaStato];
                      return (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/pratiche/${p.id}`)}>
                          <TableCell className="font-medium truncate max-w-[200px]">{p.titolo}</TableCell>
                          <TableCell><Badge variant="outline" className={cfg?.color}>{cfg?.label}</Badge></TableCell>
                          <TableCell>€ {p.prezzo.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={p.pagamento_stato === "pagata" ? "text-success" : p.pagamento_stato === "non_pagata" ? "text-warning" : ""}>
                              {p.pagamento_stato}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString("it-IT")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet */}
        <TabsContent value="wallet">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Importo</TableHead>
                      <TableHead>Causale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nessun movimento</TableCell></TableRow>
                    ) : movements.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(m.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={m.tipo === "credito" ? "text-success" : "text-destructive"}>
                            {m.tipo === "credito" ? "+" : "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-semibold ${m.tipo === "credito" ? "text-success" : "text-destructive"}`}>
                          {m.tipo === "credito" ? "+" : "-"}€ {m.importo.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">{m.causale}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Utenti */}
        <TabsContent value="utenti">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Assegnato il</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nessun utente assegnato</TableCell></TableRow>
                  ) : users.map(u => {
                    const profile = profiles.find(p => p.id === u.user_id);
                    return (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{profile ? `${profile.nome} ${profile.cognome}`.trim() : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{profile?.email || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("it-IT")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fatture */}
        <TabsContent value="fatture">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numero</TableHead>
                      <TableHead>Oggetto</TableHead>
                      <TableHead>Totale</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fatture.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessuna fattura</TableCell></TableRow>
                    ) : fatture.map(f => (
                      <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/fatturazione/${f.id}`)}>
                        <TableCell className="font-medium">{f.numero}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{f.oggetto}</TableCell>
                        <TableCell className="font-semibold">€ {f.totale.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={f.stato === "pagata" ? "text-success" : f.stato === "emessa" ? "text-primary" : ""}>
                            {f.stato}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(f.data_emissione).toLocaleDateString("it-IT")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}
