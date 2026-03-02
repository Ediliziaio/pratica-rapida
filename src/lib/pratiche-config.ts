import { FileEdit, Clock, AlertCircle, CheckCircle2, Ban, Send } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import type { LucideIcon } from "lucide-react";

export type PraticaStato = Database["public"]["Enums"]["pratica_stato"];

export interface StatoConfigItem {
  label: string;
  color: string;
  bgColumn: string;
  icon: LucideIcon;
}

export const STATO_ORDER: PraticaStato[] = [
  "bozza",
  "inviata",
  "in_lavorazione",
  "in_attesa_documenti",
  "completata",
  "annullata",
];

export const STATO_CONFIG: Record<PraticaStato, StatoConfigItem> = {
  bozza: { label: "Bozza", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/30", icon: FileEdit },
  inviata: { label: "Inviata", color: "bg-primary/10 text-primary", bgColumn: "bg-primary/5", icon: Send },
  in_lavorazione: { label: "In Lavorazione", color: "bg-warning/10 text-warning", bgColumn: "bg-warning/5", icon: Clock },
  in_attesa_documenti: { label: "Attesa Documenti", color: "bg-destructive/10 text-destructive", bgColumn: "bg-destructive/5", icon: AlertCircle },
  completata: { label: "Completata", color: "bg-success/10 text-success", bgColumn: "bg-success/5", icon: CheckCircle2 },
  annullata: { label: "Annullata", color: "bg-muted text-muted-foreground", bgColumn: "bg-muted/20", icon: Ban },
};

export const PAGAMENTO_BADGE: Record<string, { label: string; className: string }> = {
  pagata: { label: "Pagata", className: "bg-success/10 text-success border-success/20" },
  non_pagata: { label: "Non pagata", className: "bg-muted text-muted-foreground border-muted" },
  in_verifica: { label: "In verifica", className: "bg-warning/10 text-warning border-warning/20" },
  rimborsata: { label: "Rimborsata", className: "bg-primary/10 text-primary border-primary/20" },
};

export const ACTIVE_STATES: PraticaStato[] = ["inviata", "in_lavorazione", "in_attesa_documenti"];

export function getAgingDot(pratica: { stato: string; created_at: string }): { color: string; label: string } | null {
  if (!ACTIVE_STATES.includes(pratica.stato as PraticaStato)) return null;
  const days = (Date.now() - new Date(pratica.created_at).getTime()) / 86400000;
  if (days > 5) return { color: "bg-destructive", label: "Ferma da più di 5 giorni" };
  if (days > 3) return { color: "bg-warning", label: "Ferma da più di 3 giorni" };
  return null;
}
