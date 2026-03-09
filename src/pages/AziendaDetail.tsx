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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2, ArrowLeft, FolderOpen, Wallet, Users, FileText, TrendingUp,
  Mail, Phone, MapPin, CreditCard, Clock, Download, Plus, RotateCcw,
} from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { STATO_CONFIG, PAGAMENTO_BADGE } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { useToast } from "@/hooks/use-toast";

export default function AziendaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = isSuperAdmin(roles);

  // Dialog states
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupCausale, setTopupCausale] = useState("Bonifico ricevuto");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundCausale, setRefundCausale] = useState("Rimborso");
  const [refundPraticaId, setRefundPraticaId] = useState<string>("none");

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

  // Mutations
  const walletTopup = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(topupAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Importo non valido");
      const { error } = await supabase.rpc("wallet_topup", {
        _company_id: id!,
        _importo: amount,
        _causale: topupCausale,
        _user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["company-wallet-movements", id] });
      toast({ title: "Wallet ricaricato con successo" });
      setTopupOpen(false);
      setTopupAmount("");
      setTopupCausale("Bonifico ricevuto");
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const walletRefund = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(refundAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Importo non valido");
      const { error } = await supabase.rpc("wallet_refund", {
        _company_id: id!,
        _importo: amount,
        _causale: refundCausale,
        _pratica_id: refundPraticaId === "none" ? null : refundPraticaId,
        _user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["company-wallet-movements", id] });
      queryClient.invalidateQueries({ queryKey: ["company-pratiche", id] });
      toast({ title: "Rimborso effettuato" });
      setRefundOpen(false);
      setRefundAmount("");
      setRefundCausale("Rimborso");
      setRefundPraticaId("none");
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
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
                                  <SelectTrigger className={`h-7 w-32 text-xs ${pagamento.className}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="non_pagata">Non pagata</SelectItem>
                                    <SelectItem value="in_verifica">In verifica</SelectItem>
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

          {/* Wallet */}
          <TabsContent value="wallet">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Movimenti Wallet</CardTitle>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <Button variant="default" size="sm" onClick={() => setTopupOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />Ricarica
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />Rimborso
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => exportToCSV(movements.map(m => ({
                    data: new Date(m.created_at).toLocaleDateString("it-IT"),
                    tipo: m.tipo,
                    importo: m.importo.toFixed(2),
                    causale: m.causale,
                  })), `wallet-${company.ragione_sociale}`, [
                    { key: "data", label: "Data" },
                    { key: "tipo", label: "Tipo" },
                    { key: "importo", label: "Importo" },
                    { key: "causale", label: "Causale" },
                  ])}>
                    <Download className="mr-2 h-4 w-4" />CSV
                  </Button>
                </div>
              </CardHeader>
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
        </Tabs>

        {/* Topup Dialog */}
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ricarica Wallet</DialogTitle>
              <DialogDescription>Aggiungi credito al wallet di {company.ragione_sociale}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Importo (€)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="100.00" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} />
              </div>
              <div>
                <Label>Causale</Label>
                <Select value={topupCausale} onValueChange={setTopupCausale}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bonifico ricevuto">Bonifico ricevuto</SelectItem>
                    <SelectItem value="Ricarica manuale">Ricarica manuale</SelectItem>
                    <SelectItem value="Pagamento contanti">Pagamento contanti</SelectItem>
                    <SelectItem value="Altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTopupOpen(false)}>Annulla</Button>
              <Button onClick={() => walletTopup.mutate()} disabled={walletTopup.isPending}>
                {walletTopup.isPending ? "Ricaricando..." : "Ricarica"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Refund Dialog */}
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rimborso Wallet</DialogTitle>
              <DialogDescription>Rimborsa credito al wallet di {company.ragione_sociale}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Importo (€)</Label>
                <Input type="number" min="0.01" step="0.01" placeholder="50.00" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
              </div>
              <div>
                <Label>Causale</Label>
                <Input value={refundCausale} onChange={e => setRefundCausale(e.target.value)} placeholder="Rimborso pratica annullata" />
              </div>
              <div>
                <Label>Pratica collegata (opzionale)</Label>
                <Select value={refundPraticaId} onValueChange={setRefundPraticaId}>
                  <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    {pratiche.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.titolo} — € {p.prezzo.toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundOpen(false)}>Annulla</Button>
              <Button onClick={() => walletRefund.mutate()} disabled={walletRefund.isPending}>
                {walletRefund.isPending ? "Rimborsando..." : "Rimborsa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
