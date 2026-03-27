import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Profile = {
  id: string;
  nome: string | null;
  cognome: string | null;
  company_name: string | null;
  telefono: string | null;
};

type WhatsappLog = {
  id: string;
  phone: string;
  template_name: string | null;
  body: string | null;
  direction: string;
  status: string;
  sent_at: string;
};

type MessageMode = "template" | "free";

const TEMPLATES = [
  { value: "pratica_ricevuta",      label: "Pratica Ricevuta" },
  { value: "pratica_in_lavorazione", label: "Pratica in Lavorazione" },
  { value: "pratica_completata",    label: "Pratica Completata" },
  { value: "reminder_documenti",    label: "Reminder Documenti" },
];

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  sent:      { label: "Inviato",    className: "bg-gray-100 text-gray-600 border-gray-200" },
  delivered: { label: "Consegnato", className: "bg-blue-100 text-blue-700 border-blue-200" },
  read:      { label: "Letto",      className: "bg-green-100 text-green-700 border-green-200" },
  failed:    { label: "Fallito",    className: "bg-red-100 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Send Message Modal
// ---------------------------------------------------------------------------

function SendMessageModal({
  profile,
  open,
  onClose,
}: {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<MessageMode>("template");
  const [template, setTemplate] = useState("");
  const [freeText, setFreeText] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      const phone = profile.telefono ?? "";
      if (!phone) throw new Error("Numero di telefono mancante");

      const payload =
        mode === "template"
          ? { phone, template_name: template }
          : { phone, body: freeText };

      const { error } = await supabase.functions.invoke("send-whatsapp", {
        body: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Messaggio inviato", description: "WhatsApp inviato correttamente." });
      onClose();
      setTemplate("");
      setFreeText("");
      setMode("template");
    },
    onError: (err: Error) => {
      toast({ title: "Errore invio", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit =
    mode === "template" ? !!template : freeText.trim().length > 0;

  const displayName = profile
    ? (profile.company_name || `${profile.nome ?? ""} ${profile.cognome ?? ""}`.trim())
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invia Messaggio WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-muted-foreground text-xs">Destinatario</Label>
            <p className="font-medium">{displayName}</p>
            <p className="text-sm text-muted-foreground">{profile?.telefono ?? "—"}</p>
          </div>

          {/* Mode selector */}
          <div>
            <Label>Tipo messaggio</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as MessageMode)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="template">Template</SelectItem>
                <SelectItem value="free">Testo libero</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "template" ? (
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleziona template…" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label htmlFor="free-text">Messaggio</Label>
              <textarea
                id="free-text"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[100px] resize-none"
                placeholder="Scrivi il messaggio…"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Annulla
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit || mutation.isPending}
            >
              {mutation.isPending ? "Invio…" : "Invia"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab: Invia Messaggio
// ---------------------------------------------------------------------------

function InviaMessaggioTab() {
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["whatsapp-profiles"],
    queryFn: async () => {
      const rolesRes = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["azienda_admin", "azienda_user"]);

      const userIds = rolesRes.data?.map((r) => r.user_id) ?? [];
      if (userIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, cognome, company_name, telefono")
        .in("id", userIds)
        .order("company_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const filtered = profiles.filter((p) => {
    const name = (p.company_name || `${p.nome ?? ""} ${p.cognome ?? ""}`.trim()).toLowerCase();
    const phone = (p.telefono ?? "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Clienti Azienda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Cerca per nome o telefono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda / Nome</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead className="text-right">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nessun cliente trovato
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.company_name || `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—"}
                      </TableCell>
                      <TableCell>{p.telefono || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!p.telefono}
                          onClick={() => setSelectedProfile(p)}
                        >
                          <MessageCircle className="h-4 w-4 mr-1.5" />
                          Invia Messaggio
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SendMessageModal
        profile={selectedProfile}
        open={!!selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Log Conversazioni
// ---------------------------------------------------------------------------

function LogConversazioniTab() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["whatsapp-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_logs")
        .select("id, phone, template_name, body, direction, status, sent_at")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as WhatsappLog[];
    },
  });

  const filtered = statusFilter === "all"
    ? logs
    : logs.filter((l) => l.status === statusFilter);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Log Conversazioni WhatsApp</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtra per stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="sent">Inviato</SelectItem>
              <SelectItem value="delivered">Consegnato</SelectItem>
              <SelectItem value="read">Letto</SelectItem>
              <SelectItem value="failed">Fallito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefono</TableHead>
                <TableHead>Template / Testo</TableHead>
                <TableHead>Direzione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Data invio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nessun log trovato
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{log.phone}</TableCell>
                    <TableCell className="max-w-xs">
                      {log.template_name ? (
                        <span className="font-medium">{log.template_name}</span>
                      ) : (
                        <span className="text-muted-foreground truncate block max-w-xs">
                          {log.body ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {log.direction === "outbound" ? "Uscente" : "Entrante"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {log.sent_at
                        ? format(new Date(log.sent_at), "dd MMM yyyy HH:mm", { locale: it })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WhatsappPanel() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Panel</h1>
          <p className="text-muted-foreground text-sm">
            Invia messaggi e consulta i log delle conversazioni
          </p>
        </div>
      </div>

      <Tabs defaultValue="invia">
        <TabsList>
          <TabsTrigger value="invia">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Invia Messaggio
          </TabsTrigger>
          <TabsTrigger value="log">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Log Conversazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invia" className="mt-4">
          <InviaMessaggioTab />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <LogConversazioniTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
