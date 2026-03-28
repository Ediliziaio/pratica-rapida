import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages } from "@/hooks/useEneaPractices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  Upload,
  X,
  Loader2,
  FileText,
  ChevronRight,
  ChevronLeft,
  Save,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRODUCTS = [
  "Caldaia a condensazione",
  "Pompa di calore",
  "Pannelli solari termici",
  "Vepa",
  "Infissi e serramenti",
  "Cappotto termico",
  "Impianto fotovoltaico",
  "Scaldacqua a pompa di calore",
  "Altro",
];

const schema = z.object({
  cliente_nome: z.string().min(1, "Campo obbligatorio"),
  cliente_cognome: z.string().min(1, "Campo obbligatorio"),
  cliente_email: z.string().email("Email non valida").or(z.literal("")),
  cliente_telefono: z.string().min(6, "Telefono obbligatorio"),
  brand: z.enum(["enea", "conto_termico"]),
  prodotto_installato: z.string().min(1, "Campo obbligatorio"),
  fornitore: z.string().optional(),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type TipoServizio = "pratica_only";

// Steps 0-3 = Cliente · Pratica · Documenti · Conferma
const STEPS = ["Cliente", "Pratica", "Documenti", "Conferma"];
const STORAGE_KEY = "nuova_pratica_enea_draft";

// localStorage può lanciare in Safari Private Mode — sempre wrappare
function storageTryGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageTrySet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* silent — private mode */ }
}
function storageTryRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* silent — private mode */ }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuovaPraticaEnea() {
  const { resellerId } = useAuth();
  const { toast } = useToast();

  // step  0 = Cliente
  // step  1 = Pratica
  // step  2 = Documenti
  // step  3 = Conferma
  const [step, setStep] = useState<number>(0);
  const tipoServizio: TipoServizio = "pratica_only";
  const [fatture, setFatture] = useState<File[]>([]);
  const [docAggiuntivi, setDocAggiuntivi] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; nome: string } | null>(null);
  const [productInput, setProductInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: stages = [] } = usePipelineStages("enea");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brand: "enea",
      cliente_email: "",
      ...(JSON.parse(storageTryGet(STORAGE_KEY) || "null") ?? {}),
    },
  });

  // Autosave ogni 30s
  useEffect(() => {
    const t = setInterval(() => {
      storageTrySet(STORAGE_KEY, JSON.stringify(getValues()));
    }, 30000);
    return () => clearInterval(t);
  }, [getValues]);

  const watchProduct = watch("prodotto_installato");
  useEffect(() => {
    setProductInput(watchProduct || "");
  }, [watchProduct]);

  const onDropFatture = useCallback((accepted: File[]) => {
    setFatture((prev) => [...prev, ...accepted].slice(0, 5));
  }, []);

  const onDropDocs = useCallback((accepted: File[]) => {
    setDocAggiuntivi((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps: getFattureProps, getInputProps: getFattureInput, isDragActive: isFattureDrag } =
    useDropzone({ onDrop: onDropFatture, accept: { "application/pdf": [], "image/*": [] }, maxSize: 10485760 });

  const { getRootProps: getDocsProps, getInputProps: getDocsInput, isDragActive: isDocsDrag } =
    useDropzone({ onDrop: onDropDocs, accept: { "application/pdf": [], "image/*": [] }, maxSize: 10485760 });

  const uploadFiles = async (files: File[], practiceId: string, folder: string) => {
    const urls: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const path = `${resellerId}/${practiceId}/${folder}/${file.name}`;
      const { error } = await supabase.storage.from("practice-documents").upload(path, file);
      if (error) {
        failed.push(file.name);
        console.error(`Upload failed for ${file.name}:`, error.message);
      } else {
        const { data } = supabase.storage.from("practice-documents").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    if (failed.length > 0) {
      toast({
        variant: "destructive",
        title: `${failed.length} file non caricati`,
        description: `Non è stato possibile caricare: ${failed.join(", ")}`,
      });
    }
    return urls;
  };

  // Campi da validare per ogni step del wizard (step 0→3)
  const stepFields: (keyof FormValues)[][] = [
    ["cliente_nome", "cliente_cognome", "cliente_telefono", "cliente_email"],
    ["brand", "prodotto_installato"],
    [],
    [],
  ];

  const nextStep = async () => {
    const fieldsToValidate = stepFields[step];
    const valid = await trigger(fieldsToValidate);
    if (!valid) return;
    if (step === 2 && fatture.length === 0) {
      toast({ variant: "destructive", title: "Fattura obbligatoria", description: "Carica almeno una fattura per procedere." });
      return;
    }
    setStep((s) => s + 1);
  };

  const saveDraft = () => {
    storageTrySet(STORAGE_KEY, JSON.stringify(getValues()));
    toast({ title: "Bozza salvata" });
  };

  const onSubmit = async (values: FormValues) => {
    if (!resellerId) return;
    setSubmitting(true);

    try {
      const inviataStage = stages.find((s) => s.stage_type === "inviata");

      const { data: practice, error } = await supabase
        .from("enea_practices")
        .insert({
          reseller_id: resellerId,
          current_stage_id: inviataStage?.id ?? null,
          brand: values.brand,
          cliente_nome: values.cliente_nome,
          cliente_cognome: values.cliente_cognome,
          cliente_email: values.cliente_email || null,
          cliente_telefono: values.cliente_telefono,
          cliente_indirizzo: null,
          cliente_cf: null,
          prodotto_installato: values.prodotto_installato,
          fornitore: values.fornitore || null,
          note: values.note || null,
          tipo_servizio: tipoServizio,
        })
        .select()
        .single();

      if (error || !practice) throw error;

      const [fattureUrls, docUrls] = await Promise.all([
        uploadFiles(fatture, practice.id, "fatture"),
        uploadFiles(docAggiuntivi, practice.id, "documenti"),
      ]);

      if (fattureUrls.length > 0 || docUrls.length > 0) {
        const { error: updateError } = await supabase
          .from("enea_practices")
          .update({ fatture_urls: fattureUrls, documenti_aggiuntivi_urls: docUrls })
          .eq("id", practice.id);
        if (updateError) throw updateError;
      }

      storageTryRemove(STORAGE_KEY);
      setSubmitted({ id: practice.id, nome: `${values.cliente_nome} ${values.cliente_cognome}` });
    } catch {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile inviare la pratica." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4 p-6">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold">Pratica inviata con successo!</h1>
        <p className="text-muted-foreground">
          La pratica per <strong>{submitted.nome}</strong> è stata creata. Riceverai una
          mail di conferma.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(null);
              setStep(0);
              setFatture([]);
              setDocAggiuntivi([]);
            }}
          >
            Invia altra pratica
          </Button>
          <Button asChild>
            <a href="/kanban">Vai alla Board</a>
          </Button>
        </div>
      </div>
    );
  }

  // ── Wizard steps 0–3 ────────────────────────────────────────────────────────

  const suggestions = PRODUCTS.filter(
    (p) => p.toLowerCase().includes(productInput.toLowerCase()) && productInput.length > 0
  );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Nuova Pratica ENEA / Conto Termico</h1>
        <Button variant="ghost" size="sm" onClick={saveDraft}>
          <Save className="h-4 w-4 mr-1" />
          Salva bozza
        </Button>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                i < step
                  ? "bg-green-500 text-white"
                  : i === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:block", i === step ? "font-medium" : "text-muted-foreground")}>
              {s}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Step 0 — Cliente */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input {...register("cliente_nome")} />
                {errors.cliente_nome && <p className="text-xs text-destructive">{errors.cliente_nome.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Cognome *</Label>
                <Input {...register("cliente_cognome")} />
                {errors.cliente_cognome && <p className="text-xs text-destructive">{errors.cliente_cognome.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" {...register("cliente_email")} />
              {errors.cliente_email && <p className="text-xs text-destructive">{errors.cliente_email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Telefono *</Label>
              <Input placeholder="+39 333 1234567" {...register("cliente_telefono")} />
              {errors.cliente_telefono && <p className="text-xs text-destructive">{errors.cliente_telefono.message}</p>}
            </div>
          </div>
        )}

        {/* Step 1 — Pratica */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Brand *</Label>
              <Select
                value={watch("brand")}
                onValueChange={(v) => setValue("brand", v as "enea" | "conto_termico")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enea">ENEA</SelectItem>
                  <SelectItem value="conto_termico">Conto Termico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 relative">
              <Label>Prodotto installato *</Label>
              <Input
                value={productInput}
                onChange={(e) => {
                  setProductInput(e.target.value);
                  setValue("prodotto_installato", e.target.value);
                  setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Es. Caldaia a condensazione"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-background border rounded-md mt-1 shadow-md">
                  {suggestions.map((s) => (
                    <li
                      key={s}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                      onMouseDown={() => {
                        setValue("prodotto_installato", s);
                        setProductInput(s);
                        setShowSuggestions(false);
                      }}
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {errors.prodotto_installato && (
                <p className="text-xs text-destructive">{errors.prodotto_installato.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Fornitore</Label>
              <Input {...register("fornitore")} />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea rows={3} {...register("note")} />
            </div>
          </div>
        )}

        {/* Step 2 — Documenti */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-950/20">
              <FolderOpen className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Documenti — carica i documenti del cliente
                </p>
                <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5">
                  La fattura è obbligatoria. Puoi aggiungere altri documenti utili alla pratica.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fattura * — max 5, PDF/JPG/PNG, max 10MB</Label>
              <div
                {...getFattureProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  isFattureDrag ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                )}
              >
                <input {...getFattureInput()} />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Trascina qui le fatture o <span className="text-primary">sfoglia</span>
                </p>
              </div>
              {fatture.length > 0 && (
                <ul className="space-y-1">
                  {fatture.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <button type="button" onClick={() => setFatture((p) => p.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label>Documenti aggiuntivi (opzionale)</Label>
              <div
                {...getDocsProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  isDocsDrag ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                )}
              >
                <input {...getDocsInput()} />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Trascina documenti aggiuntivi</p>
              </div>
              {docAggiuntivi.length > 0 && (
                <ul className="space-y-1">
                  {docAggiuntivi.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <button type="button" onClick={() => setDocAggiuntivi((p) => p.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Riepilogo */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Riepilogo pratica</h2>
            <div className="rounded-lg border divide-y text-sm">
              {[
                ["Nome cliente", `${watch("cliente_nome")} ${watch("cliente_cognome")}`],
                ["Email", watch("cliente_email") || "—"],
                ["Telefono", watch("cliente_telefono")],
                ["Brand", watch("brand") === "enea" ? "ENEA" : "Conto Termico"],
                ["Prodotto", watch("prodotto_installato")],
                ["Fatture", `${fatture.length} file`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between px-4 py-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Indietro
            </Button>
          ) : (
            <div />
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              Avanti
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Invia pratica
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
