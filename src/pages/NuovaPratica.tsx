import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, Check, Plus, FileText, Users, Briefcase, Send } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ServiceCategory = Database["public"]["Enums"]["service_category"];

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  fatturazione: "Fatturazione",
  enea_bonus: "ENEA / Bonus",
  finanziamenti: "Finanziamenti",
  pratiche_edilizie: "Pratiche Edilizie",
  altro: "Altro",
};

const STEPS = ["Servizio", "Cliente", "Dettagli", "Riepilogo"];

export default function NuovaPratica() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | "">("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [priorita, setPriorita] = useState<string>("normale");

  // Quick client creation
  const [showNewClient, setShowNewClient] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newCognome, setNewCognome] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Fetch services
  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("attivo", true)
        .order("categoria");
      if (error) throw error;
      return data;
    },
  });

  // Fetch clients
  const { data: clienti = [] } = useQuery({
    queryKey: ["clienti", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("clienti_finali")
        .select("*")
        .eq("company_id", companyId)
        .order("cognome");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedClient = clienti.find((c) => c.id === selectedClientId);

  const filteredServices = selectedCategory
    ? services.filter((s) => s.categoria === selectedCategory)
    : services;

  // Create quick client
  const createQuickClient = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      const { data, error } = await supabase
        .from("clienti_finali")
        .insert({ company_id: companyId, nome: newNome, cognome: newCognome, email: newEmail })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clienti"] });
      setSelectedClientId(data.id);
      setShowNewClient(false);
      setNewNome(""); setNewCognome(""); setNewEmail("");
      toast({ title: "Cliente creato" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  // Fetch company balance
  const { data: companyData } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("wallet_balance")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const walletBalance = companyData?.wallet_balance ?? 0;
  const prezzo = selectedService?.prezzo_base || 0;
  const hasSufficientCredit = walletBalance >= prezzo;

  // Submit practice
  const submitPratica = useMutation({
    mutationFn: async (asBozza: boolean) => {
      if (!companyId || !user) throw new Error("Missing data");

      // Insert practice first
      const { data: pratica, error } = await supabase.from("pratiche").insert({
        company_id: companyId,
        creato_da: user.id,
        service_id: selectedServiceId || null,
        cliente_finale_id: selectedClientId || null,
        categoria: (selectedService?.categoria || selectedCategory || "altro") as ServiceCategory,
        titolo: titolo || selectedService?.nome || "Nuova pratica",
        descrizione,
        stato: asBozza ? "bozza" : "inviata",
        priorita: priorita as any,
        prezzo,
        pagamento_stato: asBozza ? "non_pagata" : "pagata",
      }).select().single();
      if (error) throw error;

      // If not draft, deduct from wallet
      if (!asBozza && prezzo > 0) {
        const { data: success, error: deductError } = await supabase.rpc("wallet_deduct", {
          _company_id: companyId,
          _importo: prezzo,
          _pratica_id: pratica.id,
          _user_id: user.id,
        });
        if (deductError) throw deductError;
        if (!success) throw new Error("Credito insufficiente");
      }
    },
    onSuccess: (_, asBozza) => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      queryClient.invalidateQueries({ queryKey: ["company-balance"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-movements"] });
      toast({ title: asBozza ? "Bozza salvata" : "Pratica inviata con successo!" });
      navigate("/pratiche");
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const canNext = () => {
    if (step === 0) return !!selectedServiceId;
    if (step === 1) return true; // client is optional
    if (step === 2) return true;
    return true;
  };

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Briefcase className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
        <p className="text-sm text-muted-foreground">Contatta l'amministratore.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
        <p className="text-muted-foreground">Crea una pratica in pochi passaggi</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i < step ? "bg-primary text-primary-foreground" :
              i === step ? "bg-primary text-primary-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "font-medium" : "text-muted-foreground"} hidden sm:inline`}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 0: Select Service */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scegli il servizio</CardTitle>
            <CardDescription>Seleziona la categoria e il servizio dal listino</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={!selectedCategory ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCategory("")}>Tutti</Badge>
              {(Object.keys(CATEGORY_LABELS) as ServiceCategory[]).map((cat) => (
                <Badge key={cat} variant={selectedCategory === cat ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCategory(cat)}>
                  {CATEGORY_LABELS[cat]}
                </Badge>
              ))}
            </div>
            <div className="grid gap-3">
              {filteredServices.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setSelectedServiceId(s.id); setTitolo(s.nome); }}
                  className={`cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent ${
                    selectedServiceId === s.id ? "border-primary bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{s.nome}</p>
                      <p className="text-sm text-muted-foreground">{s.descrizione}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">€ {s.prezzo_base.toFixed(2)}</p>
                      <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[s.categoria as ServiceCategory]}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Select Client */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Seleziona cliente</CardTitle>
            <CardDescription>Scegli un cliente esistente o creane uno nuovo (opzionale)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div
                onClick={() => setSelectedClientId("")}
                className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors hover:bg-accent ${!selectedClientId ? "border-primary bg-accent" : ""}`}
              >
                Nessun cliente (pratica generica)
              </div>
              {clienti.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors hover:bg-accent ${selectedClientId === c.id ? "border-primary bg-accent" : ""}`}
                >
                  <p className="font-medium">{c.nome} {c.cognome}</p>
                  {c.email && <p className="text-sm text-muted-foreground">{c.email}</p>}
                </div>
              ))}
            </div>
            <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full"><Plus className="mr-2 h-4 w-4" />Nuovo Cliente</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Crea cliente rapido</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createQuickClient.mutate(); }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Nome</Label><Input value={newNome} onChange={(e) => setNewNome(e.target.value)} required /></div>
                    <div className="space-y-2"><Label>Cognome</Label><Input value={newCognome} onChange={(e) => setNewCognome(e.target.value)} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={createQuickClient.isPending}>Crea</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Dettagli pratica</CardTitle>
            <CardDescription>Inserisci i dettagli aggiuntivi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Titolo</Label>
              <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrizione / Note</Label>
              <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={4} placeholder="Dettagli aggiuntivi..." />
            </div>
            <div className="space-y-2">
              <Label>Priorità</Label>
              <Select value={priorita} onValueChange={setPriorita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bassa">Bassa</SelectItem>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Summary */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Riepilogo</CardTitle>
            <CardDescription>Verifica i dettagli prima di inviare</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Servizio</span>
                <span className="font-medium">{selectedService?.nome || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Categoria</span>
                <Badge variant="outline">{CATEGORY_LABELS[(selectedService?.categoria || "altro") as ServiceCategory]}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cliente</span>
                <span className="font-medium">{selectedClient ? `${selectedClient.nome} ${selectedClient.cognome}` : "Nessuno"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Titolo</span>
                <span className="font-medium">{titolo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Priorità</span>
                <Badge variant={priorita === "urgente" ? "destructive" : "outline"}>{priorita}</Badge>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="font-semibold">Costo</span>
                <span className="text-lg font-bold">€ {prezzo.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Saldo Wallet</span>
                <span className={`font-semibold ${hasSufficientCredit ? "text-success" : "text-destructive"}`}>
                  € {walletBalance.toFixed(2)}
                </span>
              </div>
              {!hasSufficientCredit && prezzo > 0 && (
                <p className="text-sm text-destructive">
                  ⚠️ Credito insufficiente. Puoi salvare come bozza e ricaricare il wallet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />{step === 0 ? "Annulla" : "Indietro"}
        </Button>
        <div className="flex gap-2">
          {step === 3 && (
            <Button variant="outline" onClick={() => submitPratica.mutate(true)} disabled={submitPratica.isPending}>
              <FileText className="mr-2 h-4 w-4" />Salva Bozza
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Avanti<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => submitPratica.mutate(false)} disabled={submitPratica.isPending || (!hasSufficientCredit && prezzo > 0)}>
              <Send className="mr-2 h-4 w-4" />Invia Pratica
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
