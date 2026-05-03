import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Loader2, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { EneaPractice } from "@/integrations/supabase/types";

import {
  detectProdottoTipo,
  emptyFormData,
  FormClienteData,
  ProdottoTipo,
  STEPS,
  StepId,
} from "@/types/form-cliente";
import { validateStep } from "@/components/form-cliente/validation";
import {
  StepCatastali,
  StepCointestazione,
  StepEdificio,
  StepImpianto,
  StepIndirizzo,
  StepProdotto,
  StepRichiedente,
} from "@/components/form-cliente/Steps";
import { StepRecap } from "@/components/form-cliente/StepRecap";

// ── Helper: pre-popolazione bozza esistente ───────────────────────────────────
// Il dati_form salvato in DB potrebbe essere parziale (bozza salvata a metà
// compilazione). Mergiamo sul default per garantire la shape completa.
function mergeDraft(base: FormClienteData, draft: unknown): FormClienteData {
  if (!draft || typeof draft !== "object") return base;
  const d = draft as Partial<FormClienteData>;
  return {
    ...base,
    ...d,
    richiedente: { ...base.richiedente, ...(d.richiedente || {}) },
    residenza: { ...base.residenza, ...(d.residenza || {}) },
    appartamento_lavori: { ...base.appartamento_lavori, ...(d.appartamento_lavori || {}) },
    cointestazione: { ...base.cointestazione, ...(d.cointestazione || {}) },
    catastali: { ...base.catastali, ...(d.catastali || {}) },
    edificio: { ...base.edificio, ...(d.edificio || {}) },
    impianto: { ...base.impianto, ...(d.impianto || {}) },
    prodotto: (d.prodotto && (d.prodotto as { tipo?: string }).tipo
      ? (d.prodotto as FormClienteData["prodotto"])
      : base.prodotto),
  };
}

// Pre-popola la sezione richiedente coi dati base della pratica se la bozza è vuota.
function seedFromPractice(
  base: FormClienteData,
  practice: {
    cliente_nome?: string | null;
    cliente_cognome?: string | null;
    cliente_email?: string | null;
    cliente_telefono?: string | null;
    cliente_cf?: string | null;
  },
): FormClienteData {
  const r = base.richiedente;
  return {
    ...base,
    richiedente: {
      ...r,
      nome: r.nome || practice.cliente_nome || "",
      cognome: r.cognome || practice.cliente_cognome || "",
      email: r.email || practice.cliente_email || "",
      telefono: r.telefono || practice.cliente_telefono || "",
      cf: r.cf || (practice.cliente_cf || "").toUpperCase(),
    },
  };
}

// Inizializza la sezione prodotto con la variante corretta in base al
// `prodotto_installato` della pratica.
function initProdottoForVariant(data: FormClienteData, tipo: ProdottoTipo): FormClienteData {
  if (data.prodotto.tipo === tipo) return data;
  if (tipo === "infissi") {
    return {
      ...data,
      prodotto: {
        tipo: "infissi",
        vecchi_materiale: "",
        vecchi_vetro: "",
        nuovi_materiale: "",
        nuovi_vetro: "",
        zanzariere_tapparelle: null,
      },
    };
  }
  if (tipo === "schermature") {
    return {
      ...data,
      prodotto: { tipo: "schermature", items: [{ tipo: "", direzione: "" }] },
    };
  }
  return { ...data, prodotto: { tipo: "impianto_termico" } };
}

export default function FormPubblico() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  // ── Initial fetch state ─────────────────────────────────────────────────────
  const [practice, setPractice] = useState<EneaPractice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resellerName, setResellerName] = useState("");
  const [prodottoTipo, setProdottoTipo] = useState<ProdottoTipo>("infissi");

  // ── Wizard state ────────────────────────────────────────────────────────────
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormClienteData>(emptyFormData());
  const [uploading, setUploading] = useState(false);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setError("Link non valido.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Usa RPC SECURITY DEFINER (accesso anon controllato via form_token).
    // La tabella enea_practices non ha policy anon → SELECT diretto restituisce [].
    supabase
      .rpc("get_practice_by_form_token", { p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : null;
        if (error || !row) {
          setError("Pratica non trovata o link non valido.");
        } else if (row.archived_at) {
          setError("Questa pratica è stata archiviata.");
        } else if (row.form_compilato_at) {
          setSubmitted(true);
        } else {
          setPractice(row as unknown as EneaPractice);
          setResellerName(row.reseller_name ?? "");

          const tipo = detectProdottoTipo(row.prodotto_installato);
          setProdottoTipo(tipo);

          // Build form data: default → merge bozza esistente → seed dati base practice
          //                   → assicurati che `prodotto.tipo` matchi la variante.
          let initial = emptyFormData();
          initial = mergeDraft(initial, row.dati_form);
          initial = seedFromPractice(initial, row);
          initial = initProdottoForVariant(initial, tipo);
          setFormData(initial);
        }
        setLoading(false);
      }, (err) => {
        // Promise rejection handler — senza questo lo spinner resta infinito su network error.
        if (cancelled) return;
        console.error("get_practice_by_form_token failed:", err);
        setError("Impossibile caricare la pratica. Controlla la connessione e riprova.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Patch helper per le sezioni del form ────────────────────────────────────
  const patchSection = useMemo(() => {
    return <S extends keyof FormClienteData>(
      section: S,
      patch: Partial<FormClienteData[S]>,
    ) => {
      setFormData((prev) => ({
        ...prev,
        [section]: { ...prev[section], ...patch },
      }));
    };
  }, []);

  // ── Validazione step corrente ───────────────────────────────────────────────
  const currentStep = STEPS[stepIndex];
  const stepErrors = useMemo(
    () => validateStep(currentStep.id, formData, prodottoTipo),
    [currentStep.id, formData, prodottoTipo],
  );
  const canProceed = Object.keys(stepErrors).length === 0;

  // ── Autosave bozza ──────────────────────────────────────────────────────────
  const saveDraft = async (data: FormClienteData) => {
    if (!token) return;
    try {
      await supabase.rpc("save_form_draft_by_token", {
        p_token: token,
        p_dati_form: data as unknown as Record<string, unknown>,
      });
    } catch (err) {
      // Non bloccare il flusso: la bozza è un nice-to-have.
      console.error("save_form_draft_by_token failed:", err);
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (!canProceed) return;
    await saveDraft(formData);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = async () => {
    if (stepIndex === 0) return;
    // Salviamo anche al "Indietro" come da specifica
    await saveDraft(formData);
    setStepIndex((i) => Math.max(i - 1, 0));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Submit finale ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!practice || !token) return;
    const allErrors = validateStep("recap", formData, prodottoTipo);
    if (Object.keys(allErrors).length > 0) {
      toast({
        variant: "destructive",
        title: "Compila tutti i campi obbligatori",
        description: Object.values(allErrors).slice(0, 3).join(" · "),
      });
      return;
    }

    setSubmitting(true);
    const r = formData.richiedente;
    const res = formData.residenza;
    const indirizzoCompleto = `${res.indirizzo} ${res.civico}, ${res.comune}`.trim();

    // Submit via RPC SECURITY DEFINER — l'unica via per anon di scrivere
    // controllata dal form_token. La funzione DB gestisce:
    //   · validazione (non archiviata, non già compilata)
    //   · spostamento a stage pronte_da_fare (per brand)
    //   · aggiornamento dati cliente + dati_form jsonb
    const { error: submitError } = await supabase.rpc("submit_form_by_token", {
      p_token: token,
      p_cliente_nome: r.nome,
      p_cliente_cognome: r.cognome,
      p_cliente_email: r.email,
      p_cliente_telefono: r.telefono,
      p_cliente_indirizzo: indirizzoCompleto,
      p_cliente_cf: r.cf,
      p_note: "",
      p_dati_form: formData as unknown as Record<string, unknown>,
    });

    if (submitError) {
      console.error("submit_form_by_token failed:", submitError);
      toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare. Riprova." });
      setSubmitting(false);
      return;
    }

    // Fire Messaggio 3 confirmation (email + WA) to cliente finale via on-stage-changed.
    // The edge function itself guards on tipo_servizio === "servizio_completo" and form_compilato_at.
    supabase.functions
      .invoke("on-stage-changed", {
        body: { practice_id: practice.id, new_stage_type: "pronte_da_fare" },
      })
      .catch(console.error);

    setSubmitted(true);
    setSubmitting(false);
  };

  // ── Render: stati globali ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Link non valido</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold">Grazie!</h1>
          <p className="text-muted-foreground">
            I tuoi dati sono stati ricevuti. La tua pratica è ora in lavorazione.
            Riceverai aggiornamenti via email o WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: wizard ──────────────────────────────────────────────────────────
  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;
  const isLast = currentStep.id === "recap";
  const isFirst = stepIndex === 0;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header brand */}
        <div className="text-center space-y-1">
          {resellerName && (
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {resellerName} × Pratica Rapida
            </p>
          )}
          <h1 className="text-2xl font-bold">Completa la tua pratica</h1>
          <p className="text-muted-foreground text-sm">
            Pratica {practice?.brand === "enea" ? "ENEA" : "Conto Termico"} — Compila i tuoi dati
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Passo {stepIndex + 1} di {STEPS.length}
            </span>
            <span className="font-medium">{currentStep.label}</span>
          </div>
          <Progress value={progressPct} />
        </div>

        {/* Step content */}
        <div className="rounded-lg border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">{currentStep.label}</h2>
          <StepBody
            step={currentStep.id}
            data={formData}
            errors={stepErrors}
            patchSection={patchSection}
            prodottoTipo={prodottoTipo}
            practiceId={practice?.id ?? ""}
            uploading={uploading}
            onUploadStart={() => setUploading(true)}
            onUploadEnd={() => setUploading(false)}
          />
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={isFirst || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Indietro
          </Button>

          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canProceed || submitting || uploading}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Invia pratica
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              disabled={!canProceed || submitting || uploading}
            >
              Avanti
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>

        {/* Supporto */}
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm space-y-1">
          <p className="font-semibold text-foreground">Hai bisogno di aiuto?</p>
          <p className="text-muted-foreground">
            Scrivi a{" "}
            <a href="mailto:supporto@praticarapida.it" className="text-primary underline">
              supporto@praticarapida.it
            </a>
          </p>
          <p className="text-muted-foreground">
            Oppure su{" "}
            <a
              href="https://wa.me/390398682691"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              WhatsApp
            </a>{" "}
            <span className="text-xs">(solo messaggi, non rispondiamo a chiamate vocali)</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dispatcher per il body dello step ─────────────────────────────────────────
interface StepBodyProps {
  step: StepId;
  data: FormClienteData;
  errors: Record<string, string>;
  patchSection: <S extends keyof FormClienteData>(
    section: S,
    patch: Partial<FormClienteData[S]>,
  ) => void;
  prodottoTipo: ProdottoTipo;
  practiceId: string;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}

function StepBody(props: StepBodyProps) {
  const { step, data, errors, patchSection, prodottoTipo } = props;
  switch (step) {
    case "richiedente":
      return <StepRichiedente data={data} errors={errors} patchSection={patchSection} />;
    case "indirizzo":
      return <StepIndirizzo data={data} errors={errors} patchSection={patchSection} />;
    case "cointestazione":
      return <StepCointestazione data={data} errors={errors} patchSection={patchSection} />;
    case "catastali":
      return <StepCatastali data={data} errors={errors} patchSection={patchSection} />;
    case "edificio":
      return <StepEdificio data={data} errors={errors} patchSection={patchSection} />;
    case "impianto":
      return <StepImpianto data={data} errors={errors} patchSection={patchSection} />;
    case "prodotto":
      return (
        <StepProdotto
          data={data}
          errors={errors}
          patchSection={patchSection}
          prodottoTipo={prodottoTipo}
          practiceId={props.practiceId}
          uploading={props.uploading}
          onUploadStart={props.onUploadStart}
          onUploadEnd={props.onUploadEnd}
        />
      );
    case "recap":
      return <StepRecap data={data} prodottoTipo={prodottoTipo} />;
    default:
      return null;
  }
}
