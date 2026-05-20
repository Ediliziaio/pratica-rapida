/**
 * /admin/whatsapp-config — Configurazione integrazione WhatsApp Business API
 *
 * 2 tab:
 *  - "Setup Meta": istruzioni step-by-step per collegare le API Meta +
 *                  stato connessione live (verifica secrets settati su
 *                  Supabase Edge Functions + chiamata Meta /me con il token)
 *  - "Template": lista template approvati Meta + sync button + edit
 *                mapping a trigger event interno
 *
 * La pagina chiama l'edge function `whatsapp-meta-sync` (super_admin only)
 * con `{ action: "status" | "sync_templates" | "test_send" }`.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, MessageCircle,
  ExternalLink, KeyRound, Webhook, Send, Pencil, Loader2, Plus, Sparkles,
  Trash2, Phone,
} from "lucide-react";

// ============================================================
// Tipi
// ============================================================

interface StatusResponse {
  secrets: {
    WA_PHONE_NUMBER_ID: boolean;
    WA_ACCESS_TOKEN: boolean;
    WA_APP_SECRET: boolean;
    WA_WEBHOOK_VERIFY_TOKEN: boolean;
    WA_BUSINESS_ACCOUNT_ID: boolean;
  };
  webhook_url: string;
  business_account: { name?: string; timezone_id?: string; message_template_namespace?: string } | null;
  phone_number: { display_phone_number?: string; verified_name?: string; quality_rating?: string } | null;
  token_status: "valid" | "invalid" | "missing_secrets" | "network_error" | "unknown";
  token_error: string | null;
}

interface WhatsappTemplate {
  id: string;
  meta_template_name: string;
  meta_template_id: string | null;
  language: string;
  category: string | null;
  status: string;
  rejection_reason: string | null;
  header_type: string | null;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: Array<Record<string, unknown>>;
  variables: Array<{ position: number; name: string; description?: string; example?: string }>;
  mapped_trigger_event: string | null;
  display_name: string | null;
  description: string | null;
  is_active: boolean;
  meta_last_synced_at: string | null;
  updated_at: string;
}

// Trigger events disponibili — sincronizzati con process-automations
const TRIGGER_EVENTS = [
  { value: "", label: "— nessun mapping —" },
  { value: "days_waiting_7", label: "Sollecito compilazione modulo (7 giorni)" },
  { value: "days_waiting_fornitore_30", label: "Sollecito fornitore (30 giorni)" },
  { value: "days_waiting_fornitore_60", label: "Sollecito fornitore (60 giorni)" },
  { value: "days_waiting_fornitore_90", label: "Sollecito fornitore (90 giorni)" },
  { value: "recensione_7d_followup", label: "Sollecito recensione (7 giorni)" },
  { value: "stage_changed", label: "Cambio stage pratica" },
  { value: "form_compilato", label: "Form cliente compilato" },
  { value: "pratica_completata", label: "Pratica completata" },
  { value: "manuale", label: "Solo invio manuale" },
];

// ============================================================
// Componente principale
// ============================================================

export default function WhatsappConfig() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Configurazione WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Collega le API Meta WhatsApp Business e gestisci i template approvati.
        </p>
      </div>

      <Tabs defaultValue="setup" className="space-y-4">
        <TabsList>
          <TabsTrigger value="setup" className="gap-2">
            <KeyRound className="h-4 w-4" />
            Setup Meta
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Template
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <SetupTab />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab "Setup Meta"
// ============================================================

function SetupTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["whatsapp-config-status"],
    queryFn: async (): Promise<StatusResponse> => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data as StatusResponse;
    },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiato negli appunti` });
  };

  const allSecretsSet = data && Object.values(data.secrets).every(Boolean);
  const tokenValid = data?.token_status === "valid";

  return (
    <div className="space-y-4">
      {/* Stato connessione */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg">Stato connessione</CardTitle>
              <CardDescription>Verifica live dei secrets + chiamata Meta API</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Verifica
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!data && isFetching && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifica in corso…
            </div>
          )}
          {data && (
            <div className="space-y-3">
              {/* Token status banner */}
              <div className={`rounded-lg border p-3 flex items-start gap-3 ${
                tokenValid
                  ? "bg-emerald-50 border-emerald-200"
                  : data.token_status === "missing_secrets"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-red-50 border-red-200"
              }`}>
                {tokenValid ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> :
                 data.token_status === "missing_secrets" ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" /> :
                 <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {tokenValid && "Connessione Meta attiva"}
                    {data.token_status === "missing_secrets" && "Secrets mancanti su Supabase Edge Functions"}
                    {data.token_status === "invalid" && "Token Meta invalido o scaduto"}
                    {data.token_status === "network_error" && "Errore di rete verso Meta"}
                  </p>
                  {data.token_error && (
                    <p className="text-xs text-red-700 mt-0.5 break-words">{data.token_error}</p>
                  )}
                  {tokenValid && data.phone_number && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <strong>{data.phone_number.verified_name}</strong> · {data.phone_number.display_phone_number}
                      {data.phone_number.quality_rating && (
                        <span className="ml-2">Quality: <Badge variant="outline" className="text-[10px]">{data.phone_number.quality_rating}</Badge></span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Lista secrets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(data.secrets).map(([key, set]) => (
                  <div key={key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-slate-50">
                    {set ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <code className="text-xs flex-1 truncate">{key}</code>
                    <span className="text-[10px] text-muted-foreground">{set ? "settato" : "mancante"}</span>
                  </div>
                ))}
              </div>

              {/* Business account */}
              {data.business_account && (
                <div className="rounded-md border p-3 bg-slate-50 text-xs space-y-1">
                  <p><strong>Business Account:</strong> {data.business_account.name}</p>
                  <p><strong>Timezone:</strong> {data.business_account.timezone_id}</p>
                  {data.business_account.message_template_namespace && (
                    <p><strong>Template namespace:</strong> <code>{data.business_account.message_template_namespace}</code></p>
                  )}
                </div>
              )}

              {/* Webhook URL */}
              <div>
                <Label className="text-xs">URL Webhook (da incollare in Meta)</Label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 px-2.5 py-2 rounded-md bg-slate-100 text-xs truncate">{data.webhook_url}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(data.webhook_url, "URL webhook")} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copia
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guida step-by-step */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Come collegare WhatsApp Business API</CardTitle>
          <CardDescription>Setup completo in 4 step. Tutti i secret vanno nei Supabase Edge Function Secrets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <SetupStep
            n={1}
            title="Crea un'app su Meta for Developers"
            done={data?.secrets.WA_PHONE_NUMBER_ID && data?.secrets.WA_ACCESS_TOKEN}
          >
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
              <li>Vai su <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">developers.facebook.com/apps <ExternalLink className="h-3 w-3" /></a> e crea un'app di tipo <strong>Business</strong>.</li>
              <li>Aggiungi il prodotto <strong>WhatsApp</strong> all'app.</li>
              <li>Vai su <em>API Setup</em> e copia il <strong>Phone Number ID</strong> (Test Number o numero verificato).</li>
              <li>Genera un <strong>Permanent Access Token</strong> da System User (Business Manager → Settings → Users → System Users). Aggiungi WhatsApp + permessi <code className="text-[10px]">whatsapp_business_messaging</code> + <code className="text-[10px]">whatsapp_business_management</code>.</li>
            </ol>
            <SecretsBlock secrets={[
              { name: "WA_PHONE_NUMBER_ID", description: "Phone Number ID di Meta" },
              { name: "WA_ACCESS_TOKEN", description: "Permanent Token System User" },
              { name: "WA_BUSINESS_ACCOUNT_ID", description: "WhatsApp Business Account ID (per sync template)" },
            ]} />
          </SetupStep>

          <SetupStep
            n={2}
            title="Configura il webhook di Meta"
            done={data?.secrets.WA_WEBHOOK_VERIFY_TOKEN && data?.secrets.WA_APP_SECRET}
          >
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
              <li>In Meta Developers → WhatsApp → Configuration → <strong>Webhooks</strong>, clicca <em>Edit</em>.</li>
              <li>Incolla l'URL webhook (sopra) come <em>Callback URL</em>.</li>
              <li>Inserisci come <em>Verify Token</em> una stringa casuale (es. <code className="text-[10px]">openssl rand -hex 32</code>). Salva la stessa stringa in <code className="text-[10px]">WA_WEBHOOK_VERIFY_TOKEN</code>.</li>
              <li>Sottoscrivi i campi: <code className="text-[10px]">messages</code> + <code className="text-[10px]">message_template_status_update</code>.</li>
              <li>Copia l'<strong>App Secret</strong> da App Settings → Basic e salvalo in <code className="text-[10px]">WA_APP_SECRET</code> (serve per HMAC verification dei webhook inbound).</li>
            </ol>
            <SecretsBlock secrets={[
              { name: "WA_WEBHOOK_VERIFY_TOKEN", description: "Stringa casuale per la verifica del webhook" },
              { name: "WA_APP_SECRET", description: "App Secret per HMAC SHA-256 sui webhook" },
            ]} />
          </SetupStep>

          <SetupStep
            n={3}
            title="Crea e fai approvare i template messaggi"
            done={false /* questo step è continuo, non c'è un "done" */}
          >
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
              <li>In Meta Business Manager → WhatsApp Manager → <strong>Message Templates</strong>, crea i template che usi nei flow (es. <code className="text-[10px]">sollecito_compilazione</code>, <code className="text-[10px]">sollecito_recensione</code>, <code className="text-[10px]">pratica_ricevuta</code>, ecc.).</li>
              <li>Usa <code className="text-[10px]">{`{{1}}`}</code>, <code className="text-[10px]">{`{{2}}`}</code>, ecc. come placeholder nel body.</li>
              <li>Lingua: <strong>Italian (it)</strong>. Categoria consigliata: <strong>UTILITY</strong> (transazionali) o <strong>MARKETING</strong> (promo).</li>
              <li>Attendi l'approvazione Meta (di solito qualche minuto fino a 24h).</li>
              <li>Nella tab <strong>Template</strong> qui sopra, clicca <strong>Sincronizza con Meta</strong> per importarli nel sistema.</li>
            </ol>
          </SetupStep>

          <SetupStep
            n={4}
            title="Verifica e mapping ai trigger interni"
            done={tokenValid}
          >
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
              <li>Una volta che la connessione mostra <Badge variant="outline" className="text-[10px]">valid</Badge>, vai alla tab <strong>Template</strong>.</li>
              <li>Per ogni template, imposta il <em>trigger event</em> corrispondente (es. <code className="text-[10px]">sollecito_compilazione</code> → <code className="text-[10px]">days_waiting_7</code>). Questo permette al cron <code className="text-[10px]">process-automations</code> di trovare il template giusto.</li>
              <li>Fai un <strong>test send</strong> per confermare che tutto funzioni.</li>
            </ol>
          </SetupStep>
        </CardContent>
      </Card>

      {/* Phone numbers management */}
      <PhoneNumbersCard />

      {/* Link utili */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 text-xs">
            <a href="https://supabase.com/dashboard/project/xmkjrhwmmuzaqjqlvzxm/settings/functions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Edge Function Secrets (Supabase)
            </a>
            <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Gestione Template (Meta Business)
            </a>
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Documentazione Meta Cloud API
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Card: gestione numeri di telefono (lista + verifica OTP)
// ============================================================

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  name_status?: string;
}

function PhoneNumbersCard() {
  const [verifyTarget, setVerifyTarget] = useState<PhoneNumber | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-phone-numbers"],
    queryFn: async (): Promise<{ phone_numbers: PhoneNumber[]; current_phone_id: string }> => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "list_phone_numbers" },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string; phone_numbers?: PhoneNumber[]; current_phone_id?: string };
      if (!res.success) throw new Error(res.error ?? "Lista numeri non disponibile");
      return { phone_numbers: res.phone_numbers ?? [], current_phone_id: res.current_phone_id ?? "" };
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Numeri di telefono
              </CardTitle>
              <CardDescription>
                Test Number + numeri registrati. Per aggiungere un numero italiano usa Meta Business Manager, poi verifica l'OTP qui.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </div>
          )}
          {data && data.phone_numbers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun numero trovato.</p>
          )}
          {data && data.phone_numbers.length > 0 && (
            <div className="space-y-2">
              {data.phone_numbers.map((pn) => {
                const isCurrent = pn.id === data.current_phone_id;
                const isVerified = pn.code_verification_status === "VERIFIED";
                return (
                  <div key={pn.id} className="border rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{pn.display_phone_number}</span>
                        {pn.verified_name && (
                          <Badge variant="outline" className="text-[10px]">{pn.verified_name}</Badge>
                        )}
                        {isCurrent && (
                          <Badge className="text-[10px] bg-emerald-600">IN USO</Badge>
                        )}
                        {pn.quality_rating && (
                          <Badge variant="outline" className={`text-[10px] ${
                            pn.quality_rating === "GREEN" ? "border-emerald-500 text-emerald-700" :
                            pn.quality_rating === "YELLOW" ? "border-amber-500 text-amber-700" :
                            "border-red-500 text-red-700"
                          }`}>
                            Quality: {pn.quality_rating}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <code>ID: {pn.id}</code>
                        {pn.code_verification_status && (
                          <Badge variant={isVerified ? "outline" : "secondary"} className="text-[10px]">
                            {isVerified ? "✓ Verificato" : "Da verificare"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isVerified && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVerifyTarget(pn)}
                          className="gap-1.5"
                        >
                          Verifica OTP
                        </Button>
                      )}
                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(pn.id);
                            toast({
                              title: "ID numero copiato",
                              description: "Aggiorna WA_PHONE_NUMBER_ID nei secrets Supabase con questo valore.",
                            });
                          }}
                          className="gap-1.5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copia ID
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs space-y-1">
            <p className="font-medium text-blue-900">Come aggiungere un nuovo numero italiano</p>
            <ol className="list-decimal list-inside text-blue-800 leading-relaxed">
              <li>Vai su <a href={`https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${data?.current_phone_id ? "" : ""}`} target="_blank" rel="noopener noreferrer" className="underline">Meta Business Manager → Numeri di telefono</a></li>
              <li>Clicca "Aggiungi numero" → inserisci il numero italiano</li>
              <li>Conferma con OTP via SMS o chiamata (puoi farlo da qui col bottone "Verifica OTP")</li>
              <li>Una volta verificato, clicca "Copia ID" e aggiorna <code>WA_PHONE_NUMBER_ID</code> nei secret Supabase</li>
              <li>Forza un cold start delle edge functions (curl alla function): vedi guida nel tab Setup</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {verifyTarget && (
        <VerifyOtpDialog
          phoneNumber={verifyTarget}
          onClose={() => setVerifyTarget(null)}
        />
      )}
    </>
  );
}

function VerifyOtpDialog({ phoneNumber, onClose }: { phoneNumber: PhoneNumber; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [method, setMethod] = useState<"SMS" | "VOICE">("SMS");
  const [code, setCode] = useState("");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: {
          action: "request_phone_verification",
          phone_number_id: phoneNumber.id,
          code_method: method,
          language: "it",
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Richiesta fallita");
    },
    onSuccess: () => {
      toast({
        title: `Codice inviato via ${method === "SMS" ? "SMS" : "chiamata"}`,
        description: "Inserisci il codice ricevuto qui sotto.",
      });
      setStep("verify");
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore richiesta", description: err.message });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Inserisci il codice");
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: {
          action: "verify_phone_otp",
          phone_number_id: phoneNumber.id,
          code: code.trim(),
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Verifica fallita");
    },
    onSuccess: () => {
      toast({
        title: "Numero verificato",
        description: `${phoneNumber.display_phone_number} è ora attivo. Aggiorna WA_PHONE_NUMBER_ID per usarlo.`,
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-phone-numbers"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Codice non valido", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Verifica numero</DialogTitle>
          <DialogDescription>
            <code>{phoneNumber.display_phone_number}</code>
          </DialogDescription>
        </DialogHeader>

        {step === "request" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">Come vuoi ricevere il codice?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={method === "SMS" ? "default" : "outline"}
                onClick={() => setMethod("SMS")}
                className="gap-2"
              >
                SMS
              </Button>
              <Button
                variant={method === "VOICE" ? "default" : "outline"}
                onClick={() => setMethod("VOICE")}
                className="gap-2"
              >
                Chiamata vocale
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Annulla</Button>
              <Button onClick={() => requestMutation.mutate()} disabled={requestMutation.isPending} className="gap-2">
                {requestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Invia codice
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="otp_code">Codice ricevuto</Label>
              <Input
                id="otp_code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="font-mono text-lg text-center tracking-widest"
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Codice a 6 cifre ricevuto via {method === "SMS" ? "SMS" : "chiamata"}.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("request")}>Indietro</Button>
              <Button onClick={() => verifyMutation.mutate()} disabled={code.length !== 6 || verifyMutation.isPending} className="gap-2">
                {verifyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Verifica
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SetupStep({ n, title, done, children }: { n: number; title: string; done: boolean | undefined; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
        }`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  );
}

function SecretsBlock({ secrets }: { secrets: Array<{ name: string; description: string }> }) {
  return (
    <div className="mt-2 rounded-md bg-slate-900 text-slate-100 p-3 text-[11px] font-mono space-y-1">
      <p className="text-slate-400 mb-1">// Aggiungi questi secret in Supabase → Edge Functions → Settings</p>
      {secrets.map((s) => (
        <div key={s.name} className="flex items-center gap-2">
          <span className="text-emerald-400">{s.name}</span>
          <span className="text-slate-500">=</span>
          <span className="text-slate-300">«{s.description}»</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Tab "Template"
// ============================================================

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [testing, setTesting] = useState<WhatsappTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: async (): Promise<WhatsappTemplate[]> => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("meta_template_name");
      if (error) throw error;
      return (data as WhatsappTemplate[]) ?? [];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "sync_templates" },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "success" in data && !data.success) {
        throw new Error((data as { error?: string }).error ?? "Sync fallito");
      }
      return data as { synced: number; errors: number; total_fetched: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({
        title: `Sincronizzati ${res.synced} template`,
        description: res.errors > 0 ? `${res.errors} errori durante l'import` : `Totale ricevuti: ${res.total_fetched}`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore sync", description: err.message });
    },
  });

  // Seed dei 5 template di base (one-click batch creation su Meta)
  const seedMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "seed_default_templates" },
      });
      if (error) throw error;
      return data as {
        success: boolean;
        results: Array<{ name: string; success: boolean; status?: string; error?: string }>;
        created: number;
        skipped: number;
        failed: number;
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      const parts: string[] = [];
      if (res.created > 0) parts.push(`${res.created} creati`);
      if (res.skipped > 0) parts.push(`${res.skipped} già esistenti`);
      if (res.failed > 0) parts.push(`${res.failed} errori`);
      toast({
        title: "Template base inviati a Meta",
        description: `${parts.join(" · ")}. Approval da Meta in pochi minuti.`,
        variant: res.failed > 0 ? "destructive" : "default",
      });
      // Logga i fail dettagliati nel console per debug
      if (res.failed > 0) {
        const fails = res.results.filter((r) => !r.success);
        console.warn("[seed_default_templates] failures:", fails);
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore seed", description: err.message });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg">Template WhatsApp</CardTitle>
              <CardDescription>
                Crea template direttamente dall'app, oppure importa quelli già esistenti su Meta.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="gap-2"
                title="Crea automaticamente i 5 template di base (sollecito_compilazione, sollecito_recensione, modulo_cliente_enea, pratica_ricevuta, pratica_completata)"
              >
                {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Crea 5 template di base
              </Button>
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-2"
              >
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizza
              </Button>
              <Button onClick={() => setCreating(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Nuovo template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </div>
          )}
          {!isLoading && (!templates || templates.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mx-auto opacity-30 mb-3" />
              <p className="text-sm font-medium">Nessun template ancora importato</p>
              <p className="text-xs mt-1">
                Clicca <strong>Crea 5 template di base</strong> per partire subito,
                oppure <strong>Nuovo template</strong> per crearne uno custom.
              </p>
            </div>
          )}
          {templates && templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onEdit={() => setEditing(t)}
                  onTest={() => setTesting(t)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && <EditTemplateDialog template={editing} onClose={() => setEditing(null)} />}
      {testing && <TestSendDialog template={testing} onClose={() => setTesting(null)} />}
      {creating && <CreateTemplateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    APPROVED: { variant: "default", label: "Approvato" },
    PENDING: { variant: "secondary", label: "In attesa" },
    REJECTED: { variant: "destructive", label: "Rifiutato" },
    PAUSED: { variant: "outline", label: "In pausa" },
    DISABLED: { variant: "outline", label: "Disabilitato" },
  };
  const cfg = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>;
}

function TemplateRow({ template, onEdit, onTest }: {
  template: WhatsappTemplate;
  onEdit: () => void;
  onTest: () => void;
}) {
  const queryClient = useQueryClient();
  const toggleActiveMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase
        .from("whatsapp_templates")
        .update({ is_active: active })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });

  // Elimina il template su Meta (lo soft-disabilita in DB). Meta richiede
  // approval per ricreare un template con lo stesso nome dopo delete.
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "delete_template", name: template.meta_template_name },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Eliminazione fallita");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: "Template eliminato da Meta" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore eliminazione", description: err.message });
    },
  });

  return (
    <div className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm font-semibold">{template.meta_template_name}</code>
            <Badge variant="outline" className="text-[10px]">{template.language}</Badge>
            {statusBadge(template.status)}
            {template.category && <Badge variant="outline" className="text-[10px]">{template.category}</Badge>}
            {template.mapped_trigger_event && (
              <Badge variant="secondary" className="text-[10px]">
                trigger: {template.mapped_trigger_event}
              </Badge>
            )}
          </div>
          {template.display_name && (
            <p className="text-sm font-medium">{template.display_name}</p>
          )}
          {template.body_text && (
            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
              {template.body_text}
            </p>
          )}
          {template.rejection_reason && (
            <p className="text-xs text-red-700">Motivo rifiuto: {template.rejection_reason}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={template.is_active}
              onCheckedChange={(v) => toggleActiveMutation.mutate(v)}
              disabled={toggleActiveMutation.isPending}
            />
            <span className="text-xs text-muted-foreground">Attivo</span>
          </div>
          {template.status === "APPROVED" && (
            <Button variant="outline" size="sm" onClick={onTest} className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> Test
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Modifica
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`Eliminare il template "${template.meta_template_name}" da Meta? Non recuperabile.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="gap-1.5 text-red-600 hover:text-red-700"
            title="Elimina su Meta"
          >
            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dialog: edit template (display_name, description, trigger, variables)
// ============================================================

function EditTemplateDialog({ template, onClose }: { template: WhatsappTemplate; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(template.display_name ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [trigger, setTrigger] = useState(template.mapped_trigger_event ?? "");
  const [variables, setVariables] = useState<string>(JSON.stringify(template.variables ?? [], null, 2));

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedVars: unknown = [];
      try {
        parsedVars = JSON.parse(variables || "[]");
      } catch {
        throw new Error("JSON variables non valido");
      }
      const { error } = await supabase
        .from("whatsapp_templates")
        .update({
          display_name: displayName || null,
          description: description || null,
          mapped_trigger_event: trigger || null,
          variables: parsedVars as never,
        })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: "Template aggiornato" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore salvataggio", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica template</DialogTitle>
          <DialogDescription>
            <code>{template.meta_template_name}</code> · {template.language} · {template.status}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Read-only meta info */}
          <div className="rounded-md border p-3 bg-slate-50 text-xs space-y-1">
            <p className="font-medium">Contenuto (sola lettura — gestito da Meta)</p>
            {template.header_text && (
              <p><strong>Header:</strong> {template.header_text}</p>
            )}
            <div>
              <strong>Body:</strong>
              <pre className="whitespace-pre-wrap break-words bg-white border rounded p-2 mt-1 text-[11px]">{template.body_text}</pre>
            </div>
            {template.footer_text && (
              <p><strong>Footer:</strong> {template.footer_text}</p>
            )}
            {template.buttons && template.buttons.length > 0 && (
              <p><strong>Buttons:</strong> {template.buttons.length}</p>
            )}
          </div>

          <div>
            <Label htmlFor="display_name">Nome display (admin)</Label>
            <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Es. Sollecito compilazione form" />
          </div>

          <div>
            <Label htmlFor="description">Descrizione</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A cosa serve, quando viene inviato…" rows={2} />
          </div>

          <div>
            <Label htmlFor="trigger">Trigger event interno</Label>
            <select
              id="trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TRIGGER_EVENTS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Collega questo template a un trigger del cron <code>process-automations</code>.
            </p>
          </div>

          <div>
            <Label htmlFor="variables">Variabili (JSON)</Label>
            <Textarea
              id="variables"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='[{"position":1,"name":"nome_cliente","description":"Nome del cliente","example":"Mario"}]'
            />
            <p className="text-xs text-muted-foreground mt-1">
              Documenta cosa va in ogni <code>{`{{N}}`}</code> del body. Usato come reference nelle automazioni.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog: test send
// ============================================================

function TestSendDialog({ template, onClose }: { template: WhatsappTemplate; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [params, setParams] = useState<string>("");

  const sendMutation = useMutation({
    mutationFn: async () => {
      const parameters = params
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ type: "text", text }));
      const components = parameters.length > 0 ? [{ type: "body", parameters }] : [];

      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: {
          action: "test_send",
          to: phone,
          template_name: template.meta_template_name,
          language: template.language,
          components,
        },
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; wa_message_id?: string };
      if (!result.success) {
        throw new Error(result.error ?? "Invio fallito");
      }
      return result;
    },
    onSuccess: (res) => {
      toast({
        title: "Messaggio inviato",
        description: res.wa_message_id ? `Meta ID: ${res.wa_message_id}` : undefined,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio fallito", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Test invio
          </DialogTitle>
          <DialogDescription>
            Template <code>{template.meta_template_name}</code> ({template.language})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="phone">Numero destinatario</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 333 1234567"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Sarà normalizzato in formato E.164 (393331234567).
            </p>
          </div>

          {template.body_text.includes("{{") && (
            <div>
              <Label htmlFor="params">Parametri body (separati da virgola)</Label>
              <Input
                id="params"
                value={params}
                onChange={(e) => setParams(e.target.value)}
                placeholder="Mario, https://app.praticarapida.it/form/abc"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Un valore per ogni <code>{`{{N}}`}</code> nel body.
              </p>
            </div>
          )}

          <div className="rounded-md bg-slate-50 border p-2.5 text-xs">
            <p className="font-medium mb-1">Preview body:</p>
            <pre className="whitespace-pre-wrap break-words text-[11px]">{template.body_text}</pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !phone}>
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Invia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog: crea nuovo template (submit a Meta)
// ============================================================

/**
 * Form per creare un template direttamente dall'app. Invia il template a
 * Meta Business API che lo metterà in stato PENDING fino all'approval.
 * Estrae automaticamente le variabili {{N}} dal body per richiedere gli
 * esempi (campo obbligatorio per approval Meta).
 */
function CreateTemplateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("it");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [examples, setExamples] = useState<string[]>([]);

  // Estrae i placeholder {{1}}, {{2}}, ... dal body e crea il count
  const placeholders = (() => {
    const matches = body.matchAll(/\{\{(\d+)\}\}/g);
    const nums = new Set<number>();
    for (const m of matches) nums.add(parseInt(m[1], 10));
    return Array.from(nums).sort((a, b) => a - b);
  })();

  // Auto-ridimensiona examples quando placeholders cambia
  if (examples.length !== placeholders.length) {
    setExamples(placeholders.map((_, i) => examples[i] ?? ""));
  }

  const nameValid = /^[a-z0-9_]+$/.test(name) && name.length >= 3;
  const bodyValid = body.trim().length >= 10;
  const examplesValid = placeholders.length === 0 || examples.every((e) => e.trim().length > 0);
  const canSubmit = nameValid && bodyValid && examplesValid;

  const createMutation = useMutation({
    mutationFn: async () => {
      const components: Array<Record<string, unknown>> = [
        {
          type: "BODY",
          text: body,
          ...(placeholders.length > 0 && {
            example: { body_text: [examples] },
          }),
        },
      ];
      if (footer.trim()) {
        components.push({ type: "FOOTER", text: footer.trim() });
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: {
          action: "create_template",
          template: { name, category, language, components },
        },
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; meta_template_id?: string; meta_status?: string };
      if (!result.success) {
        throw new Error(result.error ?? "Creazione fallita");
      }
      return result;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({
        title: "Template inviato a Meta",
        description: `Status: ${res.meta_status ?? "PENDING"}. Approval di solito in pochi minuti.`,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore creazione", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crea nuovo template</DialogTitle>
          <DialogDescription>
            Il template viene inviato a Meta per approvazione. Una volta approvato (di solito pochi minuti per UTILITY) sarà disponibile per l'invio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl_name">Nome template *</Label>
              <Input
                id="tpl_name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="es. sollecito_pagamento"
                className="font-mono"
              />
              <p className={`text-xs mt-1 ${nameValid ? "text-muted-foreground" : "text-red-600"}`}>
                snake_case, lowercase, min 3 caratteri. Non modificabile dopo creazione.
              </p>
            </div>

            <div>
              <Label htmlFor="tpl_lang">Lingua</Label>
              <select
                id="tpl_lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="it">Italiano (it)</option>
                <option value="en_US">English US (en_US)</option>
                <option value="en_GB">English UK (en_GB)</option>
                <option value="es">Español (es)</option>
                <option value="fr">Français (fr)</option>
                <option value="de">Deutsch (de)</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="tpl_cat">Categoria *</Label>
            <select
              id="tpl_cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="UTILITY">Utility — transazionali (consigliato)</option>
              <option value="MARKETING">Marketing — promozionali (richiede opt-in)</option>
              <option value="AUTHENTICATION">Authentication — OTP/codici</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>Utility</strong> si approva in pochi minuti e non richiede opt-in.
              <strong> Marketing</strong> per promozioni: approval più lento, il cliente deve aver dato consenso.
            </p>
          </div>

          <div>
            <Label htmlFor="tpl_body">Body *</Label>
            <Textarea
              id="tpl_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={"Ciao {{1}}!\n\nIl tuo ordine {{2}} è stato spedito.\n\nGrazie!"}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Usa <code>{`{{1}}`}</code>, <code>{`{{2}}`}</code>, ... per i placeholder. Meta richiede esempi sotto.
            </p>
          </div>

          {placeholders.length > 0 && (
            <div className="rounded-md border p-3 bg-amber-50 space-y-2">
              <Label className="text-xs">Esempi per i placeholder (obbligatori per approval) *</Label>
              {placeholders.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <code className="text-xs bg-white border rounded px-1.5 py-1 shrink-0 w-12 text-center">{`{{${n}}}`}</code>
                  <Input
                    value={examples[i] ?? ""}
                    onChange={(e) => {
                      const next = [...examples];
                      next[i] = e.target.value;
                      setExamples(next);
                    }}
                    placeholder={n === 1 ? "Mario" : n === 2 ? "ORD-12345" : `esempio ${n}`}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <Label htmlFor="tpl_footer">Footer (opzionale)</Label>
            <Input
              id="tpl_footer"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="Pratica Rapida - Edilizia.io"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground mt-1">Max 60 caratteri. Visibile sotto il body.</p>
          </div>

          {/* Preview */}
          {body && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs font-medium text-emerald-900 mb-2">Preview (con esempi popolati)</p>
              <div className="bg-white rounded-lg border p-3 shadow-sm">
                <pre className="whitespace-pre-wrap break-words text-[12px] font-sans">
                  {body.replace(/\{\{(\d+)\}\}/g, (_, n) => examples[parseInt(n, 10) - 1] || `{{${n}}}`)}
                </pre>
                {footer && (
                  <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">{footer}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="gap-2"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Invia a Meta per approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
