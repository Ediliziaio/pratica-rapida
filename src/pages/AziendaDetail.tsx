import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isSuperAdmin } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2, ArrowLeft, FolderOpen, Receipt, Users, FileText, TrendingUp,
  Mail, Phone, MapPin, CreditCard, Clock, Download,
} from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { STATO_CONFIG, PAGAMENTO_BADGE } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function AziendaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = isSuperAdmin(roles);

  const { data: company, isLoading } = useQuery({
    queryKey: ["company-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, ragione_sociale, piva, codice_fiscale, email, telefono, indirizzo, cap, citta, provincia, settore")
        .eq("id", id!)
        .single();
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
        .select("id, titolo, stato, prezzo, created_at, updated_at, pagamento_stato")
        .eq("company_id", id!)
        .order("created_at", { ascending: false });
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

  const changePagamentoStato = useMutation({
    mutationFn: async ({ praticaId, stato }: { praticaId: string; stato: string }) => {
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: stato as any }).eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-pratiche", id] });
      toast({ title: "Stato pagamento aggiornato" });
    },
  });

  // KPIs
  const kpis = useMemo(() => {
    const revenue = pratiche.reduce((s, p) => s + (p.prezzo || 0), 0);
    const completate = pratiche.filter(p => p.stato === "completata").length;
    const daFatturare = pratiche
      .filter(p => p.stato === "completata" && p.pagamento_stato === "non_pagata")
      .reduce((s, p) => s + (p.prezzo || 0), 0);
    const statoCounts: Record<string, number> = {};
    pratiche.forEach(p => { statoCounts[p.stato] = (statoCounts[p.stato] || 0) + 1; });
    return { revenue, completate, daFatturare, total: pratiche.length, statoCounts };
  }, [pratiche]);

  // Raggruppamento per mese per tab fatturazione
  const fatturazionePerMese = useMemo(() => {
    const map: Record<string, { label: string; pratiche: typeof pratiche; totale: number }> = {};
    pratiche
      .filter(p => p.stato === "completata")
      .forEach(p => {
        const d = new Date(p.updated_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = format(d, "MMMM yyyy", { locale: it });
        if (!map[key]) map[key] = { label, pratiche: [], totale: 0 };
        map[key].pratiche.push(p);
        map[key].totale += p.prezzo || 0;
      });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
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
    <TooltipProvider>
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
          <Card className={kpis.daFatturare > 0 ? "border-warning/50" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Da Fatturare</CardTitle>
              <Receipt className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€ {kpis.daFatturare.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">pratiche completate non pagate</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Utenti Assegnati</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{users.length}</div></CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="space-y-4">
          <TabsList>
            <TabsTrigger value="info"><Building2 className="mr-1.5 h-4 w-4" />Anagrafica</TabsTrigger>
            <TabsTrigger value="pratiche"><FolderOpen className="mr-1.5 h-4 w-4" />Pratiche</TabsTrigger>
            <TabsTrigger value="fatturazione"><Receipt className="mr-1.5 h-4 w-4" />Fatturazione</TabsTrigger>
            <TabsTrigger value="utenti"><Users className="mr-1.5 h-4 w-4" />Utenti</TabsTrigger>
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
                        const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
                        return (
                          <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/pratiche/${p.id}`)}>
                            <TableCell className="font-medium truncate max-w-[200px]">{p.titolo}</TableCell>
                            <TableCell><Badge variant="outline" className={cfg?.color}>{cfg?.label}</Badge></TableCell>
                            <TableCell>€ {p.prezzo.toFixed(2)}</TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              {isAdmin ? (
                                <Select
                                  value={p.pagamento_stato}
                                  onValueChange={v => changePagamentoStato.mutate({ praticaId: p.id, stato: v })}
                                >
                                  <SelectTrigger className={`h-7 w-36 text-xs ${pagamento.className}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="non_pagata">Da fatturare</SelectItem>
                                    <SelectItem value="in_verifica">Fatturata</SelectItem>
                                    <SelectItem value="pagata">Pagata</SelectItem>
                                    <SelectItem value="rimborsata">Rimborsata</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="outline" className={pagamento.className}>
                                  {pagamento.label}
                                </Badge>
                              )}
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

          {/* Fatturazione */}
          <TabsContent value="fatturazione">
            <div className="space-y-4">
              {fatturazionePerMese.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12 text-center">
                    <Receipt className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-muted-foreground">Nessuna pratica completata da fatturare</p>
                  </CardContent>
                </Card>
              ) : fatturazionePerMese.map((mese) => {
                const daFatturare = mese.pratiche.filter(p => p.pagamento_stato === "non_pagata").reduce((s, p) => s + (p.prezzo || 0), 0);
                const fatturate = mese.pratiche.filter(p => p.pagamento_stato === "in_verifica").reduce((s, p) => s + (p.prezzo || 0), 0);
                const pagate = mese.pratiche.filter(p => p.pagamento_stato === "pagata").reduce((s, p) => s + (p.prezzo || 0), 0);
                return (
                  <Card key={mese.label}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="capitalize text-base">{mese.label}</CardTitle>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {daFatturare > 0 && (
                            <span className="text-muted-foreground">Da fatturare: <span className="font-semibold text-foreground">€ {daFatturare.toFixed(2)}</span></span>
                          )}
                          {fatturate > 0 && (
                            <span className="text-warning">Fatturate: <span className="font-semibold">€ {fatturate.toFixed(2)}</span></span>
                          )}
                          {pagate > 0 && (
                            <span className="text-success">Pagate: <span className="font-semibold">€ {pagate.toFixed(2)}</span></span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => exportToCSV(
                              mese.pratiche.map(p => ({
                                titolo: p.titolo,
                                prezzo: p.prezzo.toFixed(2),
                                pagamento: PAGAMENTO_BADGE[p.pagamento_stato]?.label || p.pagamento_stato,
                                data: new Date(p.updated_at).toLocaleDateString("it-IT"),
                              })),
                              `fatturazione-${company.ragione_sociale}-${mese.label}`,
                              [
                                { key: "titolo", label: "Pratica" },
                                { key: "prezzo", label: "Importo (€)" },
                                { key: "pagamento", label: "Stato Pagamento" },
                                { key: "data", label: "Data Completamento" },
                              ]
                            )}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />CSV
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pratica</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead>Stato Pagamento</TableHead>
                            <TableHead>Data</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mese.pratiche.map(p => {
                            const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
                            return (
                              <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/pratiche/${p.id}`)}>
                                <TableCell className="font-medium truncate max-w-[220px]">{p.titolo}</TableCell>
                                <TableCell>€ {p.prezzo.toFixed(2)}</TableCell>
                                <TableCell onClick={e => e.stopPropagation()}>
                                  {isAdmin ? (
                                    <Select
                                      value={p.pagamento_stato}
                                      onValueChange={v => changePagamentoStato.mutate({ praticaId: p.id, stato: v })}
                                    >
                                      <SelectTrigger className={`h-7 w-36 text-xs ${pagamento.className}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="non_pagata">Da fatturare</SelectItem>
                                        <SelectItem value="in_verifica">Fatturata</SelectItem>
                                        <SelectItem value="pagata">Pagata</SelectItem>
                                        <SelectItem value="rimborsata">Rimborsata</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant="outline" className={pagamento.className}>
                                      {pagamento.label}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(p.updated_at).toLocaleDateString("it-IT")}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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
        </Tabs>
      </div>
    </TooltipProvider>
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
