import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePipelineStages } from "@/hooks/useEneaPractices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, Upload, X, Loader2, FileText,
  Sun, Home, Maximize2, Thermometer, Sparkles,
  FolderUp, User, Building2, AlertCircle, ExternalLink,
  HelpCircle, Info, Layers, Calendar as CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { it } from "date-fns/locale";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Centesimi → "€ 183,00". Gli importi girano sempre in centesimi: 150 * 1.22
 *  in floating point non fa esattamente 183. */
const euro = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/** "150,00 € + IVA (183,00 €)" — il totale secco non dice nulla: la gente
 *  deve vedere imponibile e IVA separati, come su un preventivo. */
const euroScomposto = (p: { imponibileCents: number; totaleCents: number }) =>
  `${euro(p.imponibileCents)} + IVA (${euro(p.totaleCents)})`;

type TipoProdotto = "schermature_solari" | "infissi" | "vepa" | "pompe_calore" | "insufflaggio_tetti";

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
  { id: "insufflaggio_tetti", label: "Insufflaggio Tetti", short: "Insufflaggio", icon: Layers, color: "text-orange-600 bg-orange-50 border-orange-200" },
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
/**
 * Form Nuova Pratica ENEA. Stesso componente usato in due contesti:
 *  - interno (/enea/nuova): rivenditore/staff loggato → insert diretto
 *  - pubblico (publicMode, /area-riservata-vecchia/pratica-enea): senza
 *    login → invio via edge function `richiesta-pubblica`, con in più i
 *    campi azienda (ragione sociale, email, telefono).
 */
// Contratto di servizio: da oggi ogni pratica richiede l'accettazione del
// rivenditore. Il PDF sta in /public; la versione viene registrata sulla
// pratica come prova di quale testo e stato accettato.
const CONTRATTO_URL = "/contratto-di-servizio.pdf";
const CONTRATTO_VERSIONE = "2026-08-03";

export default function NuovaPraticaEnea({ publicMode = false }: { publicMode?: boolean } = {}) {
  const { resellerId, isInternal } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: stages = [] } = usePipelineStages("enea");

  // ── Chi sta compilando (solo publicMode) ──
  // Sul sito il modulo è aperto a due pubblici diversi: il rivenditore che
  // carica la pratica per un suo cliente (paga a fine mese, condizioni
  // concordate) e il privato che vuole la pratica per casa propria (paga
  // subito con carta). Cambiano i campi richiesti e il flusso di invio.
  const [richiedenteTipo, setRichiedenteTipo] = useState<"rivenditore" | "privato" | null>(null);
  const isPrivato = publicMode && richiedenteTipo === "privato";

  // ── Campi azienda (solo publicMode + rivenditore) ──
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [aziendaEmail, setAziendaEmail] = useState("");
  const [aziendaTelefono, setAziendaTelefono] = useState("");
  // Consenso condizioni di pagamento (publicMode, solo se paga il rivenditore)
  const [accettoPagamento, setAccettoPagamento] = useState(false);
  // Accettazione del contratto di servizio: obbligatoria per ogni pratica.
  const [accettoContratto, setAccettoContratto] = useState(false);

  // Prezzo per il cliente privato: sta in platform_settings così lo staff può
  // cambiarlo senza un deploy. Qui serve solo per MOSTRARLO: la cifra che
  // finisce su Stripe la rilegge `stripe-checkout` dal DB, altrimenti
  // basterebbe modificare la richiesta dal browser per pagare meno.
  const { data: prezzoPrivato } = useQuery({
    queryKey: ["prezzo-privato-enea"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "prezzo_privato_enea")
        .maybeSingle();
      const v = (data?.value ?? {}) as {
        imponibile_cents?: number;
        iva_percent?: number;
        attivo?: boolean;
      };
      // Nessun default di comodo: se il prezzo non è configurato il percorso
      // privato resta chiuso, invece di addebitare una cifra inventata.
      const imponibile = v.imponibile_cents ?? 0;
      const iva = v.iva_percent ?? 0;
      return {
        imponibileCents: imponibile,
        ivaPercent: iva,
        totaleCents: Math.round(imponibile * (1 + iva / 100)),
        attivo: v.attivo !== false && imponibile > 0,
      };
    },
  });
  const privatoDisponibile = prezzoPrivato ? prezzoPrivato.attivo : true;


  // For staff (super_admin/operatore) who don't have a resellerId, let them pick
  // the company (reseller) that will own the practice. Direct-channel clients.
  const [staffSelectedCompanyId, setStaffSelectedCompanyId] = useState<string>("");
  const { data: allCompanies = [] } = useQuery({
    queryKey: ["nuova-pratica-companies"],
    enabled: isInternal,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .eq("is_active", true)
        .order("ragione_sociale");
      return data ?? [];
    },
  });
  const effectiveResellerId = isInternal ? staffSelectedCompanyId || null : resellerId;

  // Listino CF personalizzato dell'azienda (companies.prezzo_cf_imponibile_cents):
  // nel portale sappiamo chi e' il rivenditore, quindi l'avviso "al tuo cliente
  // chiederemo X" deve mostrare il SUO prezzo, non lo standard. Dal sito
  // l'azienda si abbina solo dopo l'invio → si mostra lo standard con riserva.
  const { data: prezzoCfAzienda } = useQuery({
    queryKey: ["prezzo-cf-azienda", effectiveResellerId],
    enabled: !publicMode && !!effectiveResellerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("prezzo_cf_imponibile_cents")
        .eq("id", effectiveResellerId!)
        .maybeSingle();
      return data?.prezzo_cf_imponibile_cents ?? null;
    },
  });
  // Prezzo mostrato nell'avviso CF: override azienda se c'e', altrimenti listino.
  const prezzoCf =
    prezzoPrivato && prezzoCfAzienda
      ? {
          imponibileCents: prezzoCfAzienda,
          totaleCents: Math.round(prezzoCfAzienda * (1 + prezzoPrivato.ivaPercent / 100)),
        }
      : prezzoPrivato;

  // ── State ─────────────────────────────────────────────────────────────────
  const [tipoServizio, setTipoServizio] = useState<TipoServizio | null>(null);
  // Solo per "documenti_forniti": il rivenditore sceglie se allegare i moduli
  // cartacei compilati ("moduli_cartacei") o compilare il form online a nome
  // del cliente ("form_online").
  const [documentiMode, setDocumentiMode] = useState<"moduli_cartacei" | "form_online" | null>(null);
  // Solo per "documenti_forniti": con questo servizio il cliente non viene mai
  // contattato, ma il rivenditore può volere che la pratica conclusa gli venga
  // comunque inviata. null = non ha ancora risposto (la domanda è obbligatoria).
  const [inviaPraticaCliente, setInviaPraticaCliente] = useState<boolean | null>(null);
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
  const [dataFineLavori, setDataFineLavori] = useState<Date | undefined>();
  const [note, setNote] = useState("");

  // Documenti: fattura sempre presente + slot condizionali
  const [fatturaFiles, setFatturaFiles] = useState<File[]>([]);
  const [docExtra1, setDocExtra1] = useState<File[]>([]); // doc condizionale 1
  const [docExtra2, setDocExtra2] = useState<File[]>([]); // doc condizionale 2 (solo pompe di calore: libretto)
  // Moduli di raccolta dati compilati — obbligatori SOLO se tipoServizio === "documenti_forniti".
  // Valido per tutti i prodotti (schermature, infissi, vepa, pompe di calore, insufflaggio tetti).
  const [moduliRaccoltaFiles, setModuliRaccoltaFiles] = useState<File[]>([]);
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
        // VEPA: NON serve la trasmittanza. Servono fattura + metri quadri delle
        // vetrate (solo fattura se i mq sono già indicati in fattura).
        return {
          flagQuestion: "La fattura riporta i metri quadri delle vetrate (VEPA)?",
          extraLabel: "Documento con i metri quadri delle VEPA",
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
      case "insufflaggio_tetti":
        // Insufflaggio tetti: flusso identico agli infissi MA con domanda
        // specifica su spessore + conducibilità termica. Se NO → allegato
        // aggiuntivo obbligatorio con questi dati.
        return {
          flagQuestion: "La fattura riporta lo spessore dell'insufflaggio e la conducibilità termica?",
          extraLabel: "Documento con spessore insufflaggio e conducibilità termica",
          hasExtra: true,
          hasLibretto: false,
        };
    }
  };

  const docConfig = getDocConfig(tipoProdotto);

  // ── Validazione ────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (publicMode) {
      if (!richiedenteTipo) e.richiedenteTipo = "Indica se sei un rivenditore o un cliente privato";
      // I dati azienda li chiediamo solo al rivenditore: il privato un'azienda
      // non ce l'ha, e obbligarlo a inventarsi una ragione sociale lo blocca.
      if (richiedenteTipo === "rivenditore") {
        if (ragioneSociale.trim().length < 2) e.ragioneSociale = "Ragione sociale obbligatoria";
        if (!EMAIL_RE.test(aziendaEmail.trim())) e.aziendaEmail = "Email aziendale non valida";
        if (aziendaTelefono.replace(/\D/g, "").length < 8) e.aziendaTelefono = "Telefono azienda obbligatorio";
      }
      // Al privato l'email non è facoltativa: è lì che arrivano la ricevuta
      // Stripe e il link per completare i dati della pratica.
      if (isPrivato && !EMAIL_RE.test(email.trim())) {
        e.email = "Email obbligatoria: ci serve per la ricevuta e per farti completare la pratica";
      }
      if (!accettoPagamento) e.accettoPagamento = "Devi accettare le condizioni per inviare la richiesta";
    }
    // Contratto di servizio: obbligatorio per ogni pratica, in ogni modalità.
    if (!accettoContratto) e.accettoContratto = "Devi accettare le condizioni di servizio per inviare la pratica";
    if (!tipoServizio)     e.tipoServizio = "Seleziona il tipo di servizio";
    if (!tipoProdotto)     e.tipoProdotto = "Seleziona il prodotto";
    if (!tipoSoggetto)     e.tipoSoggetto = "Seleziona il tipo di soggetto";
    if (!tipoFatturazione) e.tipoFatturazione = "Seleziona la fatturazione";
    if (!nome.trim())      e.nome = "Nome obbligatorio";
    if (!cognome.trim())   e.cognome = "Cognome obbligatorio";
    if (!telefono.trim())  e.telefono = "Telefono obbligatorio";
    if (!dataFineLavori)   e.dataFineLavori = "La data di fine lavori è obbligatoria";
    if (fatturaFiles.length === 0) e.fattura = "La fattura è obbligatoria";
    // Documenti forniti: i moduli di raccolta dati compilati sono obbligatori per ogni prodotto
    if (tipoServizio === "documenti_forniti" && !documentiMode)
      e.documentiMode = "Scegli se allegare i moduli cartacei o compilare il form online";
    // I moduli di raccolta dati sono obbligatori SOLO se si è scelto il cartaceo.
    if (tipoServizio === "documenti_forniti" && documentiMode === "moduli_cartacei" && moduliRaccoltaFiles.length === 0)
      e.moduliRaccolta = "I moduli di raccolta dati compilati sono obbligatori";
    // Contattare o no il cliente è una decisione di chi compila: niente default.
    if (tipoServizio === "documenti_forniti" && inviaPraticaCliente === null)
      e.inviaPraticaCliente = "Rispondi se dobbiamo mandare la pratica al cliente";
    // "Sì" senza email = promessa che non possiamo mantenere: la pratica si
    // consegna via email, quindi qui l'email diventa obbligatoria.
    if (tipoServizio === "documenti_forniti" && inviaPraticaCliente === true && !email.trim())
      e.email = "Serve l'email del cliente per potergli inviare la pratica";
    // A carico del cliente finale: il link per pagare arriva via email. Senza,
    // non c'e' nessun modo di raggiungerlo e la pratica resta ferma.
    if (!isPrivato && tipoFatturazione === "cliente_finale" && !EMAIL_RE.test(email.trim()))
      e.email = "Serve l'email del cliente: e' li' che arriva il link per il pagamento";
    // Pompe di calore: libretto obbligatorio
    if (tipoProdotto === "pompe_calore" && docExtra2.length === 0)
      e.libretto = "Il certificato F-GAS è obbligatorio";
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
    // ── PUBLIC MODE: invio via edge function (no login, no insert diretto) ──
    if (publicMode) {
      setSubmitting(true);
      try {
        const prodottoLabel = PRODOTTI.find((p) => p.id === tipoProdotto)?.label ?? tipoProdotto ?? "";
        const payload = {
          modulo: "pratica-enea",
          prodotto: prodottoLabel,
          richiedente_tipo: richiedenteTipo ?? "rivenditore",
          // Il privato paga prima che la pratica entri in lavorazione: niente
          // messaggio "completa i tuoi dati" adesso, lo mandiamo noi al
          // /form/:token subito dopo il pagamento.
          requires_payment: isPrivato,
          tipo_servizio: tipoServizio,
          // Sotto-modalità documenti_forniti: cartacei (tutto allegato → pronte
          // da fare) vs form online (il rivenditore compila lui il /form).
          documenti_mode: tipoServizio === "documenti_forniti" ? documentiMode : undefined,
          // Solo documenti_forniti: il rivenditore ha scelto se farci inviare la
          // pratica conclusa al suo cliente.
          invia_pratica_al_cliente: tipoServizio === "documenti_forniti" && inviaPraticaCliente === true,
          tipo_fatturazione: tipoFatturazione,
          tipo_soggetto: tipoSoggetto,
          azienda: isPrivato
            ? undefined
            : {
                ragione_sociale: ragioneSociale.trim(),
                email: aziendaEmail.trim(),
                telefono: aziendaTelefono.trim(),
              },
          cliente: {
            nome: nome.trim(),
            cognome: cognome.trim(),
            telefono: telefono.trim(),
            email: email.trim() || undefined,
            cf: cf.trim() || undefined,
            indirizzo: indirizzo.trim() || undefined,
          },
          data_fine_lavori: dataFineLavori ? format(dataFineLavori, "yyyy-MM-dd") : undefined,
          note: note.trim() || undefined,
        };
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        fatturaFiles.forEach((f) => fd.append("fattura", f));
        docExtra1.forEach((f) => fd.append("doc_extra", f));
        docExtra2.forEach((f) => fd.append("libretto", f));
        moduliRaccoltaFiles.forEach((f) => fd.append("moduli_raccolta", f));

        const { data, error: fnErr } = await supabase.functions.invoke("richiesta-pubblica", { body: fd });
        if (fnErr) throw new Error(fnErr.message);
        const res = data as {
          success: boolean;
          error?: string;
          form_token?: string | null;
          practice_id?: string;
        };
        if (!res.success) throw new Error(res.error ?? "Invio fallito");

        // ── Cliente privato: si passa dalla cassa ──
        // La pratica esiste già ma resta non pagata finché Stripe non conferma
        // (stripe-webhook → pagamento_stato='pagata'). A pagamento riuscito
        // Stripe riporta l'utente sul suo /form/:token per i dati tecnici.
        if (isPrivato) {
          if (!res.practice_id) {
            throw new Error(
              "Richiesta registrata ma senza riferimento per il pagamento. Scrivici su WhatsApp e la completiamo noi.",
            );
          }
          const { data: checkout, error: checkoutErr } = await supabase.functions.invoke("stripe-checkout", {
            body: {
              practice_id: res.practice_id,
              // L'importo NON lo passiamo da qui: lo legge la function dal DB.
              pricing_key: "prezzo_privato_enea",
              success: "form",
              email: email.trim(),
              descrizione: `Pratica ENEA — ${prodottoLabel}`,
            },
          });
          // Attenzione ai messaggi da qui in giù: la pratica È GIÀ STATA
          // CREATA. Dire "riprova" farebbe ricompilare tutto e creerebbe un
          // doppione non pagato, quindi rimandiamo al supporto.
          if (checkoutErr) {
            // supabase-js sugli status non-2xx non espone il body: senza
            // leggerlo dal Response allegato l'utente vedrebbe solo
            // "Edge Function returned a non-2xx status code".
            let msg = checkoutErr.message;
            const ctx = (checkoutErr as { context?: Response }).context;
            if (ctx && typeof ctx.json === "function") {
              try { msg = (await ctx.json())?.error ?? msg; } catch { /* body non JSON */ }
            }
            throw new Error(`${msg} — la tua richiesta è stata registrata: scrivici e completiamo noi il pagamento, non ricompilare il modulo.`);
          }
          const co = checkout as { url?: string; error?: string };
          if (!co?.url) {
            throw new Error(
              co?.error ??
                "Non riusciamo ad aprire la pagina di pagamento. La tua richiesta è stata registrata: scrivici e la completiamo noi.",
            );
          }
          window.location.href = co.url;
          return;
        }

        // SOLO con "form online" il rivenditore viene mandato a compilare il
        // modulo. Con i moduli cartacei ci ha già dato tutto → conferma e basta
        // (la pratica è già in "pronte da fare", il cliente NON viene contattato).
        if (tipoServizio === "documenti_forniti" && documentiMode === "form_online" && res.form_token) {
          navigate(`/form/${res.form_token}`);
          return;
        }
        setSubmitted({ id: "public", nome: `${nome.trim()} ${cognome.trim()}` });
      } catch (err) {
        toast({ variant: "destructive", title: "Errore invio", description: err instanceof Error ? err.message : "Riprova tra poco" });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!effectiveResellerId) {
      toast({
        variant: "destructive",
        title: isInternal ? "Seleziona un'azienda" : "Errore autenticazione",
        description: isInternal
          ? "Scegli l'azienda (rivenditore) a cui assegnare la pratica."
          : "Nessun rivenditore associato all'utente. Esci e rientra.",
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
      // Trova stage iniziale in base al tipo servizio:
      // - servizio_completo → "inviata" (in attesa che il cliente compili il modulo)
      // - documenti_forniti → "attesa_compilazione" (il rivenditore deve completare lui
      //   il modulo cliente; dopo il submit del form la pratica viene promossa a
      //   "pronte_da_fare" via submit_form_by_token RPC + on-stage-changed)
      // Stage iniziale:
      //  - servizio_completo → "inviata"
      //  - documenti_forniti + moduli cartacei → "pronte_da_fare" (tutto fornito)
      //  - documenti_forniti + form online → "attesa_compilazione" (il rivenditore
      //    compilerà il form a nome del cliente, poi diventa pronte_da_fare)
      const targetStageType =
        tipoServizio === "servizio_completo"
          ? "inviata"
          : documentiMode === "moduli_cartacei"
            ? "pronte_da_fare"
            : "attesa_compilazione";
      const initialStage = stages.find((s) => s.stage_type === targetStageType) ?? stages[0];

      const prodottoLabel = PRODOTTI.find((p) => p.id === tipoProdotto)?.label ?? tipoProdotto ?? "";

      const { data: practice, error: insertError } = await supabase
        .from("enea_practices")
        .insert({
          reseller_id: effectiveResellerId,
          brand: "enea",
          current_stage_id: initialStage?.id ?? null,
          tipo_servizio: tipoServizio === "documenti_forniti" ? "documenti_forniti" : "servizio_completo",
          // Ha senso solo con documenti_forniti: nel servizio completo il
          // cliente riceve la pratica comunque.
          invia_pratica_al_cliente: tipoServizio === "documenti_forniti" && inviaPraticaCliente === true,
          tipo_fatturazione: tipoFatturazione,
          tipo_soggetto: tipoSoggetto,
          prodotto_installato: prodottoLabel,
          cliente_nome: nome.trim(),
          cliente_cognome: cognome.trim(),
          cliente_email: email.trim() || null,
          cliente_telefono: telefono.trim(),
          cliente_cf: cf.trim() || null,
          cliente_indirizzo: indirizzo.trim() || null,
          data_fine_lavori: dataFineLavori ? format(dataFineLavori, "yyyy-MM-dd") : null,
          note: note.trim() || null,
          // Prova dell'accettazione del contratto di servizio da parte del
          // rivenditore che sta inserendo questa pratica.
          contratto_accettato_at: new Date().toISOString(),
          contratto_versione: CONTRATTO_VERSIONE,
          fatture_urls: [],
          documenti_enea_urls: [],
          documenti_aggiuntivi_urls: [],
          documenti_mancanti: [],
        })
        .select()
        .single();

      if (insertError || !practice) throw insertError ?? new Error("Insert fallito");

      // Upload documenti in parallelo
      const [fatture, docExtra, docExtra2Res, moduliRes] = await Promise.all([
        uploadFiles(fatturaFiles, practice.id, "fattura"),
        uploadFiles(docExtra1, practice.id, "doc_extra"),
        uploadFiles(docExtra2, practice.id, "libretto"),
        uploadFiles(moduliRaccoltaFiles, practice.id, "moduli_raccolta"),
      ]);

      const allFailed = [...fatture.failed, ...docExtra.failed, ...docExtra2Res.failed, ...moduliRes.failed];
      if (allFailed.length > 0) {
        toast({
          variant: "destructive",
          title: "Alcuni file non sono stati caricati",
          description: `Riprova dal dettaglio pratica per: ${allFailed.join(", ")}`,
        });
      }

      if (fatture.urls.length || docExtra.urls.length || docExtra2Res.urls.length || moduliRes.urls.length) {
        await supabase.from("enea_practices").update({
          fatture_urls: fatture.urls,
          documenti_aggiuntivi_urls: [...docExtra.urls, ...docExtra2Res.urls, ...moduliRes.urls],
        }).eq("id", practice.id);
      }

      // Trigger automations for "servizio_completo" (email+WA al cliente)
      if (tipoServizio === "servizio_completo") {
        supabase.functions.invoke("on-practice-created", {
          body: { practice_id: practice.id },
        }).catch(console.error); // non-blocking
      }

      // "documenti_forniti" + FORM ONLINE, servizio a carico del cliente: il
      // rivenditore compila lui il modulo, ma il pagamento resta del cliente e
      // il link glielo deve mandare qualcuno. Negli altri rami ci pensa la
      // chiamata a on-practice-created gia' presente; qui non c'era.
      if (tipoServizio === "documenti_forniti" && documentiMode === "form_online" && tipoFatturazione === "cliente_finale") {
        supabase.functions.invoke("on-practice-created", {
          body: { practice_id: practice.id, reseller_only: true },
        }).catch(console.error); // non-blocking
      }

      // "documenti_forniti" + FORM ONLINE: il rivenditore compila il modulo
      // cliente a nome del cliente. Reindirizziamo al FormPubblico col token.
      if (tipoServizio === "documenti_forniti" && documentiMode === "form_online" && practice.form_token) {
        toast({
          title: "Pratica creata",
          description: "Ora compila il modulo cliente con tutti i dettagli per inviarcela.",
        });
        navigate(`/form/${practice.form_token}`);
        return;
      }

      // "documenti_forniti" + MODULI CARTACEI: tutto fornito → pratica già in
      // "pronte da fare". Nessun messaggio al cliente; al rivenditore parte solo
      // l'email "pratica ricevuta" (reseller_only). La seconda email ("lavorata")
      // arriverà quando lo staff la chiude (on-stage-changed → notifica rivenditore).
      if (tipoServizio === "documenti_forniti" && documentiMode === "moduli_cartacei") {
        supabase.functions.invoke("on-practice-created", {
          body: { practice_id: practice.id, reseller_only: true },
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
    setRichiedenteTipo(null);
    setTipoServizio(null); setDocumentiMode(null); setTipoProdotto(null);
    setTipoSoggetto(null); setTipoFatturazione(null);
    setNome(""); setCognome(""); setEmail(""); setTelefono("");
    setCf(""); setIndirizzo(""); setNote("");
    setFatturaFiles([]); setDocExtra1([]); setDocExtra2([]);
    setModuliRaccoltaFiles([]);
    setFlagDocCompleto(null); setErrors({});
    setAccettoContratto(false);
    setSubmitted(null);
  };

  // ── Scelta rivenditore / privato ───────────────────────────────────────────
  const scegliRivenditore = () => {
    setRichiedenteTipo("rivenditore");
    // Il rivenditore sceglie da sé servizio, soggetto e fatturazione.
    setTipoServizio(null); setTipoSoggetto(null); setTipoFatturazione(null);
    setErrors((p) => ({ ...p, richiedenteTipo: "" }));
  };

  const scegliPrivato = () => {
    setRichiedenteTipo("privato");
    // Per un privato queste tre domande hanno una sola risposta possibile:
    // le impostiamo noi e nascondiamo le sezioni, invece di fargli scegliere
    // fra opzioni scritte per i rivenditori (es. "Documenti Forniti", che
    // presuppone i moduli cartacei di raccolta dati).
    setTipoServizio("servizio_completo");
    setTipoSoggetto("persona_fisica");
    setTipoFatturazione("cliente_finale");
    setDocumentiMode(null);
    setInviaPraticaCliente(null);
    setRagioneSociale(""); setAziendaEmail(""); setAziendaTelefono("");
    setErrors((p) => ({ ...p, richiedenteTipo: "" }));
  };

  // Numeri delle sezioni: al privato ne mostriamo 4 invece di 7, quindi la
  // numerazione va ricalcolata o si vedrebbe "2, 5, 6, 7".
  // (le sezioni nascoste restano a 0: non vengono renderizzate)
  const S = isPrivato
    ? { servizio: 0, prodotto: 1, soggetto: 0, fatturazione: 0, dati: 2, documenti: 3, note: 4 }
    : { servizio: 1, prodotto: 2, soggetto: 3, fatturazione: 4, dati: 5, documenti: 6, note: 7 };

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
          {publicMode
            ? <Button asChild><a href="/area-riservata-vecchia/servizi">Torna ai servizi</a></Button>
            : <Button asChild><a href="/kanban">Vai alla Board</a></Button>}
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

      {/* ── Chi compila: rivenditore o cliente privato (solo dal sito) ──
          Prima domanda di tutte perché decide sia i campi richiesti sia il
          pagamento: il privato passa dalla cassa, il rivenditore no. */}
      {publicMode && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Chi sta compilando questo modulo?</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Da questa scelta dipendono i dati che ti chiediamo e come viene pagato il servizio.
            </p>
          </div>
          {errors.richiedenteTipo && (
            <p className="text-xs text-destructive flex items-center gap-1" data-error>
              <AlertCircle className="h-3.5 w-3.5" />{errors.richiedenteTipo}
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={scegliRivenditore}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
                richiedenteTipo === "rivenditore"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                  richiedenteTipo === "rivenditore" ? "bg-primary text-white" : "bg-muted text-muted-foreground",
                )}>
                  <Building2 className="h-5 w-5" />
                </div>
                <p className="font-semibold text-sm leading-tight">Sono un rivenditore<br />o installatore</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Carico la pratica per un mio cliente. <strong className="text-foreground">Nessun pagamento adesso</strong>:
                vale la fatturazione concordata.
              </p>
            </button>

            <button
              type="button"
              onClick={scegliPrivato}
              disabled={!privatoDisponibile}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm focus:outline-none",
                richiedenteTipo === "privato"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
                !privatoDisponibile && "opacity-50 cursor-not-allowed hover:shadow-none hover:border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                  richiedenteTipo === "privato" ? "bg-primary text-white" : "bg-muted text-muted-foreground",
                )}>
                  <User className="h-5 w-5" />
                </div>
                <p className="font-semibold text-sm leading-tight">Sono un cliente<br />privato</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {/* Tono volutamente piano: il prezzo si dice, non si impone.
                    Resta comunque in chiaro — nascondere il costo prima del
                    checkout sarebbe peggio che dirlo. */}
                {privatoDisponibile ? (
                  <>
                    Voglio la pratica ENEA per casa mia.
                    {prezzoPrivato && (
                      <> Il servizio costa{" "}
                      <strong className="text-foreground">{euro(prezzoPrivato.imponibileCents)} + IVA</strong>{" "}
                      ({euro(prezzoPrivato.totaleCents)} in totale).</>
                    )}
                  </>
                ) : (
                  <>Al momento non disponibile online: scrivici e ti seguiamo noi.</>
                )}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ── Dati azienda (solo modalità pubblica dal sito, solo rivenditore) ── */}
      {publicMode && richiedenteTipo === "rivenditore" && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <h2 className="font-semibold">I tuoi dati (azienda / rivenditore)</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ragione" className="text-sm">Ragione sociale *</Label>
              <Input id="ragione" value={ragioneSociale}
                onChange={(e) => { setRagioneSociale(e.target.value); setErrors((p) => ({ ...p, ragioneSociale: "" })); }}
                placeholder="Es. Serramenti Rossi S.r.l." className={errors.ragioneSociale ? "border-destructive" : ""} />
              {errors.ragioneSociale && <p className="text-xs text-destructive" data-error>{errors.ragioneSociale}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="azienda-email" className="text-sm">Email aziendale *</Label>
              <Input id="azienda-email" type="email" value={aziendaEmail}
                onChange={(e) => { setAziendaEmail(e.target.value); setErrors((p) => ({ ...p, aziendaEmail: "" })); }}
                placeholder="info@azienda.it" className={errors.aziendaEmail ? "border-destructive" : ""} />
              {errors.aziendaEmail
                ? <p className="text-xs text-destructive" data-error>{errors.aziendaEmail}</p>
                : <p className="text-xs text-muted-foreground">Se sei già registrato, usa la stessa email del portale.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="azienda-tel" className="text-sm">Telefono azienda *</Label>
              <Input id="azienda-tel" value={aziendaTelefono}
                onChange={(e) => { setAziendaTelefono(e.target.value); setErrors((p) => ({ ...p, aziendaTelefono: "" })); }}
                placeholder="es. 333 1234567" className={errors.aziendaTelefono ? "border-destructive" : ""} />
              {errors.aziendaTelefono && <p className="text-xs text-destructive" data-error>{errors.aziendaTelefono}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Company picker (solo staff interni, per clienti direct-channel) ── */}
      {isInternal && !publicMode && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-700" />
            <h2 className="font-semibold text-sm text-amber-900">
              Modalità staff — Assegna la pratica a un'azienda
            </h2>
          </div>
          <p className="text-xs text-amber-800/80">
            Stai creando una pratica come operatore interno. Seleziona il rivenditore/azienda a cui
            intestare la pratica (es. per clienti direct-channel).
          </p>
          <Select value={staffSelectedCompanyId} onValueChange={setStaffSelectedCompanyId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Scegli azienda..." />
            </SelectTrigger>
            <SelectContent>
              {allCompanies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.ragione_sociale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── 1. Tipo di Servizio ────────────────────────────────────────────
          Nascosta al privato: "Documenti Forniti" presuppone i moduli
          cartacei di raccolta dati che compila il rivenditore. Per lui vale
          sempre il servizio completo (impostato in scegliPrivato). */}
      {!isPrivato && (
      <Section number={S.servizio} title="Tipo di servizio">
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

        {/* Sotto-scelta per "Documenti Forniti": cartaceo vs form online */}
        {tipoServizio === "documenti_forniti" && (
          <div className="mt-4 space-y-2.5">
            <p className="text-sm font-medium">Come vuoi fornire i dati del cliente?</p>
            {errors.documentiMode && (
              <p className="text-xs text-destructive flex items-center gap-1" data-error>
                <AlertCircle className="h-3.5 w-3.5" />{errors.documentiMode}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDocumentiMode("moduli_cartacei")}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm focus:outline-none",
                  documentiMode === "moduli_cartacei" ? "border-foreground/60 bg-muted/30" : "border-border hover:border-foreground/30"
                )}
              >
                <p className="font-semibold text-sm">📄 Scarica i moduli e allegali</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stampi i moduli di raccolta dati, li fai compilare/firmare e li alleghi qui sotto.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDocumentiMode("form_online")}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm focus:outline-none",
                  documentiMode === "form_online" ? "border-foreground/60 bg-muted/30" : "border-border hover:border-foreground/30"
                )}
              >
                <p className="font-semibold text-sm">💻 Compila il form online</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Compili tu i dati del cliente in un modulo online, al posto del cartaceo.
                </p>
              </button>
            </div>

            {/* Form online — CTA per aprire il modulo cliente. Crea la pratica in
                stato "attesa_compilazione" (via handleSubmit) e reindirizza a /form/:token. */}
            {documentiMode === "form_online" && (
              <div className="mt-4 rounded-lg border border-dashed bg-muted/30 p-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground leading-snug">
                  Clicca qui per aprire il modulo cliente e compilarlo online al posto del cartaceo.
                </p>
                <Button
                  type="submit"
                  disabled={submitting}
                  size="sm"
                  className="shrink-0"
                >
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Apro...</> : "Apri form online"}
                </Button>
              </div>
            )}

            {/* Moduli raccolta dati — download link + upload allegati compilati.
                Visibile solo quando il rivenditore sceglie "Scarica i moduli e allegali". */}
            {documentiMode === "moduli_cartacei" && (
              <div className="mt-4 space-y-3">
                <a
                  href={MODULI_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Scarica i moduli di raccolta dati
                </a>
                <div className="space-y-2">
                  {errors.moduliRaccolta && (
                    <p className="text-xs text-destructive flex items-center gap-1" data-error>
                      <AlertCircle className="h-3.5 w-3.5" />{errors.moduliRaccolta}
                    </p>
                  )}
                  <FileDropzone
                    label="Moduli di raccolta dati compilati"
                    required
                    files={moduliRaccoltaFiles}
                    onAdd={(f) => setModuliRaccoltaFiles((p) => [...p, ...f])}
                    onRemove={(i) => setModuliRaccoltaFiles((p) => p.filter((_, j) => j !== i))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Allega qui i moduli scaricabili sopra, compilati e firmati dal cliente.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
      )}

      {/* ── 2. Tipo di Prodotto ──────────────────────────────────────────── */}
      <Section number={S.prodotto} title="Tipo di prodotto installato">
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

      {/* ── 3. Tipo di Soggetto ────────────────────────────────────────────
          Nascosta al privato: per definizione è persona fisica. */}
      {!isPrivato && (
      <Section number={S.soggetto} title="Tipo di soggetto">
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
      )}

      {/* ── 4. Fatturazione ────────────────────────────────────────────────
          Nascosta al privato: paga lui, non c'è alternativa da scegliere. */}
      {!isPrivato && (
      <Section number={S.fatturazione} title="Fatturazione del servizio">
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
            {/* Nessun prezzo qui: ogni azienda ha condizioni sue
                (company_pricing), quindi una cifra fissa a schermo sarebbe
                sbagliata per la maggior parte dei rivenditori. */}
            <p className="text-xs text-muted-foreground mt-1">
              Fatturazione mensile posticipata tramite bonifico, secondo le condizioni concordate.
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
      )}

      {/* Cosa comporta il "CF": il rivenditore deve sapere che al SUO cliente
          parte una richiesta di pagamento a nostro nome. */}
      {!isPrivato && tipoFatturazione === "cliente_finale" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Al tuo cliente invieremo il link per pagare il servizio
            {prezzoCf ? ` (${euroScomposto(prezzoCf)} in totale)` : ""}.
            {publicMode ? " Se hai condizioni concordate con Pratica Rapida, al cliente verrà chiesto l'importo dei tuoi accordi." : ""}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
            Gli arriva via email, con scritto che sei tu ad averci incaricati.
            {tipoServizio === "documenti_forniti"
              ? " Non gli chiediamo nessun documento: quelli li hai forniti tu."
              : " I dati tecnici glieli chiediamo solo dopo il pagamento."}{" "}
            Assicurati che l'email qui sotto sia corretta e che il cliente sia d'accordo.
          </p>
        </div>
      )}

      {/* ── 5. Dati Cliente Finale ───────────────────────────────────────── */}
      <Section number={S.dati} title={isPrivato ? "I tuoi dati" : "Dati del cliente finale"}>
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
            {/* Al privato l'email è obbligatoria: ricevuta Stripe + link al
                modulo da completare dopo il pagamento. */}
            <Label htmlFor="email" className="text-sm">
              Email {(isPrivato || tipoFatturazione === "cliente_finale") && "*"}
            </Label>
            <Input id="email" type="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
              placeholder="mario@esempio.it" className={errors.email ? "border-destructive" : ""} />
            {errors.email && <p className="text-xs text-destructive" data-error>{errors.email}</p>}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="data-fine-lavori" className="text-sm">Data di fine lavori *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="data-fine-lavori"
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full h-10 justify-start text-left font-normal",
                    !dataFineLavori && "text-muted-foreground",
                    errors.dataFineLavori && "border-destructive",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataFineLavori ? format(dataFineLavori, "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dataFineLavori} onSelect={setDataFineLavori} locale={it} />
              </PopoverContent>
            </Popover>
            {errors.dataFineLavori && <p className="text-xs text-destructive" data-error>{errors.dataFineLavori}</p>}
          </div>
        </div>

        {/* Invio della pratica conclusa al cliente — solo "Documenti Forniti".
            Con questo servizio il cliente non viene mai contattato, quindi
            l'invio della pratica finita dev'essere una scelta esplicita di chi
            compila: non c'è un default sensato al posto suo. */}
        {tipoServizio === "documenti_forniti" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">
                Vuoi che mandiamo la pratica ENEA al cliente una volta conclusa? *
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Con «Documenti Forniti» il cliente non viene mai contattato. Se rispondi sì, a
                lavorazione conclusa gli inviamo la pratica tramite mail.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setInviaPraticaCliente(true); setErrors((p) => ({ ...p, inviaPraticaCliente: "" })); }}
                className={cn(
                  "rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                  inviaPraticaCliente === true ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                )}
              >
                Sì, inviatela al cliente
              </button>
              <button
                type="button"
                onClick={() => { setInviaPraticaCliente(false); setErrors((p) => ({ ...p, inviaPraticaCliente: "" })); }}
                className={cn(
                  "rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                  inviaPraticaCliente === false ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                )}
              >
                No, non contattatelo
              </button>
            </div>
            {inviaPraticaCliente === true && !email.trim() && (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Serve l'email del cliente qui sopra: è lì che inviamo la pratica.
              </p>
            )}
            {errors.inviaPraticaCliente && (
              <p className="text-xs text-destructive" data-error>{errors.inviaPraticaCliente}</p>
            )}
          </div>
        )}
      </Section>

      {/* ── 6. Documenti ────────────────────────────────────────────────── */}
      <Section number={S.documenti} title="Documenti da allegare">
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
              label="Certificato F-GAS (marca e modello)"
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
            Seleziona il prodotto nella sezione {S.prodotto} per vedere i documenti richiesti.
          </div>
        )}
      </Section>

      {/* ── 7. Note aggiuntive ───────────────────────────────────────────── */}
      <Section number={S.note} title="Note aggiuntive (opzionale)">
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

      {/* ── Consenso (publicMode) — nel flusso normale, NON nella barra sticky ── */}
      {publicMode && (
        <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer select-none rounded-lg border bg-muted/20 p-3">
          <input
            type="checkbox"
            checked={accettoPagamento}
            onChange={(e) => { setAccettoPagamento(e.target.checked); setErrors((p) => ({ ...p, accettoPagamento: "" })); }}
            className="mt-0.5 accent-primary"
          />
          <span>
            {isPrivato ? (
              <>
                Acconsento al trattamento dei miei dati (GDPR) per la gestione della pratica ENEA
                {prezzoPrivato && (
                  <> e ho preso visione del costo del servizio:{" "}
                  <strong>{euro(prezzoPrivato.imponibileCents)} + IVA</strong> ({euro(prezzoPrivato.totaleCents)} in
                  totale). Dopo la conferma potrò completare con calma i dati tecnici della pratica</>
                )}.
              </>
            ) : (
              <>
                Dichiaro di aver informato il cliente finale e acconsento al trattamento dei dati (GDPR)
                per la gestione della pratica.
                {tipoFatturazione === "rivenditore" && (
                  <> In qualità di soggetto pagante, <strong>accetto di corrispondere a Pratica Rapida S.r.l.s. il compenso pattuito a pratica completata</strong>.</>
                )}
              </>
            )}
            {errors.accettoPagamento && <span className="block text-destructive mt-0.5" data-error>{errors.accettoPagamento}</span>}
          </span>
        </label>
      )}

      {/* ── Accettazione contratto di servizio (obbligatoria, ogni pratica) ── */}
      <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer select-none rounded-lg border bg-muted/20 p-3">
        <input
          type="checkbox"
          checked={accettoContratto}
          onChange={(e) => { setAccettoContratto(e.target.checked); setErrors((p) => ({ ...p, accettoContratto: "" })); }}
          className="mt-0.5 accent-primary"
        />
        <span>
          Inviando la pratica accetto le{" "}
          <a
            href={CONTRATTO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary underline underline-offset-2"
          >
            condizioni di servizio di Pratica Rapida
          </a>.
          {errors.accettoContratto && <span className="block text-destructive mt-0.5" data-error>{errors.accettoContratto}</span>}
        </span>
      </label>

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4">
        <div className="rounded-xl border bg-card/95 backdrop-blur p-4 shadow-lg flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {/* Al rivenditore niente importi: il prezzo varia da azienda ad
                azienda. Al privato il totale va invece SEMPRE in chiaro. */}
            {isPrivato
              ? [PRODOTTI.find((p) => p.id === tipoProdotto)?.short,
                 prezzoPrivato ? euroScomposto(prezzoPrivato) : undefined,
                ].filter(Boolean).join(" · ")
              : [tipoServizio && (tipoServizio === "servizio_completo" ? "Servizio Completo" : "Documenti Forniti"),
                 PRODOTTI.find((p) => p.id === tipoProdotto)?.short,
                 tipoFatturazione === "cliente_finale" ? "CF" : tipoFatturazione === "rivenditore" ? "A carico mio" : undefined,
                ].filter(Boolean).join(" · ")}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="ml-auto"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isPrivato ? "Un momento..." : "Invio in corso..."}
              </>
            ) : isPrivato ? (
              // "Prosegui" invece di "Vai al pagamento": l'importo accanto
              // basta a far capire dove si sta andando, senza incalzare.
              prezzoPrivato ? `Prosegui — ${euro(prezzoPrivato.totaleCents)}` : "Prosegui"
            ) : (
              "Invia Pratica ENEA"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
