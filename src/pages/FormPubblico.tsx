import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { EneaPractice } from "@/integrations/supabase/types";

type FormData = {
  cliente_nome: string;
  cliente_cognome: string;
  cliente_email: string;
  cliente_telefono: string;
  cliente_indirizzo: string;
  cliente_cf: string;
  note: string;
};

export default function FormPubblico() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [practice, setPractice] = useState<EneaPractice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resellerName, setResellerName] = useState("");
  const [form, setForm] = useState<FormData>({
    cliente_nome: "",
    cliente_cognome: "",
    cliente_email: "",
    cliente_telefono: "",
    cliente_indirizzo: "",
    cliente_cf: "",
    note: "",
  });

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
          setForm({
            cliente_nome: row.cliente_nome || "",
            cliente_cognome: row.cliente_cognome || "",
            cliente_email: row.cliente_email || "",
            cliente_telefono: row.cliente_telefono || "",
            cliente_indirizzo: row.cliente_indirizzo || "",
            cliente_cf: row.cliente_cf || "",
            note: row.note || "",
          });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!practice) return;
    setSubmitting(true);

    // ── Client-side validation ───────────────────────────────────────────────
    const errors: string[] = [];
    if (form.cliente_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.cliente_email)) {
      errors.push("Email non valida");
    }
    if (form.cliente_cf && !/^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i.test(form.cliente_cf)) {
      errors.push("Codice fiscale non valido (16 caratteri formato italiano)");
    }
    if (form.cliente_telefono) {
      const digits = form.cliente_telefono.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 13) {
        errors.push("Numero di telefono non valido");
      }
    }
    if (errors.length > 0) {
      toast({ variant: "destructive", title: "Errore", description: errors.join(" · ") });
      setSubmitting(false);
      return;
    }

    // Submit via RPC SECURITY DEFINER — l'unica via per anon di scrivere
    // controllata dal form_token. La funzione DB gestisce:
    //   · validazione (non archiviata, non già compilata)
    //   · spostamento a stage pronte_da_fare (per brand)
    //   · aggiornamento dati cliente
    const { error } = await supabase.rpc("submit_form_by_token", {
      p_token: token!,
      p_cliente_nome: form.cliente_nome,
      p_cliente_cognome: form.cliente_cognome,
      p_cliente_email: form.cliente_email,
      p_cliente_telefono: form.cliente_telefono,
      p_cliente_indirizzo: form.cliente_indirizzo,
      p_cliente_cf: form.cliente_cf,
      p_note: form.note,
    });

    if (error) {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare. Riprova." });
      setSubmitting(false);
      return;
    }

    // Fire Messaggio 3 confirmation (email + WA) to cliente finale via on-stage-changed.
    // The edge function itself guards on tipo_servizio === "servizio_completo" and form_compilato_at.
    supabase.functions
      .invoke("on-stage-changed", {
        body: {
          practice_id: practice.id,
          new_stage_type: "pronte_da_fare",
        },
      })
      .catch(console.error);

    setSubmitted(true);
    setSubmitting(false);
  };

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

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.cliente_nome}
                onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cognome">Cognome *</Label>
              <Input
                id="cognome"
                value={form.cliente_cognome}
                onChange={(e) => setForm({ ...form, cliente_cognome: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.cliente_email}
              onChange={(e) => setForm({ ...form, cliente_email: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="telefono">Telefono *</Label>
            <Input
              id="telefono"
              type="tel"
              placeholder="+39 333 1234567"
              value={form.cliente_telefono}
              onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="indirizzo">Indirizzo impianto</Label>
            <Input
              id="indirizzo"
              value={form.cliente_indirizzo}
              onChange={(e) => setForm({ ...form, cliente_indirizzo: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf">Codice Fiscale</Label>
            <Input
              id="cf"
              value={form.cliente_cf}
              onChange={(e) => setForm({ ...form, cliente_cf: e.target.value.toUpperCase() })}
              maxLength={16}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="note">Note aggiuntive</Label>
            <Textarea
              id="note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Invia dati
          </Button>
        </form>

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
