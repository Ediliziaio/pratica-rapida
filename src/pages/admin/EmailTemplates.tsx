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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerEvent =
  | "pratica_created"
  | "pratica_status_changed"
  | "onboarding_welcome"
  | "sollecito"
  | "recensione"
  | "registrazione_azienda"
  | "recupera_password";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  trigger_event: TriggerEvent;
  is_active: boolean;
  created_at: string;
}

interface EmailLog {
  id: string;
  to_email: string;
  subject: string;
  status: "sent" | "failed" | "bounced" | "opened";
  sent_at: string;
}

type LogStatus = EmailLog["status"] | "all";

const TRIGGER_EVENTS: { value: TriggerEvent; label: string }[] = [
  { value: "pratica_created", label: "Pratica creata" },
  { value: "pratica_status_changed", label: "Stato pratica cambiato" },
  { value: "onboarding_welcome", label: "Benvenuto onboarding" },
  { value: "sollecito", label: "Sollecito" },
  { value: "recensione", label: "Recensione" },
  { value: "registrazione_azienda", label: "✅ Registrazione azienda" },
  { value: "recupera_password", label: "🔑 Recupera password" },
];

const EMPTY_FORM: Omit<EmailTemplate, "id" | "created_at"> = {
  name: "",
  subject: "",
  html_body: "",
  trigger_event: "pratica_created",
  is_active: true,
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

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Template</TabsTrigger>
          <TabsTrigger value="logs">Log Invii</TabsTrigger>
        </TabsList>

        {/* ── Tab Template ──────────────────────────────────────────────────── */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Template Email</CardTitle>
              <Button onClick={openCreate}>+ Nuovo template</Button>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun template trovato.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Oggetto</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Attivo</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((tpl) => (
                      <TableRow key={tpl.id}>
                        <TableCell className="font-medium">{tpl.name}</TableCell>
                        <TableCell className="text-muted-foreground">{tpl.subject}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {TRIGGER_EVENTS.find((e) => e.value === tpl.trigger_event)?.label ?? tpl.trigger_event}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={tpl.is_active}
                            onCheckedChange={(checked) =>
                              toggleActive.mutate({ id: tpl.id, is_active: checked })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(tpl)}>
                            Anteprima
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(tpl)}>
                            Modifica
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  {TRIGGER_EVENTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
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
          <DialogFooter>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
