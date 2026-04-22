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
    if (!token) return;
    supabase
      .from("enea_practices")
      .select("*, companies:reseller_id(ragione_sociale)")
      .eq("form_token", token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError("Pratica non trovata o link non valido.");
        } else if (data.archived_at) {
          setError("Questa pratica è stata archiviata.");
        } else if (data.form_compilato_at) {
          setSubmitted(true);
        } else {
          setPractice(data as unknown as EneaPractice);
          setResellerName((data.companies as { ragione_sociale?: string } | null)?.ragione_sociale ?? "");
          setForm({
            cliente_nome: data.cliente_nome || "",
            cliente_cognome: data.cliente_cognome || "",
            cliente_email: data.cliente_email || "",
            cliente_telefono: data.cliente_telefono || "",
            cliente_indirizzo: data.cliente_indirizzo || "",
            cliente_cf: data.cliente_cf || "",
            note: data.note || "",
          });
        }
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!practice) return;
    setSubmitting(true);

    // Find the "pronte_da_fare" stage for this practice's brand
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .is("reseller_id", null)
      .eq("stage_type", "pronte_da_fare")
      .eq("brand", practice.brand)
      .single();

    const { error } = await supabase
      .from("enea_practices")
      .update({
        ...form,
        form_compilato_at: new Date().toISOString(),
        current_stage_id: stage?.id ?? practice.current_stage_id,
      })
      .eq("id", practice.id);

    if (error) {
      toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare. Riprova." });
      setSubmitting(false);
      return;
    }

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
          <div className="grid grid-cols-2 gap-4">
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
      </div>
    </div>
  );
}
