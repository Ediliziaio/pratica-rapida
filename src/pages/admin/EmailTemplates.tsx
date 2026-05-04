import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmailBuilder, type EmailTmplRow } from "@/components/EmailBuilder";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerEvent =
  // Cliente finale
  | "richiesta_form"
  | "sollecito_privato"
  | "form_compilato"
  | "pratica_inviata"
  | "recensione"
  // Rivenditore
  | "pratica_ricevuta"
  | "sollecito_fornitore"
  | "notifica_docs_mancanti"
  | "notifica_pratica_disponibile"
  // Ticket
  | "ticket_conferma"
  | "ticket_risposta_staff"
  | "ticket_replica_cliente"
  | "ticket_nuovo"
  // Onboarding/Auth
  | "benvenuto_azienda"
  | "registrazione_azienda"
  | "recupera_password"
  | "onboarding_welcome"
  // Modulo cliente prodotto
  | "modulo_cliente_invio"
  | "modulo_cliente_reminder"
  // Pratica generica
  | "pratica_created"
  | "pratica_status_changed"
  | "sollecito";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  trigger_event: TriggerEvent;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

interface EmailLog {
  id: string;
  to_email: string;
  subject: string;
  status: "sent" | "failed" | "bounced" | "opened";
  sent_at: string;
}

type LogStatus = EmailLog["status"] | "all";

const TRIGGER_EVENTS: { value: TriggerEvent; label: string; group: string }[] = [
  // Cliente finale
  { value: "richiesta_form", label: "📨 Richiesta compilazione form (M1)", group: "Cliente finale" },
  { value: "sollecito_privato", label: "🔁 Sollecito cliente (M2 — 7gg)", group: "Cliente finale" },
  { value: "form_compilato", label: "✅ Conferma form ricevuto (M3)", group: "Cliente finale" },
  { value: "pratica_inviata", label: "🎉 Pratica completata + recensione (M4)", group: "Cliente finale" },
  { value: "recensione", label: "⭐ Sollecito recensione (M5)", group: "Cliente finale" },
  // Rivenditore
  { value: "pratica_ricevuta", label: "📋 Pratica ricevuta", group: "Rivenditore" },
  { value: "sollecito_fornitore", label: "⏰ Notifica B (30/60/90gg)", group: "Rivenditore" },
  { value: "notifica_docs_mancanti", label: "📄 Notifica A documenti mancanti", group: "Rivenditore" },
  { value: "notifica_pratica_disponibile", label: "📂 Notifica C archivio disponibile", group: "Rivenditore" },
  // Ticket
  { value: "ticket_conferma", label: "🎫 Ticket aperto (al cliente)", group: "Ticket" },
  { value: "ticket_risposta_staff", label: "💬 Risposta staff → cliente", group: "Ticket" },
  { value: "ticket_replica_cliente", label: "💬 Cliente ribatte → staff", group: "Ticket" },
  { value: "ticket_nuovo", label: "🆕 Nuovo ticket (al team)", group: "Ticket" },
  // Onboarding
  { value: "benvenuto_azienda", label: "👋 Benvenuto nuova azienda", group: "Onboarding" },
  { value: "registrazione_azienda", label: "✅ Registrazione completata", group: "Onboarding" },
  { value: "recupera_password", label: "🔑 Recupera password", group: "Onboarding" },
  { value: "onboarding_welcome", label: "🚀 Welcome onboarding", group: "Onboarding" },
  // Modulo cliente
  { value: "modulo_cliente_invio", label: "📝 Modulo cliente — primo invio", group: "Modulo cliente" },
  { value: "modulo_cliente_reminder", label: "📝 Modulo cliente — reminder", group: "Modulo cliente" },
  // Pratica generica (legacy)
  { value: "pratica_created", label: "Pratica creata", group: "Pratica generica" },
  { value: "pratica_status_changed", label: "Stato pratica cambiato", group: "Pratica generica" },
  { value: "sollecito", label: "Sollecito generico", group: "Pratica generica" },
];

// Ordine di visualizzazione dei gruppi
const TRIGGER_GROUPS = [
  "Cliente finale",
  "Rivenditore",
  "Ticket",
  "Onboarding",
  "Modulo cliente",
  "Pratica generica",
];

const EMPTY_FORM: Omit<EmailTemplate, "id" | "created_at" | "updated_at"> = {
  name: "",
  subject: "",
  html_body: "",
  trigger_event: "richiesta_form",
  is_active: true,
};

// Dati di esempio usati quando si invia una test email — coprono le variabili
// presenti in tutti i template seedati.
const SAMPLE_TEST_DATA: Record<string, string> = {
  nome: "Mario",
  cognome: "Rossi",
  cliente_nome: "Anna",
  cliente_cognome: "Bianchi",
  ragione_sociale: "Acme Costruzioni Srl",
  email: "test@example.com",
  password: "Esempio2026!",
  brand: "ENEA",
  prodotto: "Schermature solari",
  reseller: "Bricoman SpA",
  oggetto: "Esempio oggetto ticket",
  subject: "Risposta al tuo ticket",
  messaggio: "Questo è un messaggio di esempio per la test email.",
  descrizione: "Descrizione di esempio del problema riportato.",
  priorita: "normale",
  priorita_upper: "NORMALE",
  company: "Cliente Test Srl",
  giorni: "30",
  stato: "In lavorazione",
  tentativi: "2",
  note: "Manca la planimetria firmata e la copia documento installatore.",
  tipo_modulo: "Schermature",
  link: "https://app.praticarapida.it/test-link",
  ticket_link: "https://app.praticarapida.it/ticket/test",
  login_url: "https://pannello.praticarapida.it",
  app_url: "https://app.praticarapida.it",
  base_url: "https://app.praticarapida.it",
  token: "TEST-TOKEN-1234",
  message: "Messaggio generico di esempio.",
};

// ─── Status badge helpers ─────────────────────────────────────────────────────

const STATUS_BADGE: Record<EmailLog["status"], { label: string; className: string }> = {
  sent: { label: "Inviata", className: "bg-green-100 text-green-800 border-green-200" },
  failed: { label: "Fallita", className: "bg-red-100 text-red-800 border-red-200" },
  bounced: { label: "Bounce", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  opened: { label: "Aperta", className: "bg-blue-100 text-blue-800 border-blue-200" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Template state
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Log filters
  const [searchEmail, setSearchEmail] = useState("");
  const [statusFilter, setStatusFilter] = useState<LogStatus>("all");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["email_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data as EmailLog[];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_templates"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato.", variant: "destructive" });
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM & { id?: string }) => {
      if (data.id) {
        const { id, ...rest } = data;
        const { error } = await supabase.from("email_templates").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_templates"] });
      setEditingTemplate(null);
      setIsCreating(false);
      setFormData(EMPTY_FORM);
      toast({ title: "Salvato", description: "Template salvato con successo." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare il template.", variant: "destructive" });
    },
  });

  // Duplica un template esistente — apre il dialog su un nuovo record "copia"
  const duplicateTemplate = useMutation({
    mutationFn: async (tpl: EmailTemplate) => {
      const { data, error } = await supabase
        .from("email_templates")
        .insert({
          name: `${tpl.name} (copia)`,
          subject: tpl.subject,
          html_body: tpl.html_body,
          trigger_event: null, // clear trigger to evitare conflitto UNIQUE
          is_active: false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: (newTpl) => {
      queryClient.invalidateQueries({ queryKey: ["email_templates"] });
      toast({ title: "Duplicato", description: "Template duplicato. Configuralo e attivalo quando pronto." });
      // apri il dialog edit sul nuovo template
      openEdit(newTpl);
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile duplicare il template.", variant: "destructive" });
    },
  });

  // ── Send test email ────────────────────────────────────────────────────────
  const [testDialog, setTestDialog] = useState<{ open: boolean; trigger: string; defaultEmail: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");

  // ── Visual builder (full-screen) — opzionale per power-users ───────────────
  const [builderTpl, setBuilderTpl] = useState<EmailTemplate | null>(null);

  const sendTest = useMutation({
    mutationFn: async ({ trigger, to }: { trigger: string; to: string }) => {
      const { error } = await supabase.functions.invoke("send-email", {
        body: { to, template: trigger, data: SAMPLE_TEST_DATA },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Email di test inviata ✓", description: `Inviata a ${testEmail}` });
      setTestDialog(null);
    },
    onError: (e: Error) => {
      toast({ title: "Errore invio test", description: e.message, variant: "destructive" });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openEdit(template: EmailTemplate) {
    setFormData({
      name: template.name,
      subject: template.subject,
      html_body: template.html_body,
      trigger_event: template.trigger_event,
      is_active: template.is_active,
    });
    setEditingTemplate(template);
  }

  function openCreate() {
    setFormData(EMPTY_FORM);
    setIsCreating(true);
  }

  function handleSave() {
    if (!formData.name || !formData.subject || !formData.html_body) {
      toast({ title: "Campi mancanti", description: "Compila tutti i campi obbligatori.", variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      saveTemplate.mutate({ ...formData, id: editingTemplate.id });
    } else {
      saveTemplate.mutate(formData);
    }
  }

  // ── Filtered logs ──────────────────────────────────────────────────────────

  const filteredLogs = logs.filter((log) => {
    const matchesEmail = searchEmail === "" || log.to_email.toLowerCase().includes(searchEmail.toLowerCase());
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    return matchesEmail && matchesStatus;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Email Templates</h1>

      {/* Banner informativo — chiarisce che i template hardcoded NON sono modificabili qui */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-900 mb-1">⚠️ Ambito di questa pagina</p>
        <p className="text-amber-800">
          I template qui configurati sono usati <strong>solo</strong> dall'edge function <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">notify-cliente</code> per i moduli cliente (Schermature, Infissi, Pompe di calore, VEPA).
        </p>
        <p className="text-amber-800 mt-2">
          Le email del flusso ENEA (<em>Messaggio 1-5</em>, <em>Notifica A/B/C</em>, <em>conferme pratica</em>, <em>ticket</em>, <em>benvenuto azienda</em>) sono <strong>hardcoded</strong> nell'edge function <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">send-email</code> e non si modificano da qui. Per cambiarle, modificare <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">supabase/functions/send-email/index.ts</code> e redeploy.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Template</TabsTrigger>
          <TabsTrigger value="logs">Log Invii</TabsTrigger>
        </TabsList>

        {/* ── Tab Template — raggruppata per gruppo ──────────────────────── */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Template Email</CardTitle>
              <Button onClick={openCreate}>+ Nuovo template</Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingTemplates ? (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun template trovato.</p>
              ) : (
                <>
                  {TRIGGER_GROUPS.map((group) => {
                    const groupEvents = TRIGGER_EVENTS.filter((e) => e.group === group).map((e) => e.value);
                    const groupTemplates = templates.filter((t) => groupEvents.includes(t.trigger_event));
                    if (groupTemplates.length === 0) return null;

                    return (
                      <section key={group}>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          {group}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {groupTemplates.map((tpl) => {
                            const triggerLabel =
                              TRIGGER_EVENTS.find((e) => e.value === tpl.trigger_event)?.label ?? tpl.trigger_event;
                            const lastEdit = tpl.updated_at ?? tpl.created_at;
                            return (
                              <div
                                key={tpl.id}
                                className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm truncate" title={tpl.name}>
                                      {tpl.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5" title={tpl.subject}>
                                      {tpl.subject}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={tpl.is_active ? "default" : "outline"}
                                    className={tpl.is_active ? "bg-green-100 text-green-800 hover:bg-green-100 border-green-200" : ""}
                                  >
                                    {tpl.is_active ? "Attivo" : "Inattivo"}
                                  </Badge>
                                </div>

                                <Badge variant="outline" className="text-[10px] w-fit">
                                  {triggerLabel}
                                </Badge>

                                {lastEdit && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Ultima modifica: {format(new Date(lastEdit), "dd MMM yyyy HH:mm", { locale: it })}
                                  </p>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t">
                                  <div className="flex items-center gap-1.5">
                                    <Switch
                                      checked={tpl.is_active}
                                      onCheckedChange={(checked) =>
                                        toggleActive.mutate({ id: tpl.id, is_active: checked })
                                      }
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                      {tpl.is_active ? "Attivo" : "Off"}
                                    </span>
                                  </div>

                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => setPreviewTemplate(tpl)}
                                      title="Anteprima"
                                    >
                                      👁
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => {
                                        setTestEmail("");
                                        setTestDialog({ open: true, trigger: tpl.trigger_event, defaultEmail: "" });
                                      }}
                                      title="Invia test"
                                    >
                                      ✉
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => duplicateTemplate.mutate(tpl)}
                                      title="Duplica"
                                    >
                                      ⎘
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => openEdit(tpl)}
                                    >
                                      Modifica
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}

                  {/* Template senza gruppo riconosciuto (legacy / custom) */}
                  {(() => {
                    const known = new Set(TRIGGER_EVENTS.map((e) => e.value));
                    const orphan = templates.filter((t) => !known.has(t.trigger_event));
                    if (orphan.length === 0) return null;
                    return (
                      <section>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Altri / personalizzati
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {orphan.map((tpl) => (
                            <div key={tpl.id} className="rounded-lg border bg-card p-4 flex flex-col gap-2">
                              <p className="font-semibold text-sm">{tpl.name}</p>
                              <p className="text-xs text-muted-foreground">{tpl.subject}</p>
                              <Badge variant="outline" className="w-fit text-[10px]">
                                {tpl.trigger_event ?? "—"}
                              </Badge>
                              <div className="flex gap-2 pt-2">
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(tpl)}>
                                  Modifica
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => duplicateTemplate.mutate(tpl)}
                                >
                                  Duplica
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab Log Invii ─────────────────────────────────────────────────── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Log Invii</CardTitle>
              <div className="flex gap-3 pt-2">
                <Input
                  placeholder="Cerca per email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LogStatus)}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Filtra stato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    <SelectItem value="sent">Inviata</SelectItem>
                    <SelectItem value="failed">Fallita</SelectItem>
                    <SelectItem value="bounced">Bounce</SelectItem>
                    <SelectItem value="opened">Aperta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              ) : filteredLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun log trovato.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Oggetto</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Data invio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const badge = STATUS_BADGE[log.status];
                      return (
                        <TableRow key={log.id}>
                          <TableCell>{log.to_email}</TableCell>
                          <TableCell className="text-muted-foreground">{log.subject}</TableCell>
                          <TableCell>
                            <Badge className={badge.className}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(log.sent_at), "dd MMM yyyy HH:mm", { locale: it })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Edit / Create Dialog ───────────────────────────────────────────── */}
      <Dialog
        open={!!editingTemplate || isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTemplate(null);
            setIsCreating(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Modifica template" : "Nuovo template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome del template"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="subject">Oggetto email *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Oggetto dell'email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trigger_event">Evento trigger</Label>
              <Select
                value={formData.trigger_event}
                onValueChange={(v) => setFormData((f) => ({ ...f, trigger_event: v as TriggerEvent }))}
              >
                <SelectTrigger id="trigger_event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_GROUPS.map((group) => {
                    const items = TRIGGER_EVENTS.filter((e) => e.group === group);
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                          {group}
                        </SelectLabel>
                        {items.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="html_body">Corpo HTML *</Label>
              <Textarea
                id="html_body"
                value={formData.html_body}
                onChange={(e) => setFormData((f) => ({ ...f, html_body: e.target.value }))}
                placeholder="<p>Contenuto email...</p>"
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((f) => ({ ...f, is_active: checked }))}
              />
              <Label htmlFor="is_active">Attivo</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:flex-row sm:justify-between sm:items-center">
            <div>
              {editingTemplate && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setBuilderTpl(editingTemplate);
                    setEditingTemplate(null);
                  }}
                  title="Modifica con il builder visivo a blocchi"
                >
                  🎨 Apri builder visivo
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingTemplate(null);
                  setIsCreating(false);
                }}
              >
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saveTemplate.isPending}>
                {saveTemplate.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Anteprima: {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="border rounded-md overflow-auto max-h-[60vh] p-4 bg-white">
            {previewTemplate && (
              <iframe
                srcDoc={previewTemplate.html_body}
                title="Anteprima template"
                className="w-full min-h-96 border-0"
                sandbox="allow-same-origin"
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            {previewTemplate && (
              <Button
                variant="outline"
                onClick={() => {
                  setTestEmail("");
                  setTestDialog({ open: true, trigger: previewTemplate.trigger_event, defaultEmail: "" });
                }}
              >
                ✉ Invia test
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Visual EmailBuilder (full-screen) ──────────────────────────────── */}
      {builderTpl && (
        <EmailBuilder
          tmpl={
            {
              id: builderTpl.id,
              name: builderTpl.name,
              subject: builderTpl.subject,
              html_body: builderTpl.html_body,
              design_json: null,
              is_active: builderTpl.is_active,
              trigger_event: builderTpl.trigger_event,
            } as EmailTmplRow
          }
          onClose={() => setBuilderTpl(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["email_templates"] });
          }}
        />
      )}

      {/* ── Send test email Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!testDialog?.open}
        onOpenChange={(open) => {
          if (!open) setTestDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invia email di test</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Invia un'anteprima reale del template <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{testDialog?.trigger}</code> a un indirizzo a tua scelta. Le variabili saranno popolate con dati di esempio.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="test_email">Indirizzo destinatario</Label>
              <Input
                id="test_email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@esempio.it"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialog(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
                  toast({ title: "Email non valida", variant: "destructive" });
                  return;
                }
                if (testDialog) sendTest.mutate({ trigger: testDialog.trigger, to: testEmail });
              }}
              disabled={sendTest.isPending || !testEmail}
            >
              {sendTest.isPending ? "Invio..." : "Invia test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
