import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileSearch,
  FlaskConical,
  LockKeyhole,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mapSchermaturaPractice } from "@/features/enea-lab/mapper";
import type { EneaLabField, EneaLabFieldStatus } from "@/features/enea-lab/types";
import { useReadOnlyEneaQueue } from "@/features/enea-lab/useReadOnlyQueue";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  EneaLabFieldStatus,
  { label: string; shortLabel: string; icon: typeof CheckCircle2; classes: string }
> = {
  ready: {
    label: "Pronto per ENEA",
    shortLabel: "Pronti",
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  review: {
    label: "Da controllare",
    shortLabel: "Da controllare",
    icon: FileSearch,
    classes: "border-amber-200 bg-amber-50 text-amber-700",
  },
  missing: {
    label: "Da recuperare",
    shortLabel: "Mancanti",
    icon: AlertTriangle,
    classes: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

function FieldRow({ field }: { field: EneaLabField }) {
  const meta = STATUS_META[field.status];
  const Icon = meta.icon;

  return (
    <div className="grid gap-3 border-b border-border/60 py-3 last:border-0 md:grid-cols-[minmax(170px,0.9fr)_minmax(220px,1.25fr)_150px_150px] md:items-center">
      <div className="text-sm font-medium text-foreground">{field.label}</div>
      <div>
        <div className={cn("text-sm", field.status === "missing" ? "italic text-muted-foreground" : "text-foreground")}>
          {field.value}
        </div>
        {field.note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{field.note}</p>}
      </div>
      <div className="text-xs text-muted-foreground">{field.source}</div>
      <Badge variant="outline" className={cn("w-fit gap-1.5 font-medium", meta.classes)}>
        <Icon className="h-3.5 w-3.5" />
        {meta.label}
      </Badge>
    </div>
  );
}

export default function EneaLab() {
  const { data: sourcePractices = [], error, isPending, isFetching, refetch } = useReadOnlyEneaQueue();
  const mappedPractices = useMemo(
    () => sourcePractices.map(mapSchermaturaPractice),
    [sourcePractices],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preparedIds, setPreparedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedId && mappedPractices[0]) setSelectedId(mappedPractices[0].source.id);
    if (selectedId && !mappedPractices.some((practice) => practice.source.id === selectedId)) {
      setSelectedId(mappedPractices[0]?.source.id ?? null);
    }
  }, [mappedPractices, selectedId]);

  const selected = mappedPractices.find((practice) => practice.source.id === selectedId) ?? mappedPractices[0];

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50/70">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Lettura della coda CRM in corso…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50/70 p-6">
        <Alert className="mx-auto max-w-3xl border-rose-200 bg-rose-50 text-rose-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Collegamento in sola lettura non disponibile</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>ENEA Lab non ha modificato il CRM. Controlla la sessione locale o la configurazione Supabase.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!selected) {
    return (
      <main className="min-h-screen bg-slate-50/70 p-6">
        <Alert className="mx-auto max-w-3xl border-emerald-200 bg-emerald-50 text-emerald-950">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Collegamento attivo</AlertTitle>
          <AlertDescription>
            Non ci sono ancora schermature solari nelle fasi “in attesa cliente” o “pronte da fare”. La coda si aggiorna automaticamente ogni 30 secondi.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const totalFields = selected.summary.ready + selected.summary.review + selected.summary.missing;
  const completeness = Math.round((selected.summary.ready / totalFields) * 100);
  const isPrepared = preparedIds.includes(selected.source.id);

  const preparePractice = () => {
    setPreparedIds((current) => current.includes(selected.source.id) ? current : [...current, selected.source.id]);
  };

  return (
    <main className="min-h-screen bg-slate-50/70">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5 bg-violet-100 text-violet-800 hover:bg-violet-100">
                <FlaskConical className="h-3.5 w-3.5" />
                Laboratorio locale
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-slate-200 bg-white text-slate-600">
                <LockKeyhole className="h-3.5 w-3.5" />
                Non visibile nel CRM
              </Badge>
            </div>
            <h1 className="text-3xl tracking-tight text-slate-950">ENEA Lab</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Prepara e controlla i dati delle schermature solari prima di aprire il portale ENEA.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Sola lettura · aggiornamento ogni 30 secondi
          </div>
        </header>

        <Alert className="mb-6 border-violet-200 bg-violet-50 text-violet-950">
          <CircleDashed className="h-4 w-4 text-violet-700" />
          <AlertTitle>Simulazione controllata</AlertTitle>
          <AlertDescription className="text-violet-800">
            La coda legge soltanto i dati minimi delle schermature presenti nel CRM. Non modifica stati, non carica file e non attiva email, WhatsApp o automazioni.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside>
            <Card className="overflow-hidden shadow-sm xl:sticky xl:top-6">
              <CardHeader className="border-b bg-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Coda di prova</CardTitle>
                  <Badge variant="secondary">{mappedPractices.length}</Badge>
                </div>
                <CardDescription className="flex items-center justify-between gap-2">
                  <span>Primo form e form cliente</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => void refetch()} disabled={isFetching} title="Aggiorna coda">
                    <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 bg-slate-50/60 p-3">
                {mappedPractices.map((practice) => {
                  const active = practice.source.id === selected.source.id;
                  const prepared = preparedIds.includes(practice.source.id);
                  const practiceTotal = practice.summary.ready + practice.summary.review + practice.summary.missing;
                  const practiceCompleteness = Math.round((practice.summary.ready / practiceTotal) * 100);
                  return (
                    <button
                      key={practice.source.id}
                      type="button"
                      onClick={() => setSelectedId(practice.source.id)}
                      className={cn(
                        "w-full rounded-xl border p-4 text-left transition",
                        active
                          ? "border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-500"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            {practice.source.code}
                          </div>
                          <div className="mt-1 font-semibold text-slate-950">
                            {practice.source.clienteNome} {practice.source.clienteCognome}
                          </div>
                        </div>
                        {prepared ? (
                          <Check className="mt-1 h-4 w-4 text-emerald-600" />
                        ) : (
                          <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />
                        )}
                      </div>
                          <div className="mt-1 truncate text-xs text-slate-500">{practice.source.reseller}</div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "mt-2 text-[10px]",
                              practice.source.queueStatus === "ready"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700",
                            )}
                          >
                            {practice.source.queueStatus === "ready" ? "Form cliente ricevuto" : "In attesa del cliente"}
                          </Badge>
                      <div className="mt-4 flex items-center gap-3">
                        <Progress value={practiceCompleteness} className="h-1.5" />
                        <span className="w-9 text-right text-xs font-semibold text-slate-600">{practiceCompleteness}%</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{formatDate(practice.source.ricevutaAt)}</span>
                        <span className={cn(practice.summary.missing ? "text-rose-600" : "text-emerald-600")}>
                          {practice.summary.missing} mancanti
                        </span>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-xl">
                      {selected.source.clienteNome} {selected.source.clienteCognome}
                    </CardTitle>
                    <Badge variant="outline">{selected.source.code}</Badge>
                    {isPrepared && <Badge className="gap-1 bg-emerald-600"><Check className="h-3 w-3" /> Scheda preparata</Badge>}
                  </div>
                  <CardDescription className="mt-1">
                    {selected.source.prodottoInstallato} · {selected.source.reseller}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled title="Sarà attivo nella fase di automazione del browser">
                    Apri portale ENEA
                  </Button>
                  <Button onClick={preparePractice} disabled={isPrepared} className="gap-2">
                    {isPrepared ? <Check className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
                    {isPrepared ? "Scheda pronta" : "Prepara scheda"}
                  </Button>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(STATUS_META) as EneaLabFieldStatus[]).map((status) => {
                    const meta = STATUS_META[status];
                    const Icon = meta.icon;
                    return (
                      <div key={status} className={cn("rounded-xl border p-4", meta.classes)}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{meta.shortLabel}</span>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="mt-2 text-3xl font-bold">{selected.summary[status]}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Completezza automatica: {completeness}%</div>
                    <p className="text-xs text-muted-foreground">Calcolata soltanto sui campi già pronti, senza nascondere quelli da controllare.</p>
                  </div>
                  <div className="w-full sm:w-64">
                    <Progress value={completeness} className="h-2.5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {isPrepared && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <AlertTitle>Scheda di prova preparata</AlertTitle>
                <AlertDescription className="text-emerald-800">
                  La trasformazione locale dei dati è riuscita. Prima della compilazione reale restano {selected.summary.review} controlli e {selected.summary.missing} valori da recuperare.
                </AlertDescription>
              </Alert>
            )}

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Mappatura CRM → ENEA</CardTitle>
                <CardDescription>Ogni riga mostra valore, provenienza e livello di affidabilità.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={selected.sections[0].id} key={selected.source.id}>
                  <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto bg-slate-100 p-1">
                    {selected.sections.map((currentSection) => (
                      <TabsTrigger key={currentSection.id} value={currentSection.id} className="whitespace-nowrap text-xs">
                        {currentSection.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {selected.sections.map((currentSection) => (
                    <TabsContent key={currentSection.id} value={currentSection.id} className="mt-0">
                      <div className="mb-2 rounded-lg bg-slate-50 px-4 py-3">
                        <h2 className="text-base font-semibold text-slate-900">{currentSection.title}</h2>
                        <p className="text-sm text-slate-500">{currentSection.description}</p>
                      </div>
                      <div className="hidden border-b px-0 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[minmax(170px,0.9fr)_minmax(220px,1.25fr)_150px_150px] md:gap-3">
                        <span>Campo ENEA</span>
                        <span>Valore</span>
                        <span>Origine</span>
                        <span>Stato</span>
                      </div>
                      {currentSection.fields.map((field) => <FieldRow key={field.id} field={field} />)}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
