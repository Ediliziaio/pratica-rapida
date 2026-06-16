import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Loader2, Send, Briefcase, LayoutDashboard } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
import { DynamicSteps } from "@/components/form-cliente/DynamicSteps";
import {
  getVisibleSteps,
  validateAllDynamicSteps,
  validateDynamicStep,
} from "@/components/form-cliente/dynamicValidation";
import { useFormModuleByProdotto } from "@/hooks/useFormSchema";

// Refactor DB-first: se `useFormModuleByProdotto` matcha un modulo (CMS in
// /admin/moduli), il form usa il renderer DINAMICO. Altrimenti fallback
// non-breaking sullo schema TS hardcoded (`STEPS`).

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
  if (tipo === "insufflaggio") {
    // Insufflaggio: nessun dato specifico del prodotto. Le info tecniche
    // (spessore + conducibilità termica) le fornisce il rivenditore via
    // fattura/allegato, non il cliente finale.
    return { ...data, prodotto: { tipo: "insufflaggio" } };
  }
  return { ...data, prodotto: { tipo: "impianto_termico" } };
}

export default function FormPubblico() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session, isInternal, isReseller } = useAuth();
  // Modalità "compilato dal fornitore/staff per conto del cliente": utile
  // quando il cliente è anziano o non riesce a usare il portale. Il
  // rivenditore ha cliccato "Documenti Forniti" in /enea/nuova ed è stato
  // reindirizzato qui col form_token della pratica appena creata.
  const isProxyCompiler = !!session && (isInternal || isReseller);

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

  // ── Dynamic-path state ──────────────────────────────────────────────────────
  // Quando `dbModule` è risolto, usiamo `dynamicData` (shape libera dallo
  // schema DB) invece dei tipi hardcoded.
  const [dynamicData, setDynamicData] = useState<Record<string, Record<string, unknown>>>({});

  // Fetch del modulo DB. È abilitato solo se conosciamo `prodotto_installato`.
  const { data: dbModule, isLoading: dbModuleLoading } = useFormModuleByProdotto(
    practice?.prodotto_installato,
  );
  const useDynamic = !!dbModule;

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

          // Pre-popolazione del path dinamico: se il dati_form è già nello shape
          // {sezione: {field: value}} lo usiamo as-is (può contenere campi non
          // presenti in FormClienteData se il super_admin ha esteso lo schema).
          if (row.dati_form && typeof row.dati_form === "object" && !Array.isArray(row.dati_form)) {
            setDynamicData(row.dati_form as Record<string, Record<string, unknown>>);
          }
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

  // ── Step list (dynamic vs hardcoded) ────────────────────────────────────────
  // Lista di step "visibili" in base allo stato corrente. Per il path dinamico
  // applichiamo `visible_if` step-level; per il path hardcoded usiamo STEPS.
  const visibleDynamicSteps = useMemo(() => {
    if (!useDynamic || !dbModule) return [];
    return getVisibleSteps(dbModule.schema, dynamicData);
  }, [useDynamic, dbModule, dynamicData]);

  const totalSteps = useDynamic ? visibleDynamicSteps.length : STEPS.length;
  const safeStepIndex = totalSteps > 0 ? Math.min(stepIndex, totalSteps - 1) : 0;

  // Se il numero di step "visibili" si riduce sotto stepIndex (perché un
  // visible_if step-level è stato disattivato dal cambio di un campo),
  // riportiamo l'indice all'ultimo step disponibile.
  // NB: deve essere DOPO la dichiarazione di `totalSteps` per evitare TDZ
  // ("Cannot access 'totalSteps' before initialization" in build minificata).
  useEffect(() => {
    if (totalSteps > 0 && stepIndex >= totalSteps) {
      setStepIndex(totalSteps - 1);
    }
  }, [totalSteps, stepIndex]);

  // ── Validazione step corrente ───────────────────────────────────────────────
  // Path hardcoded
  const hardcodedStep = STEPS[safeStepIndex] ?? STEPS[0];
  const hardcodedErrors = useMemo(
    () => (useDynamic ? {} : validateStep(hardcodedStep.id, formData, prodottoTipo)),
    [useDynamic, hardcodedStep.id, formData, prodottoTipo],
  );
  // Path dinamico
  const dynamicStep = visibleDynamicSteps[safeStepIndex];
  const dynamicErrors = useMemo(
    () => (useDynamic && dynamicStep ? validateDynamicStep(dynamicStep, dynamicData) : {}),
    [useDynamic, dynamicStep, dynamicData],
  );

  const stepErrors = useDynamic ? dynamicErrors : hardcodedErrors;
  const canProceed = Object.keys(stepErrors).length === 0;

  // ── Navigation lock: previene click doppio durante saveDraft async ─────────
  // Prima del fix: se la rete era lenta, l'utente poteva cliccare "Avanti" 2
  // volte → 2 RPC saveDraft in parallelo → race condition + bozza duplicata.
  // Ora: useRef perché non triggera re-render (più reattivo del setState).
  const [navigating, setNavigating] = useState(false);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);

  // ── Autosave bozza con feedback errore ──────────────────────────────────────
  // Prima del fix: errore loggato solo in console → utente perdeva i dati
  // senza saperlo. Ora: toast destructive con istruzione "riprova".
  // Serializzato: se c'è già un save in volo, aspetta che finisca prima di
  // partirne un altro (evita race condition).
  const saveDraft = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!token) return true;
    if (inFlightSaveRef.current) {
      // Aspetta che il save precedente termini prima di partire col nuovo
      await inFlightSaveRef.current;
    }
    const promise = (async () => {
      try {
        const { error } = await supabase.rpc("save_form_draft_by_token", {
          p_token: token,
          p_dati_form: payload,
        });
        if (error) throw error;
      } catch (err) {
        console.error("save_form_draft_by_token failed:", err);
        toast({
          variant: "destructive",
          title: "Salvataggio bozza fallito",
          description: "Le risposte sono salvate localmente, ma non sul server. Verifica la connessione e riprova.",
        });
        throw err;
      }
    })();
    inFlightSaveRef.current = promise;
    try {
      await promise;
      return true;
    } catch {
      return false;
    } finally {
      inFlightSaveRef.current = null;
    }
  };

  // ── Dynamic onChange: aggiorna lo stato e (lazy) autosave ───────────────────
  const updateDynamicField = (
    stepKey: string,
    fieldKey: string,
    value: unknown,
  ) => {
    setDynamicData((prev) => ({
      ...prev,
      [stepKey]: { ...(prev[stepKey] ?? {}), [fieldKey]: value },
    }));
    // L'autosave a ogni keystroke sarebbe troppo aggressivo; manteniamo il
    // comportamento esistente: salviamo a Avanti/Indietro.
  };

  // ── Helper: scroll smooth + focus primo campo con errore ───────────────────
  // Quando l'utente preme "Avanti" ma ci sono errori validazione, scrolliamo
  // al primo campo invalido e mostriamo toast informativo. Senza questo, su
  // mobile l'errore poteva essere fuori viewport (utente bloccato senza
  // capire perché il bottone è disabled).
  const scrollToFirstError = (errors: Record<string, string>) => {
    const firstKey = Object.keys(errors)[0];
    if (!firstKey) return;
    // Cerca per id, name, o data-field
    const el = document.getElementById(firstKey)
      || document.querySelector(`[name="${firstKey}"]`)
      || document.querySelector(`[data-field="${firstKey}"]`);
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus dopo l'animazione di scroll
      setTimeout(() => {
        if (typeof el.focus === "function") el.focus();
      }, 400);
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (navigating) return; // Mutex: previene click doppio
    if (!canProceed) {
      scrollToFirstError(stepErrors);
      toast({
        variant: "destructive",
        title: "Compila i campi evidenziati",
        description: "Alcuni campi obbligatori non sono validi.",
      });
      return;
    }
    setNavigating(true);
    try {
      const ok = await saveDraft(
        useDynamic ? dynamicData : (formData as unknown as Record<string, unknown>),
      );
      // Procediamo anche se il save fallisce — il toast è già stato mostrato.
      // L'utente può sempre tornare indietro e riprovare. Lo stato locale è
      // preservato.
      void ok; // (variabile esistenziale per documentazione)
      setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setNavigating(false);
    }
  };

  const goBack = async () => {
    if (navigating) return;
    if (safeStepIndex === 0) return;
    setNavigating(true);
    try {
      await saveDraft(useDynamic ? dynamicData : (formData as unknown as Record<string, unknown>));
      setStepIndex((i) => Math.max(i - 1, 0));
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setNavigating(false);
    }
  };

  // ── Submit finale ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!practice || !token) return;

    if (useDynamic && dbModule) {
      // Validazione completa su tutti gli step visibili
      const allErrors = validateAllDynamicSteps(dbModule.schema, dynamicData);
      if (Object.keys(allErrors).length > 0) {
        toast({
          variant: "destructive",
          title: "Compila tutti i campi obbligatori",
          description: Object.values(allErrors).slice(0, 3).join(" · "),
        });
        return;
      }

      setSubmitting(true);

      // Estrai dati cliente dal dynamicData con un best-effort lookup. Lo schema
      // DB definisce typicamente uno step "richiedente" con field nome/cognome/
      // email/telefono/cf, ma siamo permissivi: accettiamo qualunque key che
      // contenga i nomi standard. Fallback ai dati base della pratica.
      const r = extractRichiedente(dynamicData) ?? {
        nome: practice.cliente_nome ?? "",
        cognome: practice.cliente_cognome ?? "",
        email: practice.cliente_email ?? "",
        telefono: practice.cliente_telefono ?? "",
        cf: practice.cliente_cf ?? "",
      };
      const indirizzo = extractIndirizzo(dynamicData);

      const { error: submitError } = await supabase.rpc("submit_form_by_token", {
        p_token: token,
        p_cliente_nome: r.nome,
        p_cliente_cognome: r.cognome,
        p_cliente_email: r.email,
        p_cliente_telefono: r.telefono,
        p_cliente_indirizzo: indirizzo,
        p_cliente_cf: r.cf,
        p_note: "",
        p_dati_form: dynamicData,
      });

      if (submitError) {
        console.error("submit_form_by_token failed:", submitError);
        toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare. Riprova." });
        setSubmitting(false);
        return;
      }

      // Messaggio 3 (email + WA conferma) parte dal TRIGGER DB on_form_compilato_trigger
      // (scatta quando submit_form_by_token setta form_compilato_at). NON invocare
      // on-stage-changed anche qui: causerebbe un DOPPIO invio al cliente.
      setSubmitted(true);
      setSubmitting(false);
      return;
    }

    // ── Path hardcoded (fallback) ─────────────────────────────────────────────
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

    // Messaggio 3 (email + WA conferma) parte dal TRIGGER DB on_form_compilato_trigger
    // (scatta quando submit_form_by_token setta form_compilato_at). NON invocare
    // on-stage-changed anche qui: causerebbe un DOPPIO invio al cliente.
    setSubmitted(true);
    setSubmitting(false);
  };

  // ── Render: stati globali ───────────────────────────────────────────────────
  // Attendiamo anche il dbModule prima di renderizzare il wizard, per evitare
  // un flash dello schema hardcoded mentre la query DB è in volo.
  if (loading || (practice && dbModuleLoading)) {
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
    // Branch dedicato al rivenditore/staff che ha compilato il modulo per
    // conto del cliente: testo + CTA "Torna al kanban" invece del messaggio
    // standard pensato per il cliente finale.
    if (isProxyCompiler) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center space-y-5 max-w-md">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold">Pratica inviata ✓</h1>
            <p className="text-muted-foreground">
              I dati sono stati registrati. La pratica è ora visibile a Pratica Rapida
              nella colonna <strong>“Pronte da fare”</strong> e sarà gestita dal team
              entro le tempistiche standard.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button onClick={() => navigate("/kanban")}>
                <LayoutDashboard className="h-4 w-4 mr-1.5" />Torna al kanban
              </Button>
              <Button variant="outline" onClick={() => navigate("/enea/nuova")}>
                Nuova pratica
              </Button>
            </div>
          </div>
        </div>
      );
    }
    // Cliente finale: messaggio originale
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
  const stepLabel = useDynamic
    ? dynamicStep?.label ?? ""
    : hardcodedStep.label;
  const progressPct = totalSteps > 0 ? ((safeStepIndex + 1) / totalSteps) * 100 : 0;
  const isLast = useDynamic
    ? safeStepIndex === totalSteps - 1
    : hardcodedStep.id === "recap";
  const isFirst = safeStepIndex === 0;

  const clienteNomeCompleto = [practice?.cliente_nome, practice?.cliente_cognome]
    .filter(Boolean).join(" ") || "il cliente";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Banner "modalità rivenditore" — visibile solo se l'utente è loggato
            come staff/rivenditore e sta compilando per conto del cliente */}
        {isProxyCompiler && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Briefcase className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-amber-900">
                  Stai compilando per conto del cliente
                </p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Inserisci i dati di <strong>{clienteNomeCompleto}</strong> come se fossi tu il cliente
                  finale. Allega fatture e documenti tecnici. Al termine la pratica
                  apparirà a Pratica Rapida in <strong>“Pronte da fare”</strong>.
                </p>
              </div>
              <Link
                to="/kanban"
                className="shrink-0 text-xs text-amber-900 underline hover:no-underline whitespace-nowrap"
              >
                ← Torna al kanban
              </Link>
            </div>
          </div>
        )}

        {/* Header brand — adattato per ruolo */}
        <div className="text-center space-y-1">
          {resellerName && (
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {resellerName} × Pratica Rapida
            </p>
          )}
          <h1 className="text-2xl font-bold">
            {isProxyCompiler ? "Compilazione per conto del cliente" : "Completa la tua pratica"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Pratica {practice?.brand === "enea" ? "ENEA" : "Conto Termico"} —{" "}
            {isProxyCompiler ? `Dati di ${clienteNomeCompleto}` : "Compila i tuoi dati"}
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Passo {safeStepIndex + 1} di {totalSteps}
            </span>
            <span className="font-medium">{stepLabel}</span>
          </div>
          <Progress value={progressPct} />
        </div>

        {/* Step content */}
        <div className="rounded-lg border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">{stepLabel}</h2>
          {useDynamic && dbModule ? (
            <DynamicSteps
              schema={dbModule.schema}
              currentStepIndex={safeStepIndex}
              formData={dynamicData}
              onChange={updateDynamicField}
              errors={stepErrors}
              practiceId={practice?.id ?? ""}
            />
          ) : (
            <StepBody
              step={hardcodedStep.id}
              data={formData}
              errors={stepErrors}
              patchSection={patchSection}
              prodottoTipo={prodottoTipo}
              practiceId={practice?.id ?? ""}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
            />
          )}
        </div>

        {/* Navigation — sticky in basso su mobile per non essere coperta da
            keyboard/safe-area. Su desktop resta in linea col contenuto.
            pb safe-area-inset-bottom per iPhone/notch. */}
        <div
          className="sticky bottom-0 -mx-4 sm:mx-0 sm:static z-10 bg-white/95 backdrop-blur sm:bg-transparent border-t sm:border-t-0 px-4 sm:px-0 py-3 sm:py-0 flex justify-between gap-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={isFirst || submitting || navigating}
          >
            {navigating && !isLast ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowLeft className="h-4 w-4 mr-2" />
            )}
            Indietro
          </Button>

          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || uploading || navigating}
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
              disabled={submitting || uploading || navigating}
            >
              {navigating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvataggio…
                </>
              ) : (
                <>
                  Avanti
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
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

// ── Helper: best-effort extraction dati cliente dal dynamicData ───────────────
// Lo schema DB può variare: cerchiamo la sezione e i field con i nomi standard.
// Se non troviamo nulla restituiamo null e il chiamante usa il fallback dalla
// pratica.
function pickStringField(
  bag: Record<string, unknown> | undefined,
  keys: string[],
): string {
  if (!bag) return "";
  for (const k of keys) {
    const v = bag[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

function findSection(
  data: Record<string, Record<string, unknown>>,
  sectionKeys: string[],
): Record<string, unknown> | undefined {
  for (const k of sectionKeys) {
    const s = data[k];
    if (s && typeof s === "object") return s;
  }
  // Fallback: prendiamo la prima sezione che contiene un field "email" o "nome".
  for (const v of Object.values(data)) {
    if (v && typeof v === "object" && ("email" in v || "nome" in v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

function extractRichiedente(data: Record<string, Record<string, unknown>>) {
  const sec = findSection(data, ["richiedente", "anagrafica", "cliente", "intestatario"]);
  if (!sec) return null;
  return {
    nome: pickStringField(sec, ["nome", "first_name", "name"]),
    cognome: pickStringField(sec, ["cognome", "last_name", "surname"]),
    email: pickStringField(sec, ["email", "mail"]),
    telefono: pickStringField(sec, ["telefono", "phone", "cellulare", "mobile"]),
    cf: pickStringField(sec, ["cf", "codice_fiscale", "codiceFiscale"]).toUpperCase(),
  };
}

function extractIndirizzo(data: Record<string, Record<string, unknown>>): string {
  const sec = findSection(data, ["indirizzo", "residenza", "address"]);
  if (!sec) return "";
  const via = pickStringField(sec, ["indirizzo", "via", "street"]);
  const civ = pickStringField(sec, ["civico", "numero", "number"]);
  const com = pickStringField(sec, ["comune", "citta", "city", "municipality"]);
  const parts: string[] = [];
  if (via) parts.push(civ ? `${via} ${civ}` : via);
  if (com) parts.push(com);
  return parts.join(", ");
}
