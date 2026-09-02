// ============================================================
// ModuloPreview
//
// Anteprima "come cliente" di un modulo del form pubblico.
// Riusa lo stesso renderer dinamico (`DynamicSteps`) di FormPubblico,
// ma senza token/pratica: nessun salvataggio, nessun invio. Serve al
// super_admin per vedere il form esattamente come lo compilerebbe il
// cliente finale.
//
// Rotta: /admin/moduli/preview/:id  (solo ADMIN_ROLES, vedi App.tsx)
// ============================================================

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Eye, Loader2, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DynamicSteps } from "@/components/form-cliente/DynamicSteps";
import { getVisibleSteps } from "@/components/form-cliente/dynamicValidation";
import type { FormModule } from "@/types/form-module";

type DynamicFormData = Record<string, Record<string, unknown>>;

export default function ModuloPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: module,
    isLoading,
    error,
  } = useQuery<FormModule | null>({
    queryKey: ["form-module-preview", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("form_modules" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as FormModule) ?? null;
    },
    enabled: !!id,
  });

  // Stato locale del form (non persistito): mappa sezione → campo → valore.
  const [formData, setFormData] = useState<DynamicFormData>({});
  const [stepIndex, setStepIndex] = useState(0);

  const visibleSteps = useMemo(() => {
    if (!module?.schema) return [];
    return getVisibleSteps(module.schema, formData);
  }, [module?.schema, formData]);

  const totalSteps = visibleSteps.length;
  const safeStepIndex = Math.min(stepIndex, Math.max(0, totalSteps - 1));
  const currentStep = visibleSteps[safeStepIndex];
  const stepLabel = currentStep?.label ?? "";
  const progressPct =
    totalSteps > 0 ? ((safeStepIndex + 1) / totalSteps) * 100 : 0;
  const isFirst = safeStepIndex === 0;
  const isLast = totalSteps === 0 || safeStepIndex === totalSteps - 1;

  function updateField(stepKey: string, fieldKey: string, value: unknown) {
    setFormData((prev) => ({
      ...prev,
      [stepKey]: { ...(prev[stepKey] ?? {}), [fieldKey]: value },
    }));
  }

  // ── Stati di caricamento / errore ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Caricamento anteprima…
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-destructive font-medium">
          Modulo non trovato o non caricabile.
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/moduli")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Torna ai moduli
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Banner anteprima */}
        <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Eye className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-sky-900">
                Modalità anteprima — {module.name}
              </p>
              <p className="text-xs text-sky-800 mt-1 leading-relaxed">
                Stai vedendo il form pubblico esattamente come lo compila il
                cliente. Puoi navigare tra tutti i passi liberamente; i dati{" "}
                <strong>non</strong> vengono salvati né inviati.
              </p>
            </div>
            <button
              onClick={() => navigate("/admin/moduli")}
              className="shrink-0 text-xs text-sky-900 underline hover:no-underline whitespace-nowrap"
            >
              ← Torna ai moduli
            </button>
          </div>
        </div>

        {/* Header brand — come nel form pubblico */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Completa la tua pratica</h1>
          <p className="text-muted-foreground text-sm">Compila i tuoi dati</p>
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

        {/* Contenuto step */}
        <div className="rounded-lg border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">{stepLabel}</h2>
          {totalSteps > 0 ? (
            <DynamicSteps
              schema={module.schema}
              currentStepIndex={safeStepIndex}
              formData={formData}
              onChange={updateField}
              errors={{}}
              practiceId=""
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Questo modulo non ha ancora step da mostrare.
            </p>
          )}
        </div>

        {/* Navigazione */}
        <div className="flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            disabled={isFirst}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Indietro
          </Button>

          {isLast ? (
            <Button type="button" disabled title="Disabilitato in anteprima">
              <Send className="h-4 w-4 mr-2" /> Invia pratica
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() =>
                setStepIndex((i) => Math.min(i + 1, totalSteps - 1))
              }
            >
              Avanti <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
