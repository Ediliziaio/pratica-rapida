import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CRM_OMBRA } from "@/lib/crmOmbra";
import { esportaPratica } from "./esportaPratica.ts";
import { nomeFileEsportazione } from "./exportFormat.ts";
import { clientEsportazioneSupabase } from "./supabaseAdapters.ts";

// MODIFICA AL CRM DI PRODUZIONE (l'unica del CRM ombra), approvata dal
// titolare il 14/09/2026 a queste condizioni, tutte qui dentro:
//   - sola lettura: tre select e i download dei documenti, nessuna scrittura;
//   - visibile solo al super_admin;
//   - nessuna automazione collegata: niente trigger, niente funzione, niente
//     log; il file scende nel browser di chi ha premuto e basta;
//   - nel CRM ombra non compare (esportare dall'ombra non ha senso).
export function EsportaPerOmbraButton({ practiceId }: { practiceId: string }) {
  const { roles, user } = useAuth();
  const { toast } = useToast();
  const [inCorso, setInCorso] = useState(false);

  if (CRM_OMBRA || !roles.includes("super_admin")) return null;

  const esporta = async () => {
    setInCorso(true);
    try {
      const now = new Date();
      const esito = await esportaPratica(clientEsportazioneSupabase(supabase), practiceId, user?.email ?? user?.id ?? "super_admin", now);
      if (esito.ok === false) { toast({ title: "Esportazione non riuscita", description: esito.errore, variant: "destructive" }); return; }
      const blob = new Blob([JSON.stringify(esito.esportazione, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeFileEsportazione(practiceId, now);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "File per il CRM ombra pronto",
        description: `${esito.esportazione.documents.length} documenti inclusi.${esito.avvisi.length ? ` Avvisi: ${esito.avvisi.join(" ")}` : ""}`,
      });
    } catch (error) {
      toast({ title: "Esportazione non riuscita", description: (error as Error).message, variant: "destructive" });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs gap-1"
      onClick={esporta}
      disabled={inCorso}
      title="Scarica la pratica e i suoi documenti in un file da importare nel CRM ombra. Sola lettura."
    >
      <Download className="h-3.5 w-3.5" />
      {inCorso ? "Esporto…" : "Esporta per CRM ombra"}
    </Button>
  );
}
