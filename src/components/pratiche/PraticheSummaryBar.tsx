import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { STATO_CONFIG } from "@/lib/pratiche-config";

interface PraticheSummaryBarProps {
  pratiche: any[];
}

export function PraticheSummaryBar({ pratiche }: PraticheSummaryBarProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totale = pratiche.length;
    const inLavorazione = pratiche.filter(p => p.stato === "in_lavorazione").length;
    const attesaDocumenti = pratiche.filter(p => p.stato === "in_attesa_documenti").length;
    const completateMese = pratiche.filter(p => p.stato === "completata" && new Date(p.updated_at) >= startOfMonth).length;

    return { totale, inLavorazione, attesaDocumenti, completateMese };
  }, [pratiche]);

  const cards = [
    {
      label: "Totale Pratiche",
      value: stats.totale,
      icon: FolderOpen,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "In Lavorazione",
      value: stats.inLavorazione,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Attesa Documenti",
      value: stats.attesaDocumenti,
      icon: AlertCircle,
      color: stats.attesaDocumenti > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: stats.attesaDocumenti > 0 ? "bg-destructive/10" : "bg-muted",
    },
    {
      label: "Completate (mese)",
      value: stats.completateMese,
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="border-none shadow-sm">
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.bgColor}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
