/**
 * OpenWAPanel — gestione gateway WhatsApp OpenWA da /admin/integrazioni.
 *
 * Parla con l'edge function `openwa-admin` (super_admin only) che fa da
 * proxy sicuro verso il server OpenWA self-hosted:
 *  - stato sessione live (connected / qr_ready / disconnected / ...)
 *  - QR code da scansionare direttamente in pagina (auto-refresh)
 *  - riavvio sessione (rigenera QR / riconnette)
 *  - checklist secrets + provider attivo
 *
 * Polling adattivo: 5s quando si aspetta la scansione QR, 30s quando
 * connesso o fermo.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Smartphone,
  QrCode, Loader2, Power,
} from "lucide-react";

interface OpenWAStatus {
  secrets: {
    WA_PROVIDER: string;
    OPENWA_BASE_URL: boolean;
    OPENWA_API_KEY: boolean;
    OPENWA_SESSION_ID: boolean;
    OPENWA_WEBHOOK_SECRET: boolean;
  };
  reachable: boolean;
  session: {
    id: string;
    name: string;
    status: string;
    phone: string | null;
    pushName: string | null;
    connectedAt: string | null;
  } | null;
  error: string | null;
  webhook_url?: string;
}

/** Mappa lo stato sessione OpenWA su pill colorata + testo italiano. */
function sessionBadge(status: string | undefined | null) {
  switch ((status ?? "").toLowerCase()) {
    case "connected":
    case "ready":
    case "authenticated":
    case "working":
      return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Connesso", Icon: CheckCircle2 };
    case "qr_ready":
    case "scan_qr":
      return { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Scansiona il QR", Icon: QrCode };
    case "initializing":
    case "connecting":
    case "starting":
      return { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Avvio in corso…", Icon: Loader2 };
    case "disconnected":
    case "failed":
    case "stopped":
      return { cls: "bg-red-50 text-red-700 border-red-200", label: "Disconnesso", Icon: XCircle };
    default:
      return { cls: "bg-slate-50 text-slate-600 border-slate-200", label: status || "Sconosciuto", Icon: AlertTriangle };
  }
}

export default function OpenWAPanel() {
  const queryClient = useQueryClient();

  const { data: status, isFetching, refetch } = useQuery({
    queryKey: ["openwa-status"],
    queryFn: async (): Promise<OpenWAStatus> => {
      const { data, error } = await supabase.functions.invoke("openwa-admin", {
        body: { action: "status" },
      });
      if (error) throw new Error(error.message);
      return data as OpenWAStatus;
    },
    // Poll veloce mentre si aspetta la scansione, lento quando stabile
    refetchInterval: (query) => {
      const s = query.state.data?.session?.status?.toLowerCase();
      return s === "qr_ready" || s === "initializing" || s === "connecting" ? 5_000 : 30_000;
    },
    staleTime: 3_000,
  });

  const sessionStatus = status?.session?.status?.toLowerCase();
  const needsQr = sessionStatus === "qr_ready" || sessionStatus === "scan_qr";
  const isConnected = sessionStatus === "connected" || sessionStatus === "ready"
    || sessionStatus === "authenticated" || sessionStatus === "working";

  // QR: fetcha solo quando la sessione lo richiede; il QR whatsapp-web.js
  // ruota ogni ~30-60s → refetch ogni 30s per non mostrarne uno scaduto.
  const { data: qrData, isFetching: qrFetching } = useQuery({
    queryKey: ["openwa-qr"],
    queryFn: async (): Promise<{ qr: string | null; error?: string }> => {
      const { data, error } = await supabase.functions.invoke("openwa-admin", {
        body: { action: "qr" },
      });
      if (error) throw new Error(error.message);
      return data as { qr: string | null; error?: string };
    },
    enabled: needsQr,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("openwa-admin", {
        body: { action: "restart" },
      });
      if (error) throw new Error(error.message);
      const res = data as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Riavvio fallito");
      return res;
    },
    onSuccess: () => {
      toast({ title: "Sessione riavviata", description: "Tra qualche secondo apparirà un nuovo QR se serve la scansione." });
      queryClient.invalidateQueries({ queryKey: ["openwa-status"] });
      queryClient.invalidateQueries({ queryKey: ["openwa-qr"] });
    },
    onError: (e) => {
      toast({ title: "Errore riavvio", description: e instanceof Error ? e.message : "Errore sconosciuto", variant: "destructive" });
    },
  });

  const badge = sessionBadge(status?.session?.status);
  const BadgeIcon = badge.Icon;
  const providerActive = status?.secrets.WA_PROVIDER === "openwa";
  const secretsMissing = status && (!status.secrets.OPENWA_BASE_URL || !status.secrets.OPENWA_API_KEY || !status.secrets.OPENWA_SESSION_ID);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}>
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                WhatsApp via OpenWA
                {providerActive
                  ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">PROVIDER ATTIVO</Badge>
                  : <Badge variant="outline" className="text-[10px]">provider: {status?.secrets.WA_PROVIDER ?? "…"}</Badge>}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gateway self-hosted (whatsapp-web.js) — invio e ricezione senza Cloud API Meta
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${badge.cls}`}>
            <BadgeIcon className={`h-3.5 w-3.5 ${sessionStatus === "initializing" || sessionStatus === "connecting" ? "animate-spin" : ""}`} />
            {badge.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* Secrets mancanti → istruzioni */}
        {secretsMissing && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">⚙️ Configurazione incompleta</p>
            <p>Mancano alcuni secrets su Supabase Edge Functions:</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {!status?.secrets.OPENWA_BASE_URL && <li>• OPENWA_BASE_URL</li>}
              {!status?.secrets.OPENWA_API_KEY && <li>• OPENWA_API_KEY</li>}
              {!status?.secrets.OPENWA_SESSION_ID && <li>• OPENWA_SESSION_ID</li>}
              {!status?.secrets.OPENWA_WEBHOOK_SECRET && <li>• OPENWA_WEBHOOK_SECRET</li>}
            </ul>
          </div>
        )}

        {/* Server irraggiungibile */}
        {status && !status.reachable && !secretsMissing && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 leading-relaxed">
            <p className="font-semibold">🔌 Server OpenWA irraggiungibile</p>
            <p className="mt-0.5">{status.error ?? "Verifica che il container Docker e il tunnel siano attivi."}</p>
          </div>
        )}

        {/* QR code da scansionare */}
        {needsQr && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium text-center">
              📱 Scansiona col telefono del numero dedicato
            </p>
            {qrData?.qr ? (
              <img
                src={qrData.qr}
                alt="QR code WhatsApp"
                className="w-52 h-52 rounded-md border bg-white p-2"
              />
            ) : (
              <div className="w-52 h-52 rounded-md border bg-white flex items-center justify-center">
                {qrFetching
                  ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  : <p className="text-xs text-muted-foreground text-center px-4">{qrData?.error ?? "QR in caricamento…"}</p>}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              WhatsApp → <strong>Impostazioni</strong> → <strong>Dispositivi collegati</strong> → <strong>Collega un dispositivo</strong>
              <br />Il QR si rinnova automaticamente ogni 30 secondi.
            </p>
          </div>
        )}

        {/* Connesso: info numero */}
        {isConnected && status?.session && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">✅ Numero collegato e operativo</p>
            <p className="mt-1">
              {status.session.phone ? `+${status.session.phone}` : "Numero"}
              {status.session.pushName ? ` · ${status.session.pushName}` : ""}
              {status.session.connectedAt ? ` · connesso ${new Date(status.session.connectedAt).toLocaleString("it-IT")}` : ""}
            </p>
            {!providerActive && (
              <p className="mt-2 text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ La sessione è connessa ma <code className="font-mono text-[11px]">WA_PROVIDER</code> non è <code className="font-mono text-[11px]">openwa</code>:
                gli invii passano ancora da Meta. Imposta il secret per attivare OpenWA.
              </p>
            )}
          </div>
        )}

        {/* Azioni */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna stato
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending || !status?.reachable}
            className="gap-2"
          >
            {restartMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Power className="h-3.5 w-3.5" />}
            Riavvia sessione
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
