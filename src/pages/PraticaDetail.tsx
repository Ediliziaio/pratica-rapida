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
import { ArrowLeft, Send, ExternalLink, FileDown } from "lucide-react";
import { PracticeChat } from "@/components/PracticeChat";
import { DocumentUpload } from "@/components/DocumentUpload";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { STATO_CONFIG, INTERNAL_TRANSITIONS } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

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
  tipo_intervento?: string;
  dati_catastali?: string;
  data_fine_lavori?: string;
  importo_lavori?: number;
  note_aggiuntive?: string;
}

// Output section component
function OutputSection({ outputUrls, noteConsegna }: { outputUrls: unknown; noteConsegna: string | null }) {
  const urls = Array.isArray(outputUrls) ? outputUrls as string[] : [];
  if (urls.length === 0 && !noteConsegna) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileDown className="h-4 w-4" />Documenti di Output</CardTitle></CardHeader>
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["pratica", id] });
    queryClient.invalidateQueries({ queryKey: ["pratiche"] });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  if (!pratica) {
    return <div className="py-12 text-center text-muted-foreground">Pratica non trovata</div>;
  }

  const statoConf = STATO_CONFIG[pratica.stato];
  const Icon = statoConf.icon;
  const datiPratica = (pratica.dati_pratica as DatiPratica | null) || {};
  const cliente = pratica.clienti_finali as ClienteFinale | null;

  // Only show valid target states for internal users
  const validTargetStates = isInternalUser
    ? INTERNAL_TRANSITIONS[pratica.stato as PraticaStato] || []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pratiche")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">{pratica.titolo}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">Pratica ENEA</Badge>
            <Badge className={statoConf.color}><Icon className="mr-1 h-3 w-3" />{statoConf.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Cliente info */}
          {cliente && (
            <Card>
              <CardHeader><CardTitle>Dati Cliente</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nome</span>
                    <p className="font-medium">{cliente.nome} {cliente.cognome}</p>
                  </div>
                  {cliente.codice_fiscale && (
                    <div>
                      <span className="text-muted-foreground">Codice Fiscale</span>
                      <p className="font-medium">{cliente.codice_fiscale}</p>
                    </div>
                  )}
                  {cliente.email && (
                    <div>
                      <span className="text-muted-foreground">Email</span>
                      <p className="font-medium">{cliente.email}</p>
                    </div>
                  )}
                  {cliente.telefono && (
                    <div>
                      <span className="text-muted-foreground">Telefono</span>
                      <p className="font-medium">{cliente.telefono}</p>
                    </div>
                  )}
                  {cliente.indirizzo && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Indirizzo immobile</span>
                      <p className="font-medium">{cliente.indirizzo}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dati ENEA */}
          <Card>
            <CardHeader><CardTitle>Dati Pratica ENEA</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {datiPratica.tipo_intervento && (
                  <div>
                    <span className="text-muted-foreground">Tipo Intervento</span>
                    <p className="font-medium">{datiPratica.tipo_intervento}</p>
                  </div>
                )}
                {datiPratica.dati_catastali && (
                  <div>
                    <span className="text-muted-foreground">Dati Catastali</span>
                    <p className="font-medium">{datiPratica.dati_catastali}</p>
                  </div>
                )}
                {datiPratica.data_fine_lavori && (
                  <div>
                    <span className="text-muted-foreground">Data Fine Lavori</span>
                    <p className="font-medium">{new Date(datiPratica.data_fine_lavori).toLocaleDateString("it-IT")}</p>
                  </div>
                )}
                {datiPratica.importo_lavori != null && datiPratica.importo_lavori > 0 && (
                  <div>
                    <span className="text-muted-foreground">Importo Lavori</span>
                    <p className="font-medium">€ {Number(datiPratica.importo_lavori).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Prezzo Servizio</span>
                  <p className="font-medium">€ {pratica.prezzo.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Pagamento</span>
                  <Badge variant="outline" className="capitalize">{pratica.pagamento_stato.replace("_", " ")}</Badge>
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
          <PracticeChat praticaId={pratica.id} companyId={pratica.company_id} />
        </div>

        <div className="space-y-4">
          {/* Send button for company users */}
          {!isInternalUser && (
            <SendPraticaButton praticaId={pratica.id} stato={pratica.stato} onSuccess={invalidateAll} />
          )}

          {isInternalUser && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Gestione Stato</CardTitle></CardHeader>
              <CardContent>
                <Select value={pratica.stato} onValueChange={(v) => updateStato.mutate(v as PraticaStato)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Current state + valid targets */}
                    <SelectItem value={pratica.stato}>{STATO_CONFIG[pratica.stato as PraticaStato].label} (corrente)</SelectItem>
                    {validTargetStates.map((s) => (
                      <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <ChecklistPanel praticaId={pratica.id} companyId={pratica.company_id} serviceId={pratica.service_id} />

          <Card>
            <CardHeader><CardTitle className="text-sm">Cosa fare ora?</CardTitle></CardHeader>
            <CardContent>
              {pratica.stato === "bozza" && (
                <p className="text-sm text-muted-foreground">Completa i dati e invia la pratica.</p>
              )}
              {pratica.stato === "inviata" && (
                <p className="text-sm text-muted-foreground">La pratica è in attesa di presa in carico da Pratica Rapida.</p>
              )}
              {pratica.stato === "in_lavorazione" && (
                <p className="text-sm text-muted-foreground">La pratica ENEA è in fase di lavorazione. Riceverai aggiornamenti.</p>
              )}
              {pratica.stato === "in_attesa_documenti" && (
                <p className="text-sm text-warning">Documenti mancanti! Carica i documenti richiesti.</p>
              )}
              {pratica.stato === "completata" && (
                <p className="text-sm text-success">Pratica ENEA completata con successo!</p>
              )}
              {pratica.stato === "annullata" && (
                <p className="text-sm text-muted-foreground">Questa pratica è stata annullata.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
