import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, X } from "lucide-react";
import { STATO_ORDER, STATO_CONFIG, COMPANY_TRANSITIONS, INTERNAL_TRANSITIONS } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BulkActionsBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  onChangeStato?: (stato: string) => void;
  onChangePagamento?: (stato: string) => void;
  deleteLabel?: string;
  isAdmin?: boolean;
}

export function BulkActionsBar({
  count,
  onClear,
  onDelete,
  onChangeStato,
  onChangePagamento,
  deleteLabel = "Elimina selezionate",
  isAdmin,
}: BulkActionsBarProps) {
  // #14 For non-admin, only show valid target states from bozza (most restrictive)
  const transitions = isAdmin ? INTERNAL_TRANSITIONS : COMPANY_TRANSITIONS;
  const availableStates = isAdmin
    ? STATO_ORDER
    : [...new Set(Object.values(transitions).flat())] as PraticaStato[];

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
      <span className="text-sm font-medium">{count} selezionat{count === 1 ? "a" : "e"}</span>

      {onChangeStato && availableStates.length > 0 && (
        <Select onValueChange={onChangeStato}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Cambia stato" />
          </SelectTrigger>
          <SelectContent>
            {availableStates.map(s => (
              <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isAdmin && onChangePagamento && (
        <Select onValueChange={onChangePagamento}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Cambia pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="non_pagata">Non pagata</SelectItem>
            <SelectItem value="in_verifica">In verifica</SelectItem>
            <SelectItem value="pagata">Pagata</SelectItem>
            <SelectItem value="rimborsata">Rimborsata</SelectItem>
          </SelectContent>
        </Select>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="mr-1.5 h-4 w-4" />{deleteLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare {count} pratic{count === 1 ? "a" : "he"}. Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
