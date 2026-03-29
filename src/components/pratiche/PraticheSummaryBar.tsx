import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import type { CompanyKpi } from "@/hooks/usePraticheServerQuery";

interface PraticheSummaryBarProps {
  counts: CompanyKpi;
}

export function PraticheSummaryBar({ counts }: PraticheSummaryBarProps) {
  const cards = [
    {
      label: "Totale Pratiche",
      value: counts.totale,
      icon: FolderOpen,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "In Lavorazione",
      value: counts.inLavorazione,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Attesa Documenti",
      value: counts.attesaDoc,
      icon: AlertCircle,
      color: counts.attesaDoc > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: counts.attesaDoc > 0 ? "bg-destructive/10" : "bg-muted",
    },
    {
      label: "Completate (mese)",
      value: counts.completateMese,
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
