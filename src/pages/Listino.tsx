import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Euro, Clock, Package } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import { serviceSchema } from "@/lib/validation-schemas";
import type { Database } from "@/integrations/supabase/types";

type ServiceCategory = Database["public"]["Enums"]["service_category"];

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  fatturazione: "Fatturazione",
  enea_bonus: "ENEA / Bonus",
  finanziamenti: "Finanziamenti",
  pratiche_edilizie: "Pratiche Edilizie",
  altro: "Altro",
};

const emptyForm = {
  nome: "", descrizione: "", categoria: "" as ServiceCategory | "",
  prezzo_base: "", tempo_stimato_ore: "", attivo: true,
};

export default function Listino() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<ServiceCategory | "">("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_catalog").select("*").order("categoria").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const upsertService = useMutation({
    mutationFn: async () => {
      const parsed = serviceSchema.safeParse({
        nome: form.nome,
        descrizione: form.descrizione,
        categoria: form.categoria,
        prezzo_base: parseFloat(form.prezzo_base) || 0,
        tempo_stimato_ore: parseInt(form.tempo_stimato_ore) || 0,
        attivo: form.attivo,
      });

      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        parsed.error.errors.forEach((e) => {
          fieldErrors[e.path[0]?.toString() || "form"] = e.message;
        });
        setErrors(fieldErrors);
        throw new Error("Dati non validi. Controlla i campi evidenziati.");
      }

      const payload = {
        nome: parsed.data.nome,
        descrizione: parsed.data.descrizione || "",
        categoria: parsed.data.categoria,
        prezzo_base: parsed.data.prezzo_base,
        tempo_stimato_ore: parsed.data.tempo_stimato_ore || 0,
        attivo: parsed.data.attivo,
      };
      if (editId) {
        const { error } = await supabase.from("service_catalog").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_catalog").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      setErrors({});
      toast({ title: editId ? "Servizio aggiornato" : "Servizio creato" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase.from("service_catalog").update({ attivo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-services"] }),
  });

  const openEdit = (s: typeof services[0]) => {
    setEditId(s.id);
    setForm({
      nome: s.nome, descrizione: s.descrizione || "",
      categoria: s.categoria, prezzo_base: String(s.prezzo_base),
      tempo_stimato_ore: String(s.tempo_stimato_ore || ""), attivo: s.attivo,
    });
    setErrors({});
    setShowForm(true);
  };

  const filtered = services.filter(s => {
    const matchSearch = `${s.nome} ${s.descrizione}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || s.categoria === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Listino Servizi</h1>
          <p className="text-muted-foreground">Configura servizi, prezzi e varianti</p>
        </div>
        <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setEditId(null); setForm(emptyForm); setErrors({}); } setShowForm(o); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuovo Servizio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Modifica Servizio" : "Nuovo Servizio"}</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); if (errors.nome) setErrors(p => { const n = { ...p }; delete n.nome; return n; }); }} className={errors.nome ? "border-destructive" : ""} />
                {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
              </div>
              <div><Label>Descrizione</Label><Textarea value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria *</Label>
                  <Select value={form.categoria} onValueChange={v => { setForm(f => ({ ...f, categoria: v as ServiceCategory })); if (errors.categoria) setErrors(p => { const n = { ...p }; delete n.categoria; return n; }); }}>
                    <SelectTrigger className={errors.categoria ? "border-destructive" : ""}><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.service_category.map(c => (
                        <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.categoria && <p className="text-xs text-destructive mt-1">{errors.categoria}</p>}
                </div>
                <div>
                  <Label>Prezzo Base (€)</Label>
                  <Input type="number" min="0" step="0.01" value={form.prezzo_base} onChange={e => { setForm(f => ({ ...f, prezzo_base: e.target.value })); if (errors.prezzo_base) setErrors(p => { const n = { ...p }; delete n.prezzo_base; return n; }); }} className={errors.prezzo_base ? "border-destructive" : ""} />
                  {errors.prezzo_base && <p className="text-xs text-destructive mt-1">{errors.prezzo_base}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tempo Stimato (ore)</Label><Input type="number" min="0" value={form.tempo_stimato_ore} onChange={e => setForm(f => ({ ...f, tempo_stimato_ore: e.target.value }))} /></div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.attivo} onCheckedChange={v => setForm(f => ({ ...f, attivo: v }))} />
                  <Label>Attivo</Label>
                </div>
              </div>
              <Button onClick={() => { setErrors({}); upsertService.mutate(); }} disabled={upsertService.isPending}>
                {upsertService.isPending ? "Salvataggio..." : editId ? "Salva Modifiche" : "Crea Servizio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cerca servizi..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={!filterCat ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterCat("")}>Tutti</Badge>
          {Constants.public.Enums.service_category.map(cat => (
            <Badge key={cat} variant={filterCat === cat ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilterCat(cat)}>
              {CATEGORY_LABELS[cat]}
            </Badge>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="grid gap-3">
          {filtered.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Package className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <h3 className="font-display text-base font-semibold">
                  {search || filterCat ? "Nessun servizio trovato" : "Nessun servizio nel listino"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || filterCat ? "Prova a modificare i filtri di ricerca." : "Crea il primo servizio per iniziare."}
                </p>
                {!search && !filterCat && (
                  <Button className="mt-4" onClick={() => setShowForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />Crea Servizio
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          {filtered.map(s => (
            <Card key={s.id} className={`cursor-pointer transition-colors hover:bg-accent/50 ${!s.attivo ? "opacity-60" : ""}`} onClick={() => openEdit(s)}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{s.nome}</p>
                    {!s.attivo && <Badge variant="outline" className="text-xs">Disattivo</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[s.categoria]}</Badge>
                    {s.descrizione && <span className="truncate">{s.descrizione}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">€ {s.prezzo_base.toFixed(2)}</span>
                  </div>
                  {s.tempo_stimato_ore > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />{s.tempo_stimato_ore}h
                    </div>
                  )}
                  <Switch checked={s.attivo} onClick={e => e.stopPropagation()} onCheckedChange={v => toggleActive.mutate({ id: s.id, attivo: v })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
