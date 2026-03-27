import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Building2,
  User,
  Bell,
  Lock,
  CreditCard,
  Save,
  Check,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";

// ── Schemas ────────────────────────────────────────────────────────────────────

const companySchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Ragione sociale obbligatoria").max(255),
  piva: z.string().trim().refine(v => v === "" || /^(IT)?\d{11}$/.test(v.replace(/\s/g, "")), { message: "P.IVA non valida (11 cifre)" }).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(16).optional().or(z.literal("")),
  email: z.string().trim().refine(v => v === "" || z.string().email().safeParse(v).success, { message: "Email non valida" }).optional().or(z.literal("")),
  telefono: z.string().trim().refine(v => v === "" || /^[\d\s\+\-().]{6,20}$/.test(v), { message: "Telefono non valido" }).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(255).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().refine(v => v === "" || /^\d{5}$/.test(v), { message: "CAP non valido (5 cifre)" }).optional().or(z.literal("")),
  provincia: z.string().trim().toUpperCase().refine(v => v === "" || /^[A-Z]{2}$/.test(v), { message: "Provincia (2 lettere)" }).optional().or(z.literal("")),
});

const profileSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
  telefono: z.string().trim().refine(v => v === "" || /^[\d\s\+\-().]{6,20}$/.test(v), { message: "Telefono non valido" }).optional().or(z.literal("")),
});

const passwordSchema = z.object({
  current: z.string().min(1, "Password attuale obbligatoria"),
  next: z.string().min(8, "Minimo 8 caratteri"),
  confirm: z.string(),
}).refine(d => d.next === d.confirm, { message: "Le password non coincidono", path: ["confirm"] });

// ── Section navigation ─────────────────────────────────────────────────────────

type Section = "azienda" | "account" | "notifiche" | "sicurezza" | "abbonamento";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: "azienda", label: "Dati Azienda", icon: Building2, description: "Ragione sociale, P.IVA, indirizzo" },
  { id: "account", label: "Account Personale", icon: User, description: "Nome, cognome, contatti" },
  { id: "notifiche", label: "Notifiche", icon: Bell, description: "Preferenze di comunicazione" },
  { id: "sicurezza", label: "Sicurezza", icon: Lock, description: "Password e accesso" },
  { id: "abbonamento", label: "Abbonamento", icon: CreditCard, description: "Piano e pagamenti" },
];

// ── Field helpers ──────────────────────────────────────────────────────────────

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      <Separator className="mt-4" />
    </div>
  );
}

// ── Sezione: Dati Azienda ─────────────────────────────────────────────────────

function SezioneAzienda({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ ragione_sociale: "", piva: "", codice_fiscale: "", email: "", telefono: "", indirizzo: "", citta: "", cap: "", provincia: "" });

  useEffect(() => {
    if (company) setForm({ ragione_sociale: company.ragione_sociale || "", piva: company.piva || "", codice_fiscale: company.codice_fiscale || "", email: company.email || "", telefono: company.telefono || "", indirizzo: company.indirizzo || "", citta: company.citta || "", cap: company.cap || "", provincia: company.provincia || "" });
  }, [company]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(v => ({ ...v, [k]: e.target.value }));
    setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
    setSaved(false);
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("companies").update(data).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
      setSaved(true);
      toast({ title: "Dati aziendali aggiornati" });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => toast({ title: "Errore", description: "Impossibile salvare.", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const r = companySchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeader title="Dati Azienda" description="Informazioni legali e fiscali della tua azienda" />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Ragione Sociale *" error={errors.ragione_sociale}>
            <Input value={form.ragione_sociale} onChange={f("ragione_sociale")} placeholder="Acme S.r.l." />
          </Field>
        </div>
        <Field label="P.IVA" error={errors.piva} hint="11 cifre, con o senza prefisso IT">
          <Input value={form.piva} onChange={f("piva")} placeholder="IT01234567890" />
        </Field>
        <Field label="Codice Fiscale" error={errors.codice_fiscale}>
          <Input value={form.codice_fiscale} onChange={f("codice_fiscale")} placeholder="RSSMRA80A01H501U" className="uppercase" />
        </Field>
      </div>

      <Separator />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email aziendale" error={errors.email}>
          <Input type="email" value={form.email} onChange={f("email")} placeholder="info@acme.it" />
        </Field>
        <Field label="Telefono" error={errors.telefono}>
          <Input value={form.telefono} onChange={f("telefono")} placeholder="+39 02 1234567" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Indirizzo">
            <Input value={form.indirizzo} onChange={f("indirizzo")} placeholder="Via Roma 1" />
          </Field>
        </div>
        <Field label="Città">
          <Input value={form.citta} onChange={f("citta")} placeholder="Milano" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CAP" error={errors.cap}>
            <Input value={form.cap} onChange={f("cap")} placeholder="20121" maxLength={5} />
          </Field>
          <Field label="Provincia" error={errors.provincia}>
            <Input value={form.provincia} onChange={f("provincia")} placeholder="MI" maxLength={2} className="uppercase" />
          </Field>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {mutation.isPending ? "Salvataggio..." : saved ? "Salvato!" : "Salva modifiche"}
        </Button>
      </div>
    </form>
  );
}

// ── Sezione: Account Personale ────────────────────────────────────────────────

function SezioneAccount({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ nome: "", cognome: "", telefono: "" });

  useEffect(() => {
    if (profile) setForm({ nome: profile.nome || "", cognome: profile.cognome || "", telefono: profile.telefono || "" });
  }, [profile]);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(v => ({ ...v, [k]: e.target.value }));
    setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
    setSaved(false);
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("profiles").update(data).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
      setSaved(true);
      toast({ title: "Profilo aggiornato" });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => toast({ title: "Errore", description: "Impossibile salvare.", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const r = profileSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeader title="Account Personale" description="Le tue informazioni di contatto personali" />

      {/* Email (read-only) */}
      <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Indirizzo Email</p>
          <p className="text-sm text-muted-foreground mt-0.5">{profile?.email ?? "—"}</p>
        </div>
        <Badge variant="secondary" className="text-xs">Non modificabile</Badge>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome *" error={errors.nome}>
          <Input value={form.nome} onChange={f("nome")} placeholder="Mario" />
        </Field>
        <Field label="Cognome *" error={errors.cognome}>
          <Input value={form.cognome} onChange={f("cognome")} placeholder="Rossi" />
        </Field>
        <Field label="Telefono" error={errors.telefono}>
          <Input value={form.telefono} onChange={f("telefono")} placeholder="+39 333 1234567" />
        </Field>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {mutation.isPending ? "Salvataggio..." : saved ? "Salvato!" : "Salva modifiche"}
        </Button>
      </div>
    </form>
  );
}

// ── Sezione: Notifiche ────────────────────────────────────────────────────────

function SezioneNotifiche() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Notifiche" description="Scegli come e quando vuoi essere avvisato" />
      <div className="space-y-4">
        {[
          { label: "Aggiornamenti pratica", desc: "Quando lo stato di una pratica cambia", active: true },
          { label: "Nuovi documenti", desc: "Quando vengono caricati nuovi documenti", active: true },
          { label: "Messaggi ricevuti", desc: "Quando ricevi un nuovo messaggio o risposta", active: false },
          { label: "Scadenze imminenti", desc: "Promemoria per le scadenze entro 7 giorni", active: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <Badge variant={item.active ? "default" : "secondary"} className="text-xs">
              {item.active ? "Attive" : "Disattive"}
            </Badge>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Per modificare le preferenze di notifica contatta il supporto.</p>
    </div>
  );
}

// ── Sezione: Sicurezza ────────────────────────────────────────────────────────

function SezioneSicurezza() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async (newPwd: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
    },
    onSuccess: () => {
      setDone(true);
      setForm({ current: "", next: "", confirm: "" });
      toast({ title: "Password aggiornata con successo" });
      setTimeout(() => setDone(false), 4000);
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const r = passwordSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    mutation.mutate(form.next);
  };

  const PasswordInput = ({ field, label, show, toggle }: { field: "current" | "next" | "confirm"; label: string; show: boolean; toggle: () => void }) => (
    <Field label={label} error={errors[field]}>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={form[field]}
          onChange={e => { setForm(v => ({ ...v, [field]: e.target.value })); setErrors(p => { const n = { ...p }; delete n[field]; return n; }); }}
          className="pr-10"
          placeholder="••••••••"
        />
        <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeader title="Sicurezza" description="Aggiorna la tua password di accesso" />

      <div className="max-w-md space-y-4">
        <PasswordInput field="current" label="Password attuale" show={showCurrent} toggle={() => setShowCurrent(v => !v)} />
        <PasswordInput field="next" label="Nuova password" show={showNext} toggle={() => setShowNext(v => !v)} />
        <Field label="Conferma nuova password" error={errors.confirm}>
          <div className="relative">
            <Input
              type={showNext ? "text" : "password"}
              value={form.confirm}
              onChange={e => { setForm(v => ({ ...v, confirm: e.target.value })); setErrors(p => { const n = { ...p }; delete n.confirm; return n; }); }}
              className="pr-10"
              placeholder="••••••••"
            />
          </div>
        </Field>

        <div className="rounded-lg bg-muted/40 border px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Requisiti password</p>
          <p>• Minimo 8 caratteri</p>
          <p>• Usa lettere maiuscole, minuscole e numeri</p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {done ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {mutation.isPending ? "Aggiornamento..." : done ? "Aggiornata!" : "Aggiorna password"}
        </Button>
      </div>
    </form>
  );
}

// ── Sezione: Abbonamento ──────────────────────────────────────────────────────

function SezioneAbbonamento() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Abbonamento" description="Dettagli del tuo piano e storico pagamenti" />
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Piano attivo</p>
            <p className="text-xl font-bold mt-1">Standard</p>
            <p className="text-sm text-muted-foreground mt-1">Accesso completo alla piattaforma</p>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Attivo</Badge>
        </div>
      </div>

      <div className="rounded-lg border px-4 py-4 flex items-center justify-between group cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => window.location.href = "/wallet"}>
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Estratto Conto</p>
            <p className="text-xs text-muted-foreground">Visualizza transazioni e ricariche wallet</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </div>

      <p className="text-xs text-muted-foreground">Per modificare il piano o richiedere informazioni, contatta il supporto tramite la sezione <strong>Assistenza</strong>.</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ImpostazioniAzienda() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("azienda");

  const activeSection = SECTIONS.find(s => s.id === section)!;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gestisci il tuo account e le preferenze aziendali</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* ── Left sidebar nav ─────────────────────────────────────────────── */}
        <nav className="md:w-56 shrink-0">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSection(s.id)}
                    className={[
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all",
                      active
                        ? "bg-primary/8 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Right content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border bg-card p-6">
            {section === "azienda" && companyId && (
              <SezioneAzienda companyId={companyId} />
            )}
            {section === "azienda" && !companyId && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p>Nessuna azienda associata al tuo account.</p>
              </div>
            )}
            {section === "account" && user && (
              <SezioneAccount userId={user.id} />
            )}
            {section === "notifiche" && <SezioneNotifiche />}
            {section === "sicurezza" && <SezioneSicurezza />}
            {section === "abbonamento" && <SezioneAbbonamento />}
          </div>
        </div>
      </div>
    </div>
  );
}
