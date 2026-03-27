import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePromoTypes, useClientPromos, type PromoType } from "@/hooks/usePromo";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Gift, Users, BarChart3, Trash2, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:    { label: "Attiva",    className: "bg-green-100 text-green-700 border-green-200" },
  expired:   { label: "Scaduta",   className: "bg-gray-100 text-gray-600 border-gray-200" },
  exhausted: { label: "Esaurita",  className: "bg-red-100 text-red-700 border-red-200" },
};

const TYPE_LABEL: Record<string, string> = {
  free_pratiche:    "Pratiche Gratuite",
  discount_percent: "Sconto %",
  discount_fixed:   "Sconto Fisso €",
};

// -----------------------------------------------
// PromoManager
// -----------------------------------------------
export default function PromoManager() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Gift className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Promo Engine</h1>
          <p className="text-muted-foreground text-sm">Gestisci offerte, pratiche gratuite e sconti clienti</p>
        </div>
      </div>

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo"><Gift className="h-4 w-4 mr-1.5" />Catalogo Promo</TabsTrigger>
          <TabsTrigger value="assegnazioni"><Users className="h-4 w-4 mr-1.5" />Assegnazioni</TabsTrigger>
          <TabsTrigger value="report"><BarChart3 className="h-4 w-4 mr-1.5" />Report</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-4">
          <CatalogoTab />
        </TabsContent>
        <TabsContent value="assegnazioni" className="mt-4">
          <AssegnazioniTab />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <ReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -----------------------------------------------
// Tab 1: Catalogo
// -----------------------------------------------
function CatalogoTab() {
  const { data: promos = [], isLoading } = usePromoTypes();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoType | null>(null);

  const [form, setForm] = useState({ name: "", description: "", type: "free_pratiche", value: "", max_pratiche: "", validity_days: "" });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        type: form.type,
        value: form.value ? parseFloat(form.value) : null,
        max_pratiche: form.max_pratiche ? parseInt(form.max_pratiche) : null,
        validity_days: form.validity_days ? parseInt(form.validity_days) : null,
      };
      if (editing) {
        const { error } = await supabase.from("promo_types").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promo_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-types"] });
      toast({ title: editing ? "Promo aggiornata" : "Promo creata" });
      setOpen(false);
      setEditing(null);
      setForm({ name: "", description: "", type: "free_pratiche", value: "", max_pratiche: "", validity_days: "" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      const { error } = await supabase.from("promo_types").update({ is_active: val }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-types"] }),
  });

  const openEdit = (p: PromoType) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", type: p.type, value: p.value?.toString() ?? "", max_pratiche: p.max_pratiche?.toString() ?? "", validity_days: p.validity_days?.toString() ?? "" });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setForm({ name: "", description: "", type: "free_pratiche", value: "", max_pratiche: "", validity_days: "" }); }}>
              <Plus className="h-4 w-4 mr-2" /> Nuova Promo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifica Promo" : "Nuova Promo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prima pratica gratis" className="mt-1" />
              </div>
              <div>
                <Label>Descrizione</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Dettagli promo..." className="mt-1 h-20" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_pratiche">🎁 Pratiche Gratuite</SelectItem>
                    <SelectItem value="discount_percent">% Sconto Percentuale</SelectItem>
                    <SelectItem value="discount_fixed">€ Sconto Fisso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valore</Label>
                  <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="2" type="number" className="mt-1" />
                </div>
                <div>
                  <Label>Max pratiche</Label>
                  <Input value={form.max_pratiche} onChange={e => setForm(f => ({ ...f, max_pratiche: e.target.value }))} placeholder="5" type="number" className="mt-1" />
                </div>
                <div>
                  <Label>Durata (gg)</Label>
                  <Input value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))} placeholder="90" type="number" className="mt-1" />
                </div>
              </div>
              <Button className="w-full" onClick={() => upsert.mutate()} disabled={!form.name || upsert.isPending}>
                {upsert.isPending ? "Salvataggio..." : editing ? "Aggiorna" : "Crea Promo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna promo nel catalogo</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {promos.map(p => (
            <Card key={p.id} className={`transition-opacity ${!p.is_active ? "opacity-50" : ""}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{p.name}</span>
                    <Badge variant="outline" className="text-xs">{TYPE_LABEL[p.type]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    {p.value != null && <span>Valore: {p.type === "discount_percent" ? `${p.value}%` : p.type === "discount_fixed" ? `€${p.value}` : `${p.value} pratiche`}</span>}
                    {p.max_pratiche && <span>Max: {p.max_pratiche} pratiche</span>}
                    {p.validity_days && <span>Durata: {p.validity_days}gg</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={p.is_active} onCheckedChange={v => toggleActive.mutate({ id: p.id, val: v })} />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------
// Tab 2: Assegnazioni
// -----------------------------------------------
function AssegnazioniTab() {
  const { data: assegnazioni = [], isLoading } = useClientPromos();
  const { data: promoTypes = [] } = usePromoTypes();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [selectedPromo, setSelectedPromo] = useState("");
  const [notes, setNotes] = useState("");

  const assegna = useMutation({
    mutationFn: async () => {
      // Trova profile per email
      const { data: profile } = await supabase.from("profiles").select("id").eq("email", clientEmail).single();
      if (!profile) throw new Error("Cliente non trovato");

      const promo = promoTypes.find(p => p.id === selectedPromo);
      if (!promo) throw new Error("Promo non trovata");

      const expires_at = promo.validity_days
        ? new Date(Date.now() + promo.validity_days * 86400000).toISOString()
        : null;

      const { error } = await supabase.from("client_promos").insert({
        client_id: profile.id,
        promo_type_id: selectedPromo,
        expires_at,
        pratiche_free_remaining: promo.type === "free_pratiche" ? promo.value : null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-promos"] });
      toast({ title: "Promo assegnata ✓" });
      setOpen(false);
      setClientEmail(""); setSelectedPromo(""); setNotes("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Assegna Promo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Assegna Promo a Cliente</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Email cliente</Label>
                <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="cliente@email.it" className="mt-1" />
              </div>
              <div>
                <Label>Promo</Label>
                <Select value={selectedPromo} onValueChange={setSelectedPromo}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona promo..." /></SelectTrigger>
                  <SelectContent>
                    {promoTypes.filter(p => p.is_active).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note interne</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note..." className="mt-1 h-20" />
              </div>
              <Button className="w-full" onClick={() => assegna.mutate()} disabled={!clientEmail || !selectedPromo || assegna.isPending}>
                {assegna.isPending ? "Assegnazione..." : "Assegna"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Promo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Usate / Rimaste</TableHead>
                <TableHead>Scadenza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assegnazioni.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessuna assegnazione</TableCell></TableRow>
              ) : assegnazioni.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.profiles?.nome} {a.profiles?.cognome}</div>
                    <div className="text-xs text-muted-foreground">{a.profiles?.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{a.promo_types?.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[a.status]?.className}>
                      {STATUS_BADGE[a.status]?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.pratiche_used ?? 0} / {a.pratiche_free_remaining ?? "∞"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.expires_at ? format(new Date(a.expires_at), "dd MMM yyyy", { locale: it }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// -----------------------------------------------
// Tab 3: Report
// -----------------------------------------------
function ReportTab() {
  const { data: assegnazioni = [] } = useClientPromos();

  const totFree = assegnazioni.reduce((s: number, a: any) => s + (a.pratiche_used ?? 0), 0);
  const totActive = assegnazioni.filter((a: any) => a.status === "active").length;
  const totExhausted = assegnazioni.filter((a: any) => a.status === "exhausted").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pratiche Gratuite Erogate</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totFree}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Promo Attive</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600">{totActive}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Promo Esaurite</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-muted-foreground">{totExhausted}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Clienti più attivi con promo</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pratiche usate</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...assegnazioni]
                .sort((a: any, b: any) => (b.pratiche_used ?? 0) - (a.pratiche_used ?? 0))
                .slice(0, 10)
                .map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.profiles?.nome} {a.profiles?.cognome}</TableCell>
                    <TableCell>{a.pratiche_used ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[a.status]?.className}>
                        {STATUS_BADGE[a.status]?.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
