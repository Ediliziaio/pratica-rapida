import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Building2, Trash2, User } from "lucide-react";
import { STATO_CONFIG, STATO_ORDER, PAGAMENTO_BADGE, getAgingDot } from "@/lib/pratiche-config";
import type { PraticaStato } from "@/lib/pratiche-config";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface PraticheTableViewProps {
  pratiche: any[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  onChangeStato: (praticaId: string, stato: PraticaStato) => void;
  onChangePagamento: (praticaId: string, pagamento: string) => void;
  onAssignOperator: (praticaId: string, value: string) => void;
  onDelete: (ids: string[]) => void;
  assigneeMap: Record<string, { nome: string; cognome: string }>;
  internalOperators: { id: string; nome: string; cognome: string }[];
}

export function PraticheTableView({
  pratiche,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  onChangeStato,
  onChangePagamento,
  onAssignOperator,
  onDelete,
  assigneeMap,
  internalOperators,
}: PraticheTableViewProps) {
  const navigate = useNavigate();
  const allSelected = pratiche.length > 0 && selectedIds.size === pratiche.length;

  if (pratiche.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
        <p className="text-lg font-semibold">Nessuna pratica trovata</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            </TableHead>
            <TableHead>Titolo</TableHead>
            <TableHead>Azienda</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Prezzo</TableHead>
            <TableHead>Operatore</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="w-20">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pratiche.map(p => {
            const conf = STATO_CONFIG[p.stato];
            const aging = getAgingDot(p);
            const pagamento = PAGAMENTO_BADGE[p.pagamento_stato] || PAGAMENTO_BADGE.non_pagata;
            const assignee = p.assegnatario_id ? assigneeMap[p.assegnatario_id] : null;
            const isSelected = selectedIds.has(p.id);

            return (
              <TableRow
                key={p.id}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : ""}`}
              >
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(p.id)} />
                </TableCell>
                <TableCell onClick={() => navigate(`/pratiche/${p.id}`)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate max-w-[200px]">{p.titolo}</span>
                    {aging && (
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${aging.color}`}
                        title={aging.label}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={() => navigate(`/pratiche/${p.id}`)}>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate max-w-[140px]">{(p.companies as any)?.ragione_sociale}</span>
                  </span>
                </TableCell>
                <TableCell onClick={() => navigate(`/pratiche/${p.id}`)}>
                  {p.clienti_finali ? (
                    <span className="text-sm">
                      {(p.clienti_finali as any).nome} {(p.clienti_finali as any).cognome}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Select
                    value={p.stato}
                    onValueChange={v => onChangeStato(p.id, v as PraticaStato)}
                  >
                    <SelectTrigger className={`h-7 w-36 text-xs ${conf.color}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATO_ORDER.map(s => (
                        <SelectItem key={s} value={s}>{STATO_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Select
                    value={p.pagamento_stato}
                    onValueChange={v => onChangePagamento(p.id, v)}
                  >
                    <SelectTrigger className={`h-7 w-28 text-xs ${pagamento.className}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="non_pagata">Non pagata</SelectItem>
                      <SelectItem value="in_verifica">In verifica</SelectItem>
                      <SelectItem value="pagata">Pagata</SelectItem>
                      <SelectItem value="rimborsata">Rimborsata</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right font-semibold text-sm" onClick={() => navigate(`/pratiche/${p.id}`)}>
                  € {p.prezzo.toFixed(2)}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Select
                    value={p.assegnatario_id || "unassigned"}
                    onValueChange={v => onAssignOperator(p.id, v)}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue placeholder="Non assegnato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Non assegnato</SelectItem>
                      {internalOperators.map(op => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.nome} {op.cognome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground" onClick={() => navigate(`/pratiche/${p.id}`)}>
                  {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: it })}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina pratica</AlertDialogTitle>
                          <AlertDialogDescription>
                            Stai per eliminare la pratica "{p.titolo}". Questa azione è irreversibile.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => onDelete([p.id])}
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/pratiche/${p.id}`)}>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
