import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Link2, Copy, Check, Send, Bell, RefreshCw, ClipboardList,
  CheckCircle2, Clock, Mail, MessageSquare,
} from "lucide-react";

interface ModuloClienteProps {
  praticaId: string;
}

type TipoModulo = "schermature-solari" | "infissi" | "impianto-termico" | "vepa";
type StatoToken = "pending" | "inviato" | "compilato" | "scaduto";

interface Token {
  id: string;
  pratica_id: string;
  token: string;
  tipo_modulo: TipoModulo;
  stato: StatoToken;
  created_at: string;
  sent_at: string | null;
  compiled_at: string | null;
  expires_at: string;
  reminder_count: number;
  last_reminder_at: string | null;
}

const TIPO_LABEL: Record<TipoModulo, string> = {
  "schermature-solari": "Schermature Solari",
  "infissi": "Infissi",
  "impianto-termico": "Impianto Termico",
  "vepa": "VEPA",
};

const TIPO_PATH: Record<TipoModulo, string> = {
  "schermature-solari": "schermature-solari",
  "infissi": "modulo-infissi",
  "impianto-termico": "impianto-termico",
  "vepa": "modulo-vepa",
};

const STATO_BADGE: Record<StatoToken, { label: string; className: string }> = {
  pending: { label: "In attesa", className: "border-yellow-400/50 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20" },
  inviato: { label: "Inviato", className: "border-blue-400/50 text-blue-600 bg-blue-50 dark:bg-blue-950/20" },
  compilato: { label: "Compilato", className: "border-green-400/50 text-green-600 bg-green-50 dark:bg-green-950/20" },
  scaduto: { label: "Scaduto", className: "border-red-400/50 text-red-600 bg-red-50 dark:bg-red-950/20" },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildToken(nome: string, cognome: string): string {
  const suffix = Math.random().toString(16).slice(2, 8);
  const base = [slugify(nome), slugify(cognome)].filter(Boolean).join("-");
  return base ? `${base}-${suffix}` : suffix;
}

function getModuloUrl(tipoModulo: TipoModulo, token: string): string {
  return `${window.location.origin}/${TIPO_PATH[tipoModulo]}/${token}`;
}

export function ModuloCliente({ praticaId }: ModuloClienteProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tipoModulo, setTipoModulo] = useState<TipoModulo>("schermature-solari");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: tokens = [], isLoading } = useQuery<Token[]>({
    queryKey: ["client-form-tokens", praticaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_form_tokens")
        .select("*")
        .eq("pratica_id", praticaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Token[];
    },
  });

  const generateToken = useMutation({
    mutationFn: async () => {
      // Fetch client name to build a readable token
      const { data: pratica } = await supabase
        .from("pratiche")
        .select("clienti_finali(nome, cognome)")
        .eq("id", praticaId)
        .maybeSingle();
      const cliente = (pratica?.clienti_finali as any);
      const tokenValue = buildToken(cliente?.nome ?? "", cliente?.cognome ?? "");

      const { data, error } = await supabase
        .from("client_form_tokens")
        .insert({ pratica_id: praticaId, tipo_modulo: tipoModulo, token: tokenValue })
        .select("*")
        .single();
      if (error) throw error;
      return data as Token;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-form-tokens", praticaId] });
      toast({ title: "Link generato", description: "Il link cliente è pronto." });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const sendReminder = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase.functions.invoke("notify-cliente", {
        body: { token_id: tokenId, channel: "email", is_reminder: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-form-tokens", praticaId] });
      toast({ title: "Reminder inviato" });
    },
    onError: (e: Error) => toast({ title: "Errore reminder", description: e.message, variant: "destructive" }),
  });

  const handleCopy = async (token: Token) => {
    await navigator.clipboard.writeText(getModuloUrl(token.tipo_modulo, token.token));
    setCopiedId(token.id);
    setTimeout(() => setCopiedId(null), 2000);
    // Mark as sent
    await supabase
      .from("client_form_tokens")
      .update({ stato: "inviato", sent_at: new Date().toISOString() })
      .eq("id", token.id)
      .eq("stato", "pending");
    queryClient.invalidateQueries({ queryKey: ["client-form-tokens", praticaId] });
  };

  const handleSendEmail = async (token: Token) => {
    try {
      const { error } = await supabase.functions.invoke("notify-cliente", {
        body: { token_id: token.id, channel: "email", is_reminder: false },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-form-tokens", praticaId] });
      toast({ title: "Email inviata al cliente" });
    } catch (e: any) {
      toast({ title: "Errore invio email", description: e.message, variant: "destructive" });
    }
  };

  const handleSendWhatsApp = async (token: Token) => {
    try {
      const { error } = await supabase.functions.invoke("notify-cliente", {
        body: { token_id: token.id, channel: "whatsapp", is_reminder: false },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-form-tokens", praticaId] });
      toast({ title: "WhatsApp inviato al cliente" });
    } catch (e: any) {
      toast({ title: "Errore invio WhatsApp", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Modulo Cliente ENEA
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Generate new token */}
        <div className="flex items-center gap-2">
          <Select value={tipoModulo} onValueChange={(v) => setTipoModulo(v as TipoModulo)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_LABEL) as TipoModulo[]).map((k) => (
                <SelectItem key={k} value={k}>{TIPO_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 gap-1.5 shrink-0"
            onClick={() => generateToken.mutate()}
            disabled={generateToken.isPending}
          >
            {generateToken.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Genera link
          </Button>
        </div>

        {/* Tokens list */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-3">Caricamento...</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nessun link generato. Seleziona il tipo di modulo e genera un link da inviare al cliente.
          </p>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => {
              const badge = STATO_BADGE[t.stato];
              const url = getModuloUrl(t.tipo_modulo, t.token);
              const copied = copiedId === t.id;
              const isExpired = new Date(t.expires_at) < new Date();

              return (
                <div key={t.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium">{TIPO_LABEL[t.tipo_modulo]}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${badge.className}`}>
                        {isExpired && t.stato !== "compilato" ? "Scaduto" : badge.label}
                      </Badge>
                      {t.stato === "compilato" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.reminder_count > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                          <Bell className="h-3 w-3" />
                          {t.reminder_count}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        scade {new Date(t.expires_at).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  </div>

                  {/* URL */}
                  <div className="flex items-center gap-1.5 bg-background rounded border px-2 py-1.5">
                    <span className="text-[11px] text-muted-foreground truncate flex-1 font-mono">{url}</span>
                    <button
                      onClick={() => handleCopy(t)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copia link"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Actions */}
                  {t.stato !== "compilato" && !isExpired && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleSendEmail(t)}
                      >
                        <Mail className="h-3 w-3" />
                        Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleSendWhatsApp(t)}
                      >
                        <MessageSquare className="h-3 w-3" />
                        WhatsApp
                      </Button>
                      {t.stato === "inviato" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 ml-auto"
                          onClick={() => sendReminder.mutate(t.id)}
                          disabled={sendReminder.isPending}
                        >
                          <Bell className="h-3 w-3" />
                          Reminder
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Compiled data preview */}
                  {t.stato === "compilato" && (
                    <CompiledDataPreview tokenId={t.id} tipoModulo={t.tipo_modulo} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompiledDataPreview({ tokenId, tipoModulo }: { tokenId: string; tipoModulo: TipoModulo }) {
  const tableMap: Record<TipoModulo, string> = {
    "schermature-solari": "client_form_schermature",
    "infissi": "client_form_infissi",
    "impianto-termico": "client_form_impianto_termico",
  };

  const { data } = useQuery({
    queryKey: ["compiled-form", tokenId, tipoModulo],
    queryFn: async () => {
      const table = tableMap[tipoModulo];
      const { data, error } = await (supabase.from(table as any) as any)
        .select("*")
        .eq("token_id", tokenId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!data) return null;

  const fields = Object.entries(data).filter(
    ([k]) => !["id", "token_id", "pratica_id", "created_at"].includes(k)
  );

  return (
    <div className="border-t pt-2 mt-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Dati compilati dal cliente
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {fields.map(([k, v]) => (
          v != null && v !== "" ? (
            <div key={k} className="min-w-0">
              <p className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
              <p className="text-xs font-medium truncate">{String(v)}</p>
            </div>
          ) : null
        ))}
      </div>
    </div>
  );
}
