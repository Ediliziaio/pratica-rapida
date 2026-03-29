import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isInternal } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft, Send, ExternalLink, FileDown, Copy, Check,
  CalendarDays, User, Tag, CreditCard, Clock, Hash,
  CopyPlus, CheckCircle2, CircleDot, Circle, XCircle, AlertCircle,
} from "lucide-react";
import { PracticeChat } from "@/components/PracticeChat";
import { DocumentUpload } from "@/components/DocumentUpload";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { STATO_CONFIG, INTERNAL_TRANSITIONS, PAGAMENTO_BADGE } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// Typed interfaces for joined data
interface ClienteFinale {
  nome: string;
  cognome: string;
  email: string | null;
  codice_fiscale: string | null;
  telefono: string | null;
  indirizzo: string | null;
}

interface DatiPratica {
  brand?: "enea" | "conto_termico";
  tipo_intervento?: string;
  dati_catastali?: string;
  data_fine_lavori?: string;
  importo_lavori?: number;
  note_aggiuntive?: string;
}

// Copy button with feedback
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 opacity-40 hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copied
              ? <Check className="h-3 w-3 text-success" />
              : <Copy className="h-3 w-3" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copiato!" : "Copia"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Output section component
function OutputSection({ outputUrls, noteConsegna }: { outputUrls: unknown; noteConsegna: string | null }) {
  const urls = Array.isArray(outputUrls) ? outputUrls as string[] : [];
  if (urls.length === 0 && !noteConsegna) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileDown className="h-4 w-4" />Documenti di Output
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {urls.length > 0 && (
          <div className="space-y-2">
            {urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border p-3 text-sm text-primary hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="truncate">{url.split("/").pop() || `Documento ${i + 1}`}</span>
              </a>
            ))}
          </div>
        )}
        {noteConsegna && (
          <div>
            <span className="text-sm text-muted-foreground">Note di consegna</span>
            <p className="mt-1 text-sm">{noteConsegna}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Send button for company users
function SendPraticaButton({ praticaId, stato, onSuccess }: { praticaId: string; stato: string; onSuccess: () => void }) {
  const { toast } = useToast();

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pratiche")
        .update({ stato: "inviata" })
        .eq("id", praticaId);
      if (error) throw error;
    },
    onSuccess: () => {
      onSuccess();
      toast({ title: "Pratica inviata con successo!" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (stato !== "bozza") return null;

  return (
    <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="w-full">
      <Send className="mr-2 h-4 w-4" />
      {sendMutation.isPending ? "Invio in corso..." : "Invia Pratica"}
    </Button>
  );
}

// ── Practice stage timeline (read-only for azienda) ───────────────────────────
interface TimelineState {
  key: PraticaStato;
  label: string;
  desc: string;
  /** Classes applied to the dot when this step is the CURRENT state */
  activeDot: string;
  activeRing: string;
  activePulse: string;
  activeLabel: string;
  activeDesc: string;
  /** Connector line color when this step is done */
  doneConnector: string;
}

const TIMELINE_STATES: TimelineState[] = [
  {
    key: "bozza",
    label: "Bozza",
    desc: "Pratica in preparazione",
    activeDot:       "border-slate-500 bg-slate-500 text-white",
    activeRing:      "ring-slate-200",
    activePulse:     "bg-white",
    activeLabel:     "text-slate-700",
    activeDesc:      "text-slate-500",
    doneConnector:   "bg-green-300",
  },
  {
    key: "inviata",
    label: "Inviata",
    desc: "In attesa di presa in carico",
    activeDot:       "border-blue-500 bg-blue-500 text-white",
    activeRing:      "ring-blue-100",
    activePulse:     "bg-white",
    activeLabel:     "text-blue-700",
    activeDesc:      "text-blue-500",
    doneConnector:   "bg-green-300",
  },
  {
    key: "in_lavorazione",
    label: "In Lavorazione",
    desc: "Elaborazione in corso",
    activeDot:       "border-amber-500 bg-amber-500 text-white",
    activeRing:      "ring-amber-100",
    activePulse:     "bg-white",
    activeLabel:     "text-amber-700",
    activeDesc:      "text-amber-500",
    doneConnector:   "bg-green-300",
  },
  {
    key: "in_attesa_documenti",
    label: "Attesa Documenti",
    desc: "Documentazione aggiuntiva richiesta",
    activeDot:       "border-orange-500 bg-orange-500 text-white",
    activeRing:      "ring-orange-100",
    activePulse:     "bg-white",
    activeLabel:     "text-orange-700",
    activeDesc:      "text-orange-500",
    doneConnector:   "bg-green-300",
  },
  {
    key: "completata",
    label: "Completata",
    desc: "Pratica consegnata",
    activeDot:       "border-green-500 bg-green-500 text-white",
    activeRing:      "ring-green-100",
    activePulse:     "bg-white",
    activeLabel:     "text-green-700",
    activeDesc:      "text-green-500",
    doneConnector:   "bg-green-300",
  },
];

function PraticaTimeline({ stato }: { stato: PraticaStato }) {
  const isAnnullata = stato === "annullata";
  const currentIndex = TIMELINE_STATES.findIndex((s) => s.key === stato);

  const getStepStatus = (idx: number): "done" | "current" | "pending" => {
    if (isAnnullata) return "pending";
    if (idx < currentIndex) return "done";
    if (idx === currentIndex) return "current";
    return "pending";
  };

  if (isAnnullata) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600">Pratica annullata</p>
            <p className="text-xs text-muted-foreground">Questa pratica è stata annullata.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-primary" />
          Stato della Pratica
        </CardTitle>
        <p className="text-xs text-muted-foreground">Aggiornato da Pratica Rapida</p>
      </CardHeader>
      <CardContent className="pb-4">
        <ol className="relative space-y-0">
          {TIMELINE_STATES.map((s, idx) => {
            const status = getStepStatus(idx);
            const isLast = idx === TIMELINE_STATES.length - 1;
            return (
              <li key={s.key} className="flex gap-3">
                {/* Connector line + dot column */}
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    status === "done"
                      ? "border-green-500 bg-green-500 text-white"
                      : status === "current"
                      ? `${s.activeDot} ring-4 ${s.activeRing}`
                      : "border-border bg-background"
                  }`}>
                    {status === "done" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : status === "current" ? (
                      <div className={`h-2.5 w-2.5 rounded-full ${s.activePulse} animate-pulse`} />
                    ) : (
                      <Circle className="h-2.5 w-2.5 text-muted-foreground/40" />
                    )}
                  </div>
                  {!isLast && (
                    <div className={`mt-0.5 w-0.5 flex-1 min-h-[20px] transition-colors ${
                      status === "done" ? s.doneConnector : "bg-border"
                    }`} />
                  )}
                </div>

                {/* Content */}
                <div className={`pb-4 pt-0.5 min-w-0 ${isLast ? "pb-0" : ""}`}>
                  <p className={`text-sm font-semibold leading-tight ${
                    status === "current"
                      ? s.activeLabel
                      : status === "done"
                      ? "text-green-700"
                      : "text-muted-foreground/50"
                  }`}>
                    {s.label}
                  </p>
                  <p className={`text-xs mt-0.5 leading-snug ${
                    status === "current"
                      ? s.activeDesc
                      : status === "done"
                      ? "text-green-600/70"
                      : "text-muted-foreground/40"
                  }`}>
                    {s.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function PraticaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isInternalUser = isInternal(roles);

  const { data: pratica, isLoading } = useQuery({
    queryKey: ["pratica", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, clienti_finali(nome, cognome, email, codice_fiscale, telefono, indirizzo), service_catalog(nome)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch assignee profile when present
  const { data: assigneeProfile } = useQuery({
    queryKey: ["assignee-profile", (pratica as any)?.assegnatario_id],
    queryFn: async () => {
      const assigneeId = (pratica as any)?.assegnatario_id;
      if (!assigneeId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("nome, cognome, email")
        .eq("id", assigneeId)
        .single();
      return data;
    },
    enabled: !!(pratica as any)?.assegnatario_id && isInternalUser,
  });

  const updateStato = useMutation({
    mutationFn: async (newStato: PraticaStato) => {
      const { error } = await supabase
        .from("pratiche")
        .update({ stato: newStato })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pratica", id] });
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const markAsPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pratiche")
        .update({ pagamento_stato: "pagata" })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pratica", id] });
      toast({ title: "Pratica marcata come pagata" });
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["pratica", id] });
    queryClient.invalidateQueries({ queryKey: ["pratiche"] });
  };

  const duplicatePratica = useMutation({
    mutationFn: async () => {
      if (!pratica) throw new Error("Pratica non trovata");
      const { data, error } = await supabase.from("pratiche").insert({
        company_id: pratica.company_id,
        service_id: pratica.service_id,
        cliente_finale_id: pratica.cliente_finale_id,
        creato_da: user!.id,
        titolo: `Copia — ${pratica.titolo}`,
        descrizione: pratica.descrizione,
        categoria: pratica.categoria,
        stato: "bozza",
        priorita: pratica.priorita,
        pagamento_stato: "non_pagata",
        prezzo: pratica.prezzo,
        dati_pratica: pratica.dati_pratica,
        is_free: false,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pratiche"] });
      toast({ title: "Pratica duplicata", description: "La nuova bozza è pronta per la modifica." });
      navigate(`/pratiche/${data.id}`);
    },
    onError: (e) => toast({ title: "Errore duplicazione", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!pratica) {
    return (
      <div className="flex flex-col items-center py-20 text-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Hash className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Pratica non trovata</h2>
          <p className="text-sm text-muted-foreground mt-1">La pratica richiesta non esiste o non hai i permessi per visualizzarla.</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Torna indietro
        </Button>
      </div>
    );
  }

  const statoConf = STATO_CONFIG[pratica.stato];
  const Icon = statoConf.icon;
  const datiPratica = (pratica.dati_pratica as DatiPratica | null) || {};
  const brand = datiPratica.brand ?? "enea";
  const brandLabel = brand === "conto_termico" ? "Conto Termico" : "ENEA";
  const brandBadgeClass = brand === "conto_termico" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
  const cliente = pratica.clienti_finali as ClienteFinale | null;
  const serviceName = (pratica.service_catalog as any)?.nome;
  const pagamentoBadge = PAGAMENTO_BADGE?.[pratica.pagamento_stato as string];

  // Only show valid target states for internal users
  const validTargetStates = isInternalUser
    ? INTERNAL_TRANSITIONS[pratica.stato as PraticaStato] || []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight truncate">{pratica.titolo}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={brandBadgeClass}>Pratica {brandLabel}</Badge>
            <Badge className={statoConf.color}><Icon className="mr-1 h-3 w-3" />{statoConf.label}</Badge>
            {serviceName && (
              <Badge variant="secondary" className="gap-1">
                <Tag className="h-3 w-3" />{serviceName}
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => duplicatePratica.mutate()}
          disabled={duplicatePratica.isPending}
          className="shrink-0 gap-1.5"
          title="Crea una copia di questa pratica come nuova bozza"
        >
          <CopyPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Duplica</span>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Cliente info */}
          {cliente && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />Dati Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nome completo</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="font-medium">{cliente.nome} {cliente.cognome}</p>
                      <CopyBtn text={`${cliente.nome} ${cliente.cognome}`} />
                    </div>
                  </div>
                  {cliente.codice_fiscale && (
                    <div>
                      <span className="text-muted-foreground">Codice Fiscale</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="font-medium font-mono text-xs">{cliente.codice_fiscale}</p>
                        <CopyBtn text={cliente.codice_fiscale} />
                      </div>
                    </div>
                  )}
                  {cliente.email && (
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <a href={`mailto:${cliente.email}`} className="font-medium text-primary hover:underline truncate max-w-[160px]">
                          {cliente.email}
                        </a>
                        <CopyBtn text={cliente.email} />
                      </div>
                    </div>
                  )}
                  {cliente.telefono && (
                    <div>
                      <span className="text-muted-foreground">Telefono</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <a href={`tel:${cliente.telefono}`} className="font-medium text-primary hover:underline">
                          {cliente.telefono}
                        </a>
                        <CopyBtn text={cliente.telefono} />
                      </div>
                    </div>
                  )}
                  {cliente.indirizzo && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Indirizzo immobile</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="font-medium">{cliente.indirizzo}</p>
                        <CopyBtn text={cliente.indirizzo} />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dati Pratica */}
          <Card>
            <CardHeader><CardTitle>Dati Pratica {brandLabel}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {datiPratica.tipo_intervento && (
                  <div>
                    <span className="text-muted-foreground">Tipo Intervento</span>
                    <p className="font-medium mt-0.5">{datiPratica.tipo_intervento}</p>
                  </div>
                )}
                {datiPratica.dati_catastali && (
                  <div>
                    <span className="text-muted-foreground">Dati Catastali</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="font-medium">{datiPratica.dati_catastali}</p>
                      <CopyBtn text={datiPratica.dati_catastali} />
                    </div>
                  </div>
                )}
                {datiPratica.data_fine_lavori && (
                  <div>
                    <span className="text-muted-foreground">Data Fine Lavori</span>
                    <p className="font-medium mt-0.5">{new Date(datiPratica.data_fine_lavori).toLocaleDateString("it-IT")}</p>
                  </div>
                )}
                {datiPratica.importo_lavori != null && datiPratica.importo_lavori > 0 && (
                  <div>
                    <span className="text-muted-foreground">Importo Lavori</span>
                    <p className="font-medium mt-0.5">€ {Number(datiPratica.importo_lavori).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Prezzo Servizio</span>
                  <p className="font-bold text-base mt-0.5">€ {pratica.prezzo.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Stato Pagamento</span>
                  <div className="mt-0.5">
                    {pagamentoBadge ? (
                      <Badge variant="outline" className={`text-xs ${pagamentoBadge.className ?? ""}`}>
                        {pagamentoBadge.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="capitalize text-xs">
                        {pratica.pagamento_stato.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {pratica.descrizione && (
                <div className="border-t pt-3 mt-3">
                  <span className="text-sm text-muted-foreground">Note</span>
                  <p className="mt-1 text-sm">{pratica.descrizione}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Output section */}
          <OutputSection outputUrls={pratica.output_urls} noteConsegna={pratica.note_consegna} />

          <DocumentUpload praticaId={pratica.id} companyId={pratica.company_id} />
          <PracticeChat praticaId={pratica.id} companyId={pratica.company_id} praticaTitle={pratica.titolo} />
        </div>

        <div className="space-y-4">
          {/* Send button for company users */}
          {!isInternalUser && (
            <SendPraticaButton praticaId={pratica.id} stato={pratica.stato} onSuccess={invalidateAll} />
          )}

          {/* Gestione stato — internal */}
          {isInternalUser && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Gestione Stato</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={pratica.stato} onValueChange={(v) => updateStato.mutate(v as PraticaStato)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={pratica.stato}>{STATO_CONFIG[pratica.stato as PraticaStato].label} (corrente)</SelectItem>
                    {validTargetStates.map((s) => (
                      <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Mark as paid */}
                {pratica.pagamento_stato !== "pagata" && pratica.stato === "completata" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-success/40 text-success hover:bg-success/10"
                    onClick={() => markAsPaid.mutate()}
                    disabled={markAsPaid.isPending}
                  >
                    <CreditCard className="h-4 w-4" />
                    {markAsPaid.isPending ? "Aggiornamento..." : "Segna come pagata"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Assigned operator — internal only */}
          {isInternalUser && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />Assegnatario</CardTitle></CardHeader>
              <CardContent>
                {assigneeProfile ? (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {assigneeProfile.nome?.[0]}{assigneeProfile.cognome?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{assigneeProfile.nome} {assigneeProfile.cognome}</p>
                      {assigneeProfile.email && (
                        <p className="text-xs text-muted-foreground">{assigneeProfile.email}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-orange-500 flex items-center gap-1.5">
                    <User className="h-4 w-4" />Non assegnata
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <ChecklistPanel praticaId={pratica.id} companyId={pratica.company_id} serviceId={pratica.service_id} />

          {/* Timestamps */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Date</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />Creata
                </span>
                <span className="font-medium">
                  {format(new Date(pratica.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />Aggiornata
                </span>
                <span className="font-medium">
                  {format(new Date(pratica.updated_at), "dd MMM yyyy HH:mm", { locale: it })}
                </span>
              </div>
              <div className="pt-1 border-t">
                <span className="text-muted-foreground text-xs">ID Pratica</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="text-xs font-mono text-muted-foreground">{pratica.id.slice(0, 16)}…</code>
                  <CopyBtn text={pratica.id} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline fasi pratica — visibile a tutti, modificabile solo dagli interni */}
          <PraticaTimeline stato={pratica.stato as PraticaStato} />

          {/* Alert attesa documenti */}
          {pratica.stato === "in_attesa_documenti" && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Documenti richiesti</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Pratica Rapida ha bisogno di documentazione aggiuntiva. Carica i documenti nella sezione qui sotto.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
