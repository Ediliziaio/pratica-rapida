import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, FileEdit, Ban, Send } from "lucide-react";
import { PracticeChat } from "@/components/PracticeChat";
import { DocumentUpload } from "@/components/DocumentUpload";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; icon: any }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", icon: Clock },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", icon: AlertCircle },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", icon: Ban },
};

const CATEGORY_LABELS: Record<string, string> = {
  fatturazione: "Fatturazione",
  enea_bonus: "ENEA / Bonus",
  finanziamenti: "Finanziamenti",
  pratiche_edilizie: "Pratiche Edilizie",
  altro: "Altro",
};

export default function PraticaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isInternalUser = roles.some(r => ["super_admin", "admin_interno", "operatore"].includes(r));

  const { data: pratica, isLoading } = useQuery({
    queryKey: ["pratica", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pratiche")
        .select("*, clienti_finali(nome, cognome, email), service_catalog(nome, categoria)")
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  if (!pratica) {
    return <div className="py-12 text-center text-muted-foreground">Pratica non trovata</div>;
  }

  const statoConf = STATO_CONFIG[pratica.stato];
  const Icon = statoConf.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pratiche")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">{pratica.titolo}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{CATEGORY_LABELS[pratica.categoria] || pratica.categoria}</Badge>
            <Badge className={statoConf.color}><Icon className="mr-1 h-3 w-3" />{statoConf.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Dettagli</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Servizio</span>
                  <p className="font-medium">{(pratica.service_catalog as any)?.nome || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente</span>
                  <p className="font-medium">
                    {pratica.clienti_finali ? `${(pratica.clienti_finali as any).nome} ${(pratica.clienti_finali as any).cognome}` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Priorità</span>
                  <p className="font-medium capitalize">{pratica.priorita}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prezzo</span>
                  <p className="font-medium">€ {pratica.prezzo.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Pagamento</span>
                  <Badge variant="outline" className="capitalize">{pratica.pagamento_stato.replace("_", " ")}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Creata</span>
                  <p className="font-medium">{new Date(pratica.created_at).toLocaleDateString("it-IT")}</p>
                </div>
              </div>
              {pratica.descrizione && (
                <div className="border-t pt-3">
                  <span className="text-sm text-muted-foreground">Descrizione</span>
                  <p className="mt-1 text-sm">{pratica.descrizione}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <DocumentUpload praticaId={pratica.id} companyId={pratica.company_id} />

          {/* Chat */}
          <PracticeChat praticaId={pratica.id} companyId={pratica.company_id} />
        </div>

        {/* Sidebar actions */}
        <div className="space-y-4">
          {isInternalUser && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Gestione Stato</CardTitle></CardHeader>
              <CardContent>
                <Select value={pratica.stato} onValueChange={(v) => updateStato.mutate(v as PraticaStato)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATO_CONFIG) as PraticaStato[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Checklist */}
          <ChecklistPanel praticaId={pratica.id} companyId={pratica.company_id} serviceId={pratica.service_id} />

          <Card>
            <CardHeader><CardTitle className="text-sm">Cosa fare ora?</CardTitle></CardHeader>
            <CardContent>
              {pratica.stato === "bozza" && (
                <p className="text-sm text-muted-foreground">Completa i dati e invia la pratica.</p>
              )}
              {pratica.stato === "inviata" && (
                <p className="text-sm text-muted-foreground">La pratica è in attesa di presa in carico.</p>
              )}
              {pratica.stato === "in_lavorazione" && (
                <p className="text-sm text-muted-foreground">La pratica è in fase di lavorazione. Riceverai aggiornamenti.</p>
              )}
              {pratica.stato === "in_attesa_documenti" && (
                <p className="text-sm text-warning">Documenti mancanti! Carica i documenti richiesti.</p>
              )}
              {pratica.stato === "completata" && (
                <p className="text-sm text-success">Pratica completata con successo!</p>
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
