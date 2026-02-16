import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

export const STATO_ORDER: PraticaStato[] = ["bozza", "inviata", "in_lavorazione", "in_attesa_documenti", "completata", "annullata"];

export const STATO_CONFIG: Record<PraticaStato, { label: string; color: string; bgColumn: string; icon: string }> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/30", icon: "FileEdit" },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", bgColumn: "bg-primary/5", icon: "Clock" },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", bgColumn: "bg-warning/5", icon: "AlertCircle" },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", bgColumn: "bg-destructive/5", icon: "AlertCircle" },
  completata: { label: "Completata", color: "bg-success/10 text-success", bgColumn: "bg-success/5", icon: "CheckCircle2" },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/20", icon: "Ban" },
};

import { FolderOpen, Clock, CheckCircle2, AlertCircle, FileEdit, Ban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, any> = { FileEdit, Clock, AlertCircle, CheckCircle2, Ban };

export function getStatoIcon(iconName: string) {
  return ICONS[iconName] || AlertCircle;
}

export function ListView({ pratiche, navigate }: { pratiche: any[]; navigate: (path: string) => void }) {
  if (pratiche.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="font-display text-lg font-semibold">Nessuna pratica</h3>
          <p className="mt-1 text-sm text-muted-foreground">Crea la tua prima pratica ENEA per iniziare.</p>
          <Button className="mt-4" onClick={() => navigate("/pratiche/nuova")}>
            <Plus className="mr-2 h-4 w-4" />Nuova Pratica ENEA
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {pratiche.map((p) => {
        const statoConf = STATO_CONFIG[p.stato as PraticaStato];
        const Icon = getStatoIcon(statoConf.icon);
        return (
          <Card key={p.id} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => navigate(`/pratiche/${p.id}`)}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${statoConf.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.titolo}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {p.clienti_finali && <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">€ {p.prezzo.toFixed(2)}</p>
                <Badge className={`text-xs ${statoConf.color}`}>{statoConf.label}</Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
