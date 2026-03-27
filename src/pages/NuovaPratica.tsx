import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, FileText, Briefcase, Send, CalendarIcon, Zap, Flame, Gift } from "lucide-react";
import { usePromo } from "@/hooks/usePromo";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { PracticeBrand } from "@/integrations/supabase/types";

type Brand = PracticeBrand;

const STEPS = ["Dati Cliente", "Dati Pratica", "Riepilogo"];

const TIPI_INTERVENTO_ENEA = [
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

const TIPI_INTERVENTO_CT = [
  "Sostituzione generatore a biomassa",
  "Pompa di calore (riscaldamento)",
  "Solare termico con collettori",
  "Sistemi ibridi pompa di calore",
  "Caldaia a condensazione",
  "Impianti geotermici",
  "Scaldacqua a pompa di calore",
  "Caldaia a gas naturale (efficienza)",
  "Altro",
];

const BRAND_CONFIG: Record<Brand, {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  badgeClass: string;
  praticaLabel: string;
  icon: React.ElementType;
}> = {
  enea: {
    label: "Pratica ENEA",
    shortLabel: "ENEA",
    description: "Detrazioni fiscali 50–110%: Ecobonus, SuperBonus, detrazioni per riqualificazione energetica.",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    badgeClass: "bg-blue-100 text-blue-700",
    praticaLabel: "ENEA",
    icon: Zap,
  },
  conto_termico: {
    label: "Conto Termico",
    shortLabel: "CT",
    description: "Contributi GSE a fondo perduto per sostituzione generatori di calore e fonti rinnovabili.",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
    badgeClass: "bg-orange-100 text-orange-700",
    praticaLabel: "Conto Termico",
    icon: Flame,
  },
};

const nuovaPraticaClienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(100, "Massimo 100 caratteri"),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100, "Massimo 100 caratteri"),
  codice_fiscale: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (val) => val === "" || /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(val),
      { message: "Codice fiscale non valido (16 caratteri alfanumerici)" }
    )
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Indirizzo email non valido" }
    )
    .optional()
    .or(z.literal("")),
  telefono: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^[\d\s\+\-().]{6,20}$/.test(val),
      { message: "Numero di telefono non valido" }
    )
    .optional()
    .or(z.literal("")),
  indirizzo: z.string().trim().max(255, "Massimo 255 caratteri").optional().or(z.literal("")),
});

type NuovaPraticaClienteData = z.infer<typeof nuovaPraticaClienteSchema>;

const praticaSchema = z.object({
  tipo_intervento: z.string().optional().or(z.literal("")),
  dati_catastali: z.string().trim().max(255).optional().or(z.literal("")),
  data_fine_lavori: z.date().optional(),
  importo_lavori: z
    .string()
    .refine(
      (val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0),
      { message: "Importo non valido (deve essere ≥ 0)" }
    )
    .optional()
    .or(z.literal("")),
  note_aggiuntive: z.string().trim().max(2000, "Massimo 2000 caratteri").optional().or(z.literal("")),
});

export default function NuovaPratica() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { activePromo, isPromoApplicable, daysToExpiry, applyPromo } = usePromo(user?.id);
  const [usePromoOnSubmit, setUsePromoOnSubmit] = useState(false);

  const [brand, setBrand] = useState<Brand | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1: Dati Cliente
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCognome, setClienteCognome] = useState("");
  const [clienteCF, setClienteCF] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteIndirizzo, setClienteIndirizzo] = useState("");

  // Step 2: Dati Pratica
  const [tipoIntervento, setTipoIntervento] = useState("");
  const [datiCatastali, setDatiCatastali] = useState("");
  const [dataFineLavori, setDataFineLavori] = useState<Date | undefined>();
  const [importoLavori, setImportoLavori] = useState("");
  const [noteAggiuntive, setNoteAggiuntive] = useState("");
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  const brandConf = brand ? BRAND_CONFIG[brand] : null;
  const tipiIntervento = brand === "conto_termico" ? TIPI_INTERVENTO_CT : TIPI_INTERVENTO_ENEA;

  // Fetch service from catalog (used to store service_id and prezzo for billing)
  const { data: praticaService } = useQuery({
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

  const prezzo = praticaService?.prezzo_base || 0;

  const getClienteFormData = () => ({
    nome: clienteNome,
    cognome: clienteCognome,
    codice_fiscale: clienteCF,
    email: clienteEmail,
    telefono: clienteTelefono,
    indirizzo: clienteIndirizzo,
  });

  const validateStep1 = (): boolean => {
    const result = nuovaPraticaClienteSchema.safeParse(getClienteFormData());
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

  const validateStep2 = (): boolean => {
    const result = praticaSchema.safeParse({
      tipo_intervento: tipoIntervento,
      dati_catastali: datiCatastali,
      data_fine_lavori: dataFineLavori,
      importo_lavori: importoLavori,
      note_aggiuntive: noteAggiuntive,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setStep2Errors(fieldErrors);
      return false;
    }
    setStep2Errors({});
    return true;
  };

  const submitPratica = useMutation({
    mutationFn: async (asBozza: boolean) => {
      if (!companyId || !user || !brand) throw new Error("Missing data");

      const validated = nuovaPraticaClienteSchema.parse(getClienteFormData());

      // Find or create client
      let clienteId: string;
      if (validated.codice_fiscale) {
        const { data: existing } = await supabase
          .from("clienti_finali")
          .select("id")
          .eq("company_id", companyId)
          .eq("codice_fiscale", validated.codice_fiscale)
          .maybeSingle();
        if (existing) {
          clienteId = existing.id;
          await supabase.from("clienti_finali").update({
            nome: validated.nome,
            cognome: validated.cognome,
            email: validated.email || null,
            telefono: validated.telefono || null,
            indirizzo: validated.indirizzo || null,
          }).eq("id", clienteId);
        } else {
          const { data: cliente, error: clienteError } = await supabase
            .from("clienti_finali")
            .insert({
              company_id: companyId,
              nome: validated.nome,
              cognome: validated.cognome,
              codice_fiscale: validated.codice_fiscale,
              email: validated.email || null,
              telefono: validated.telefono || null,
              indirizzo: validated.indirizzo || null,
            })
            .select()
            .single();
          if (clienteError) throw clienteError;
          clienteId = cliente.id;
        }
      } else {
        const { data: cliente, error: clienteError } = await supabase
          .from("clienti_finali")
          .insert({
            company_id: companyId,
            nome: validated.nome,
            cognome: validated.cognome,
            codice_fiscale: null,
            email: validated.email || null,
            telefono: validated.telefono || null,
            indirizzo: validated.indirizzo || null,
          })
          .select()
          .single();
        if (clienteError) throw clienteError;
        clienteId = cliente.id;
      }

      // Build dati_pratica JSONB
      const datiPratica: Record<string, string | number> = { brand };
      if (tipoIntervento) datiPratica.tipo_intervento = tipoIntervento;
      if (datiCatastali) datiPratica.dati_catastali = datiCatastali;
      if (dataFineLavori) datiPratica.data_fine_lavori = format(dataFineLavori, "yyyy-MM-dd");
      if (importoLavori && !isNaN(parseFloat(importoLavori)) && parseFloat(importoLavori) >= 0) {
        datiPratica.importo_lavori = parseFloat(importoLavori);
      }
      if (noteAggiuntive) datiPratica.note_aggiuntive = noteAggiuntive;

      const titoloBase = `Pratica ${BRAND_CONFIG[brand].praticaLabel} - ${validated.nome} ${validated.cognome}`;

      // Fatturazione mensile posticipata: nessuna verifica wallet, la pratica viene inviata direttamente
      const { data: inserted, error } = await supabase.from("pratiche").insert({
        company_id: companyId,
        creato_da: user.id,
        service_id: praticaService?.id || null,
        cliente_finale_id: clienteId,
        categoria: "enea_bonus" as const,
        titolo: titoloBase,
        stato: asBozza ? "bozza" : "inviata",
        priorita: "normale",
        prezzo,
        pagamento_stato: "non_pagata",
        dati_pratica: datiPratica,
        is_free: !asBozza && usePromoOnSubmit && isPromoApplicable,
      }).select("id").single();
      if (error) throw error;

      // Applica promo se selezionata
      if (!asBozza && usePromoOnSubmit && isPromoApplicable && inserted?.id) {
        await applyPromo(inserted.id).catch(() => null);
      }
    },
    onSuccess: (_, asBozza) => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      const brandLabel = brand ? BRAND_CONFIG[brand].praticaLabel : "Pratica";
      toast({ title: asBozza ? "Bozza salvata" : `${brandLabel} inviata con successo!` });
      navigate("/pratiche");
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleNext = () => {
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && !validateStep2()) return;
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

  // Brand selection screen
  if (!brand) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
          <p className="text-muted-foreground">Seleziona il tipo di incentivo per questa pratica</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.entries(BRAND_CONFIG) as [Brand, typeof BRAND_CONFIG[Brand]][]).map(([key, conf]) => {
            const Icon = conf.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setBrand(key)}
                className={`rounded-xl border-2 p-6 text-left transition-all ${conf.color} focus:outline-none focus:ring-2 focus:ring-primary`}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-bold">{conf.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{conf.description}</p>
              </button>
            );
          })}
        </div>
        <div className="flex">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />Annulla
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
            <Badge className={brandConf!.badgeClass}>{brandConf!.shortLabel}</Badge>
          </div>
          <p className="text-muted-foreground">
            {brand === "enea" ? "Inserisci i dati per la pratica ENEA" : "Inserisci i dati per la pratica Conto Termico"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setBrand(null); setStep(0); }} className="text-muted-foreground">
          Cambia tipo
        </Button>
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
            <CardDescription>Inserisci i dati del cliente per questa pratica</CardDescription>
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

      {/* Step 1: Dati Pratica */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Dati della Pratica {brandConf!.shortLabel}
            </CardTitle>
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
                  {tipiIntervento.map(t => (
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
                <Input type="number" value={importoLavori} onChange={e => { setImportoLavori(e.target.value); setStep2Errors(prev => ({ ...prev, importo_lavori: "" })); }} placeholder="15000" min="0" step="0.01" />
                {step2Errors.importo_lavori && <p className="text-sm text-destructive">{step2Errors.importo_lavori}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note aggiuntive</Label>
              <Textarea value={noteAggiuntive} onChange={e => setNoteAggiuntive(e.target.value)} placeholder="Informazioni aggiuntive sulla pratica..." rows={3} maxLength={2000} />
              {step2Errors.note_aggiuntive && <p className="text-sm text-destructive">{step2Errors.note_aggiuntive}</p>}
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
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Tipo pratica</h3>
                <Badge className={brandConf!.badgeClass}>{brandConf!.label}</Badge>
              </div>

              <h3 className="font-semibold text-sm border-t pt-3">Cliente</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> {clienteNome} {clienteCognome}</div>
                {clienteCF && <div><span className="text-muted-foreground">CF:</span> {clienteCF}</div>}
                {clienteEmail && <div><span className="text-muted-foreground">Email:</span> {clienteEmail}</div>}
                {clienteTelefono && <div><span className="text-muted-foreground">Tel:</span> {clienteTelefono}</div>}
                {clienteIndirizzo && <div className="col-span-2"><span className="text-muted-foreground">Indirizzo:</span> {clienteIndirizzo}</div>}
              </div>

              {(tipoIntervento || datiCatastali || dataFineLavori || importoLavori) && (
                <>
                  <h3 className="font-semibold text-sm border-t pt-3">Dati Pratica {brandConf!.shortLabel}</h3>
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
                {prezzo > 0 && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Costo servizio</span>
                    <span className={`text-lg font-bold ${usePromoOnSubmit && isPromoApplicable ? "line-through text-muted-foreground" : ""}`}>
                      € {prezzo.toFixed(2)}
                    </span>
                  </div>
                )}
                {usePromoOnSubmit && isPromoApplicable && (
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>Con promo</span>
                    <span className="text-lg">€ 0.00 🎁</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  💳 Il pagamento avviene tramite bonifico a fine mese, insieme a tutte le pratiche del periodo.
                </p>
              </div>

              {/* Banner promo */}
              {isPromoApplicable && activePromo && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        Hai {activePromo.pratiche_free_remaining ?? "∞"} pratiche gratuite disponibili!
                      </p>
                      <p className="text-xs text-amber-600">
                        {activePromo.promo_types?.name ?? "Promo attiva"}
                        {daysToExpiry !== null && daysToExpiry <= 7 && (
                          <span className="ml-1 text-orange-600 font-medium">· Scade tra {daysToExpiry}gg</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-amber-700">Usa promo</span>
                    <Switch
                      checked={usePromoOnSubmit}
                      onCheckedChange={setUsePromoOnSubmit}
                      className="data-[state=checked]:bg-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : setBrand(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />{step === 0 ? "Indietro" : "Indietro"}
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
            <Button onClick={() => submitPratica.mutate(false)} disabled={submitPratica.isPending}>
              {submitPratica.isPending ? (
                <><div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Invio in corso...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />Invia Pratica {brandConf!.shortLabel}</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
