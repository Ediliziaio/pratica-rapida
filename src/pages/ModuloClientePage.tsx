import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";

type TipoModulo = "schermature-solari" | "infissi" | "impianto-termico";

interface TokenInfo {
  token_id: string;
  pratica_id: string;
  tipo_modulo: TipoModulo;
  stato: string;
  expires_at: string;
  nome_cliente: string;
}

// ── Form state types ─────────────────────────────────────────────────────────

interface FormSchermature {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  tipologia_schermatura: string;
  larghezza_cm: string;
  altezza_cm: string;
  colore: string;
  note: string;
}

interface FormInfissi {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  tipologia_infisso: string;
  materiale: string;
  numero_infissi: string;
  larghezza_cm: string;
  altezza_cm: string;
  trasmittanza_vecchio: string;
  trasmittanza_nuovo: string;
  note: string;
}

interface FormImpianto {
  nome_cliente: string;
  cognome_cliente: string;
  indirizzo_intervento: string;
  tipo_impianto_vecchio: string;
  tipo_impianto_nuovo: string;
  potenza_kw: string;
  anno_installazione: string;
  classe_energetica: string;
  note: string;
}

// ── Shared field component ────────────────────────────────────────────────────

function Field({
  label, id, value, onChange, type = "text", placeholder, required,
}: {
  label: string; id: string; value: string;
  onChange: (v: string) => void; type?: string;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-11 text-base"
      />
    </div>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="note" className="text-sm font-medium">Note aggiuntive</Label>
      <Textarea
        id="note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Eventuali note o osservazioni..."
        className="text-base min-h-[80px] resize-none"
      />
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return (
    <div className="pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 border-b pb-1.5">{title}</p>
    </div>
  );
}

// ── Form: Schermature Solari ──────────────────────────────────────────────────

function FormSchermatureView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormSchermature>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    tipologia_schermatura: "",
    larghezza_cm: "",
    altezza_cm: "",
    colore: "",
    note: "",
  });

  const set = (k: keyof FormSchermature) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_schermature").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        tipologia_schermatura: form.tipologia_schermatura || null,
        larghezza_cm: form.larghezza_cm ? Number(form.larghezza_cm) : null,
        altezza_cm: form.altezza_cm ? Number(form.altezza_cm) : null,
        colore: form.colore || null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Dettagli schermatura" />
      <Field label="Tipologia schermatura" id="tipo" value={form.tipologia_schermatura} onChange={set("tipologia_schermatura")} placeholder="Es. Tenda da sole, Veneziana, Rullo..." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Larghezza (cm)" id="larghezza" value={form.larghezza_cm} onChange={set("larghezza_cm")} type="number" placeholder="0" />
        <Field label="Altezza (cm)" id="altezza" value={form.altezza_cm} onChange={set("altezza_cm")} type="number" placeholder="0" />
      </div>
      <Field label="Colore" id="colore" value={form.colore} onChange={set("colore")} placeholder="Es. Bianco, Grigio antracite..." />
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Form: Infissi ─────────────────────────────────────────────────────────────

function FormInfissiView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormInfissi>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    tipologia_infisso: "",
    materiale: "",
    numero_infissi: "",
    larghezza_cm: "",
    altezza_cm: "",
    trasmittanza_vecchio: "",
    trasmittanza_nuovo: "",
    note: "",
  });

  const set = (k: keyof FormInfissi) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_infissi").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        tipologia_infisso: form.tipologia_infisso || null,
        materiale: form.materiale || null,
        numero_infissi: form.numero_infissi ? Number(form.numero_infissi) : null,
        larghezza_cm: form.larghezza_cm ? Number(form.larghezza_cm) : null,
        altezza_cm: form.altezza_cm ? Number(form.altezza_cm) : null,
        trasmittanza_vecchio: form.trasmittanza_vecchio ? Number(form.trasmittanza_vecchio) : null,
        trasmittanza_nuovo: form.trasmittanza_nuovo ? Number(form.trasmittanza_nuovo) : null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Dettagli infissi" />
      <Field label="Tipologia infisso" id="tipo" value={form.tipologia_infisso} onChange={set("tipologia_infisso")} placeholder="Es. Finestra, Porta-finestra, Portone..." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Materiale" id="materiale" value={form.materiale} onChange={set("materiale")} placeholder="Es. PVC, Alluminio, Legno..." />
        <Field label="N° infissi" id="numero" value={form.numero_infissi} onChange={set("numero_infissi")} type="number" placeholder="0" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Larghezza (cm)" id="larghezza" value={form.larghezza_cm} onChange={set("larghezza_cm")} type="number" placeholder="0" />
        <Field label="Altezza (cm)" id="altezza" value={form.altezza_cm} onChange={set("altezza_cm")} type="number" placeholder="0" />
      </div>

      <Section title="Dati termici" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trasmittanza vecchio (W/m²K)" id="tv" value={form.trasmittanza_vecchio} onChange={set("trasmittanza_vecchio")} type="number" placeholder="0.00" />
        <Field label="Trasmittanza nuovo (W/m²K)" id="tn" value={form.trasmittanza_nuovo} onChange={set("trasmittanza_nuovo")} type="number" placeholder="0.00" />
      </div>
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Form: Impianto Termico ────────────────────────────────────────────────────

function FormImpiantoView({
  tokenId, praticaId, nomeCliente, onSuccess,
}: { tokenId: string; praticaId: string; nomeCliente: string; onSuccess: () => void }) {
  const parts = nomeCliente.split(" ");
  const [form, setForm] = useState<FormImpianto>({
    nome_cliente: parts[0] ?? "",
    cognome_cliente: parts.slice(1).join(" "),
    indirizzo_intervento: "",
    tipo_impianto_vecchio: "",
    tipo_impianto_nuovo: "",
    potenza_kw: "",
    anno_installazione: "",
    classe_energetica: "",
    note: "",
  });

  const set = (k: keyof FormImpianto) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("client_form_impianto_termico").insert({
        token_id: tokenId,
        pratica_id: praticaId,
        nome_cliente: form.nome_cliente,
        cognome_cliente: form.cognome_cliente,
        indirizzo_intervento: form.indirizzo_intervento || null,
        tipo_impianto_vecchio: form.tipo_impianto_vecchio || null,
        tipo_impianto_nuovo: form.tipo_impianto_nuovo || null,
        potenza_kw: form.potenza_kw ? Number(form.potenza_kw) : null,
        anno_installazione: form.anno_installazione ? Number(form.anno_installazione) : null,
        classe_energetica: form.classe_energetica || null,
        note: form.note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("client_form_tokens")
        .update({ stato: "compilato", compiled_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (updateError) throw updateError;
    },
    onSuccess,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
      <Section title="Dati personali" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" id="nome" value={form.nome_cliente} onChange={set("nome_cliente")} required />
        <Field label="Cognome" id="cognome" value={form.cognome_cliente} onChange={set("cognome_cliente")} required />
      </div>
      <Field label="Indirizzo intervento" id="indirizzo" value={form.indirizzo_intervento} onChange={set("indirizzo_intervento")} placeholder="Via, Città, CAP" />

      <Section title="Impianto esistente" />
      <Field label="Tipo impianto vecchio" id="tipoV" value={form.tipo_impianto_vecchio} onChange={set("tipo_impianto_vecchio")} placeholder="Es. Caldaia a gas, Pompa di calore..." />

      <Section title="Nuovo impianto" />
      <Field label="Tipo impianto nuovo" id="tipoN" value={form.tipo_impianto_nuovo} onChange={set("tipo_impianto_nuovo")} placeholder="Es. Pompa di calore aria-acqua..." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Potenza (kW)" id="potenza" value={form.potenza_kw} onChange={set("potenza_kw")} type="number" placeholder="0.0" />
        <Field label="Anno installazione" id="anno" value={form.anno_installazione} onChange={set("anno_installazione")} type="number" placeholder="2025" />
      </div>
      <Field label="Classe energetica" id="classe" value={form.classe_energetica} onChange={set("classe_energetica")} placeholder="Es. A+, A++..." />
      <NoteField value={form.note} onChange={set("note")} />

      <SubmitButton isPending={submit.isPending} error={submit.error as Error | null} />
    </form>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton({ isPending, error }: { isPending: boolean; error: Error | null }) {
  return (
    <div className="pt-2 space-y-2">
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error.message}
        </p>
      )}
      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isPending}>
        {isPending ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Invio in corso...
          </div>
        ) : "Invia dati"}
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoModulo, string> = {
  "schermature-solari": "Schermature Solari",
  "infissi": "Infissi",
  "impianto-termico": "Impianto Termico",
};

export default function ModuloClientePage() {
  const { token } = useParams<{ token: string }>();
  const [submitted, setSubmitted] = useState(false);

  const { data: tokenInfo, isLoading, error } = useQuery<TokenInfo | null>({
    queryKey: ["token-info", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc("get_token_info", { p_token: token });
      if (error) throw error;
      return (data as TokenInfo[])[0] ?? null;
    },
    enabled: !!token,
  });

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Error / not found ───────────────────────────────────────────────────────
  if (error || !tokenInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h1 className="text-lg font-semibold">Link non valido</h1>
          <p className="text-sm text-muted-foreground">
            Il link che hai utilizzato non è valido o è già stato usato. Contatta il tuo consulente per ricevere un nuovo link.
          </p>
        </div>
      </div>
    );
  }

  // ── Expired ─────────────────────────────────────────────────────────────────
  const isExpired = new Date(tokenInfo.expires_at) < new Date();
  if (isExpired && tokenInfo.stato !== "compilato") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <Clock className="h-12 w-12 text-orange-400 mx-auto" />
          <h1 className="text-lg font-semibold">Link scaduto</h1>
          <p className="text-sm text-muted-foreground">
            Questo link è scaduto il {new Date(tokenInfo.expires_at).toLocaleDateString("it-IT")}. Contatta il tuo consulente per ricevere un nuovo link.
          </p>
        </div>
      </div>
    );
  }

  // ── Already compiled ────────────────────────────────────────────────────────
  if (tokenInfo.stato === "compilato" || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-sm w-full text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold">Grazie!</h1>
          <p className="text-sm text-muted-foreground">
            I tuoi dati sono stati ricevuti correttamente. Il tuo consulente li utilizzerà per elaborare la pratica ENEA.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="bg-background border-b px-4 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pratica Rapida — ENEA</p>
          <h1 className="text-sm font-semibold leading-tight">
            Modulo {TIPO_LABEL[tokenInfo.tipo_modulo]}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {tokenInfo.nome_cliente && (
          <p className="text-sm text-muted-foreground">
            Ciao <strong>{tokenInfo.nome_cliente}</strong>, compila il modulo qui sotto per fornire i dati necessari alla tua pratica.
          </p>
        )}

        <div className="bg-background rounded-xl border shadow-sm p-5">
          {tokenInfo.tipo_modulo === "schermature-solari" && (
            <FormSchermatureView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
          {tokenInfo.tipo_modulo === "infissi" && (
            <FormInfissiView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
          {tokenInfo.tipo_modulo === "impianto-termico" && (
            <FormImpiantoView
              tokenId={tokenInfo.token_id}
              praticaId={tokenInfo.pratica_id}
              nomeCliente={tokenInfo.nome_cliente}
              onSuccess={() => setSubmitted(true)}
            />
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          I tuoi dati saranno trattati nel rispetto della normativa GDPR e utilizzati esclusivamente per l'elaborazione della pratica ENEA.
        </p>
      </div>
    </div>
  );
}
