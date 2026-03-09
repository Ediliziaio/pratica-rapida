import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Zap, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { STATO_CONFIG, PAGAMENTO_BADGE, getAgingDot } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface ListViewProps {
  pratiche: any[];
  navigate: (path: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
  canDelete?: (pratica: any) => boolean;
}

export function ListView({ pratiche, navigate, selectable, selectedIds, onToggle, onDelete, canDelete }: ListViewProps) {
  if (pratiche.length === 0) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-10 w-10 text-primary" />
          </div>
          <h3 className="font-display text-xl font-bold">Invia la tua prima pratica ENEA in meno di 2 minuti</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Gestisci le tue pratiche ENEA in modo semplice e veloce. Nessuna burocrazia, prezzo fisso e consegna garantita.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-left">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Consegna entro 24 ore lavorative</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Prezzo fisso e trasparente</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success shrink-0" /> Zero burocrazia — pensiamo a tutto noi</li>
          </ul>
          <Button size="lg" className="mt-6" onClick={() => navigate("/pratiche/nuova")}>
            <Zap className="mr-2 h-4 w-4" />Crea la tua prima pratica
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
        const aging = getAgingDot(p);
        const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
        const isSelected = selectedIds?.has(p.id) ?? false;
        const deletable = canDelete ? canDelete(p) : false;

        return (
          <Card key={p.id} className={`cursor-pointer transition-colors hover:bg-accent/50 ${isSelected ? "ring-2 ring-primary" : ""}`} onClick={() => navigate(`/pratiche/${p.id}`)}>
            <CardContent className="flex items-center gap-4 p-4">
              {selectable && (
                <div onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle?.(p.id)}
                  />
                </div>
              )}
              <div className="relative">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${statoConf.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                {aging && (
                  <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background ${aging.color}`} title={aging.label} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.titolo}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {p.clienti_finali && <span>{(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}</span>}
                  <span className="text-xs">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: it })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${pagamento.className}`}>{pagamento.label}</Badge>
                <div className="text-right">
                  <p className="font-semibold">€ {p.prezzo.toFixed(2)}</p>
                  <Badge className={`text-xs ${statoConf.color}`}>{statoConf.label}</Badge>
                </div>
                {deletable && onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={e => { e.stopPropagation(); onDelete(p.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
