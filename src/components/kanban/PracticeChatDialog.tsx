/**
 * PracticeChatDialog — popup conversazione per UNA pratica specifica.
 *
 * Apre WhatsApp chat e log email direttamente dalla sheet della pratica,
 * senza dover andare in /admin/whatsapp-chat. Per casi tipici:
 *  - "Voglio mandare un template WhatsApp a questo cliente"
 *  - "Voglio vedere lo storico di tutti i messaggi inviati/ricevuti"
 *  - "Voglio rispondere a un inbound del cliente"
 *
 * Mostra:
 *  - Header con dati cliente + finestra 24h status
 *  - Thread messaggi (whatsapp_messages filtrato per phone)
 *  - Composer: template + testo (se finestra 24h aperta)
 *  - Tab Email separata: log email inviate + bottone "Nuova email"
 *
 * Reusa lo stesso storage `whatsapp_conversations` + `whatsapp_messages`
 * usato da /admin/whatsapp-chat — i messaggi appaiono in entrambi i
 * posti grazie a Supabase Realtime.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
// Phone normalize centralizzato in @/lib/phone — gemello server in
// supabase/functions/_shared/phone.ts (entrambe versioni devono restare
// allineate). Fixa il bug del prefisso `+39` mancante che causava #200 Meta.
import { normalizePhone } from "@/lib/phone";
import { useAuth } from "@/hooks/useAuth";
import {
  MessageCircle, Mail, Send, Clock, CheckCheck, Check, AlertTriangle,
  FileText, Loader2, Phone, X,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";

// ─── Tipi ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  template_name: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface EmailLog {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string;
}

interface WhatsappTemplate {
  id: string;
  meta_template_name: string;
  language: string;
  body_text: string;
}

interface Conversation {
  id: string;
  phone: string;
  last_inbound_at: string | null;
}

// ─── Componente principale ────────────────────────────────────────────────

export function PracticeChatDialog({
  practiceId,
  clienteNome,
  clienteCognome,
  clienteTelefono,
  clienteEmail,
  formToken,
  onClose,
}: {
  practiceId: string;
  clienteNome: string | null;
  clienteCognome?: string | null;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  formToken?: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"whatsapp" | "email">(
    clienteTelefono ? "whatsapp" : "email",
  );
  const phone = clienteTelefono ? normalizePhone(clienteTelefono) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">
                {clienteNome ?? "Cliente"} {clienteCognome ?? ""}
              </p>
              <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground mt-0.5">
                {clienteTelefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {clienteTelefono}
                  </span>
                )}
                {clienteEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {clienteEmail}
                  </span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="px-6 pt-3 pb-0 flex gap-1 bg-slate-50 border-b">
          <button
            onClick={() => setActiveTab("whatsapp")}
            disabled={!clienteTelefono}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors gap-1.5 flex items-center ${
              activeTab === "whatsapp"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-muted-foreground hover:text-foreground disabled:opacity-50"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
            {!clienteTelefono && <span className="text-[10px] ml-1">(no tel)</span>}
          </button>
          <button
            onClick={() => setActiveTab("email")}
            disabled={!clienteEmail}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors gap-1.5 flex items-center ${
              activeTab === "email"
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-foreground disabled:opacity-50"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
            {!clienteEmail && <span className="text-[10px] ml-1">(no email)</span>}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "whatsapp" && phone && (
            <WhatsAppTab
              practiceId={practiceId}
              phone={phone}
              clienteNome={clienteNome}
              userId={user?.id ?? null}
            />
          )}
          {activeTab === "email" && clienteEmail && (
            <EmailTab
              practiceId={practiceId}
              clienteEmail={clienteEmail}
              clienteNome={clienteNome}
              formToken={formToken ?? null}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WhatsApp tab ────────────────────────────────────────────────────────

function WhatsAppTab({
  practiceId, phone, clienteNome, userId,
}: {
  practiceId: string;
  phone: string;
  clienteNome: string | null;
  userId: string | null;
}) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Trova/crea la conversation per phone
  const { data: conv } = useQuery({
    queryKey: ["practice-chat-conv", phone],
    queryFn: async (): Promise<Conversation | null> => {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("id, phone, last_inbound_at")
        .eq("phone", phone)
        .maybeSingle();
      return data as Conversation | null;
    },
  });

  // Messaggi del thread (se la conversation esiste)
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["practice-chat-messages", conv?.id],
    queryFn: async (): Promise<Message[]> => {
      if (!conv?.id) return [];
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("sent_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as Message[]) ?? [];
    },
    enabled: !!conv?.id,
  });

  // Realtime: nuovi messaggi inbound/outbound
  useEffect(() => {
    if (!conv?.id) return;
    const channel = supabase
      .channel(`practice-chat-${conv.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conv.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["practice-chat-messages", conv.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conv?.id, queryClient]);

  // Auto-scroll a fondo quando arrivano nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Finestra 24h (5min buffer per clock skew)
  const canSendFreeText = useMemo(() => {
    if (!conv?.last_inbound_at) return false;
    const ageMs = Date.now() - new Date(conv.last_inbound_at).getTime();
    return ageMs < (24 * 3600 * 1000 - 5 * 60 * 1000);
  }, [conv]);

  return (
    <>
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#e5ddd5]/30">
        {messagesLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!messagesLoading && (!messages || messages.length === 0) && (
          <div className="text-center text-muted-foreground text-sm py-12">
            <MessageCircle className="h-10 w-10 mx-auto opacity-30 mb-2" />
            <p>Nessuna conversazione ancora con questo cliente.</p>
            <p className="text-xs mt-1">Invia un template per iniziare.</p>
          </div>
        )}
        {messages?.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            showDate={idx === 0 || !isSameDay(messages[idx - 1].sent_at, msg.sent_at)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <WhatsAppComposer
        practiceId={practiceId}
        phone={phone}
        clienteNome={clienteNome}
        userId={userId}
        canSendFreeText={canSendFreeText}
        lastInboundAt={conv?.last_inbound_at ?? null}
      />
    </>
  );
}

function MessageBubble({ msg, showDate }: { msg: Message; showDate: boolean }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <>
      {showDate && (
        <div className="flex justify-center my-3">
          <span className="bg-white/80 text-[11px] text-muted-foreground px-2.5 py-1 rounded-full shadow-sm">
            {formatDateHeader(new Date(msg.sent_at))}
          </span>
        </div>
      )}
      <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
          isOutbound
            ? msg.status === "failed"
              ? "bg-red-100 text-red-900 border border-red-200"
              : "bg-emerald-100"
            : "bg-white"
        }`}>
          {msg.template_name && (
            <p className="text-[10px] text-muted-foreground mb-1 italic">
              Template: {msg.template_name}
            </p>
          )}
          {msg.body && (
            <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
          )}
          {msg.error_message && (
            <p className="text-[10px] text-red-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {msg.error_message}
            </p>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(msg.sent_at), "HH:mm")}
            </span>
            {isOutbound && (
              <StatusIcon status={msg.status} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "pending": return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent": return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered": return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read": return <CheckCheck className="h-3 w-3 text-emerald-500" />;
    case "failed": return <AlertTriangle className="h-3 w-3 text-red-500" />;
    default: return null;
  }
}

function WhatsAppComposer({
  practiceId, phone, clienteNome, userId, canSendFreeText, lastInboundAt,
}: {
  practiceId: string;
  phone: string;
  clienteNome: string | null;
  userId: string | null;
  canSendFreeText: boolean;
  lastInboundAt: string | null;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"text" | "template">(canSendFreeText ? "text" : "template");
  const [text, setText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [templateParams, setTemplateParams] = useState("");

  // Forziamo "template" mode se finestra chiusa
  useEffect(() => {
    if (!canSendFreeText) setMode("template");
  }, [canSendFreeText]);

  // Template approved
  const { data: templates } = useQuery({
    queryKey: ["practice-chat-templates"],
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
    enabled: mode === "template",
  });

  const sendTextMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: phone,
          text_body: text.trim(),
          practice_id: practiceId,
          sent_by_user_id: userId ?? undefined,
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["practice-chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["practice-chat-conv"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio fallito", description: err.message });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async () => {
      const tpl = templates?.find((t) => t.meta_template_name === selectedTemplate);
      if (!tpl) throw new Error("Template non trovato");
      const paramsList = templateParams.split(",").map((s) => s.trim()).filter(Boolean);
      // Se vuoto e il template ha {{N}}: usa nome cliente come fallback per {{1}}
      const hasPlaceholders = tpl.body_text.includes("{{");
      const parameters = paramsList.length > 0
        ? paramsList.map((text) => ({ type: "text", text }))
        : hasPlaceholders
          ? [{ type: "text", text: clienteNome ?? "Cliente" }]
          : [];
      const components = parameters.length > 0 ? [{ type: "body", parameters }] : [];

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: phone,
          template_name: tpl.meta_template_name,
          language: tpl.language,
          components,
          practice_id: practiceId,
          sent_by_user_id: userId ?? undefined,
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");
    },
    onSuccess: () => {
      setSelectedTemplate("");
      setTemplateParams("");
      queryClient.invalidateQueries({ queryKey: ["practice-chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["practice-chat-conv"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio template fallito", description: err.message });
    },
  });

  return (
    <div className="border-t bg-white p-3 space-y-2">
      {/* Banner finestra 24h */}
      {!canSendFreeText && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-900">
            {lastInboundAt
              ? `Ultima risposta cliente: ${formatDistanceToNow(new Date(lastInboundAt), { addSuffix: true, locale: it })}. Puoi inviare solo template approvati.`
              : "Il cliente non ha mai scritto. Per iniziare invia un template."}
          </span>
        </div>
      )}

      {/* Mode switcher */}
      {canSendFreeText && (
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded text-xs">
          <button
            onClick={() => setMode("text")}
            className={`flex-1 px-2 py-1 rounded font-medium ${mode === "text" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            Testo libero
          </button>
          <button
            onClick={() => setMode("template")}
            className={`flex-1 px-2 py-1 rounded font-medium ${mode === "template" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            Template
          </button>
        </div>
      )}

      {mode === "text" ? (
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un messaggio..."
            rows={2}
            className="resize-none text-sm"
            disabled={sendTextMutation.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) sendTextMutation.mutate();
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => sendTextMutation.mutate()}
            disabled={!text.trim() || sendTextMutation.isPending}
            className="gap-1.5"
          >
            {sendTextMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Invia
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          >
            <option value="">— scegli template approvato —</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.meta_template_name}>
                {t.meta_template_name} ({t.language})
              </option>
            ))}
          </select>
          {selectedTemplate && (() => {
            const tpl = templates?.find((t) => t.meta_template_name === selectedTemplate);
            if (!tpl) return null;
            const hasPlaceholders = tpl.body_text.includes("{{");
            return (
              <>
                {hasPlaceholders && (
                  <Input
                    value={templateParams}
                    onChange={(e) => setTemplateParams(e.target.value)}
                    placeholder="Parametri: separati da virgola (es. Mario, https://..., 30 giorni)"
                    className="text-xs"
                  />
                )}
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-[11px]">
                  <p className="font-semibold text-emerald-900 mb-1">Preview</p>
                  <pre className="whitespace-pre-wrap break-words text-slate-700 font-sans">
                    {tpl.body_text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
                      const idx = parseInt(n, 10) - 1;
                      const paramsList = templateParams.split(",").map((s) => s.trim()).filter(Boolean);
                      return paramsList[idx] || (idx === 0 ? clienteNome ?? "Mario" : `{{${n}}}`);
                    })}
                  </pre>
                </div>
              </>
            );
          })()}
          <Button
            size="sm"
            onClick={() => sendTemplateMutation.mutate()}
            disabled={!selectedTemplate || sendTemplateMutation.isPending}
            className="w-full gap-2"
          >
            {sendTemplateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Invia template
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Email tab ─────────────────────────────────────────────────────────

function EmailTab({
  practiceId, clienteEmail, clienteNome, formToken,
}: {
  practiceId: string;
  clienteEmail: string;
  clienteNome: string | null;
  formToken: string | null;
}) {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailTemplate, setEmailTemplate] = useState<string>("");

  // Log email inviate a questo cliente
  const { data: emails, isLoading } = useQuery({
    queryKey: ["practice-email-logs", practiceId],
    queryFn: async (): Promise<EmailLog[]> => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("id, to_email, subject, status, sent_at")
        .eq("pratica_id", practiceId)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as EmailLog[]) ?? [];
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (emailTemplate) {
        // Template email: usa send-email con template name
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: {
            to: clienteEmail,
            template: emailTemplate,
            data: {
              nome: clienteNome ?? "",
              link: formToken ? `https://app.praticarapida.it/form/${formToken}` : "",
              practice_id: practiceId,
            },
          },
        });
        if (error) throw error;
        const res = data as { success?: boolean; error?: string };
        if (!res.success) throw new Error(res.error ?? "Invio fallito");
      } else {
        // Email custom
        if (!emailSubject.trim() || !emailBody.trim()) {
          throw new Error("Compila oggetto e corpo");
        }
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: {
            to: clienteEmail,
            subject: emailSubject,
            html: emailBody.replace(/\n/g, "<br/>"),
            practice_id: practiceId,
          },
        });
        if (error) throw error;
        const res = data as { success?: boolean; error?: string };
        if (!res.success) throw new Error(res.error ?? "Invio fallito");
      }
    },
    onSuccess: () => {
      toast({ title: "Email inviata" });
      setComposing(false);
      setEmailSubject("");
      setEmailBody("");
      setEmailTemplate("");
      queryClient.invalidateQueries({ queryKey: ["practice-email-logs", practiceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio email fallito", description: err.message });
    },
  });

  return (
    <>
      {/* Log email */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (!emails || emails.length === 0) && (
          <div className="text-center text-muted-foreground text-sm py-12">
            <Mail className="h-10 w-10 mx-auto opacity-30 mb-2" />
            <p>Nessuna email inviata a questo cliente.</p>
          </div>
        )}
        {emails?.map((e) => (
          <div key={e.id} className="border rounded-lg p-3 hover:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.subject}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  a {e.to_email} · {format(new Date(e.sent_at), "d MMM yyyy HH:mm", { locale: it })}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  e.status === "sent" || e.status === "opened" ? "border-emerald-300 text-emerald-700"
                  : e.status === "failed" || e.status === "bounced" ? "border-red-300 text-red-700"
                  : "border-amber-300 text-amber-700"
                }`}
              >
                {e.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="border-t bg-white p-3 space-y-2">
        {!composing ? (
          <Button
            onClick={() => setComposing(true)}
            className="w-full gap-2"
          >
            <Mail className="h-4 w-4" />
            Nuova email
          </Button>
        ) : (
          <>
            <div>
              <Label className="text-xs">Template (opzionale)</Label>
              <select
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-xs"
              >
                <option value="">— Email custom (scrivi sotto) —</option>
                <option value="pratica_ricevuta">Pratica ricevuta</option>
                <option value="sollecito_privato">Sollecito privato</option>
                <option value="form_compilato">Form compilato</option>
                <option value="pratica_inviata">Pratica inviata ENEA</option>
                <option value="recensione">Richiesta recensione</option>
              </select>
            </div>
            {!emailTemplate && (
              <>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Oggetto"
                  className="text-sm"
                />
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Corpo email"
                  rows={5}
                  className="text-sm"
                />
              </>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setComposing(false)}
                disabled={sendEmailMutation.isPending}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending || (!emailTemplate && (!emailSubject.trim() || !emailBody.trim()))}
                className="flex-1 gap-1.5"
              >
                {sendEmailMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Send className="h-3.5 w-3.5" />
                Invia
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Utility date ─────────────────────────────────────────────────────────

function formatDateHeader(d: Date): string {
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}
