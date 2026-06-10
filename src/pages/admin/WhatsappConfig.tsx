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
import { useWaProvider } from "@/hooks/useWaProvider";
import {
  CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, MessageCircle,
  ExternalLink, KeyRound, Webhook, Send, Pencil, Loader2, Plus, Sparkles,
  Trash2, Phone, Zap, TrendingUp,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
          <TabsTrigger value="quick-replies" className="gap-2">
            <Zap className="h-4 w-4" />
            Risposte rapide
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <SetupTab />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="quick-replies" className="space-y-4">
          <QuickRepliesTab />
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

  // Debug mutation: diagnostica server-side dei permessi token
  const debugMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "debug_template_access" },
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: (res) => {
      const conclusion = (res.conclusion as string) ?? "Vedi console per dettagli";
      console.log("[whatsapp-debug] full diagnosis:", res);
      toast({
        title: "Diagnosi completata",
        description: conclusion,
        duration: 20_000,
        variant: conclusion.startsWith("✅") ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore debug", description: err.message });
    },
  });

  // Register phone dialog: fix per numero "Non in linea" su WhatsApp Manager.
  // Quando il numero non è registrato sul Cloud API, Meta torna #200 su qualsiasi
  // send anche con permessi OK. Questo dialog chiama Meta direttamente con
  // POST /{PHONE_NUMBER_ID}/register passando un PIN 2FA.
  const [registerOpen, setRegisterOpen] = useState(false);

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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegisterOpen(true)}
                className="gap-2"
                title="Registra/Riconnetti il phone number sul Cloud API. Fix per numeri 'Non in linea' che causano #200 su send."
              >
                <Phone className="h-3.5 w-3.5" />
                Registra numero
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => debugMutation.mutate()}
                disabled={debugMutation.isPending}
                className="gap-2"
                title="Diagnosi server-side: testa scope token, accesso phone number, link WABA. Output dettagliato in console (F12)."
              >
                {debugMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                Diagnostica permessi
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Verifica
              </Button>
            </div>
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

      {registerOpen && <RegisterPhoneDialog onClose={() => setRegisterOpen(false)} />}
    </div>
  );
}

// ============================================================
// Dialog: registrazione phone number su Cloud API
// ============================================================

/**
 * Fix per phone number "Non in linea" / Offline su WhatsApp Manager che
 * causa Meta #200 OAuthException su qualsiasi send anche con permessi
 * corretti. Chiama POST /v18.0/{PHONE_NUMBER_ID}/register con un PIN 2FA
 * a 6 cifre. Una volta registrato, il numero passa a stato "In linea" e
 * i send funzionano normalmente.
 */
function RegisterPhoneDialog({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<"info" | "pin" | "done">("info");
  const [dialogOpen, setDialogOpen] = useState(true);

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "register_phone", pin },
      });
      if (error) throw error;
      const result = data as { success?: boolean; next_step?: string };
      return result;
    },
    onSuccess: (res) => {
      setLastResponse(res as Record<string, unknown>);
      if (res.success) {
        setStep("done");
        toast({
          title: "Numero registrato ✅",
          description: res.next_step ?? "Stato passerà a 'In linea' entro 30s. Ricarica la pagina per vedere l'aggiornamento.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Registrazione fallita",
          description: res.next_step ?? "Vedi dettagli sotto.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore", description: err.message });
    },
  });

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Registra phone number
          </DialogTitle>
          <DialogDescription>
            Risolve lo stato &quot;Non in linea&quot; che blocca l&apos;invio dei template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step indicator */}
          <div className="flex gap-2 justify-center text-xs font-semibold">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full ${
              step === "info" || step === "pin" || step === "done"
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 text-slate-600"
            }`}>
              {step === "done" ? <CheckCircle2 className="h-4 w-4" /> : "1"}
            </div>
            <div className={`flex items-center justify-center w-7 h-7 rounded-full ${
              step === "pin" || step === "done"
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 text-slate-600"
            }`}>
              {step === "done" ? <CheckCircle2 className="h-4 w-4" /> : "2"}
            </div>
            <div className={`flex items-center justify-center w-7 h-7 rounded-full ${
              step === "done" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
            }`}>
              3
            </div>
          </div>

          {/* Step 1: Info */}
          {step === "info" && (
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs space-y-2">
                <p className="font-semibold text-blue-900">Cos'è lo stato &quot;Non in linea&quot;?</p>
                <p className="text-blue-900">
                  Significa che il numero è stato aggiunto al WABA (WhatsApp Business Account) ma <strong>non è stato ancora registrato</strong> sul Cloud API di Meta. I template sono approved ma non si possono inviare messaggi fino a quando il numero non viene registrato e diventa &quot;In linea&quot;.
                </p>
              </div>

              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-2">
                <p className="font-semibold text-emerald-900">Cosa farà questo bottone?</p>
                <p className="text-emerald-900">
                  Registrerà il numero sul Cloud API usando un PIN a 6 cifre (two-step verification). Lo stato cambierà da &quot;Non in linea&quot; a &quot;In linea&quot; in pochi secondi.
                </p>
              </div>

              <button
                onClick={() => setStep("pin")}
                className="w-full px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary/90 transition"
              >
                Continua →
              </button>
            </div>
          )}

          {/* Step 2: PIN input */}
          {step === "pin" && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-amber-900">Dove trovo il PIN?</p>
                <ol className="space-y-1 text-amber-900 list-decimal list-inside">
                  <li>Vai su <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline font-semibold">Meta Business Manager</a></li>
                  <li>Seleziona il tuo account WhatsApp</li>
                  <li>Vai a <strong>Impostazioni → Numero di telefono</strong></li>
                  <li>Cerca <strong>Two-step verification PIN</strong></li>
                  <li>Se non ce l'hai, scegli un PIN qualsiasi di 6 cifre (es. 123456)</li>
                </ol>
              </div>

              <div>
                <Label htmlFor="pin" className="text-xs font-semibold">PIN a 6 cifre</Label>
                <Input
                  id="pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  className="font-mono text-lg tracking-widest mt-1.5"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Inserisci il PIN che hai impostato in Meta. Se non l'hai mai configurato, usa qualsiasi combinazione di 6 cifre e <strong>salvalo bene</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Success or error */}
          {step === "done" && (() => {
            const success = (lastResponse as { success?: boolean }).success === true;
            const status = (lastResponse as { status?: number }).status;
            const meta = (lastResponse as { meta_response?: { error?: { code?: number; message?: string }; success?: boolean } }).meta_response;
            const nextStep = (lastResponse as { next_step?: string }).next_step;
            return (
              <div className={`rounded-md border-2 p-3 text-[11px] space-y-1.5 ${success ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div className={`font-bold text-sm ${success ? "text-emerald-900" : "text-red-900"}`}>
                  {success ? "✅ Registrazione OK" : "❌ Registrazione fallita"}
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-1 font-mono">
                  <span className="opacity-70">HTTP status:</span>
                  <span>{status}</span>
                  {meta?.error?.code && (
                    <>
                      <span className="opacity-70">Meta code:</span>
                      <span className="font-bold">#{meta.error.code}</span>
                      <span className="opacity-70">Meta msg:</span>
                      <span>{meta.error.message}</span>
                    </>
                  )}
                </div>
                {nextStep && <p className="mt-2 font-semibold">{nextStep}</p>}
                {success && (
                  <p className="mt-2 text-emerald-900">
                    Il numero passerà a &quot;In linea&quot; entro 30 secondi. Ricarica la pagina per vedere l'aggiornamento.
                  </p>
                )}
                {!success && (
                  <details className="mt-2">
                    <summary className="cursor-pointer opacity-70 font-semibold">Response Meta (raw JSON)</summary>
                    <pre className="mt-2 p-2 bg-white rounded overflow-x-auto text-[10px] max-h-40">
{JSON.stringify(meta, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })()}

        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (step === "done" || (lastResponse && (lastResponse as { success?: boolean }).success)) {
                onClose();
              } else if (step === "pin") {
                setStep("info");
                setPin("");
              } else {
                onClose();
              }
            }}
          >
            {step === "done" ? "Chiudi" : step === "pin" ? "Indietro" : "Annulla"}
          </Button>
          {step === "pin" && (
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending || pin.length !== 6}
              className="gap-2"
            >
              {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {lastResponse ? "Riprova" : "Registra"}
            </Button>
          )}
          {step === "done" && (
            <Button
              onClick={onClose}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Fatto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Bulk delete: elimina N template selezionati su Meta + DB.
  // Loop sequenziale per non sovraccaricare Meta API (rate limit).
  // Se uno fallisce, gli altri continuano e mostriamo il summary.
  const bulkDeleteMutation = useMutation({
    mutationFn: async (templatesToDelete: WhatsappTemplate[]) => {
      const results: Array<{ name: string; success: boolean; error?: string }> = [];
      for (const t of templatesToDelete) {
        try {
          const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
            body: { action: "delete_template", name: t.meta_template_name },
          });
          if (error) throw error;
          const res = data as { success?: boolean; error?: string };
          if (!res.success) throw new Error(res.error ?? "delete failed");
          results.push({ name: t.meta_template_name, success: true });
        } catch (err) {
          results.push({
            name: t.meta_template_name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setSelectedIds(new Set());
      toast({
        title: `${ok} template eliminati`,
        description: fail > 0 ? `${fail} errori — verifica i log` : "Tutti rimossi su Meta + DB",
        variant: fail > 0 ? "destructive" : "default",
      });
      if (fail > 0) {
        console.warn("[bulk-delete] failures:", results.filter((r) => !r.success));
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore eliminazione bulk", description: err.message });
    },
  });

  // Pulizia orphan templates: cancella DAL DB i template che non esistono
  // più sul WABA Meta corrente. Utile dopo switch WABA o pulizia generale.
  const purgeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-meta-sync", {
        body: { action: "purge_orphan_templates" },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string; purged?: number; purged_names?: string[] };
      if (!res.success) throw new Error(res.error ?? "Purge fallito");
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({
        title: res.purged === 0 ? "Nessun template fantasma" : `Rimossi ${res.purged} template fantasma`,
        description: res.purged && res.purged > 0
          ? `Template puliti dal DB (non esistevano più su Meta): ${res.purged_names?.slice(0, 3).join(", ")}${res.purged > 3 ? "..." : ""}`
          : "Tutti i template in DB esistono ancora sul WABA Meta corrente",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore pulizia", description: err.message });
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

      // Estrai messaggio errore dettagliato dal primo fail (di solito tutti
      // i fail hanno la stessa causa: permessi, token, rate limit)
      const firstFail = res.results.find((r) => !r.success);
      const errorDetail = firstFail?.error
        ? ` — Errore: "${firstFail.error.slice(0, 200)}"`
        : "";

      toast({
        title: "Template base inviati a Meta",
        description: res.failed > 0
          ? `${parts.join(" · ")}${errorDetail}`
          : `${parts.join(" · ")}. Approval da Meta in pochi minuti.`,
        variant: res.failed > 0 ? "destructive" : "default",
        duration: res.failed > 0 ? 15_000 : 5_000, // più tempo per leggere l'errore
      });
      // Logga i fail completi nel console per debug
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
              {selectedIds.size > 0 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="gap-2"
                  >
                    Deseleziona ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const toDelete = (templates ?? []).filter((t) => selectedIds.has(t.id));
                      if (confirm(`Eliminare ${toDelete.length} template da Meta? Operazione non reversibile.`)) {
                        bulkDeleteMutation.mutate(toDelete);
                      }
                    }}
                    disabled={bulkDeleteMutation.isPending}
                    className="gap-2"
                  >
                    {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Elimina {selectedIds.size} selezionati
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm("Cancellare i template 'fantasma' dal DB locale? Cancella SOLO i template che non esistono più sul WABA Meta corrente (es. residui di un WABA precedente). Non tocca Meta.")) {
                        purgeMutation.mutate();
                      }
                    }}
                    disabled={purgeMutation.isPending}
                    className="gap-2"
                    title="Cancella dal DB i template che non esistono più su Meta (residui di WABA precedenti)"
                  >
                    {purgeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Pulisci fantasma
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                    className="gap-2"
                    title="Push a Meta i 9 template ufficiali v3: pratica_climatizzatori (+_cf), pratica_infissi (+_cf), pratica_schermature (+_cf), sollecito_compilazione, conferma_ricezione, pratica_inviata_recensione. Skippa quelli già esistenti."
                  >
                    {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Crea 9 template ufficiali
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
                </>
              )}
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
              {/* Header row con "seleziona tutti" */}
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
                <Checkbox
                  checked={
                    selectedIds.size === templates.length
                      ? true
                      : selectedIds.size > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => {
                    if (v) setSelectedIds(new Set(templates.map((t) => t.id)));
                    else setSelectedIds(new Set());
                  }}
                />
                <span>
                  {selectedIds.size === 0
                    ? `Seleziona tutti (${templates.length})`
                    : `${selectedIds.size} di ${templates.length} selezionati`}
                </span>
              </div>
              {templates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  selected={selectedIds.has(t.id)}
                  onToggleSelect={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.id)) next.delete(t.id);
                      else next.add(t.id);
                      return next;
                    });
                  }}
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

function TemplateRow({ template, selected, onToggleSelect, onEdit, onTest }: {
  template: WhatsappTemplate;
  selected: boolean;
  onToggleSelect: () => void;
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
    <div className={`border rounded-lg p-3 transition-colors ${
      selected ? "bg-emerald-50 border-emerald-300" : "hover:bg-slate-50"
    }`}>
      <div className="flex items-start gap-3">
        {/* Checkbox selezione */}
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          className="mt-1 shrink-0"
        />
        <div className="flex items-start justify-between gap-3 flex-wrap flex-1 min-w-0">
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
          {template.meta_last_synced_at && (
            <p className="text-[11px] text-muted-foreground">
              Sincronizzato: {new Date(template.meta_last_synced_at).toLocaleString("it-IT")}
            </p>
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
  // Salviamo l'INTERA response edge function per mostrare debug payload + meta_response
  // direttamente nel dialog, senza richiedere all'utente di aprire la console.
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);

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
      // Salviamo la response COMPLETA, sia success sia failure. Il dialog
      // mostrerà il banner debug indipendentemente dall'esito così l'utente
      // vede ESATTAMENTE: phone normalizzato, payload, response Meta verbatim.
      setLastResponse(data as Record<string, unknown>);
      const result = data as { success?: boolean; error?: string; wa_message_id?: string };
      if (!result.success) {
        throw new Error(result.error ?? "Invio fallito");
      }
      return result;
    },
    onSuccess: (res) => {
      toast({
        title: "Messaggio inviato ✅",
        description: res.wa_message_id ? `Meta ID: ${res.wa_message_id}` : undefined,
      });
      // NON chiudiamo il dialog su success: l'utente può voler vedere comunque
      // il debug per audit. Si chiude solo manualmente o cliccando "Chiudi".
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

          {/* Banner debug — mostra dettagli completi della response edge
              function. Visibile sia su success sia su failure così l'utente
              ha sempre evidenza di cosa è stato inviato e cosa Meta ha
              risposto. Risolve il problema "il toast dice solo Invio fallito
              ma non so perché". */}
          {lastResponse && (() => {
            const dbg = (lastResponse as { debug?: Record<string, unknown> }).debug ?? {};
            const meta = (lastResponse as { meta_response?: { error?: { code?: number; message?: string; error_subcode?: number; error_data?: { details?: string } }; messages?: Array<{ id?: string }> } }).meta_response;
            const payload = (lastResponse as { meta_request_payload?: Record<string, unknown> }).meta_request_payload;
            const success = (lastResponse as { success?: boolean }).success === true;
            return (
              <div className={`rounded-md border-2 p-3 text-[11px] space-y-1.5 ${success ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div className={`font-bold ${success ? "text-emerald-900" : "text-red-900"}`}>
                  {success ? "✅ Inviato (debug)" : "🔍 Dettagli errore"}
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-1 font-mono">
                  <span className="opacity-70">phone in input:</span>
                  <span className="font-semibold">{String(dbg.phone_received ?? "—")}</span>
                  <span className="opacity-70">phone → Meta:</span>
                  <span className={`font-semibold ${String(dbg.phone_sent_to_meta ?? "").startsWith("39") ? "text-emerald-700" : "text-red-900"}`}>
                    {String(dbg.phone_sent_to_meta ?? "—")}
                    {!String(dbg.phone_sent_to_meta ?? "").startsWith("39") && dbg.phone_sent_to_meta && " ⚠️ manca 39"}
                  </span>
                  <span className="opacity-70">phone_number_id:</span>
                  <span>{String(dbg.phone_number_id ?? "—")}</span>
                  <span className="opacity-70">template:</span>
                  <span>{String(dbg.template_name_sent ?? "—")}</span>
                  {!success && (
                    <>
                      <span className="opacity-70">Meta code:</span>
                      <span className="font-bold">#{meta?.error?.code ?? "—"} (sub: {meta?.error?.error_subcode ?? "—"})</span>
                      <span className="opacity-70">Meta msg:</span>
                      <span>{meta?.error?.message ?? "—"}</span>
                      {meta?.error?.error_data?.details && (
                        <>
                          <span className="opacity-70">Meta details:</span>
                          <span>{meta.error.error_data.details}</span>
                        </>
                      )}
                    </>
                  )}
                  {success && meta?.messages?.[0]?.id && (
                    <>
                      <span className="opacity-70">wa_message_id:</span>
                      <span className="font-bold">{meta.messages[0].id}</span>
                    </>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer opacity-70 font-semibold">Payload + response Meta (raw JSON)</summary>
                  <pre className="mt-2 p-2 bg-white rounded overflow-x-auto text-[10px] max-h-60">
{`REQUEST a Meta:
${JSON.stringify(payload, null, 2)}

RESPONSE da Meta:
${JSON.stringify(meta, null, 2)}`}
                  </pre>
                </details>
              </div>
            );
          })()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{lastResponse ? "Chiudi" : "Annulla"}</Button>
          <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !phone}>
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {lastResponse ? "Reinvia" : "Invia"}
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
  // Con provider OpenWA i template sono locali (nessuna approvazione Meta):
  // insert diretto in whatsapp_templates con status APPROVED, subito usabili.
  const { provider } = useWaProvider();
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
      // ── Provider OpenWA: template locale, subito APPROVED ──
      if (provider === "openwa") {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("whatsapp_templates").insert({
          meta_template_name: name,
          language,
          category,
          status: "APPROVED",
          body_text: body,
          footer_text: footer.trim() || null,
          is_active: true,
          display_name: name,
          description: "Template locale (OpenWA) — nessuna approvazione Meta richiesta",
          variables: placeholders.map((p, i) => ({
            position: p,
            name: `var_${p}`,
            example: examples[i] ?? "",
          })),
        });
        if (error) throw new Error(error.message);
        return { success: true, meta_status: "APPROVED" };
      }

      // ── Provider Meta: submit per approvazione ──
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
        title: provider === "openwa" ? "Template creato e già attivo ✅" : "Template inviato a Meta",
        description: provider === "openwa"
          ? "Con OpenWA non serve approvazione: puoi usarlo subito in chat e automazioni."
          : `Status: ${res.meta_status ?? "PENDING"}. Approval di solito in pochi minuti.`,
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
            {provider === "openwa"
              ? "Con OpenWA il template è subito attivo: nessuna approvazione Meta richiesta. Usa {{1}}, {{2}}… per le variabili."
              : "Il template viene inviato a Meta per approvazione. Una volta approvato (di solito pochi minuti per UTILITY) sarà disponibile per l'invio."}
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

// ============================================================
// Tab "Risposte rapide": canned responses per la chat WhatsApp.
// CRUD super_admin. Le risposte sono globali (tutti gli internal users
// le vedono nel composer della chat) e raggruppate per categoria.
// ============================================================

interface QuickReply {
  id: string;
  label: string;
  body: string;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

function QuickRepliesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);

  const { data: replies, isLoading } = useQuery({
    queryKey: ["whatsapp-quick-replies-all"],
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("whatsapp_quick_replies")
        .select("*")
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data as QuickReply[]) ?? [];
    },
  });

  const grouped = (() => {
    if (!replies) return new Map<string, QuickReply[]>();
    const map = new Map<string, QuickReply[]>();
    for (const r of replies) {
      const cat = r.category ?? "Senza categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return map;
  })();

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_quick_replies")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] });
      toast({ title: "Risposta rapida eliminata" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Risposte rapide
              </CardTitle>
              <CardDescription>
                Canned responses inserite nel composer della chat con un click. Saluti, FAQ, conferme.
              </CardDescription>
            </div>
            <Button onClick={() => setEditing("new")} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuova risposta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </div>
          )}

          {!isLoading && (!replies || replies.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto opacity-30 mb-3" />
              <p className="text-sm font-medium">Nessuna risposta rapida</p>
              <p className="text-xs mt-1">Crea la prima per iniziare a usarle in chat.</p>
            </div>
          )}

          {grouped.size > 0 && (
            <div className="space-y-5">
              {Array.from(grouped.entries()).map(([cat, items]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold">{cat}</h3>
                    <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        className={`border rounded-lg p-3 transition-colors ${
                          r.is_active ? "hover:bg-slate-50" : "bg-slate-50/50 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{r.label}</p>
                              {r.usage_count > 0 && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <TrendingUp className="h-2.5 w-2.5" />
                                  {r.usage_count} usi
                                </Badge>
                              )}
                              {!r.is_active && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">disattivata</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">{r.body}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <Switch
                                checked={r.is_active}
                                onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, active: v })}
                                disabled={toggleMutation.isPending}
                              />
                              <span className="text-xs text-muted-foreground">Attiva</span>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setEditing(r)} className="gap-1.5">
                              <Pencil className="h-3.5 w-3.5" /> Modifica
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Eliminare la risposta "${r.label}"?`)) {
                                  deleteMutation.mutate(r.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="gap-1.5 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditQuickReplyDialog
          quickReply={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditQuickReplyDialog({
  quickReply, onClose,
}: {
  quickReply: QuickReply | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = !quickReply;
  const [label, setLabel] = useState(quickReply?.label ?? "");
  const [body, setBody] = useState(quickReply?.body ?? "");
  const [category, setCategory] = useState(quickReply?.category ?? "");
  const [sortOrder, setSortOrder] = useState(quickReply?.sort_order ?? 100);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!label.trim() || !body.trim()) throw new Error("Label e body obbligatori");
      const row = {
        label: label.trim(),
        body: body.trim(),
        category: category.trim() || null,
        sort_order: sortOrder,
      };
      if (isNew) {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("whatsapp_quick_replies")
          .insert({ ...row, created_by: userData.user?.id ?? null });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("whatsapp_quick_replies")
          .update(row)
          .eq("id", quickReply!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] });
      toast({ title: isNew ? "Risposta rapida creata" : "Risposta rapida aggiornata" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore salvataggio", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuova risposta rapida" : "Modifica risposta"}</DialogTitle>
          <DialogDescription>
            Il body viene inserito nel composer della chat quando lo staff la sceglie. Niente placeholder dinamici qui — per quello usa i template Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="qr_label">Etichetta breve *</Label>
            <Input
              id="qr_label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Es. Saluti iniziali"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground mt-1">Mostrata nel popover. Max 80 caratteri.</p>
          </div>

          <div>
            <Label htmlFor="qr_body">Testo della risposta *</Label>
            <Textarea
              id="qr_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Buongiorno! Come posso aiutarla?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qr_cat">Categoria</Label>
              <Input
                id="qr_cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Es. Saluti, FAQ, Conferme"
                maxLength={40}
                list="qr-categories"
              />
              <datalist id="qr-categories">
                <option value="Saluti" />
                <option value="FAQ" />
                <option value="Conferme" />
                <option value="Info pratica" />
                <option value="Documenti" />
              </datalist>
            </div>
            <div>
              <Label htmlFor="qr_order">Ordine</Label>
              <Input
                id="qr_order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 100)}
              />
              <p className="text-xs text-muted-foreground mt-1">Più basso = prima in lista.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !label.trim() || !body.trim()}
            className="gap-2"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Crea" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
