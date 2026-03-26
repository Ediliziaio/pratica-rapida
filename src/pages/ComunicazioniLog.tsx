import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail,
  MessageCircle,
  Phone,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Download,
  Plus,
  Send,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { CommunicationLog, CommChannel, CommStatus } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

const CHANNEL_CONFIG: Record<CommChannel, { label: string; color: string; icon: React.ReactNode }> = {
  email: { label: "Email", color: "bg-blue-100 text-blue-700", icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp: { label: "WhatsApp", color: "bg-green-100 text-green-700", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  phone: { label: "Telefono", color: "bg-orange-100 text-orange-700", icon: <Phone className="h-3.5 w-3.5" /> },
  sms: { label: "SMS", color: "bg-purple-100 text-purple-700", icon: <MessageSquare className="h-3.5 w-3.5" /> },
};

const STATUS_CONFIG: Record<CommStatus, { label: string; color: string }> = {
  sent: { label: "Inviato", color: "text-blue-600 border-blue-200" },
  delivered: { label: "Consegnato", color: "text-green-600 border-green-200" },
  read: { label: "Letto", color: "text-emerald-600 border-emerald-200" },
  failed: { label: "Fallito", color: "text-destructive border-destructive/20" },
  pending: { label: "In attesa", color: "text-yellow-600 border-yellow-200" },
};

function ChannelIcon({ channel }: { channel: CommChannel }) {
  const cfg = CHANNEL_CONFIG[channel];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

interface SendFormData {
  channel: "email" | "whatsapp";
  recipient: string;
  subject: string;
  body: string;
}

const DEFAULT_SEND_FORM: SendFormData = {
  channel: "email",
  recipient: "",
  subject: "",
  body: "",
};

export default function ComunicazioniLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchRecipient, setSearchRecipient] = useState("");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendForm, setSendForm] = useState<SendFormData>(DEFAULT_SEND_FORM);

  const { data: logs = [], isLoading, isFetching } = useQuery<CommunicationLog[]>({
    queryKey: ["communication_log_full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CommunicationLog[];
    },
  });

  const sendManualMutation = useMutation({
    mutationFn: async (form: SendFormData) => {
      const fnName = form.channel === "email" ? "send-email" : "send-whatsapp";
      const payload = form.channel === "email"
        ? {
            to: form.recipient,
            subject: form.subject,
            html: `<p>${form.body.replace(/\n/g, "<br>")}</p>`,
            template: "custom",
            practice_id: null,
          }
        : {
            phone: form.recipient,
            template_name: "custom",
            body: form.body,
            practice_id: null,
          };

      const { error } = await supabase.functions.invoke(fnName, { body: payload });
      if (error) throw error;

      // Log it locally too
      await supabase.from("communication_log").insert({
        channel: form.channel,
        direction: "outbound",
        recipient: form.recipient,
        subject: form.subject || null,
        body_preview: form.body.substring(0, 200),
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication_log_full"] });
      toast({ title: "Comunicazione inviata" });
      setSendDialogOpen(false);
      setSendForm(DEFAULT_SEND_FORM);
    },
    onError: (e: Error) => toast({ title: "Errore invio", description: e.message, variant: "destructive" }),
  });

  const { todayCount, failedCount, deliveredCount, readCount, deliveryRate, channelStats } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let todayCount = 0, failedCount = 0, deliveredCount = 0, readCount = 0;
    const channelCounts: Record<string, number> = {};

    logs.forEach(l => {
      if (l.sent_at?.startsWith(today)) todayCount++;
      if (l.status === "failed") failedCount++;
      if (l.status === "delivered" || l.status === "read") deliveredCount++;
      if (l.status === "read") readCount++;
      if (l.channel) channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });

    const deliveryRate = logs.length > 0 ? Math.round((deliveredCount / logs.length) * 100) : 0;
    const channelStats = Object.entries(CHANNEL_CONFIG)
      .map(([ch, cfg]) => ({ channel: ch as CommChannel, cfg, count: channelCounts[ch] || 0 }))
      .filter(s => s.count > 0);

    return { todayCount, failedCount, deliveredCount, readCount, deliveryRate, channelStats };
  }, [logs]);

  const filtered = useMemo(() => logs.filter((l) => {
    if (channelFilter !== "all" && l.channel !== channelFilter) return false;
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (searchRecipient.trim() && !l.recipient.toLowerCase().includes(searchRecipient.toLowerCase())) return false;
    return true;
  }), [logs, channelFilter, statusFilter, searchRecipient]);

  const handleExportCSV = () => {
    const rows = filtered.map((l) => ({
      ID: l.id,
      Canale: l.channel,
      Destinatario: l.recipient,
      Oggetto: l.subject ?? "",
      Anteprima: l.body_preview ?? "",
      Stato: l.status,
      "Data invio": new Date(l.sent_at).toLocaleString("it-IT"),
      "Data lettura": l.read_at ? new Date(l.read_at).toLocaleString("it-IT") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ComunicazioniLog");
    XLSX.writeFile(wb, `comunicazioni_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Log Comunicazioni</h1>
          <p className="text-muted-foreground">Storico anti-contestazione di tutte le comunicazioni</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["communication_log_full"] })}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Esporta Excel
          </Button>
          <Button size="sm" onClick={() => setSendDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuova Comunicazione
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Oggi</CardTitle>
            <Mail className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCount}</div>
            <p className="text-xs text-muted-foreground">comunicazioni inviate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Delivery Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{deliveryRate}%</div>
            <p className="text-xs text-muted-foreground">{deliveredCount} su {logs.length} consegnati</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Falliti</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${failedCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${failedCount > 0 ? "text-destructive" : ""}`}>
              {failedCount}
            </div>
            {failedCount > 0 && <p className="text-xs text-destructive">Richiede attenzione</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Letti</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{readCount}</div>
            <p className="text-xs text-muted-foreground">confermati come letti</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel breakdown */}
      {channelStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {channelStats.map(s => (
            <span
              key={s.channel}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium cursor-pointer hover:opacity-80 ${s.cfg.color}`}
              onClick={() => setChannelFilter(channelFilter === s.channel ? "all" : s.channel)}
            >
              {s.cfg.icon} {s.cfg.label}: {s.count}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Canale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i canali</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="phone">Telefono</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="sent">Inviato</SelectItem>
            <SelectItem value="delivered">Consegnato</SelectItem>
            <SelectItem value="read">Letto</SelectItem>
            <SelectItem value="failed">Fallito</SelectItem>
            <SelectItem value="pending">In attesa</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Cerca destinatario..."
          value={searchRecipient}
          onChange={(e) => setSearchRecipient(e.target.value)}
          className="w-56"
        />

        <span className="self-center text-sm text-muted-foreground ml-auto">
          {filtered.length} risultati
        </span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Canale</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destinatario</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Oggetto / Anteprima</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stato</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Data invio</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Mail className="h-10 w-10 opacity-20" />
                      <p className="font-medium">Nessun log trovato</p>
                      <p className="text-xs">Le comunicazioni inviate appariranno qui</p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setSendDialogOpen(true)}>
                        <Send className="h-3.5 w-3.5 mr-1.5" />Invia prima comunicazione
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const statusCfg = STATUS_CONFIG[log.status];
                  return (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <ChannelIcon channel={log.channel} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.recipient}</td>
                      <td className="px-4 py-3 max-w-xs">
                        {log.subject && <p className="font-medium text-xs truncate">{log.subject}</p>}
                        {log.body_preview && <p className="text-xs text-muted-foreground truncate">{log.body_preview}</p>}
                        {!log.subject && !log.body_preview && <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                          {statusCfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.sent_at).toLocaleString("it-IT")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Manual Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Nuova Comunicazione Manuale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canale</Label>
              <div className="flex gap-2">
                {(["email", "whatsapp"] as const).map(ch => (
                  <button
                    key={ch}
                    onClick={() => setSendForm(f => ({ ...f, channel: ch }))}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                      sendForm.channel === ch
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {ch === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                    {ch === "email" ? "Email" : "WhatsApp"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {sendForm.channel === "email" ? "Indirizzo email" : "Numero telefono"}
                <span className="text-destructive"> *</span>
              </Label>
              <Input
                placeholder={sendForm.channel === "email" ? "cliente@email.it" : "+39 333 0000000"}
                value={sendForm.recipient}
                onChange={e => setSendForm(f => ({ ...f, recipient: e.target.value }))}
              />
            </div>

            {sendForm.channel === "email" && (
              <div className="space-y-1.5">
                <Label>Oggetto</Label>
                <Input
                  placeholder="Oggetto email..."
                  value={sendForm.subject}
                  onChange={e => setSendForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Messaggio <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder={sendForm.channel === "email"
                  ? "Corpo del messaggio. Puoi usare {{nome}}, {{brand}} come variabili."
                  : "Testo del messaggio WhatsApp (max 1024 caratteri)"}
                value={sendForm.body}
                onChange={e => setSendForm(f => ({ ...f, body: e.target.value }))}
                rows={5}
                maxLength={sendForm.channel === "whatsapp" ? 1024 : undefined}
              />
              {sendForm.channel === "whatsapp" && (
                <p className="text-xs text-muted-foreground text-right">{sendForm.body.length}/1024</p>
              )}
            </div>

            <div className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">💡 Variabili disponibili</p>
              <p><code className="bg-muted px-1 rounded">{"{{nome}}"}</code> — Nome cliente</p>
              <p><code className="bg-muted px-1 rounded">{"{{brand}}"}</code> — ENEA o Conto Termico</p>
              <p><code className="bg-muted px-1 rounded">{"{{link}}"}</code> — Link pratica/form</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => sendManualMutation.mutate(sendForm)}
              disabled={!sendForm.recipient || !sendForm.body || sendManualMutation.isPending}
            >
              {sendManualMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Invio...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Invia ora</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
