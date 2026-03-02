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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, FileText, Briefcase, Send, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STEPS = ["Dati Cliente", "Dati Pratica ENEA", "Riepilogo"];

const TIPI_INTERVENTO = [
  "Sostituzione infissi",
  "Schermature solari",
  "Caldaia a condensazione",
  "Pompa di calore",
  "Impianto solare termico",
  "Coibentazione strutture",
  "Building automation",
  "Scaldacqua a pompa di calore",
  "Microgeneratori",
  "Altro",
];

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

  // Step 2: Dati Pratica ENEA
  const [tipoIntervento, setTipoIntervento] = useState("");
  const [datiCatastali, setDatiCatastali] = useState("");
  const [dataFineLavori, setDataFineLavori] = useState<Date | undefined>();
  const [importoLavori, setImportoLavori] = useState("");
  const [noteAggiuntive, setNoteAggiuntive] = useState("");

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

      // Build dati_pratica JSONB
      const datiPratica: Record<string, any> = {};
      if (tipoIntervento) datiPratica.tipo_intervento = tipoIntervento;
      if (datiCatastali) datiPratica.dati_catastali = datiCatastali;
      if (dataFineLavori) datiPratica.data_fine_lavori = format(dataFineLavori, "yyyy-MM-dd");
      if (importoLavori) datiPratica.importo_lavori = parseFloat(importoLavori);
      if (noteAggiuntive) datiPratica.note_aggiuntive = noteAggiuntive;

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
        dati_pratica: Object.keys(datiPratica).length > 0 ? datiPratica : {},
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

  const lastStep = STEPS.length - 1;

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
            <button
              type="button"
              disabled={i > step}
              onClick={() => { if (i < step) setStep(i); }}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              } ${i < step ? "cursor-pointer hover:bg-primary/80" : i > step ? "cursor-not-allowed" : ""}`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </button>
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

      {/* Step 1: Dati Pratica ENEA */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dati della Pratica ENEA</CardTitle>
            <CardDescription>Inserisci i dettagli specifici dell'intervento (opzionali, compilabili anche dopo)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo di intervento</Label>
              <Select value={tipoIntervento} onValueChange={setTipoIntervento}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo intervento" />
                </SelectTrigger>
                <SelectContent>
                  {TIPI_INTERVENTO.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dati catastali</Label>
              <Input value={datiCatastali} onChange={e => setDatiCatastali(e.target.value)} placeholder="Foglio 10, Particella 123, Sub. 4" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data fine lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataFineLavori && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataFineLavori ? format(dataFineLavori, "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dataFineLavori} onSelect={setDataFineLavori} locale={it} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Importo lavori (€)</Label>
                <Input type="number" value={importoLavori} onChange={e => setImportoLavori(e.target.value)} placeholder="15000" min="0" step="0.01" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note aggiuntive</Label>
              <Textarea value={noteAggiuntive} onChange={e => setNoteAggiuntive(e.target.value)} placeholder="Informazioni aggiuntive sulla pratica..." rows={3} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Riepilogo */}
      {step === 2 && (
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

              {(tipoIntervento || datiCatastali || dataFineLavori || importoLavori) && (
                <>
                  <h3 className="font-semibold text-sm border-t pt-3">Dati Pratica ENEA</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {tipoIntervento && <div><span className="text-muted-foreground">Intervento:</span> {tipoIntervento}</div>}
                    {datiCatastali && <div><span className="text-muted-foreground">Catastali:</span> {datiCatastali}</div>}
                    {dataFineLavori && <div><span className="text-muted-foreground">Fine lavori:</span> {format(dataFineLavori, "dd/MM/yyyy", { locale: it })}</div>}
                    {importoLavori && <div><span className="text-muted-foreground">Importo:</span> € {parseFloat(importoLavori).toFixed(2)}</div>}
                    {noteAggiuntive && <div className="col-span-2"><span className="text-muted-foreground">Note:</span> {noteAggiuntive}</div>}
                  </div>
                </>
              )}

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
          {step === lastStep && (
            <Button variant="outline" onClick={() => submitPratica.mutate(true)} disabled={submitPratica.isPending}>
              {submitPratica.isPending ? (
                <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Salvataggio...</>
              ) : (
                <><FileText className="mr-2 h-4 w-4" />Salva Bozza</>
              )}
            </Button>
          )}
          {step < lastStep ? (
            <Button onClick={handleNext}>
              Avanti<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => submitPratica.mutate(false)} disabled={submitPratica.isPending || (!hasSufficientCredit && prezzo > 0)}>
              {submitPratica.isPending ? (
                <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Invio in corso...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />Invia Pratica ENEA</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
