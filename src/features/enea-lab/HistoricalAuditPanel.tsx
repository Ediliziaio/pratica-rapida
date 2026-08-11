import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  runHistoricalEneaBatchAudit,
  type HistoricalAuditOutcome,
  type HistoricalBatchAuditReport,
} from "./historicalBatchAudit";

const OUTCOME_META: Record<HistoricalAuditOutcome, { label: string; className: string }> = {
  match: { label: "Coincide", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  blocked: { label: "Bloccata correttamente", className: "border-amber-200 bg-amber-50 text-amber-700" },
  difference: { label: "Differenza reale", className: "border-rose-200 bg-rose-50 text-rose-700" },
  error: { label: "Errore audit", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function HistoricalAuditPanel() {
  const [report, setReport] = useState<HistoricalBatchAuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!import.meta.env.DEV) return null;

  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await runHistoricalEneaBatchAudit(supabase, 5));
    } catch (auditError) {
      setReport(null);
      setError(auditError instanceof Error ? auditError.message : "Audit storico non riuscito.");
    } finally {
      setRunning(false);
    }
  };

  const hasBlockingOutcome = Boolean(report && (report.differences > 0 || report.errors > 0));

  return (
    <Card className="mb-6 border-slate-200 bg-white shadow-sm">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4" /> Audit storico · 5 pratiche concluse
          </CardTitle>
          <CardDescription className="mt-1 max-w-3xl">
            Confronta in sola lettura il mapper attuale con i PDF ENEA finali. Il report mostra solo codici tecnici ed eventuali campi discordanti.
          </CardDescription>
        </div>
        <Button type="button" onClick={() => void runAudit()} disabled={running} className="shrink-0">
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {running ? "Audit in corso…" : "Audit 5 pratiche concluse"}
        </Button>
      </CardHeader>

      {(report || error) && (
        <CardContent className="space-y-4 border-t pt-5">
          {error && (
            <Alert className="border-rose-200 bg-rose-50 text-rose-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Audit non completato</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {report && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Disponibili {report.available}</Badge>
                <Badge variant="outline">Analizzate {report.audited}/{report.requested}</Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Coincidono {report.matches}</Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Bloccate correttamente {report.correctlyBlocked}</Badge>
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Differenze {report.differences}</Badge>
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Errori {report.errors}</Badge>
              </div>

              {report.audited < report.requested && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Campione incompleto</AlertTitle>
                  <AlertDescription>
                    Sono disponibili solo {report.available} pratiche concluse compatibili con l'audit. Non viene inventato o sostituito alcun campione.
                  </AlertDescription>
                </Alert>
              )}

              {!hasBlockingOutcome && report.audited === report.requested && (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Nessuna differenza non gestita nel campione</AlertTitle>
                  <AlertDescription>
                    Le pratiche confrontate coincidono oppure vengono fermate da un blocco già previsto dal laboratorio.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                {report.practices.map((practice) => {
                  const meta = OUTCOME_META[practice.outcome];
                  return (
                    <div key={practice.practiceCode} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{practice.practiceCode}</span>
                        <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>Campi confrontati: {practice.compared}</span>
                        <span>Coincidenze: {practice.matches}</span>
                        <span>Differenze: {practice.mismatches}</span>
                        <span>Blocchi attivi: {practice.blockerCount}</span>
                      </div>
                      {practice.differenceFieldIds.length > 0 && (
                        <p className="mt-2 break-words text-xs text-slate-700">
                          Campi discordanti: {practice.differenceFieldIds.join(", ")}
                        </p>
                      )}
                      {practice.error && <p className="mt-2 text-xs text-rose-700">{practice.error}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
