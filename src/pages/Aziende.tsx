import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Building2, Plus, Search, Wallet, Users, FolderOpen, CreditCard, LogIn,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { isSuperAdmin } from "@/hooks/useAuth";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

export default function Aziende() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showTopup, setShowTopup] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupCausale, setTopupCausale] = useState("Ricarica wallet");
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const { setImpersonatedCompany } = useCompany();
  const superAdmin = isSuperAdmin(roles);

  const [form, setForm] = useState({
    ragione_sociale: "", piva: "", codice_fiscale: "", email: "",
    telefono: "", indirizzo: "", citta: "", cap: "", provincia: "", settore: "",
  });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("ragione_sociale");
      if (error) throw error;
      return data;
    },
  });

  // Pratiche counts per company per stato
  const { data: praticheByCompany = {} } = useQuery({
    queryKey: ["admin-pratiche-by-stato"],
    queryFn: async () => {
      const { data } = await supabase.from("pratiche").select("company_id, stato");
      const result: Record<string, Record<string, number>> = {};
      (data || []).forEach(p => {
        if (!result[p.company_id]) result[p.company_id] = {};
        result[p.company_id][p.stato] = (result[p.company_id][p.stato] || 0) + 1;
      });
      return result;
    },
  });

  const { data: userCounts = {} } = useQuery({
    queryKey: ["admin-user-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("user_company_assignments").select("company_id");
      const counts: Record<string, number> = {};
      (data || []).forEach(a => { counts[a.company_id] = (counts[a.company_id] || 0) + 1; });
      return counts;
    },
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setShowCreate(false);
      setForm({ ragione_sociale: "", piva: "", codice_fiscale: "", email: "", telefono: "", indirizzo: "", citta: "", cap: "", provincia: "", settore: "" });
      toast({ title: "Azienda creata" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const walletTopup = useMutation({
    mutationFn: async () => {
      if (!showTopup || !user) return;
      const { error } = await supabase.rpc("wallet_topup", {
        _company_id: showTopup,
        _importo: parseFloat(topupAmount),
        _causale: topupCausale,
        _user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setShowTopup(null);
      setTopupAmount("");
      toast({ title: "Wallet ricaricato" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const filtered = companies.filter(c =>
    `${c.ragione_sociale} ${c.piva} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Aziende</h1>
          <p className="text-muted-foreground">Gestisci tutte le aziende registrate</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuova Azienda</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Crea Azienda</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ragione Sociale *</Label><Input value={form.ragione_sociale} onChange={e => setForm(f => ({ ...f, ragione_sociale: e.target.value }))} /></div>
                <div><Label>P.IVA</Label><Input value={form.piva} onChange={e => setForm(f => ({ ...f, piva: e.target.value }))} /></div>
                <div><Label>Codice Fiscale</Label><Input value={form.codice_fiscale} onChange={e => setForm(f => ({ ...f, codice_fiscale: e.target.value }))} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>Telefono</Label><Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                <div><Label>Settore</Label><Input value={form.settore} onChange={e => setForm(f => ({ ...f, settore: e.target.value }))} /></div>
                <div><Label>Indirizzo</Label><Input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} /></div>
                <div><Label>Città</Label><Input value={form.citta} onChange={e => setForm(f => ({ ...f, citta: e.target.value }))} /></div>
                <div><Label>CAP</Label><Input value={form.cap} onChange={e => setForm(f => ({ ...f, cap: e.target.value }))} /></div>
                <div><Label>Provincia</Label><Input value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} /></div>
              </div>
              <Button onClick={() => createCompany.mutate()} disabled={!form.ragione_sociale || createCompany.isPending}>
                {createCompany.isPending ? "Creazione..." : "Crea Azienda"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cerca aziende..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-display text-lg font-semibold">Nessuna azienda</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map(c => {
            const statoCounts = praticheByCompany[c.id] || {};
            const totalPratiche = Object.values(statoCounts).reduce((s: number, v) => s + (v as number), 0);
            return (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{c.ragione_sociale}</p>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {c.piva && <span>P.IVA: {c.piva}</span>}
                        {c.email && <span>{c.email}</span>}
                        {c.settore && <Badge variant="outline" className="text-xs">{c.settore}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <FolderOpen className="h-4 w-4" />{totalPratiche}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-4 w-4" />{userCounts[c.id] || 0}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">€ {c.wallet_balance.toFixed(2)}</p>
                        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => setShowTopup(c.id)}>
                          <CreditCard className="mr-1 h-3 w-3" />Ricarica
                        </Button>
                      </div>
                      {superAdmin && (
                        <Button variant="outline" size="sm" onClick={() => { setImpersonatedCompany(c.id, c.ragione_sociale); navigate("/"); }}>
                          <LogIn className="mr-1 h-4 w-4" />Accedi
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Mini-badges breakdown per stato */}
                  {totalPratiche > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-16">
                      {(Object.entries(STATO_CONFIG) as [PraticaStato, typeof STATO_CONFIG[PraticaStato]][]).map(([stato, cfg]) => {
                        const count = statoCounts[stato] || 0;
                        if (count === 0) return null;
                        const Icon = cfg.icon;
                        return (
                          <Badge key={stato} variant="outline" className={`text-[10px] gap-1 ${cfg.color}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}: {count}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Topup dialog */}
      <Dialog open={!!showTopup} onOpenChange={(o) => !o && setShowTopup(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ricarica Wallet</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label>Importo (€)</Label><Input type="number" min="1" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} /></div>
            <div><Label>Causale</Label><Input value={topupCausale} onChange={e => setTopupCausale(e.target.value)} /></div>
            <Button onClick={() => walletTopup.mutate()} disabled={!topupAmount || parseFloat(topupAmount) <= 0 || walletTopup.isPending}>
              {walletTopup.isPending ? "Ricarica in corso..." : "Conferma Ricarica"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
