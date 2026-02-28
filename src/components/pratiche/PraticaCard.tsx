// Re-export centralized config for backward compatibility
export { STATO_ORDER, STATO_CONFIG } from "@/lib/pratiche-config";
export type { PraticaStato } from "@/lib/pratiche-config";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATO_CONFIG } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";

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
        const Icon = statoConf.icon;
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
