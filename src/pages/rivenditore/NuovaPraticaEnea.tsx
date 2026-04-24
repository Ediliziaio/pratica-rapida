import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages } from "@/hooks/useEneaPractices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, Upload, X, Loader2, FileText,
  Sun, Home, Maximize2, Thermometer, Sparkles,
  FolderUp, User, Building2, AlertCircle, ExternalLink,
  HelpCircle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoFatturazione, TipoSoggetto, TipoServizio } from "@/integrations/supabase/types";

// ── Costanti ──────────────────────────────────────────────────────────────────
const ALLOWED_MIME = [
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const MAX_MB = 10;
const STORAGE_BUCKET = "enea-documents";

// Link moduli raccolta dati
const MODULI_URL = "https://drive.google.com/file/d/1ZZit5BsW1X0IkQ2_Xit5Jd8YRUuU6jrQ/view?usp=sharing";

type TipoProdotto = "schermature_solari" | "infissi" | "vepa" | "pompe_calore";

interface FileSlot {
  key: string;
  label: string;
  required: boolean;
  files: File[];
}

// ── Config prodotti ───────────────────────────────────────────────────────────
const PRODOTTI: {
  id: TipoProdotto;
  label: string;
  short: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { id: "schermature_solari", label: "Schermature Solari", short: "Schermature", icon: Sun, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { id: "infissi", label: "Infissi / Serramenti", short: "Infissi", icon: Home, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { id: "vepa", label: "VEPA – Vetrate Panoramiche", short: "VEPA", icon: Maximize2, color: "text-purple-600 bg-purple-50 border-purple-200" },
  { id: "pompe_calore", label: "Pompe di Calore / Climatizzazione", short: "Pompe di calore", icon: Thermometer, color: "text-green-600 bg-green-50 border-green-200" },
];

// ── Dropzone helper ───────────────────────────────────────────────────────────
function FileDropzone({
  label, required, files, onAdd, onRemove,
}: {
  label: string; required: boolean;
  files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const { toast } = useToast();

  const validate = useCallback((raw: File[]) => {
    const valid: File[] = [];
    raw.forEach((f) => {
      if (!ALLOWED_MIME.includes(f.type)) {
        toast({ variant: "destructive", title: "Formato non supportato", description: f.name });
      } else if (f.size > MAX_MB * 1024 * 1024) {
        toast({ variant: "destructive", title: "File troppo grande", description: `${f.name} supera ${MAX_MB}MB` });
      } else {
        valid.push(f);
      }
    });
    if (valid.length) onAdd(valid);
  }, [onAdd, toast]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        {required && <span className="text-destructive text-xs font-bold">*</span>}
      </div>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"
        )}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); validate(Array.from(e.dataTransfer.files)); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && ref.current?.click()}
      >
        <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-1.5" />
        <p className="text-sm text-muted-foreground">
          Trascina qui o <span className="text-primary font-medium">sfoglia</span>
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">PDF, JPG, PNG, DOCX · max {MAX_MB}MB</p>
        <input ref={ref} type="file" multiple hidden accept={ALLOWED_MIME.join(",")}
          onChange={(e) => { validate(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate text-xs">{f.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)}KB` : `${(f.size / 1024 / 1024).toFixed(1)}MB`}
              </span>
              <button type="button" onClick={() => onRemove(i)}
                className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Sezione con header ─────────────────────────────────────────────────────────
function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {number}
        </span>
        <h2 className="font-semibold text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Upload utility ─────────────────────────────────────────────────────────────
async function uploadFiles(
  files: File[],
  practiceId: string,
  tipo: string,
): Promise<{ urls: string[]; failed: string[] }> {
  const urls: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const path = `${practiceId}/${tipo}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (error) {
      console.error(`Upload failed for ${file.name}:`, error);
      failed.push(file.name);
    } else {
      urls.push(path);
    }
  }
  return { urls, failed };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NuovaPraticaEnea() {
  const { resellerId } = useAuth();
  const { toast } = useToast();
  const { data: stages = [] } = usePipelineStages("enea");

  // ── State ─────────────────────────────────────────────────────────────────
  const [tipoServizio, setTipoServizio] = useState<TipoServizio | null>(null);
  const [tipoProdotto, setTipoProdotto] = useState<TipoProdotto | null>(null);
  const [tipoSoggetto, setTipoSoggetto] = useState<TipoSoggetto | null>(null);
  const [tipoFatturazione, setTipoFatturazione] = useState<TipoFatturazione | null>(null);

  // Dati cliente
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cf, setCf] = useState("");          // codice fiscale o P.IVA
  const [indirizzo, setIndirizzo] = useState("");
  const [note, setNote] = useState("");

  // Documenti: fattura sempre presente + slot condizionali
  const [fatturaFiles, setFatturaFiles] = useState<File[]>([]);
  const [docExtra1, setDocExtra1] = useState<File[]>([]); // doc condizionale 1
  const [docExtra2, setDocExtra2] = useState<File[]>([]); // doc condizionale 2 (solo pompe di calore: libretto)
  const [flagDocCompleto, setFlagDocCompleto] = useState<boolean | null>(null); // risposta al flag

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; nome: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Config documenti per prodotto ─────────────────────────────────────────
  const getDocConfig = (prodotto: TipoProdotto | null) => {
    if (!prodotto) return null;
    switch (prodotto) {
      case "schermature_solari":
        return {
          flagQuestion: "La fattura riporta il valore GTOT e le dimensioni del prodotto?",
          extraLabel: "Documento con misure e valore GTOT",
          hasExtra: true,
          hasLibretto: false,
        };
      case "infissi":
        return {
          flagQuestion: "La fattura riporta il valore di trasmittanza?",
          extraLabel: "Certificati di trasmittanza",
          hasExtra: true,
          hasLibretto: false,
        };
      case "vepa":
        return {
          flagQuestion: "La fattura riporta il valore di trasmittanza e le dimensioni?",
          extraLabel: "Certificati di trasmittanza e misure",
          hasExtra: true,
          hasLibretto: false,
        };
      case "pompe_calore":
        return {
          flagQuestion: null, // nessun flag — libretto obbligatorio
          extraLabel: null,
          hasExtra: false,
          hasLibretto: true,
        };
    }
  };

  const docConfig = getDocConfig(tipoProdotto);

  // ── Validazione ────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!tipoServizio)     e.tipoServizio = "Seleziona il tipo di servizio";
    if (!tipoProdotto)     e.tipoProdotto = "Seleziona il prodotto";
    if (!tipoSoggetto)     e.tipoSoggetto = "Seleziona il tipo di soggetto";
    if (!tipoFatturazione) e.tipoFatturazione = "Seleziona la fatturazione";
    if (!nome.trim())      e.nome = "Nome obbligatorio";
    if (!cognome.trim())   e.cognome = "Cognome obbligatorio";
    if (!telefono.trim())  e.telefono = "Telefono obbligatorio";
    if (fatturaFiles.length === 0) e.fattura = "La fattura è obbligatoria";
    // Pompe di calore: libretto obbligatorio
    if (tipoProdotto === "pompe_calore" && docExtra2.length === 0)
      e.libretto = "Il libretto dell'impianto è obbligatorio";
    // Prodotti con flag: se NO → doc extra obbligatorio
    if (docConfig?.hasExtra && flagDocCompleto === false && docExtra1.length === 0)
      e.docExtra1 = "Il documento aggiuntivo è obbligatorio";
    if (docConfig?.hasExtra && flagDocCompleto === null)
      e.flagDoc = "Rispondi alla domanda sui documenti";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll al primo errore
      setTimeout(() => document.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    if (!resellerId) {
      toast({
        variant: "destructive",
        title: "Errore autenticazione",
        description: "Nessun rivenditore associato all'utente. Esci e rientra.",
      });
      return;
    }
    if (!stages.length) {
      toast({
        variant: "destructive",
        title: "Pipeline non configurata",
        description: "Nessuno stage disponibile. Contatta il supporto.",
      });
      return;
    }
    setSubmitting(true);

    try {
      // Trova stage iniziale in base al tipo servizio
      // servizio_completo → "inviata"; documenti_forniti → "pronte_da_fare"
      const targetStageType = tipoServizio === "servizio_completo" ? "inviata" : "pronte_da_fare";
      const initialStage = stages.find((s) => s.stage_type === targetStageType) ?? stages[0];

      const prodottoLabel = PRODOTTI.find((p) => p.id === tipoProdotto)?.label ?? tipoProdotto ?? "";

      const { data: practice, error: insertError } = await supabase
        .from("enea_practices")
        .insert({
          reseller_id: resellerId,
          brand: "enea",
          current_stage_id: initialStage?.id ?? null,
          tipo_servizio: tipoServizio === "documenti_forniti" ? "documenti_forniti" : "servizio_completo",
          tipo_fatturazione: tipoFatturazione,
          tipo_soggetto: tipoSoggetto,
          prodotto_installato: prodottoLabel,
          cliente_nome: nome.trim(),
          cliente_cognome: cognome.trim(),
          cliente_email: email.trim() || null,
          cliente_telefono: telefono.trim(),
          cliente_cf: cf.trim() || null,
          cliente_indirizzo: indirizzo.trim() || null,
          note: note.trim() || null,
          fatture_urls: [],
          documenti_enea_urls: [],
          documenti_aggiuntivi_urls: [],
          documenti_mancanti: [],
        })
        .select()
        .single();

      if (insertError || !practice) throw insertError ?? new Error("Insert fallito");

      // Upload documenti in parallelo
      const [fatture, docExtra, docExtra2Res] = await Promise.all([
        uploadFiles(fatturaFiles, practice.id, "fattura"),
        uploadFiles(docExtra1, practice.id, "doc_extra"),
        uploadFiles(docExtra2, practice.id, "libretto"),
      ]);

      const allFailed = [...fatture.failed, ...docExtra.failed, ...docExtra2Res.failed];
      if (allFailed.length > 0) {
        toast({
          variant: "destructive",
          title: "Alcuni file non sono stati caricati",
          description: `Riprova dal dettaglio pratica per: ${allFailed.join(", ")}`,
        });
      }

      if (fatture.urls.length || docExtra.urls.length || docExtra2Res.urls.length) {
        await supabase.from("enea_practices").update({
          fatture_urls: fatture.urls,
          documenti_aggiuntivi_urls: [...docExtra.urls, ...docExtra2Res.urls],
        }).eq("id", practice.id);
      }

      // Trigger automations for "servizio_completo"
      if (tipoServizio === "servizio_completo") {
        supabase.functions.invoke("on-practice-created", {
          body: { practice_id: practice.id },
        }).catch(console.error); // non-blocking
      }

      setSubmitted({ id: practice.id, nome: `${nome.trim()} ${cognome.trim()}` });
    } catch (err: unknown) {
      console.error(err);
      toast({ variant: "destructive", title: "Errore", description: "Impossibile inviare la pratica. Riprova." });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTipoServizio(null); setTipoProdotto(null);
    setTipoSoggetto(null); setTipoFatturazione(null);
    setNome(""); setCognome(""); setEmail(""); setTelefono("");
    setCf(""); setIndirizzo(""); setNote("");
    setFatturaFiles([]); setDocExtra1([]); setDocExtra2([]);
    setFlagDocCompleto(null); setErrors({});
    setSubmitted(null);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-5 p-6">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold">Pratica inviata!</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          La pratica per <strong>{submitted.nome}</strong> è stata creata con successo.
          {tipoServizio === "servizio_completo"
            ? " Il nostro team contatterà il cliente a breve."
            : " La pratica è in lavorazione."}
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={resetForm}>Nuova pratica</Button>
          <Button asChild><a href="/kanban">Vai alla Board</a></Button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5 pb-16">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nuova Pratica ENEA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Completa tutte le sezioni, poi invia. La pagina si salva automaticamente.
        </p>
      </div>

      {/* ── 1. Tipo di Servizio ──────────────────────────────────────────── */}
      <Section number={1} title="Tipo di servizio">
        {errors.tipoServizio && (
          <p className="text-xs text-destructive flex items-center gap-1" data-error>
            <AlertCircle className="h-3.5 w-3.5" />{errors.tipoServizio}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Servizio Completo */}
          <button
            type="button"
            onClick={() => setTipoServizio("servizio_completo")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
              tipoServizio === "servizio_completo"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                tipoServizio === "servizio_completo" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              )}>
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">Servizio Completo</p>
                <Badge variant="outline" className="text-[10px] mt-0.5 border-primary/30 text-primary">Consigliato</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Inserisci solo i dati del cliente e la fattura.
              <strong className="text-foreground"> Pratica Rapida contatta il cliente</strong>, raccoglie i documenti e gestisce tutto.
            </p>
          </button>

          {/* Documenti Forniti */}
          <button
            type="button"
            onClick={() => setTipoServizio("documenti_forniti")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
              tipoServizio === "documenti_forniti"
                ? "border-foreground/60 bg-muted/30"
                : "border-border hover:border-foreground/30"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                tipoServizio === "documenti_forniti" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                <FolderUp className="h-5 w-5" />
              </div>
              <p className="font-semibold text-sm leading-tight">Documenti Forniti</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fornisci tu <strong className="text-foreground">tutti i documenti</strong>.
              Pratica Rapida prepara e invia la pratica direttamente.
            </p>
          </button>
        </div>
      </Section>

      {/* ── 2. Tipo di Prodotto ──────────────────────────────────────────── */}
      <Section number={2} title="Tipo di prodotto installato">
        {errors.tipoProdotto && (
          <p className="text-xs text-destructive flex items-center gap-1" data-error>
            <AlertCircle className="h-3.5 w-3.5" />{errors.tipoProdotto}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-2.5">
          {PRODOTTI.map((prod) => {
            const Icon = prod.icon;
            const selected = tipoProdotto === prod.id;
            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => {
                  setTipoProdotto(prod.id);
                  setFlagDocCompleto(null);
                  setDocExtra1([]);
                  setDocExtra2([]);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3.5 text-left transition-all hover:shadow-sm focus:outline-none",
                  selected ? `border-current ${prod.color}` : "border-border hover:border-foreground/20"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                  selected ? prod.color : "bg-muted"
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight">{prod.label}</p>
                </div>
                {selected && (
                  <CheckCircle className="h-4 w-4 ml-auto shrink-0 text-current" />
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 3. Tipo di Soggetto ──────────────────────────────────────────── */}
      <Section number={3} title="Tipo di soggetto">
        {errors.tipoSoggetto && (
          <p className="text-xs text-destructive flex items-center gap-1" data-error>
            <AlertCircle className="h-3.5 w-3.5" />{errors.tipoSoggetto}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { id: "persona_fisica" as TipoSoggetto, label: "Persona Fisica", desc: "Privato cittadino — Codice Fiscale", Icon: User },
            { id: "azienda_piva" as TipoSoggetto, label: "Azienda con P.IVA", desc: "Impresa o professionista con P.IVA", Icon: Building2 },
          ].map(({ id, label, desc, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipoSoggetto(id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
                tipoSoggetto === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              )}
            >
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                tipoSoggetto === id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* ── 4. Fatturazione ──────────────────────────────────────────────── */}
      <Section number={4} title="Fatturazione del servizio">
        {errors.tipoFatturazione && (
          <p className="text-xs text-destructive flex items-center gap-1" data-error>
            <AlertCircle className="h-3.5 w-3.5" />{errors.tipoFatturazione}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTipoFatturazione("rivenditore")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
              tipoFatturazione === "rivenditore" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            )}
          >
            <p className="font-semibold text-sm">A carico mio (rivenditore)</p>
            <p className="text-xs text-muted-foreground mt-1">
              <strong className="text-foreground">€ 65 + IVA 22%</strong> — fatturazione mensile posticipata tramite bonifico
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTipoFatturazione("cliente_finale")}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
              tipoFatturazione === "cliente_finale" ? "border-amber-400 bg-amber-50" : "border-border hover:border-amber-300"
            )}
          >
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">A carico del cliente finale</p>
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0">CF</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Il costo del servizio è a carico del cliente che beneficia della detrazione
            </p>
          </button>
        </div>
      </Section>

      {/* ── 5. Dati Cliente Finale ───────────────────────────────────────── */}
      <Section number={5} title="Dati del cliente finale">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome" className="text-sm">Nome *</Label>
            <Input id="nome" value={nome} onChange={(e) => { setNome(e.target.value); setErrors((p) => ({ ...p, nome: "" })); }}
              placeholder="Mario" className={errors.nome ? "border-destructive" : ""} />
            {errors.nome && <p className="text-xs text-destructive" data-error>{errors.nome}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cognome" className="text-sm">Cognome *</Label>
            <Input id="cognome" value={cognome} onChange={(e) => { setCognome(e.target.value); setErrors((p) => ({ ...p, cognome: "" })); }}
              placeholder="Rossi" className={errors.cognome ? "border-destructive" : ""} />
            {errors.cognome && <p className="text-xs text-destructive" data-error>{errors.cognome}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="telefono" className="text-sm">Telefono *</Label>
            <Input id="telefono" value={telefono} onChange={(e) => { setTelefono(e.target.value); setErrors((p) => ({ ...p, telefono: "" })); }}
              placeholder="+39 333 1234567" className={errors.telefono ? "border-destructive" : ""} />
            {errors.telefono && <p className="text-xs text-destructive" data-error>{errors.telefono}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="mario@esempio.it" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cf" className="text-sm">
              {tipoSoggetto === "azienda_piva" ? "Partita IVA" : "Codice Fiscale"}
            </Label>
            <Input id="cf" value={cf} onChange={(e) => setCf(e.target.value.toUpperCase())}
              placeholder={tipoSoggetto === "azienda_piva" ? "12345678901" : "RSSMRA80A01H501Z"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="indirizzo" className="text-sm">Indirizzo immobile</Label>
            <Input id="indirizzo" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)}
              placeholder="Via Roma 1, Milano" />
          </div>
        </div>
      </Section>

      {/* ── 6. Documenti ────────────────────────────────────────────────── */}
      <Section number={6} title="Documenti da allegare">
        {/* Link moduli raccolta dati */}
        <a
          href={MODULI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Scarica i moduli di raccolta dati
        </a>

        {/* Fattura — sempre obbligatoria */}
        {errors.fattura && (
          <p className="text-xs text-destructive flex items-center gap-1" data-error>
            <AlertCircle className="h-3.5 w-3.5" />{errors.fattura}
          </p>
        )}
        <FileDropzone
          label="Fattura di acquisto/installazione"
          required
          files={fatturaFiles}
          onAdd={(f) => setFatturaFiles((p) => [...p, ...f])}
          onRemove={(i) => setFatturaFiles((p) => p.filter((_, j) => j !== i))}
        />

        {/* Logica condizionale per prodotto */}
        {tipoProdotto && tipoProdotto !== "pompe_calore" && docConfig?.hasExtra && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 p-4">
            <div className="flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{docConfig.flagQuestion}</p>
            </div>
            {errors.flagDoc && (
              <p className="text-xs text-destructive flex items-center gap-1" data-error>
                <AlertCircle className="h-3.5 w-3.5" />{errors.flagDoc}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setFlagDocCompleto(true); setErrors((p) => ({ ...p, flagDoc: "" })); }}
                className={cn(
                  "flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all",
                  flagDocCompleto === true ? "border-green-500 bg-green-50 text-green-700" : "border-border hover:border-green-400"
                )}
              >
                ✅ Sì
              </button>
              <button
                type="button"
                onClick={() => { setFlagDocCompleto(false); setErrors((p) => ({ ...p, flagDoc: "" })); }}
                className={cn(
                  "flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all",
                  flagDocCompleto === false ? "border-amber-500 bg-amber-50 text-amber-700" : "border-border hover:border-amber-400"
                )}
              >
                ❌ No
              </button>
            </div>

            {/* Se risposta è NO → campo obbligatorio */}
            {flagDocCompleto === false && (
              <div className="pt-1">
                {errors.docExtra1 && (
                  <p className="text-xs text-destructive flex items-center gap-1 mb-2" data-error>
                    <AlertCircle className="h-3.5 w-3.5" />{errors.docExtra1}
                  </p>
                )}
                <FileDropzone
                  label={docConfig.extraLabel!}
                  required
                  files={docExtra1}
                  onAdd={(f) => setDocExtra1((p) => [...p, ...f])}
                  onRemove={(i) => setDocExtra1((p) => p.filter((_, j) => j !== i))}
                />
              </div>
            )}
          </div>
        )}

        {/* Pompe di calore: libretto impianto obbligatorio */}
        {tipoProdotto === "pompe_calore" && (
          <div className="space-y-2">
            {errors.libretto && (
              <p className="text-xs text-destructive flex items-center gap-1" data-error>
                <AlertCircle className="h-3.5 w-3.5" />{errors.libretto}
              </p>
            )}
            <FileDropzone
              label="Libretto dell'impianto (marca e modello)"
              required
              files={docExtra2}
              onAdd={(f) => setDocExtra2((p) => [...p, ...f])}
              onRemove={(i) => setDocExtra2((p) => p.filter((_, j) => j !== i))}
            />
          </div>
        )}

        {!tipoProdotto && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            Seleziona il prodotto nella sezione 2 per vedere i documenti richiesti.
          </div>
        )}
      </Section>

      {/* ── 7. Note aggiuntive ───────────────────────────────────────────── */}
      <Section number={7} title="Note aggiuntive (opzionale)">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Informazioni aggiuntive sulla pratica o sul cliente..."
          rows={3}
          maxLength={2000}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground text-right">{note.length}/2000</p>
      </Section>

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4">
        <div className="rounded-xl border bg-card/95 backdrop-blur p-4 shadow-lg flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {[tipoServizio && (tipoServizio === "servizio_completo" ? "Servizio Completo" : "Documenti Forniti"),
              PRODOTTI.find((p) => p.id === tipoProdotto)?.short,
              tipoFatturazione === "cliente_finale" ? "CF" : tipoFatturazione === "rivenditore" ? "€65" : undefined,
            ].filter(Boolean).join(" · ")}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="ml-auto"
            size="lg"
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Invio in corso...</>
            ) : (
              "Invia Pratica ENEA"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
