import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Zap, FileText, Trash2, Plus, CopyPlus } from "lucide-react";
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
  onDuplicate?: (pratica: any) => void;
  isLoading?: boolean;
}

export function ListView({
  pratiche,
  navigate,
  selectable,
  selectedIds,
  onToggle,
  onDelete,
  canDelete,
  onDuplicate,
  isLoading,
}: ListViewProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border divide-y overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (pratiche.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">Nessuna pratica trovata</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Crea la tua prima pratica ENEA o Conto Termico. Consegna garantita entro 24 ore lavorative.
        </p>
        <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Prezzo fisso</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Zero burocrazia</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Consegna 24h</span>
        </div>
        <Button size="sm" className="mt-6 gap-1.5" onClick={() => navigate("/pratiche/nuova")}>
          <Plus className="h-4 w-4" /> Nuova Pratica
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden divide-y">
      {pratiche.map((p) => {
        const statoConf = STATO_CONFIG[p.stato as PraticaStato];
        const Icon = statoConf.icon;
        const aging = getAgingDot(p);
        const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
        const isSelected = selectedIds?.has(p.id) ?? false;
        const deletable = canDelete ? canDelete(p) : false;
        const isCT = (p.dati_pratica as any)?.brand === "conto_termico";

        return (
          <div
            key={p.id}
            className={`list-row group flex items-center gap-3 px-4 py-3 cursor-pointer ${isSelected ? "bg-primary/5" : "bg-background"}`}
            onClick={() => navigate(`/pratiche/${p.id}`)}
          >
            {/* Checkbox */}
            {selectable && (
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle?.(p.id)}
                />
              </div>
            )}

            {/* Status icon with aging dot */}
            <div className="relative shrink-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statoConf.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              {aging && (
                <span
                  className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${aging.color}`}
                  title={aging.label}
                />
              )}
            </div>

            {/* Title + client */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate leading-tight">{p.titolo}</span>
                <span
                  className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isCT
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  }`}
                >
                  {isCT ? "CT" : "ENEA"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {p.clienti_finali
                  ? `${(p.clienti_finali as any).nome} ${(p.clienti_finali as any).cognome} · `
                  : ""}
                {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: it })}
              </p>
            </div>

            {/* Right side: stato + price */}
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={`text-[11px] hidden sm:inline-flex ${statoConf.color}`}>
                {statoConf.label}
              </Badge>
              <span className="font-semibold text-sm tabular-nums">€ {p.prezzo.toFixed(0)}</span>
              {onDuplicate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(p); }}
                  title="Duplica pratica"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </Button>
              )}
              {deletable && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
