import React, { useState, useRef, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, ArrowRight, Check, FileText, Briefcase, Send,
  CalendarIcon, Zap, Flame, Gift, X,
  ShieldCheck, AlertCircle, Upload, Sparkles, FolderUp,
} from "lucide-react";
import { usePromo } from "@/hooks/usePromo";
import { useCompanyPromos, computeNextIsFree, getPromoDisplayInfo, useApplyCompanyPromo } from "@/hooks/useCompanyPromo";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { PracticeBrand } from "@/integrations/supabase/types";

type Brand = PracticeBrand;

// ── Document upload config (mirrors DocumentUpload.tsx) ───────────────────────
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const STORAGE_BUCKET = "documenti";

// ── Document types (Self Service upload) ──────────────────────────────────────
const DOC_TYPES = [
  { id: "identita",           label: "Documento d'Identità",          description: "Carta d'identità o passaporto in corso di validità" },
  { id: "fattura",            label: "Fattura / Proforma",            description: "Fattura o proforma relativa ai lavori eseguiti" },
  { id: "contratto",          label: "Contratto / Preventivo",        description: "Contratto firmato o preventivo dell'intervento" },
  { id: "certificati",        label: "Certificati Tecnici",           description: "APE, certificati di conformità, libretti impianto" },
  { id: "catastali",          label: "Visura Catastale",              description: "Visura catastale, planimetrie o dati immobile" },
  { id: "relazione_tecnica",  label: "Relazione Tecnica",             description: "Relazione tecnica dell'installatore o asseverazione" },
  { id: "altri",              label: "Altri Documenti",               description: "Qualsiasi altro documento utile alla pratica" },
] as const;

type DocTypeId = typeof DOC_TYPES[number]["id"];

const TIPI_INTERVENTO_ENEA = [
  "Sostituzione infissi",
  "Schermature solari",
  "Caldaia a condensazione",
  "Pompa di calore",
  "Impianto solare termico",
  "Coibentazione strutture",
  "Building automation",
  "Scaldacqua a pompa di calore",
  "Vepa",
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
  "Vepa",
  "Caldaia a gas naturale (efficienza)",
  "Altro",
];

// ── Documenti aggiuntivi (opzionali) per tipo intervento — flusso Servizio Completo ──
type ExtraDoc = { id: string; label: string; description: string };

const DOCS_PER_INTERVENTO: Record<string, ExtraDoc[]> = {
  // ENEA
  "Sostituzione infissi": [
    { id: "certificato_trasmittanza", label: "Certificato di Trasmittanza", description: "Certificato di trasmittanza termica degli infissi installati (opzionale)" },
  ],
  "Schermature solari": [],
  "Caldaia a condensazione": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica della caldaia a condensazione (opzionale)" },
  ],
  "Pompa di calore": [
    { id: "libretto_tecnico", label: "Libretto Tecnico", description: "Libretto tecnico con modello del dispositivo installato (opzionale)" },
  ],
  "Impianto solare termico": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica del sistema solare termico (opzionale)" },
  ],
  "Coibentazione strutture": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica del materiale isolante utilizzato (opzionale)" },
  ],
  "Building automation": [],
  "Scaldacqua a pompa di calore": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica dello scaldacqua a pompa di calore (opzionale)" },
  ],
  "Vepa": [],
  "Microgeneratori": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica del microgeneratore (opzionale)" },
  ],
  "Altro": [],
  // CT
  "Sostituzione generatore a biomassa": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica del generatore a biomassa (opzionale)" },
  ],
  "Pompa di calore (riscaldamento)": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica della pompa di calore (opzionale)" },
  ],
  "Solare termico con collettori": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica dei collettori solari termici (opzionale)" },
  ],
  "Sistemi ibridi pompa di calore": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica del sistema ibrido (opzionale)" },
  ],
  "Impianti geotermici": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica dell'impianto geotermico (opzionale)" },
  ],
  "Caldaia a gas naturale (efficienza)": [
    { id: "scheda_tecnica", label: "Scheda Tecnica", description: "Scheda tecnica della caldaia a gas (opzionale)" },
  ],
};

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
    description: "Detrazioni fiscali al 50% per prima casa e 36% per seconda casa: Ecobonus, detrazioni per riqualificazione energetica.",
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

// ── Schemas ───────────────────────────────────────────────────────────────────

const nuovaPraticaClienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(100, "Massimo 100 caratteri"),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100, "Massimo 100 caratteri"),
  email: z
    .string().trim()
    .refine((val) => val === "" || z.string().email().safeParse(val).success, {
      message: "Indirizzo email non valido",
    })
    .optional().or(z.literal("")),
  telefono: z
    .string().trim()
    .refine((val) => val === "" || /^[\d\s\+\-().]{6,20}$/.test(val), {
      message: "Numero di telefono non valido",
    })
    .optional().or(z.literal("")),
});

const praticaSchema = z.object({
  tipo_intervento: z.string().optional().or(z.literal("")),
  data_fine_lavori: z.date().optional(),
  note_aggiuntive: z.string().trim().max(2000).optional().or(z.literal("")),
});

// ── DocUploadCard ─────────────────────────────────────────────────────────────

function DocUploadCard({
  label,
  description,
  files,
  onAdd,
  onRemove,
  onValidationError,
}: {
  label: string;
  description: string;
  files: File[];
  onAdd: (newFiles: File[]) => void;
  onRemove: (index: number) => void;
  onValidationError?: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateAndAdd = useCallback((rawFiles: File[]) => {
    const valid: File[] = [];
    const errors: string[] = [];
    rawFiles.forEach((f) => {
      if (!ALLOWED_MIME_TYPES.includes(f.type)) {
        errors.push(`"${f.name}" — formato non supportato`);
      } else if (f.size > MAX_FILE_SIZE) {
        errors.push(`"${f.name}" — supera 10 MB`);
      } else {
        valid.push(f);
      }
    });
    if (errors.length) onValidationError?.(errors.join("; "));
    if (valid.length) onAdd(valid);
  }, [onAdd, onValidationError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
    if (dropped.length) validateAndAdd(dropped);
  }, [validateAndAdd]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) validateAndAdd(selected);
    e.target.value = "";
  }, [validateAndAdd]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between px-4 pt-3 pb-2 gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        {files.length > 0 && (
          <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
            {files.length} file
          </Badge>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "mx-4 mb-3 rounded-md border-2 border-dashed p-3 text-center cursor-pointer transition-colors select-none",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <Upload className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Trascina qui o <span className="text-primary font-medium">clicca per sfogliare</span>
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">PDF, JPG, PNG, DOCX, XLSX · max 10 MB</p>
        <input ref={inputRef} type="file" multiple hidden onChange={handleChange} accept={ALLOWED_MIME_TYPES.join(",")} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="px-4 pb-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs truncate max-w-[160px]">{f.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {f.size < 1024 * 1024
                    ? `${(f.size / 1024).toFixed(0)} KB`
                    : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Rimuovi file"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuovaPratica() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { activePromo, isPromoApplicable, daysToExpiry, applyPromo } = usePromo(user?.id);
  const [usePromoOnSubmit, setUsePromoOnSubmit] = useState(false);

  const { data: companyPromos = [] } = useCompanyPromos(companyId ?? undefined);
  const applyCompanyPromo = useApplyCompanyPromo();
  // Find first active company promo that gives a free practice
  const activeCompanyPromo = companyPromos.find(p => computeNextIsFree(p)) ?? null;
  const companyPromoInfo = activeCompanyPromo ? getPromoDisplayInfo(activeCompanyPromo) : null;

  // ── Selezione iniziale (brand + tipo servizio) ──
  const [brand, setBrand] = useState<Brand | null>(null);
  const [tipoServizio, setTipoServizio] = useState<"servizio_completo" | "pratica_only" | null>(null);

  // ── Wizard ──
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 0: Dati Cliente
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCognome, setClienteCognome] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");

  // Step 1: Dati Pratica
  const [tipoIntervento, setTipoIntervento] = useState("");
  const [dataFineLavori, setDataFineLavori] = useState<Date | undefined>();
  const [noteAggiuntive, setNoteAggiuntive] = useState("");
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  // Step Documenti (Self Service): Record<DocTypeId, File[]>
  const [documenti, setDocumenti] = useState<Record<string, File[]>>({});

  // Step Riepilogo: accettazione prezzo
  const [accettazionePrezzo, setAccettazionePrezzo] = useState(false);

  const brandConf = brand ? BRAND_CONFIG[brand] : null;
  const tipiIntervento = brand === "conto_termico" ? TIPI_INTERVENTO_CT : TIPI_INTERVENTO_ENEA;

  // ── Dynamic STEPS ──────────────────────────────────────────────────────────
  const STEPS = tipoServizio === "servizio_completo"
    ? ["Dati Cliente", "Intervento & Fattura", "Riepilogo"]
    : ["Dati Cliente", "Dati Pratica", "Documenti", "Riepilogo"];

  // Docs aggiuntivi opzionali per il flusso servizio_completo
  const extraDocs: ExtraDoc[] = tipoServizio === "servizio_completo" && tipoIntervento
    ? (DOCS_PER_INTERVENTO[tipoIntervento] ?? [])
    : [];

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

  // Company-specific price override (set by super admin per azienda)
  const { data: companyPricingRow } = useQuery({
    queryKey: ["company-pricing-row", companyId, brand],
    queryFn: async () => {
      if (!companyId || !brand) return null;
      const { data } = await supabase
        .from("company_pricing")
        .select("prezzo")
        .eq("company_id", companyId)
        .eq("brand", brand)
        .maybeSingle();
      return data as { prezzo: number } | null;
    },
    enabled: !!companyId && !!brand,
  });

  // Priority: company custom price > service catalog price > 65 (hardcoded fallback)
  const prezzoNetto: number =
    companyPricingRow?.prezzo ?? praticaService?.prezzo_base ?? 65;
  const prezzoIva = prezzoNetto * 0.22;
  const prezzoTotale = prezzoNetto + prezzoIva;

  const getClienteFormData = () => ({
    nome: clienteNome,
    cognome: clienteCognome,
    email: clienteEmail,
    telefono: clienteTelefono,
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
      data_fine_lavori: dataFineLavori,
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

      const { data: cliente, error: clienteError } = await supabase
        .from("clienti_finali")
        .insert({
          company_id: companyId,
          nome: validated.nome,
          cognome: validated.cognome,
          codice_fiscale: null,
          email: validated.email || null,
          telefono: validated.telefono || null,
          indirizzo: null,
        })
        .select().single();
      if (clienteError) throw clienteError;
      const clienteId = cliente.id;

      const datiPratica: Record<string, string | number> = {
        brand,
        tipo_servizio: tipoServizio,
      };
      if (tipoIntervento) datiPratica.tipo_intervento = tipoIntervento;
      if (dataFineLavori) datiPratica.data_fine_lavori = format(dataFineLavori, "yyyy-MM-dd");
      if (noteAggiuntive) datiPratica.note_aggiuntive = noteAggiuntive;

      const titoloBase = `Pratica ${BRAND_CONFIG[brand].praticaLabel} - ${validated.nome} ${validated.cognome}`;

      const { data: inserted, error } = await supabase.from("pratiche").insert({
        company_id: companyId,
        creato_da: user.id,
        service_id: praticaService?.id || null,
        cliente_finale_id: clienteId,
        categoria: "enea_bonus" as const,
        titolo: titoloBase,
        stato: asBozza ? "bozza" : "inviata",
        priorita: "normale",
        prezzo: prezzoNetto,
        pagamento_stato: "non_pagata",
        dati_pratica: datiPratica,
        is_free: (!asBozza && usePromoOnSubmit && isPromoApplicable) || (!asBozza && !!activeCompanyPromo && computeNextIsFree(activeCompanyPromo)),
      }).select("id").single();
      if (error) throw error;

      if (!asBozza && usePromoOnSubmit && isPromoApplicable && inserted?.id) {
        await applyPromo(inserted.id).catch(() => null);
      }

      if (!asBozza && activeCompanyPromo && computeNextIsFree(activeCompanyPromo) && inserted?.id) {
        await applyCompanyPromo.mutateAsync({ promo: activeCompanyPromo, praticaId: inserted.id }).catch(() => null);
      }

      // ── Upload documents ───────────────────────────────────────────────────
      // Documents go into the "documenti" bucket + documenti table so they appear
      // in PraticaDetail and all admin views automatically (same as DocumentUpload.tsx).
      if (inserted?.id) {
        const allUploads: { typeId: string; file: File }[] = DOC_TYPES.flatMap((dt) =>
          (documenti[dt.id] ?? []).map((file) => ({ typeId: dt.id, file }))
        );

        if (allUploads.length > 0) {
          const results = await Promise.allSettled(
            allUploads.map(async ({ typeId, file }) => {
              // 1. Upload to storage (path mirrors DocumentUpload.tsx)
              const path = `${companyId}/${inserted.id}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
              const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(path, file, { upsert: false });
              if (uploadError) throw new Error(`${file.name}: ${uploadError.message}`);

              // 2. Insert row into documenti table — this is what makes them visible in admin
              const { error: dbError } = await supabase.from("documenti").insert({
                pratica_id: inserted.id,
                company_id: companyId,
                caricato_da: user.id,
                nome_file: file.name,
                storage_path: path,
                mime_type: file.type,
                size_bytes: file.size,
                tipo: typeId,                          // categoria (es. "identita", "fattura")
                visibilita: "azienda_interno" as const,
                versione: 1,
              });
              if (dbError) throw new Error(`${file.name} (DB): ${dbError.message}`);
            })
          );

          const failed = results
            .filter((r): r is PromiseRejectedResult => r.status === "rejected")
            .map((r) => r.reason?.message ?? "Upload fallito");

          if (failed.length > 0) {
            console.warn("Upload parziale — file non caricati:", failed);
            return { partialUploadFailed: failed };
          }
        }
      }
    },
    onSuccess: (result, asBozza) => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      const brandLabel = brand ? BRAND_CONFIG[brand].praticaLabel : "Pratica";
      if (result && "partialUploadFailed" in result && result.partialUploadFailed.length > 0) {
        toast({
          title: asBozza ? "Bozza salvata (upload parziale)" : `${brandLabel} inviata — upload parziale`,
          description: `Alcuni file non sono stati caricati: ${result.partialUploadFailed.slice(0, 3).join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: asBozza ? "Bozza salvata" : `${brandLabel} inviata con successo!` });
      }
      navigate("/pratiche");
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleNext = () => {
    if (step === 0 && !validateStep1()) return;

    if (tipoServizio === "servizio_completo") {
      // Step 1 = "Intervento & Fattura" — fattura obbligatoria
      if (step === 1) {
        const fattureFiles = documenti["fattura"] ?? [];
        if (fattureFiles.length === 0) {
          toast({ title: "Fattura obbligatoria", description: "Carica almeno una fattura per procedere.", variant: "destructive" });
          return;
        }
      }
    } else {
      // pratica_only: step 1 = Dati Pratica, step 2 = Documenti
      if (step === 1 && !validateStep2()) return;
      if (step === 2) {
        const fattureFiles = documenti["fattura"] ?? [];
        if (fattureFiles.length === 0) {
          toast({ title: "Fattura obbligatoria", description: "Carica almeno una fattura per procedere.", variant: "destructive" });
          return;
        }
      }
    }

    setStep(step + 1);
  };

  const lastStep = STEPS.length - 1;

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Briefcase className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
        <p className="text-sm text-muted-foreground">Contatta l'amministratore.</p>
      </div>
    );
  }

  // ── Schermata 1: Selezione Brand ──────────────────────────────────────────

  if (!brand) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
          <p className="text-muted-foreground text-sm mt-1">Seleziona il tipo di incentivo per questa pratica</p>
        </div>

        {/* Step breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
          <span className="font-medium text-foreground">Tipo incentivo</span>
          <span className="h-px w-6 bg-border" />
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">2</span>
          <span>Tipo servizio</span>
          <span className="h-px w-6 bg-border" />
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">3</span>
          <span>Dati &amp; invio</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.entries(BRAND_CONFIG) as [Brand, typeof BRAND_CONFIG[Brand]][]).map(([key, conf]) => {
            const Icon = conf.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setBrand(key)}
                className={`group rounded-xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${conf.color} focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm group-hover:shadow transition-shadow">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-base">{conf.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{conf.description}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Seleziona <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>

        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Annulla
        </Button>
      </div>
    );
  }

  // ── Schermata 2: Selezione Tipo Servizio ─────────────────────────────────

  if (!tipoServizio) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
          <p className="text-muted-foreground text-sm mt-1">Come vuoi procedere con questa pratica?</p>
        </div>

        {/* Step breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            <Check className="h-3 w-3" />
          </span>
          <span className="text-muted-foreground">Tipo incentivo</span>
          <span className="h-px w-6 bg-primary" />
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
          <span className="font-medium text-foreground">Tipo servizio</span>
          <span className="h-px w-6 bg-border" />
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">3</span>
          <span>Dati &amp; invio</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Opzione A: Servizio Completo */}
          <button
            type="button"
            onClick={() => setTipoServizio("servizio_completo")}
            className="group relative rounded-xl border-2 border-primary/30 bg-primary/5 p-6 text-left transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Consigliato
            </div>
            <h3 className="mt-2 font-semibold text-base leading-snug">Carico solo i dati del cliente e la fattura</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Pratica Rapida pensa a tutto:</span> recuperiamo i documenti mancanti, gestiamo il cliente e seguiamo l'intera pratica per te.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Seleziona <ArrowRight className="h-3 w-3" />
            </div>
          </button>

          {/* Opzione B: Self Service */}
          <button
            type="button"
            onClick={() => setTipoServizio("pratica_only")}
            className="group relative rounded-xl border-2 border-border bg-card p-6 text-left transition-all hover:-translate-y-1 hover:border-foreground/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-sm group-hover:bg-foreground group-hover:text-background transition-all">
              <FolderUp className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base leading-snug">Carico tutti i documenti e i dati del cliente</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Pratica Rapida crea solo la pratica:</span> fornisci tu tutte le informazioni e i documenti necessari. Noi gestiamo l'iter burocratico.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              Seleziona <ArrowRight className="h-3 w-3" />
            </div>
          </button>
        </div>

        <Button variant="outline" onClick={() => setBrand(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Indietro
        </Button>
      </div>
    );
  }

  // ── Wizard steps ──────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica</h1>
            <Badge className={brandConf!.badgeClass}>{brandConf!.shortLabel}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setBrand(null); setTipoServizio(null); setStep(0); }} className="text-muted-foreground">
          Ricomincia
        </Button>
      </div>

      {/* Step indicator */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                type="button"
                disabled={i > step}
                onClick={() => { if (i < step) setStep(i); }}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  i < step
                    ? "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/80"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </button>
              <span className={`text-sm hidden sm:inline transition-colors ${
                i === step ? "font-semibold text-foreground" : i < step ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}>
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-8 transition-colors ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
        <div className="h-0.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Step 0: Dati Cliente ───────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dati del Cliente</CardTitle>
            <CardDescription>Inserisci i dati del cliente per questa pratica.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={clienteNome}
                  onChange={(e) => { setClienteNome(e.target.value); setErrors(prev => ({ ...prev, nome: "" })); }}
                  placeholder="Mario"
                />
                {errors.nome && <p className="text-sm text-destructive">{errors.nome}</p>}
              </div>
              <div className="space-y-2">
                <Label>Cognome *</Label>
                <Input
                  value={clienteCognome}
                  onChange={(e) => { setClienteCognome(e.target.value); setErrors(prev => ({ ...prev, cognome: "" })); }}
                  placeholder="Rossi"
                />
                {errors.cognome && <p className="text-sm text-destructive">{errors.cognome}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={clienteEmail}
                  onChange={(e) => { setClienteEmail(e.target.value); setErrors(prev => ({ ...prev, email: "" })); }}
                  placeholder="mario@esempio.it"
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input
                  value={clienteTelefono}
                  onChange={(e) => { setClienteTelefono(e.target.value); setErrors(prev => ({ ...prev, telefono: "" })); }}
                  placeholder="+39 333 1234567"
                />
                {errors.telefono && <p className="text-sm text-destructive">{errors.telefono}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1 (Servizio Completo): Intervento & Fattura ─────────────── */}
      {step === 1 && tipoServizio === "servizio_completo" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tipo di Intervento & Documenti</CardTitle>
              <CardDescription>
                Seleziona il tipo di intervento e carica la fattura. Pratica Rapida gestirà il resto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Tipo intervento */}
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

              {/* Info banner */}
              <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-primary">
                  <p className="font-semibold">Servizio Completo attivo</p>
                  <p className="mt-0.5 leading-relaxed">
                    La <strong>fattura</strong> è obbligatoria.
                    {extraDocs.length > 0
                      ? " Se disponibile, puoi caricare anche la documentazione tecnica (opzionale)."
                      : " Pratica Rapida recupererà tutti gli altri documenti necessari."}
                  </p>
                </div>
              </div>

              {/* Fattura — sempre obbligatoria */}
              <DocUploadCard
                label="Fattura / Proforma *"
                description={tipoIntervento === "Vepa"
                  ? "Fattura o proforma con le dimensioni del prodotto installato indicate"
                  : "Fattura o proforma relativa ai lavori eseguiti (obbligatoria)"}
                files={documenti["fattura"] ?? []}
                onAdd={(newFiles) => setDocumenti(prev => ({ ...prev, fattura: [...(prev["fattura"] ?? []), ...newFiles] }))}
                onRemove={(idx) => setDocumenti(prev => ({ ...prev, fattura: (prev["fattura"] ?? []).filter((_, i) => i !== idx) }))}
                onValidationError={(msg) => toast({ title: "File non valido", description: msg, variant: "destructive" })}
              />

              {/* Documenti aggiuntivi opzionali in base al tipo intervento */}
              {extraDocs.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Documenti opzionali</p>
                  {extraDocs.map(dt => (
                    <DocUploadCard
                      key={dt.id}
                      label={dt.label}
                      description={dt.description}
                      files={documenti[dt.id] ?? []}
                      onAdd={(newFiles) => setDocumenti(prev => ({ ...prev, [dt.id]: [...(prev[dt.id] ?? []), ...newFiles] }))}
                      onRemove={(idx) => setDocumenti(prev => ({ ...prev, [dt.id]: (prev[dt.id] ?? []).filter((_, i) => i !== idx) }))}
                      onValidationError={(msg) => toast({ title: "File non valido", description: msg, variant: "destructive" })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 1 (Self Service): Dati Pratica ────────────────────────────── */}
      {step === 1 && tipoServizio !== "servizio_completo" && (
        <Card>
          <CardHeader>
            <CardTitle>Dati della Pratica {brandConf!.shortLabel}</CardTitle>
            <CardDescription>Inserisci i dettagli specifici dell'intervento.</CardDescription>
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
              <Label>Note aggiuntive</Label>
              <Textarea
                value={noteAggiuntive}
                onChange={e => setNoteAggiuntive(e.target.value)}
                placeholder="Informazioni aggiuntive sulla pratica..."
                rows={3}
                maxLength={2000}
              />
              {step2Errors.note_aggiuntive && <p className="text-sm text-destructive">{step2Errors.note_aggiuntive}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2 (Self Service): Documenti ──────────────────────────────── */}
      {step === 2 && tipoServizio !== "servizio_completo" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documenti del Cliente</CardTitle>
              <CardDescription>Carica i documenti necessari per la pratica. Puoi aggiungere più file per categoria.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info banner */}
              <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-3">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-semibold">Documenti richiesti</p>
                  <p className="mt-0.5 leading-relaxed">
                    La <strong>fattura</strong> è obbligatoria. Gli altri documenti possono essere aggiunti anche in un secondo momento dalla pratica.
                  </p>
                </div>
              </div>

              {/* Upload cards grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {DOC_TYPES.map((dt) => (
                  <DocUploadCard
                    key={dt.id}
                    label={dt.label}
                    description={dt.description}
                    files={documenti[dt.id] ?? []}
                    onAdd={(newFiles) =>
                      setDocumenti((prev) => ({
                        ...prev,
                        [dt.id]: [...(prev[dt.id] ?? []), ...newFiles],
                      }))
                    }
                    onRemove={(idx) =>
                      setDocumenti((prev) => ({
                        ...prev,
                        [dt.id]: (prev[dt.id] ?? []).filter((_, i) => i !== idx),
                      }))
                    }
                    onValidationError={(msg) =>
                      toast({ title: "File non valido", description: msg, variant: "destructive" })
                    }
                  />
                ))}
              </div>

              {/* File count summary */}
              {(() => {
                const total = Object.values(documenti).reduce((sum, arr) => sum + arr.length, 0);
                return total > 0 ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    {total} {total === 1 ? "file selezionato" : "file selezionati"} — verranno caricati all'invio della pratica
                  </p>
                ) : null;
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2/3: Riepilogo ────────────────────────────────────────────── */}
      {step === lastStep && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo</CardTitle>
              <CardDescription>Verifica i dettagli prima di inviare</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                {/* Tipo pratica + servizio */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={brandConf!.badgeClass}>{brandConf!.label}</Badge>
                  <Badge variant="outline" className={tipoServizio === "servizio_completo" ? "border-primary/40 text-primary" : ""}>
                    {tipoServizio === "servizio_completo" ? "✦ Servizio Completo" : "Self Service"}
                  </Badge>
                </div>

                {/* Cliente */}
                <h3 className="font-semibold text-sm border-t pt-3">Cliente</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> {clienteNome} {clienteCognome}</div>
                  {clienteEmail && <div><span className="text-muted-foreground">Email:</span> {clienteEmail}</div>}
                  {clienteTelefono && <div><span className="text-muted-foreground">Tel:</span> {clienteTelefono}</div>}
                </div>

                {/* Dati pratica */}
                {(tipoIntervento || dataFineLavori) && (
                  <>
                    <h3 className="font-semibold text-sm border-t pt-3">Dati Pratica {brandConf!.shortLabel}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {tipoIntervento && <div><span className="text-muted-foreground">Intervento:</span> {tipoIntervento}</div>}
                      {dataFineLavori && <div><span className="text-muted-foreground">Fine lavori:</span> {format(dataFineLavori, "dd/MM/yyyy", { locale: it })}</div>}
                      {noteAggiuntive && <div className="col-span-2"><span className="text-muted-foreground">Note:</span> {noteAggiuntive}</div>}
                    </div>
                  </>
                )}

                {/* Documenti caricati */}
                {(() => {
                  const totalFiles = Object.values(documenti).reduce((sum, arr) => sum + arr.length, 0);
                  const typesWithFiles = DOC_TYPES.filter((dt) => (documenti[dt.id]?.length ?? 0) > 0);
                  return (
                    <>
                      <h3 className="font-semibold text-sm border-t pt-3">Documenti</h3>
                      {totalFiles === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nessun documento caricato</p>
                      ) : (
                        <div className="space-y-1">
                          {typesWithFiles.map((dt) => (
                            <div key={dt.id} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{dt.label}:</span>
                              <span className="font-medium">{documenti[dt.id]!.length} file</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-1 text-xs text-green-600 font-medium pt-1">
                            <Check className="h-3 w-3" />
                            {totalFiles} {totalFiles === 1 ? "file" : "file"} pronti per il caricamento
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Promo */}
                {usePromoOnSubmit && isPromoApplicable && (
                  <div className="flex justify-between text-green-600 font-semibold border-t pt-3">
                    <span>Con promo</span>
                    <span className="text-lg">€ 0.00 🎁</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Banner prezzo + accettazione ──────────────────────────────── */}
          <Card className={cn(
            "border-2 transition-colors",
            accettazionePrezzo ? "border-primary/30 bg-primary/5" : "border-border"
          )}>
            <CardContent className="pt-5 space-y-4">
              {/* Riepilogo costo */}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Costo del servizio</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fatturazione mensile posticipata tramite bonifico
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-2xl font-bold tabular-nums",
                    usePromoOnSubmit && isPromoApplicable ? "line-through text-muted-foreground text-base" : ""
                  )}>
                    € {prezzoNetto.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">+ IVA 22% (€ {prezzoIva.toFixed(2)})</p>
                  <p className="text-xs font-semibold text-muted-foreground">Totale € {prezzoTotale.toFixed(2)}</p>
                  {usePromoOnSubmit && isPromoApplicable && (
                    <p className="text-base font-bold text-green-600 mt-0.5">€ 0,00 🎁</p>
                  )}
                </div>
              </div>

              {/* Banner promo */}
              {isPromoApplicable && activePromo && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
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

              {/* Banner promo aziendale */}
              {activeCompanyPromo && computeNextIsFree(activeCompanyPromo) && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-start gap-2">
                  <Gift className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-700">Questa pratica è gratuita!</p>
                    <p className="text-xs text-green-600">{companyPromoInfo?.detail}</p>
                  </div>
                </div>
              )}

              {/* Checkbox accettazione — obbligatoria */}
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors",
                  accettazionePrezzo
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/40"
                )}
                onClick={() => setAccettazionePrezzo(v => !v)}
              >
                <Checkbox
                  id="accettazione-prezzo"
                  checked={accettazionePrezzo}
                  onCheckedChange={(v) => setAccettazionePrezzo(!!v)}
                  className="mt-0.5 shrink-0"
                />
                <label htmlFor="accettazione-prezzo" className="text-sm leading-relaxed cursor-pointer select-none">
                  Confermo di aver preso visione che, al completamento della pratica,
                  il costo del servizio sarà di{" "}
                  <strong className={usePromoOnSubmit && isPromoApplicable ? "line-through text-muted-foreground" : ""}>
                    € {prezzoNetto.toFixed(2)} + IVA 22%
                  </strong>
                  {usePromoOnSubmit && isPromoApplicable && (
                    <strong className="text-green-600 ml-1">€ 0,00 (promo applicata)</strong>
                  )}
                  {" "}e verrà fatturato a fine mese.
                </label>
              </div>

              {/* Avviso se non accettato */}
              {!accettazionePrezzo && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Accetta le condizioni economiche per procedere con l'invio.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (step > 0) setStep(step - 1);
            else setBrand(null);
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />Indietro
        </Button>
        <div className="flex gap-2">
          {step === lastStep && (
            <Button
              variant="outline"
              onClick={() => submitPratica.mutate(true)}
              disabled={submitPratica.isPending}
            >
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
            <Button
              onClick={() => submitPratica.mutate(false)}
              disabled={submitPratica.isPending || !accettazionePrezzo}
              title={!accettazionePrezzo ? "Accetta le condizioni economiche per procedere" : undefined}
            >
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
