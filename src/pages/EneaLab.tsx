import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clipboard,
  ExternalLink,
  FileJson,
  FileSearch,
  FlaskConical,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mapSchermaturaPractice } from "@/features/enea-lab/mapper";
import { buildEneaPayload, validatePreparedPractice } from "@/features/enea-lab/preparation";
import type {
  EneaLabField,
  EneaLabFieldStatus,
  EneaLabOverrides,
  EneaLabQueueStatus,
} from "@/features/enea-lab/types";
import { useReadOnlyEneaQueue } from "@/features/enea-lab/useReadOnlyQueue";
import { useDocumentAnalysis } from "@/features/enea-lab/useDocumentAnalysis";
import { cn } from "@/lib/utils";

const ENEA_PORTAL_URL = "https://bonusfiscali.enea.it/";
const EMPTY_OVERRIDES: EneaLabOverrides = {};

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
    label: "Intervento umano",
    shortLabel: "Intervento umano",
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

function FieldRow({
  field,
  overrideValue,
  onOverride,
  onConfirm,
}: {
  field: EneaLabField;
  overrideValue: string;
  onOverride: (value: string) => void;
  onConfirm: () => void;
}) {
  const meta = STATUS_META[field.status];
  const Icon = meta.icon;
  const needsAction = field.editable && field.status !== "ready";

  return (
    <div className="grid gap-3 border-b border-border/60 py-4 last:border-0 md:grid-cols-[minmax(170px,0.9fr)_minmax(260px,1.35fr)_150px_170px] md:items-start">
      <div className="text-sm font-medium text-foreground">{field.label}</div>
      <div>
        <div className={cn("text-sm", field.status === "missing" ? "italic text-muted-foreground" : "text-foreground")}>
          {field.value}
        </div>
        {field.testOnly && (
          <Badge variant="outline" className="mt-1 border-violet-200 bg-violet-50 text-violet-700">
            Solo prova - escluso dall'invio ufficiale
          </Badge>
        )}
        {field.note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{field.note}</p>}
        {needsAction && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label={`Correzione ${field.label}`}
              value={overrideValue}
              onChange={(event) => onOverride(event.target.value)}
              placeholder="Inserisci un valore verificato"
              className="h-8 text-xs"
            />
            {field.status === "review" && !overrideValue && (
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={onConfirm}>
                Conferma controllo
              </Button>
            )}
          </div>
        )}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | EneaLabQueueStatus>("all");
  const [overridesByPractice, setOverridesByPractice] = useState<Record<string, EneaLabOverrides>>({});
  const [confirmedByPractice, setConfirmedByPractice] = useState<Record<string, string[]>>({});
  const [preparedIds, setPreparedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const visibleSourcePractices = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase("it");
    return sourcePractices.filter((practice) => {
      if (queueFilter !== "all" && practice.queueStatus !== queueFilter) return false;
      if (!query) return true;
      return [
        practice.code,
        practice.reseller,
        practice.clienteNome,
        practice.clienteCognome,
        practice.prodottoInstallato,
      ].some((value) => value.toLocaleLowerCase("it").includes(query));
    });
  }, [queueFilter, searchText, sourcePractices]);

  const mappedPractices = useMemo(
    () => visibleSourcePractices.map((practice) => mapSchermaturaPractice(practice)),
    [visibleSourcePractices],
  );
  useEffect(() => {
    if (!selectedId && mappedPractices[0]) setSelectedId(mappedPractices[0].source.id);
    if (mappedPractices.length && selectedId && !mappedPractices.some((practice) => practice.source.id === selectedId)) {
      setSelectedId(mappedPractices[0]?.source.id ?? null);
    }
  }, [mappedPractices, selectedId]);

  const selectedBase = mappedPractices.find((practice) => practice.source.id === selectedId) ?? mappedPractices[0];
  const documentAnalysis = useDocumentAnalysis(selectedBase?.source);
  const selectedOverrides = selectedBase ? overridesByPractice[selectedBase.source.id] ?? EMPTY_OVERRIDES : EMPTY_OVERRIDES;
  const selectedConfirmations = useMemo(
    () => new Set(selectedBase ? confirmedByPractice[selectedBase.source.id] ?? [] : []),
    [confirmedByPractice, selectedBase],
  );
  const selected = useMemo(
    () => selectedBase
      ? mapSchermaturaPractice(selectedBase.source, documentAnalysis.data, {
          overrides: selectedOverrides,
          confirmedFieldIds: selectedConfirmations,
          includeTestConventions: true,
        })
      : undefined,
    [documentAnalysis.data, selectedBase, selectedConfirmations, selectedOverrides],
  );
  const issues = useMemo(
    () => selected ? validatePreparedPractice(selected.source, selected, documentAnalysis.data) : [],
    [documentAnalysis.data, selected],
  );
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  useEffect(() => {
    setCopied(false);
  }, [selectedId, selectedOverrides, selectedConfirmations]);

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
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
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
            Nessuna schermatura corrisponde ai filtri correnti. La coda si aggiorna automaticamente ogni 30 secondi.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const totalFields = selected.summary.ready + selected.summary.review + selected.summary.missing;
  const completeness = totalFields ? Math.round((selected.summary.ready / totalFields) * 100) : 0;
  const isPrepared = preparedIds.includes(selected.source.id);
  const testPayload = buildEneaPayload(selected, issues, "test");

  const updateOverride = (fieldId: string, value: string) => {
    setOverridesByPractice((current) => ({
      ...current,
      [selected.source.id]: {
        ...(current[selected.source.id] ?? {}),
        [fieldId]: value,
      },
    }));
    setPreparedIds((current) => current.filter((id) => id !== selected.source.id));
  };

  const confirmField = (fieldId: string) => {
    setConfirmedByPractice((current) => {
      const existing = current[selected.source.id] ?? [];
      return existing.includes(fieldId)
        ? current
        : { ...current, [selected.source.id]: [...existing, fieldId] };
    });
    setPreparedIds((current) => current.filter((id) => id !== selected.source.id));
  };

  const preparePractice = () => {
    setPreparedIds((current) => current.includes(selected.source.id) ? current : [...current, selected.source.id]);
  };

  const copyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(testPayload, null, 2));
    setCopied(true);
  };

  const openEnea = () => {
    window.open(ENEA_PORTAL_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="min-h-screen bg-slate-50/70">
      <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5 bg-violet-100 text-violet-800 hover:bg-violet-100">
                <FlaskConical className="h-3.5 w-3.5" /> Laboratorio locale
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-slate-200 bg-white text-slate-600">
                <LockKeyhole className="h-3.5 w-3.5" /> Non visibile nel CRM
              </Badge>
            </div>
            <h1 className="text-3xl tracking-tight text-slate-950">ENEA Lab</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Prepara, corregge e controlla i dati delle schermature solari prima di aprire il portale ENEA.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-xs text-slate-600 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Sola lettura · aggiornamento ogni 30 secondi
          </div>
        </header>

        <Alert className="mb-6 border-violet-200 bg-violet-50 text-violet-950">
          <CircleDashed className="h-4 w-4 text-violet-700" />
          <AlertTitle>Ambiente controllato</AlertTitle>
          <AlertDescription className="text-violet-800">
            Il CRM viene interrogato solo in lettura. Le correzioni restano nella memoria della pagina; non cambiano stati, file, email, WhatsApp o automazioni. I valori convenzionali sono inclusi soltanto nel pacchetto di prova.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside>
            <Card className="overflow-hidden shadow-sm xl:sticky xl:top-6">
              <CardHeader className="border-b bg-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Coda schermature</CardTitle>
                  <Badge variant="secondary">{visibleSourcePractices.length}</Badge>
                </div>
                <CardDescription className="flex items-center justify-between gap-2">
                  <span>Pratiche da preparare</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => void refetch()} disabled={isFetching} title="Aggiorna coda">
                    <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                  </Button>
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    aria-label="Cerca pratica"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Cliente, rivenditore o codice"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    ["all", "Tutte"],
                    ["ready", "Form ricevuto"],
                    ["waiting_client", "In attesa"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={queueFilter === value ? "default" : "outline"}
                      onClick={() => setQueueFilter(value)}
                      aria-pressed={queueFilter === value}
                      className="h-7 text-xs"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-310px)] space-y-2 overflow-y-auto bg-slate-50/60 p-3">
                {mappedPractices.map((practice) => {
                  const active = practice.source.id === selected.source.id;
                  const prepared = preparedIds.includes(practice.source.id);
                  const practiceTotal = practice.summary.ready + practice.summary.review + practice.summary.missing;
                  const practiceCompleteness = practiceTotal ? Math.round((practice.summary.ready / practiceTotal) * 100) : 0;
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
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{practice.source.code}</div>
                          <div className="mt-1 font-semibold text-slate-950">{practice.source.clienteNome} {practice.source.clienteCognome}</div>
                        </div>
                        {prepared ? <Check className="mt-1 h-4 w-4 text-emerald-600" /> : <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />}
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
                          {practice.summary.missing} interventi
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
                    <CardTitle className="text-xl">{selected.source.clienteNome} {selected.source.clienteCognome}</CardTitle>
                    <Badge variant="outline">{selected.source.code}</Badge>
                    {isPrepared && <Badge className="gap-1 bg-emerald-600"><Check className="h-3 w-3" /> Pacchetto prova generato</Badge>}
                  </div>
                  <CardDescription className="mt-1">{selected.source.prodottoInstallato} · {selected.source.reseller}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openEnea} disabled={!isPrepared} className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Apri ENEA per prova
                  </Button>
                  <Button onClick={preparePractice} disabled={documentAnalysis.isPending} className="gap-2">
                    {isPrepared ? <FileJson className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
                    {isPrepared ? "Rigenera pacchetto" : "Genera pacchetto prova"}
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
                        <div className="flex items-center justify-between"><span className="text-sm font-medium">{meta.shortLabel}</span><Icon className="h-4 w-4" /></div>
                        <div className="mt-2 text-3xl font-bold">{selected.summary[status]}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Completezza verificata: {completeness}%</div>
                    <p className="text-xs text-muted-foreground">I valori di prova non aumentano la percentuale e non sbloccano l'invio ufficiale.</p>
                  </div>
                  <div className="w-full sm:w-64"><Progress value={completeness} className="h-2.5" /></div>
                </div>
              </CardContent>
            </Card>

            {documentAnalysis.isPending && selected.source.queueStatus === "ready" && (
              <Alert className="border-blue-200 bg-blue-50 text-blue-950">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                <AlertTitle>Analisi delle fatture in corso</AlertTitle>
                <AlertDescription>Download in sola lettura ed estrazione di dimensioni, gTot, date e importi.</AlertDescription>
              </Alert>
            )}

            {documentAnalysis.error && (
              <Alert className="border-rose-200 bg-rose-50 text-rose-950">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Analisi documenti non riuscita</AlertTitle>
                <AlertDescription>Intervento umano richiesto. Il CRM non è stato modificato.</AlertDescription>
              </Alert>
            )}

            {blockers.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertTitle>Intervento umano richiesto · {blockers.length}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {blockers.slice(0, 10).map((issue) => <li key={issue.code}>{issue.message}</li>)}
                  </ul>
                  {blockers.length > 10 && <p className="mt-2 text-xs">Altri {blockers.length - 10} campi sono evidenziati nelle sezioni sottostanti.</p>}
                </AlertDescription>
              </Alert>
            )}

            {warnings.length > 0 && (
              <Alert className="border-blue-200 bg-blue-50 text-blue-950">
                <FileSearch className="h-4 w-4 text-blue-700" />
                <AlertTitle>Controlli consigliati</AlertTitle>
                <AlertDescription>{warnings.map((warning) => warning.message).join(" ")}</AlertDescription>
              </Alert>
            )}

            {isPrepared && (
              <Card className="border-violet-200 shadow-sm">
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Pacchetto di prova pronto</CardTitle>
                    <CardDescription>Contiene anche i due valori convenzionali, marcati come test. Nessun dato è stato inviato.</CardDescription>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copyPayload()} className="gap-2">
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copiato" : "Copia pacchetto"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Campi</div><div className="text-xl font-semibold">{Object.keys(testPayload.fields).length}</div></div>
                    <div className="rounded-lg bg-rose-50 p-3"><div className="text-xs text-rose-700">Interventi umani</div><div className="text-xl font-semibold text-rose-800">{testPayload.interventionRequired.length}</div></div>
                    <div className="rounded-lg bg-violet-50 p-3"><div className="text-xs text-violet-700">Modalità</div><div className="text-xl font-semibold text-violet-800">PROVA</div></div>
                  </div>
                </CardContent>
              </Card>
            )}

            {documentAnalysis.data?.documents.length ? (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Esito documenti fiscali</CardTitle>
                  <CardDescription>Controllo locale: nessun file è stato spostato o modificato.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {documentAnalysis.data.documents.map((document) => (
                    <div key={document.path} className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-[1fr_150px_120px_110px] sm:items-center">
                      <div className="min-w-0 truncate font-medium" title={document.path}>{document.path.split("/").at(-1)}</div>
                      <div>{document.documentType === "credit_note" ? "Nota di credito" : document.documentType === "invoice" ? "Fattura" : "Non riconosciuto"}</div>
                      <div>{document.documentDate ?? "Data assente"}</div>
                      <Badge variant="outline" className={cn("w-fit", document.status === "parsed" ? "text-emerald-700" : "text-rose-700")}>{document.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Mappatura CRM → ENEA</CardTitle>
                <CardDescription>Correggi localmente i valori mancanti oppure conferma quelli che richiedono un controllo.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={selected.sections[0].id} key={selected.source.id}>
                  <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto bg-slate-100 p-1">
                    {selected.sections.map((currentSection) => (
                      <TabsTrigger key={currentSection.id} value={currentSection.id} className="whitespace-nowrap text-xs">{currentSection.title}</TabsTrigger>
                    ))}
                  </TabsList>
                  {selected.sections.map((currentSection) => (
                    <TabsContent key={currentSection.id} value={currentSection.id} className="mt-0">
                      <div className="mb-2 rounded-lg bg-slate-50 px-4 py-3">
                        <h2 className="text-base font-semibold text-slate-900">{currentSection.title}</h2>
                        <p className="text-sm text-slate-500">{currentSection.description}</p>
                      </div>
                      <div className="hidden border-b px-0 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[minmax(170px,0.9fr)_minmax(260px,1.35fr)_150px_170px] md:gap-3">
                        <span>Campo ENEA</span><span>Valore</span><span>Origine</span><span>Stato</span>
                      </div>
                      {currentSection.fields.map((field) => (
                        <FieldRow
                          key={field.id}
                          field={field}
                          overrideValue={selectedOverrides[field.id] ?? ""}
                          onOverride={(value) => updateOverride(field.id, value)}
                          onConfirm={() => confirmField(field.id)}
                        />
                      ))}
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
