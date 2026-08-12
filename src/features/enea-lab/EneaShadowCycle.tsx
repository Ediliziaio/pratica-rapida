import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EMPTY_ENEA_SHADOW_WORKFLOW,
  loadEneaShadowWorkflow,
  recordEneaShadowEvent,
  saveEneaShadowWorkflow,
} from "./shadowWorkflow";

interface Props {
  practiceId: string;
  prepared: boolean;
  documentsChecked: boolean;
  blockerCount: number;
}

export function EneaShadowCycle({ practiceId, prepared, documentsChecked, blockerCount }: Props) {
  const [state, setState] = useState(() => loadEneaShadowWorkflow(window.localStorage, practiceId));

  useEffect(() => {
    setState(loadEneaShadowWorkflow(window.localStorage, practiceId));
  }, [practiceId]);

  useEffect(() => {
    saveEneaShadowWorkflow(window.localStorage, practiceId, state);
  }, [practiceId, state]);

  const prerequisitesReady = prepared && documentsChecked;
  const acceptConsent = () => setState((current) => recordEneaShadowEvent({
    ...current,
    consent: "accepted",
    outcome: "idle",
  }, "spid-demo-consent"));
  const declineConsent = () => setState((current) => recordEneaShadowEvent({
    ...current,
    consent: "declined",
    outcome: "idle",
  }, "spid-demo-declined"));
  const runSimulation = () => setState((current) => recordEneaShadowEvent({
    ...current,
    outcome: blockerCount > 0 ? "review_required" : "ready",
  }, blockerCount > 0 ? "local-review-required" : "local-processing-complete"));
  const reset = () => setState(EMPTY_ENEA_SHADOW_WORKFLOW);

  const steps = [
    ["Ingresso fixture", true],
    ["Dati e checklist", prerequisitesReady],
    ["Consenso SPID demo", state.consent === "accepted"],
    ["Lavorazione locale", state.outcome !== "idle"],
    ["Esito e audit", state.outcome !== "idle"],
    ["Export fixture", prepared],
  ] as const;

  return (
    <Card className="border-cyan-200 shadow-sm" data-testid="enea-shadow-cycle">
      <CardHeader>
        <CardTitle className="text-base">Ciclo CRM ombra · demo locale</CardTitle>
        <CardDescription>
          Simula il percorso della pratica fixture. Non usa CRM, ENEA, identità digitale o servizi esterni.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map(([label, complete]) => (
            <div key={label} className="rounded-md border bg-white p-2 text-xs">
              <Badge variant="outline" className={complete ? "text-emerald-700" : "text-slate-500"}>
                {complete ? "Completato" : "In attesa"}
              </Badge>
              <div className="mt-2 font-medium">{label}</div>
            </div>
          ))}
        </div>

        <Alert className="border-cyan-200 bg-cyan-50 text-cyan-950">
          <AlertTitle>Richiesta SPID simulata</AlertTitle>
          <AlertDescription>
            Questa demo registra soltanto il consenso alla simulazione. Non chiedere o inserire username, password,
            OTP, documenti di identità o altre credenziali SPID reali.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={acceptConsent} disabled={!prerequisitesReady}>
            Acconsento alla simulazione SPID
          </Button>
          <Button type="button" variant="outline" onClick={declineConsent} disabled={!prerequisitesReady}>
            Non acconsento
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={runSimulation}
            disabled={!prerequisitesReady || state.consent !== "accepted"}
          >
            Esegui lavorazione locale
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>Azzera simulazione</Button>
        </div>

        {state.outcome !== "idle" && (
          <Alert className={state.outcome === "ready" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}>
            <AlertTitle>{state.outcome === "ready" ? "Esito simulato: pronto" : "Esito simulato: revisione richiesta"}</AlertTitle>
            <AlertDescription>
              {state.outcome === "ready"
                ? "Il ciclo fixture è terminato localmente. Nessun dato è stato trasmesso."
                : `${blockerCount} controlli richiedono ancora intervento umano. Nessun dato è stato trasmesso.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-slate-500">
          Audit locale: {state.audit.length
            ? state.audit.map(({ event }) => event).join(" · ")
            : "nessun evento registrato"}
        </div>
      </CardContent>
    </Card>
  );
}
