import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { clienteSchema, type ClienteFormData } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Check, FileText, Briefcase, Send } from "lucide-react";

const STEPS = ["Dati Cliente", "Riepilogo"];

export default function NuovaPratica() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1: Dati Cliente
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCognome, setClienteCognome] = useState("");
  const [clienteCF, setClienteCF] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteIndirizzo, setClienteIndirizzo] = useState("");

  // Fetch ENEA service from catalog
  const { data: eneaService } = useQuery({
    queryKey: ["enea-service"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("categoria", "enea_bonus")
        .eq("attivo", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch company balance
  const { data: companyData } = useQuery({
    queryKey: ["company-balance", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("companies")
        .select("wallet_balance")
        .eq("id", companyId)
        .single();
      return data;
    },
    enabled: !!companyId,
  });

  const walletBalance = companyData?.wallet_balance ?? 0;
  const prezzo = eneaService?.prezzo_base || 0;
  const hasSufficientCredit = walletBalance >= prezzo;

  const getFormData = (): ClienteFormData => ({
    nome: clienteNome,
    cognome: clienteCognome,
    codice_fiscale: clienteCF,
    email: clienteEmail,
    telefono: clienteTelefono,
    indirizzo: clienteIndirizzo,
  });

  const validateForm = (): boolean => {
    const result = clienteSchema.safeParse(getFormData());
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const submitPratica = useMutation({
    mutationFn: async (asBozza: boolean) => {
      if (!companyId || !user) throw new Error("Missing data");

      const validated = clienteSchema.parse(getFormData());

      // Create client first
      const { data: cliente, error: clienteError } = await supabase
        .from("clienti_finali")
        .insert({
          company_id: companyId,
          nome: validated.nome,
          cognome: validated.cognome,
          codice_fiscale: validated.codice_fiscale || null,
          email: validated.email || null,
          telefono: validated.telefono || null,
          indirizzo: validated.indirizzo || null,
        })
        .select()
        .single();
      if (clienteError) throw clienteError;

      // Create practice
      const { data: pratica, error } = await supabase.from("pratiche").insert({
        company_id: companyId,
        creato_da: user.id,
        service_id: eneaService?.id || null,
        cliente_finale_id: cliente.id,
        categoria: "enea_bonus" as const,
        titolo: `Pratica ENEA - ${validated.nome} ${validated.cognome}`,
        stato: asBozza ? "bozza" : "inviata",
        priorita: "normale",
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
      toast({ title: asBozza ? "Bozza salvata" : "Pratica ENEA inviata con successo!" });
      navigate("/pratiche");
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleNext = () => {
    if (step === 0 && !validateForm()) return;
    setStep(step + 1);
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
        <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica ENEA</h1>
        <p className="text-muted-foreground">Inserisci i dati per la pratica ENEA</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "font-medium" : "text-muted-foreground"} hidden sm:inline`}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 0: Dati Cliente */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dati del Cliente</CardTitle>
            <CardDescription>Inserisci i dati del cliente per la pratica ENEA</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={clienteNome} onChange={(e) => { setClienteNome(e.target.value); setErrors(prev => ({ ...prev, nome: "" })); }} placeholder="Mario" />
                {errors.nome && <p className="text-sm text-destructive">{errors.nome}</p>}
              </div>
              <div className="space-y-2">
                <Label>Cognome *</Label>
                <Input value={clienteCognome} onChange={(e) => { setClienteCognome(e.target.value); setErrors(prev => ({ ...prev, cognome: "" })); }} placeholder="Rossi" />
                {errors.cognome && <p className="text-sm text-destructive">{errors.cognome}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Codice Fiscale</Label>
              <Input value={clienteCF} onChange={(e) => { setClienteCF(e.target.value.toUpperCase()); setErrors(prev => ({ ...prev, codice_fiscale: "" })); }} placeholder="RSSMRA80A01H501Z" maxLength={16} />
              {errors.codice_fiscale && <p className="text-sm text-destructive">{errors.codice_fiscale}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={clienteEmail} onChange={(e) => { setClienteEmail(e.target.value); setErrors(prev => ({ ...prev, email: "" })); }} placeholder="mario@esempio.it" />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input value={clienteTelefono} onChange={(e) => { setClienteTelefono(e.target.value); setErrors(prev => ({ ...prev, telefono: "" })); }} placeholder="+39 333 1234567" />
                {errors.telefono && <p className="text-sm text-destructive">{errors.telefono}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Indirizzo dell'immobile</Label>
              <Input value={clienteIndirizzo} onChange={(e) => { setClienteIndirizzo(e.target.value); setErrors(prev => ({ ...prev, indirizzo: "" })); }} placeholder="Via Roma 1, 00100 Roma (RM)" />
              {errors.indirizzo && <p className="text-sm text-destructive">{errors.indirizzo}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Riepilogo */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Riepilogo</CardTitle>
            <CardDescription>Verifica i dettagli prima di inviare</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <h3 className="font-semibold text-sm">Cliente</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> {clienteNome} {clienteCognome}</div>
                {clienteCF && <div><span className="text-muted-foreground">CF:</span> {clienteCF}</div>}
                {clienteEmail && <div><span className="text-muted-foreground">Email:</span> {clienteEmail}</div>}
                {clienteTelefono && <div><span className="text-muted-foreground">Tel:</span> {clienteTelefono}</div>}
                {clienteIndirizzo && <div className="col-span-2"><span className="text-muted-foreground">Indirizzo:</span> {clienteIndirizzo}</div>}
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Costo servizio</span>
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
          {step === 1 && (
            <Button variant="outline" onClick={() => submitPratica.mutate(true)} disabled={submitPratica.isPending}>
              <FileText className="mr-2 h-4 w-4" />Salva Bozza
            </Button>
          )}
          {step < 1 ? (
            <Button onClick={handleNext}>
              Avanti<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => submitPratica.mutate(false)} disabled={submitPratica.isPending || (!hasSufficientCredit && prezzo > 0)}>
              <Send className="mr-2 h-4 w-4" />Invia Pratica ENEA
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
