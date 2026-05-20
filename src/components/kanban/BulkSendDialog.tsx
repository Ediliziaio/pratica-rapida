/**
 * BulkSendDialog — invio bulk WhatsApp/email a un set di pratiche selezionate
 * dal Kanban (o futura tabella).
 *
 * Use case: admin seleziona 10-50 pratiche dal Kanban → "Invia WhatsApp" →
 * sceglie un template approvato → conferma → loop di invio con throttle.
 *
 * Caveat:
 * - WhatsApp: solo template approvati (richiesti da Meta per invii fuori
 *   dalla finestra 24h). Se la finestra è chiusa, solo template lavorano.
 * - Email: si appoggia su `send-email` con template hardcoded.
 * - Throttle 500ms tra invii per non saturare Meta API (limite ~80 msg/sec).
 * - Errori per-pratica raccolti e mostrati nel summary finale.
 */

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, MessageCircle, Mail, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";

interface PracticeForBulk {
  id: string;
  cliente_nome: string | null;
  cliente_cognome?: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  form_token?: string | null;
}

interface WhatsappTemplate {
  id: string;
  meta_template_name: string;
  language: string;
  body_text: string;
}

const EMAIL_TEMPLATES = [
  { value: "pratica_ricevuta", label: "Pratica ricevuta" },
  { value: "sollecito_privato", label: "Sollecito privato" },
  { value: "form_compilato", label: "Form compilato" },
  { value: "pratica_inviata", label: "Pratica inviata ENEA" },
  { value: "recensione", label: "Richiesta recensione" },
];

type Channel = "whatsapp" | "email";

export function BulkSendDialog({
  practices,
  defaultChannel,
  onClose,
}: {
  practices: PracticeForBulk[];
  defaultChannel: Channel;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [params, setParams] = useState<string>("");
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [results, setResults] = useState<Array<{ practiceId: string; success: boolean; error?: string }>>([]);

  // Reset selection quando si cambia channel (i template sono diversi)
  useEffect(() => {
    setSelectedTemplate("");
  }, [channel]);

  // Carica template WhatsApp approvati dal DB
  const { data: waTemplates } = useQuery({
    queryKey: ["whatsapp-templates-approved-bulk"],
    queryFn: async (): Promise<WhatsappTemplate[]> => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, meta_template_name, language, body_text")
        .eq("status", "APPROVED")
        .eq("is_active", true)
        .order("meta_template_name");
      if (error) throw error;
      return (data as WhatsappTemplate[]) ?? [];
    },
    enabled: channel === "whatsapp",
  });

  // Pratiche con contatti validi per il canale scelto
  const validPractices = useMemo(() => {
    return practices.filter((p) =>
      channel === "whatsapp" ? !!p.cliente_telefono : !!p.cliente_email,
    );
  }, [practices, channel]);

  const invalidCount = practices.length - validPractices.length;

  // Preview body con esempio del primo cliente
  const previewBody = useMemo(() => {
    if (channel !== "whatsapp") return "";
    const tpl = waTemplates?.find((t) => t.meta_template_name === selectedTemplate);
    if (!tpl) return "";
    const firstPractice = validPractices[0];
    const paramsList = params.split(",").map((p) => p.trim()).filter(Boolean);
    return tpl.body_text
      .replace(/\{\{(\d+)\}\}/g, (_, n) => {
        const idx = parseInt(n, 10) - 1;
        return paramsList[idx] || (idx === 0 ? firstPractice?.cliente_nome ?? "Nome" : `{{${n}}}`);
      });
  }, [channel, waTemplates, selectedTemplate, params, validPractices]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Scegli un template");
      if (validPractices.length === 0) throw new Error("Nessuna pratica con contatto valido");

      const total = validPractices.length;
      setProgress({ sent: 0, failed: 0, total });
      const collected: Array<{ practiceId: string; success: boolean; error?: string }> = [];

      // Throttle 500ms tra invii — Meta limite 80 msg/sec, ma manteniamo margine
      // ampio per quality rating + per ridurre il rischio rate-limit.
      for (let i = 0; i < validPractices.length; i++) {
        const p = validPractices[i];
        try {
          if (channel === "whatsapp") {
            // Per template con {{N}}: usa params espliciti se forniti, altrimenti
            // injecta nome cliente come {{1}} (utile per template tipo
            // sollecito_compilazione: {{1}} nome).
            const paramsList = params.split(",").map((s) => s.trim()).filter(Boolean);
            const parameters = paramsList.length > 0
              ? paramsList.map((text) => ({ type: "text", text }))
              : [{ type: "text", text: p.cliente_nome ?? "Cliente" }];
            const components = [{ type: "body", parameters }];

            const { data, error } = await supabase.functions.invoke("send-whatsapp", {
              body: {
                to: p.cliente_telefono!,
                template_name: selectedTemplate,
                language: "it",
                components,
                practice_id: p.id,
              },
            });
            if (error) throw new Error(error.message);
            const res = data as { success?: boolean; error?: string };
            if (!res.success) throw new Error(res.error ?? "send fallito");
          } else {
            const { data, error } = await supabase.functions.invoke("send-email", {
              body: {
                to: p.cliente_email!,
                template: selectedTemplate,
                data: {
                  nome: p.cliente_nome ?? "",
                  cognome: p.cliente_cognome ?? "",
                  practice_id: p.id,
                  link: p.form_token ? `https://app.praticarapida.it/form/${p.form_token}` : "",
                },
              },
            });
            if (error) throw new Error(error.message);
            const res = data as { success?: boolean; error?: string };
            if (!res.success) throw new Error(res.error ?? "send fallito");
          }
          collected.push({ practiceId: p.id, success: true });
          setProgress((prev) => prev ? { ...prev, sent: prev.sent + 1 } : null);
        } catch (err) {
          collected.push({
            practiceId: p.id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
          setProgress((prev) => prev ? { ...prev, failed: prev.failed + 1 } : null);
        }

        // Throttle (skip per l'ultimo)
        if (i < validPractices.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      return collected;
    },
    onSuccess: (collected) => {
      setResults(collected);
      const ok = collected.filter((r) => r.success).length;
      const fail = collected.filter((r) => !r.success).length;
      toast({
        title: `Invio completato`,
        description: `${ok} inviati, ${fail} errori${invalidCount > 0 ? ` (+${invalidCount} skippati per contatto mancante)` : ""}.`,
        variant: fail > 0 ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore invio bulk", description: err.message });
    },
  });

  const isInProgress = sendMutation.isPending;
  const isDone = !!results.length;
  const canSubmit = !!selectedTemplate && validPractices.length > 0 && !isInProgress && !isDone;

  return (
    <Dialog open onOpenChange={(o) => !o && !isInProgress && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel === "whatsapp" ? <MessageCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            Invio bulk {channel === "whatsapp" ? "WhatsApp" : "Email"}
          </DialogTitle>
          <DialogDescription>
            Invia un messaggio a <strong>{validPractices.length}</strong> {validPractices.length === 1 ? "cliente" : "clienti"}
            {invalidCount > 0 && (
              <span className="text-amber-700"> · {invalidCount} skippati (no {channel === "whatsapp" ? "telefono" : "email"})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Switch canale */}
          {!isInProgress && !isDone && (
            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md text-sm">
              <button
                onClick={() => setChannel("whatsapp")}
                className={`flex-1 px-3 py-1.5 rounded font-medium transition-colors gap-1.5 flex items-center justify-center ${
                  channel === "whatsapp" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
              <button
                onClick={() => setChannel("email")}
                className={`flex-1 px-3 py-1.5 rounded font-medium transition-colors gap-1.5 flex items-center justify-center ${
                  channel === "email" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
            </div>
          )}

          {/* Template selector */}
          {!isInProgress && !isDone && (
            <div>
              <Label htmlFor="template">Template</Label>
              <select
                id="template"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— scegli template —</option>
                {channel === "whatsapp"
                  ? waTemplates?.map((t) => (
                      <option key={t.id} value={t.meta_template_name}>
                        {t.meta_template_name} ({t.language})
                      </option>
                    ))
                  : EMAIL_TEMPLATES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
              </select>
              {channel === "whatsapp" && waTemplates && waTemplates.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  Nessun template approvato. Crea i template in /admin/whatsapp-config.
                </p>
              )}
            </div>
          )}

          {/* Parametri body (solo WhatsApp con {{N}}) */}
          {!isInProgress && !isDone && channel === "whatsapp" && selectedTemplate && previewBody.includes("{{") && (
            <div>
              <Label htmlFor="bulk-params">Parametri body</Label>
              <Input
                id="bulk-params"
                value={params}
                onChange={(e) => setParams(e.target.value)}
                placeholder="es. Mario, https://app.praticarapida.it/form, 30 giorni"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Valori separati da virgola per ogni <code>{`{{N}}`}</code>. Se vuoto, <code>{`{{1}}`}</code> = nome cliente.
              </p>
            </div>
          )}

          {/* Preview */}
          {!isInProgress && !isDone && channel === "whatsapp" && previewBody && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs">
              <p className="font-semibold text-emerald-900 mb-1">Anteprima (primo cliente)</p>
              <pre className="whitespace-pre-wrap break-words text-slate-700 font-sans">{previewBody}</pre>
            </div>
          )}

          {/* Progress / results */}
          {(isInProgress || isDone) && progress && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {isInProgress ? "Invio in corso..." : "Invio completato"}
                </span>
                <span className="text-muted-foreground">
                  {progress.sent + progress.failed} / {progress.total}
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${((progress.sent + progress.failed) / progress.total) * 100}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Inviati: {progress.sent}
                </span>
                <span className="flex items-center gap-1 text-red-700">
                  <XCircle className="h-3.5 w-3.5" /> Errori: {progress.failed}
                </span>
              </div>

              {/* Dettaglio errori (se ci sono) */}
              {isDone && progress.failed > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-amber-50 p-2 space-y-1">
                  <p className="text-xs font-semibold text-amber-900">Dettaglio errori:</p>
                  {results.filter((r) => !r.success).slice(0, 10).map((r, i) => (
                    <p key={i} className="text-[11px] text-amber-800 break-words">
                      <Badge variant="outline" className="text-[9px] mr-1">{r.practiceId.slice(0, 8)}</Badge>
                      {r.error}
                    </p>
                  ))}
                  {results.filter((r) => !r.success).length > 10 && (
                    <p className="text-[11px] text-amber-700 italic">+ altri {results.filter((r) => !r.success).length - 10} errori</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Warning */}
          {!isInProgress && !isDone && validPractices.length > 50 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-900">
                Stai per inviare <strong>{validPractices.length} messaggi</strong>. L'invio durerà circa <strong>{Math.ceil(validPractices.length * 0.5 / 60)} minuti</strong> (throttle 500ms). Non chiudere questa finestra.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {isDone ? (
            <Button onClick={onClose}>Chiudi</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isInProgress}>
                Annulla
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!canSubmit}
                className="gap-2"
              >
                {isInProgress && <Loader2 className="h-4 w-4 animate-spin" />}
                {isInProgress
                  ? `Invio... ${progress?.sent ?? 0}/${progress?.total ?? 0}`
                  : `Invia a ${validPractices.length} ${validPractices.length === 1 ? "cliente" : "clienti"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
