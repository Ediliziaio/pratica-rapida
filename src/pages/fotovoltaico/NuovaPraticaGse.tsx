import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Save, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  EMPTY_PHOTOVOLTAICO_INTAKE,
  PHOTOVOLTAICO_IVA_PERCENT,
  PHOTOVOLTAICO_PRICE_EUR,
  PHOTOVOLTAICO_UNIFILARE_PRICE_EUR,
  photovoltaicNetPrice,
  validatePhotovoltaicSubmission,
  type PhotovoltaicIntake,
} from "@/features/fotovoltaico/intake";
import { validatePhotovoltaicAttachment } from "@/features/fotovoltaico/attachments";

type DraftSummary = {
  id: string;
  proprietario_nome: string | null;
  riferimento_interno: string | null;
  updated_at: string;
  form_data: PhotovoltaicIntake;
};

type CompanyContact = {
  ragione_sociale: string;
  email: string | null;
  telefono: string | null;
};

type AttachmentCategory = {
  key: string;
  label: string;
  help?: string;
  accept: string;
};

const STEPS = [
  "Proprietario e impianto",
  "Documenti e fotografie",
  "Controllo e invio",
];

const ATTACHMENTS: AttachmentCategory[] = [
  {
    key: "fatture_vendita",
    label: "Carica le fatture di vendita",
    help: "Solo file PDF · puoi selezionare più fatture insieme",
    accept: "application/pdf",
  },
  {
    key: "fascicolo_tecnico",
    label: "Carica documenti e fotografie tecniche",
    help: "PDF e immagini · puoi selezionare tutti i file insieme",
    accept: "application/pdf,image/jpeg,image/png,image/webp",
  },
  {
    key: "schema_unifilare_rivenditore",
    label: "Carica lo schema unifilare",
    help: "Obbligatorio se non richiedi a Pratica Rapida la preparazione dello schema · solo PDF",
    accept: "application/pdf",
  },
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Queste tabelle sono create dalla migrazione della funzionalità. Il client
// senza schema generato evita cast ripetuti finché i tipi Supabase sono aggiornati.
const photovoltaicDb = supabase as unknown as SupabaseClient;

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required ? " *" : ""}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-emerald-800">{title}</h2>
      {children}
    </section>
  );
}

function safeFileName(name: string) {
  const parts = name.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()!.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "documento";
  return `${base}${ext}`;
}

export default function NuovaPraticaGse() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isInternal } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const [staffSelectedCompanyId, setStaffSelectedCompanyId] = useState("");
  const [step, setStep] = useState(0);
  const [data, setData] = useState<PhotovoltaicIntake>(EMPTY_PHOTOVOLTAICO_INTAKE);
  const [practiceId, setPracticeId] = useState<string | null>(searchParams.get("draft"));
  const [companyName, setCompanyName] = useState("");
  const [companyContact, setCompanyContact] = useState<CompanyContact | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const effectiveCompanyId = isInternal ? staffSelectedCompanyId || null : companyId;

  const { data: availableCompanies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ["fotovoltaico-intake-companies"],
    enabled: isInternal,
    queryFn: async () => {
      const { data: companies, error } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .eq("is_active", true)
        .order("ragione_sociale");
      if (error) throw error;
      return companies ?? [];
    },
  });

  const pendingFileCount = useMemo(
    () => Object.values(files).reduce((total, categoryFiles) => total + categoryFiles.length, 0),
    [files],
  );

  const set = <K extends keyof PhotovoltaicIntake>(key: K, value: PhotovoltaicIntake[K]) => {
    setData((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!effectiveCompanyId) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: company }, { data: profile }, { data: draftRows }] = await Promise.all([
        supabase.from("companies").select("ragione_sociale, email, telefono").eq("id", effectiveCompanyId).maybeSingle(),
        supabase.from("profiles").select("email, telefono").eq("id", user?.id ?? "").maybeSingle(),
        photovoltaicDb
          .from("fotovoltaico_practices")
          .select("id, proprietario_nome, riferimento_interno, updated_at, form_data")
          .eq("reseller_id", effectiveCompanyId)
          .eq("status", "bozza")
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      setCompanyName(company?.ragione_sociale ?? "");
      setCompanyContact(company ? {
        ragione_sociale: company.ragione_sociale,
        email: company.email ?? (!isInternal ? profile?.email ?? user?.email ?? null : null),
        telefono: company.telefono ?? (!isInternal ? profile?.telefono ?? null : null),
      } : null);
      setDrafts((draftRows ?? []) as DraftSummary[]);
    };
    void load();
    return () => { cancelled = true; };
  }, [effectiveCompanyId, isInternal, user?.email, user?.id]);

  useEffect(() => {
    if (!practiceId || !effectiveCompanyId) return;
    let cancelled = false;
    const loadDraft = async () => {
      const { data: row, error } = await photovoltaicDb
        .from("fotovoltaico_practices")
        .select("id, form_data, status")
        .eq("id", practiceId)
        .eq("reseller_id", effectiveCompanyId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row || row.status !== "bozza") {
        toast.error("Bozza non disponibile");
        setPracticeId(null);
        setSearchParams({});
        return;
      }
      setData({ ...EMPTY_PHOTOVOLTAICO_INTAKE, ...(row.form_data as Partial<PhotovoltaicIntake>) });
    };
    void loadDraft();
    return () => { cancelled = true; };
  }, [effectiveCompanyId, practiceId, setSearchParams]);

  const baseRow = (id: string) => ({
    id,
    reseller_id: effectiveCompanyId,
    created_by: user?.id,
    status: "bozza",
    riferimento_interno: null,
    proprietario_nome: data.proprietarioNome.trim() || null,
    proprietario_telefono: data.proprietarioTelefono.trim() || null,
    proprietario_email: data.proprietarioEmail.trim() || null,
    indirizzo_impianto: data.indirizzoImpianto.trim() || null,
    stato_impianto: data.statoImpianto || null,
    pod: null,
    distributore: null,
    unifilare_choice: data.schemaUnifilare || null,
    unifilare_status: data.schemaUnifilare === "richiesto_a_pratica_rapida" ? "richiesto" : "fornito_dal_rivenditore",
    base_price_eur: PHOTOVOLTAICO_PRICE_EUR,
    unifilare_price_eur: data.schemaUnifilare === "richiesto_a_pratica_rapida" ? PHOTOVOLTAICO_UNIFILARE_PRICE_EUR : 0,
    net_total_eur: photovoltaicNetPrice(data),
    form_data: {
      ...data,
      prezzoPraticaImponibileEuro: PHOTOVOLTAICO_PRICE_EUR,
      prezzoSchemaUnifilareImponibileEuro: data.schemaUnifilare === "richiesto_a_pratica_rapida" ? PHOTOVOLTAICO_UNIFILARE_PRICE_EUR : 0,
      prezzoImponibileEuro: photovoltaicNetPrice(data),
      ivaPercentuale: PHOTOVOLTAICO_IVA_PERCENT,
    },
  });

  const hasStoredAttachment = async (id: string, category: string): Promise<boolean> => {
    const { count, error } = await photovoltaicDb
      .from("fotovoltaico_attachments")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", id)
      .eq("category", category);
    if (error) throw error;
    return (count ?? 0) > 0;
  };

  const uploadPendingFiles = async (id: string) => {
    if (!effectiveCompanyId) throw new Error("Azienda non disponibile");
    for (const [category, categoryFiles] of Object.entries(files)) {
      for (const file of categoryFiles) {
        const validationError = validatePhotovoltaicAttachment(category, file);
        if (validationError) throw new Error(validationError);
        const path = `${effectiveCompanyId}/${id}/${category}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("fotovoltaico-documents")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const { error: attachmentError } = await photovoltaicDb
          .from("fotovoltaico_attachments")
          .insert({
            practice_id: id,
            category,
            storage_path: path,
            original_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            uploaded_by: user?.id,
          });
        if (attachmentError) throw attachmentError;
      }
    }
    setFiles({});
  };

  const saveDraft = async (quiet = false): Promise<string | null> => {
    if (!effectiveCompanyId || !user) {
      toast.error("Non riesco ad associare la tua azienda. Contatta Pratica Rapida.");
      return null;
    }
    setSaving(true);
    try {
      const id = practiceId ?? crypto.randomUUID();
      if (practiceId) {
        const { error } = await photovoltaicDb
          .from("fotovoltaico_practices")
          .update(baseRow(id))
          .eq("id", id)
          .eq("status", "bozza");
        if (error) throw error;
      } else {
        const { error } = await photovoltaicDb.from("fotovoltaico_practices").insert(baseRow(id));
        if (error) throw error;
        setPracticeId(id);
        setSearchParams({ draft: id });
      }
      await uploadPendingFiles(id);
      if (!quiet) toast.success("Bozza salvata");
      return id;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    const errors = validatePhotovoltaicSubmission(data);
    if (errors.length > 0) {
      toast.error(errors[0], { description: errors.length > 1 ? `Altri ${errors.length - 1} dati da completare.` : undefined });
      return;
    }
    if (data.schemaUnifilare === "fornito_dal_rivenditore") {
      let hasSchema = (files.schema_unifilare_rivenditore?.length ?? 0) > 0;
      if (!hasSchema && practiceId) {
        try {
          hasSchema = await hasStoredAttachment(practiceId, "schema_unifilare_rivenditore");
        } catch {
          toast.error("Non riesco a verificare lo schema unifilare già caricato. Riprova.");
          return;
        }
      }
      if (!hasSchema) {
        toast.error("Carica lo schema unifilare in PDF oppure richiedi la preparazione a Pratica Rapida.");
        return;
      }
    }
    const id = await saveDraft(true);
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await photovoltaicDb
        .from("fotovoltaico_practices")
        .update({
          status: "ricevuta_da_controllare",
          submitted_at: new Date().toISOString(),
          unifilare_requested_at: data.schemaUnifilare === "richiesto_a_pratica_rapida" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .eq("status", "bozza");
      if (error) throw error;
      setSubmitted(true);
      toast.success("Pratica Fotovoltaico / GSE inviata a Pratica Rapida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  if ((companyLoading && !isInternal) || (isInternal && companiesLoading)) {
    return <div className="p-8 text-sm text-muted-foreground">Caricamento…</div>;
  }

  if (!isInternal && !effectiveCompanyId) {
    return (
      <Card className="mx-auto mt-10 max-w-xl">
        <CardHeader><CardTitle>Azienda non associata</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Prima di inserire una pratica Fotovoltaico / GSE dobbiamo associare il tuo account a un rivenditore.
        </CardContent>
      </Card>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <h1 className="text-2xl font-bold">Pratica ricevuta</h1>
            <p className="max-w-lg text-muted-foreground">
              Pratica Rapida controllerà i dati prima di contattare il proprietario. Nessun messaggio è stato inviato automaticamente.
            </p>
            <Button onClick={() => navigate("/fotovoltaico/pratiche")}>Vedi le pratiche Fotovoltaico / GSE</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><Sun className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fotovoltaico / GSE</h1>
          <p className="text-sm text-muted-foreground">{companyName || "Rivenditore"} · Connessione fotovoltaico</p>
        </div>
      </div>

      {isInternal && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-900">Modalità staff — Assegna la pratica a un'azienda</CardTitle>
            <CardDescription>Seleziona il rivenditore o l'installatore per cui stai inserendo la pratica Fotovoltaico / GSE.</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              className={selectClass}
              value={staffSelectedCompanyId}
              onChange={(event) => {
                setStaffSelectedCompanyId(event.target.value);
                setPracticeId(null);
                setSearchParams({});
                setData(EMPTY_PHOTOVOLTAICO_INTAKE);
                setFiles({});
                setCompanyContact(null);
              }}
            >
              <option value="">Scegli azienda…</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.ragione_sociale}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {isInternal && !effectiveCompanyId && (
        <div className="rounded-lg border border-amber-200 bg-white p-5 text-sm text-muted-foreground">
          Scegli l'azienda prima di iniziare la compilazione.
        </div>
      )}

      {effectiveCompanyId && !practiceId && drafts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Riprendi una bozza</CardTitle>
            <CardDescription>Oppure continua compilando una nuova pratica qui sotto.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <Button key={draft.id} variant="outline" size="sm" onClick={() => {
                setPracticeId(draft.id);
                setSearchParams({ draft: draft.id });
              }}>
                {draft.proprietario_nome || draft.riferimento_interno || "Bozza senza nome"}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {effectiveCompanyId && <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">{STEPS[step]}</CardTitle>
              <CardDescription>Passaggio {step + 1} di {STEPS.length}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void saveDraft()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> Salva bozza
            </Button>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              <Section title="A · Dati del rivenditore">
                <p className="text-sm text-muted-foreground">Questi dati arrivano automaticamente dalla tua anagrafica.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Azienda"><Input value={companyName} disabled /></Field>
                  <Field label="Telefono"><Input value={companyContact?.telefono ?? "Non presente in anagrafica"} disabled /></Field>
                  <Field label="E-mail"><Input value={companyContact?.email ?? "Non presente in anagrafica"} disabled /></Field>
                </div>
              </Section>
              <Section title="Due informazioni indispensabili">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Stato dell'impianto" required>
                    <select className={selectClass} value={data.statoImpianto} onChange={(e) => set("statoImpianto", e.target.value as PhotovoltaicIntake["statoImpianto"])}>
                      <option value="">Seleziona…</option>
                      <option value="lavori_non_iniziati">Lavori non iniziati</option>
                      <option value="lavori_in_corso">Lavori in corso</option>
                      <option value="installato_non_connesso">Installato ma non connesso</option>
                      <option value="gia_connesso">Già connesso</option>
                    </select>
                  </Field>
                  <div className="space-y-1.5">
                    <Field label="È già stata aperta una pratica di connessione?" required>
                      <select className={selectClass} value={data.parte1} onChange={(e) => set("parte1", e.target.value as PhotovoltaicIntake["parte1"])}>
                        <option value="">Seleziona…</option><option value="si">Sì</option><option value="no">No</option><option value="non_so">Non so</option>
                      </select>
                    </Field>
                    <p className="text-xs text-muted-foreground">Se non lo sai, scegli “Non so” e carica nel passaggio successivo tutto ciò che possiedi.</p>
                  </div>
                </div>
              </Section>
              <Section title="Proprietario dell'impianto">
                <p className="text-sm text-muted-foreground">Inserisci soltanto i dati che ci servono per contattarlo. Tutto il resto lo chiederà direttamente Pratica Rapida.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome e cognome del proprietario o futuro produttore" required><Input value={data.proprietarioNome} onChange={(e) => set("proprietarioNome", e.target.value)} /></Field>
                  <Field label="Telefono" required><Input inputMode="tel" value={data.proprietarioTelefono} onChange={(e) => set("proprietarioTelefono", e.target.value)} /></Field>
                  <Field label="E-mail" required><Input type="email" value={data.proprietarioEmail} onChange={(e) => set("proprietarioEmail", e.target.value)} /></Field>
                  <Field label="Indirizzo completo dell'impianto" required><Input value={data.indirizzoImpianto} onChange={(e) => set("indirizzoImpianto", e.target.value)} /></Field>
                </div>
              </Section>
            </>
          )}

          {step === 1 && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Qui chiediamo soltanto le fatture di vendita e il materiale tecnico dell'installatore. Bolletta e documenti personali saranno richiesti direttamente al proprietario.</div>
              <Section title="Schema unifilare">
                <p className="text-sm text-muted-foreground">Scegli una sola possibilità. Se ci incarichi della preparazione, produrremo la bozza tecnica da far controllare e firmare al tuo responsabile tecnico.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${data.schemaUnifilare === "fornito_dal_rivenditore" ? "border-emerald-500 bg-emerald-50" : "bg-white hover:border-emerald-300"}`}>
                    <input type="radio" name="schema-unifilare" className="mr-2" checked={data.schemaUnifilare === "fornito_dal_rivenditore"} onChange={() => set("schemaUnifilare", "fornito_dal_rivenditore")} />
                    <span className="font-medium">Allego il nostro schema</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Lo schema deve essere già controllato e firmato dal tecnico abilitato.</span>
                  </label>
                  <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${data.schemaUnifilare === "richiesto_a_pratica_rapida" ? "border-emerald-500 bg-emerald-50" : "bg-white hover:border-emerald-300"}`}>
                    <input type="radio" name="schema-unifilare" className="mr-2" checked={data.schemaUnifilare === "richiesto_a_pratica_rapida"} onChange={() => set("schemaUnifilare", "richiesto_a_pratica_rapida")} />
                    <span className="font-medium">Richiedo la preparazione a Pratica Rapida</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Servizio per impianti fino a 6 kW. Il documento dovrà essere verificato e firmato dal responsabile tecnico dell'installatore.</span>
                  </label>
                </div>
                {data.schemaUnifilare === "richiesto_a_pratica_rapida" && (
                  <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <Checkbox checked={data.confermaSottoSeiKw} onCheckedChange={(checked) => set("confermaSottoSeiKw", checked === true)} />
                    <span className="text-sm text-amber-950">Confermo che la potenza nominale dell'impianto è <strong>fino a 6 kW compresi</strong>.</span>
                  </label>
                )}
              </Section>
              <Section title="Progetto e documenti tecnici">
                <p className="text-sm text-muted-foreground">Le fatture vanno caricate nel loro spazio, esclusivamente in PDF. Nel fascicolo tecnico puoi caricare in un unico blocco dichiarazione di conformità, autotest, certificazioni CEI 0-21 e schede tecniche. Non devi trascrivere i dati né rinominare i file.</p>
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Foto tecniche utili:</strong> pannelli, targhetta inverter, targhette dell'accumulo, quadri elettrici e zona contatori.</div>
                <div className="grid gap-3">
                  {ATTACHMENTS.filter((attachment) => attachment.key !== "schema_unifilare_rivenditore" || data.schemaUnifilare === "fornito_dal_rivenditore").map((attachment) => (
                  <label key={attachment.key} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 hover:border-emerald-400">
                    <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{attachment.label}</span>
                      {attachment.help && <span className="block text-xs text-muted-foreground">{attachment.help}</span>}
                      {(files[attachment.key]?.length ?? 0) > 0 && <span className="mt-1 block text-xs font-medium text-emerald-700">{files[attachment.key].length} file selezionati</span>}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      accept={attachment.accept}
                      multiple
                      onChange={(e) => setFiles((current) => ({ ...current, [attachment.key]: Array.from(e.target.files ?? []) }))}
                    />
                  </label>
                  ))}
                </div>
              </Section>
              <Section title="Eventuali note">
                <Field label="Scrivi solo ciò che ritieni utile"><Textarea value={data.noteFinali} onChange={(e) => set("noteFinali", e.target.value)} /></Field>
              </Section>
            </>
          )}

          {step === 2 && (
            <>
              <Section title="Riepilogo essenziale">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Proprietario</dt><dd className="font-medium">{data.proprietarioNome || "Da compilare"}</dd></div>
                  <div><dt className="text-muted-foreground">Contatto</dt><dd className="font-medium">{data.proprietarioTelefono || "Da compilare"}</dd></div>
                  <div><dt className="text-muted-foreground">Stato impianto</dt><dd className="font-medium">{data.statoImpianto || "Da compilare"}</dd></div>
                  <div><dt className="text-muted-foreground">Schema unifilare</dt><dd className="font-medium">{data.schemaUnifilare === "richiesto_a_pratica_rapida" ? "Preparazione richiesta a Pratica Rapida" : data.schemaUnifilare === "fornito_dal_rivenditore" ? "Allegato dal rivenditore" : "Da scegliere"}</dd></div>
                  <div><dt className="text-muted-foreground">Nuovi allegati</dt><dd className="font-medium">{pendingFileCount}</dd></div>
                </dl>
              </Section>
              <Section title="Conferma e invia">
                <p className="text-sm text-muted-foreground">
                  Confermo che i dati corrispondono alle informazioni disponibili. Pratica Rapida farà il controllo amministrativo; dichiarazioni e verifiche tecniche restano a carico dei soggetti abilitati.
                </p>
                <label className="flex items-start gap-3 rounded-lg border p-4">
                  <Checkbox checked={data.confermaDati} onCheckedChange={(checked) => set("confermaDati", checked === true)} />
                  <span className="text-sm">Confermo che i dati riportati corrispondono alle informazioni e ai documenti disponibili alla data di invio.</span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <Checkbox checked={data.accettaCosto} onCheckedChange={(checked) => set("accettaCosto", checked === true)} />
                  <span className="text-sm text-emerald-950">
                    Inviando la pratica, accetto il preventivo riepilogato qui sotto.
                  </span>
                </label>
                <div className="rounded-xl border bg-white p-4 text-sm">
                  <div className="flex items-center justify-between gap-4 py-1"><span>Gestione pratica Fotovoltaico / GSE</span><strong>{PHOTOVOLTAICO_PRICE_EUR},00 € + IVA</strong></div>
                  {data.schemaUnifilare === "richiesto_a_pratica_rapida" && (
                    <div className="flex items-center justify-between gap-4 border-t py-2"><span>Disegno tecnico schema unifilare</span><strong>{PHOTOVOLTAICO_UNIFILARE_PRICE_EUR},00 € + IVA</strong></div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-4 border-t-2 pt-3 text-base"><span>Totale imponibile</span><strong>{photovoltaicNetPrice(data)},00 € + IVA {PHOTOVOLTAICO_IVA_PERCENT}%</strong></div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                  Dopo il controllo iniziale Pratica Rapida contatterà direttamente il proprietario per bolletta, documento, dati catastali, IBAN, mandato e firme necessarie.
                </div>
              </Section>
            </>
          )}

          <div className="flex items-center justify-between border-t pt-5">
            <Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((value) => Math.max(0, value - 1))}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>
                Avanti <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => void submit()} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Invia a Pratica Rapida
              </Button>
            )}
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}
