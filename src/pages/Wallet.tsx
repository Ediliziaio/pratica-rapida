import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Receipt, CheckCircle2, Clock, FileText, TrendingUp,
  ChevronDown, ChevronRight, AlertCircle, Building2, Gift,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { PAGAMENTO_BADGE } from "@/lib/pratiche-config";
import { useCompanyPromos, getPromoDisplayInfo, computeNextIsFree } from "@/hooks/useCompanyPromo";

interface Pratica {
  id: string;
  titolo: string;
  stato: string;
  prezzo: number;
  pagamento_stato: string;
  created_at: string;
  completata_at: string | null;
  is_free: boolean;
}

interface MonthGroup {
  key: string;          // "yyyy-MM"
  label: string;        // "Marzo 2026"
  pratiche: Pratica[];
  totale: number;
  pagamento_stato: "non_pagata" | "in_verifica" | "pagata" | "mista";
}

function fmt(n: number) {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MonthRow({ group }: { group: MonthGroup }) {
  const [open, setOpen] = useState(false);
  const badge = PAGAMENTO_BADGE[group.pagamento_stato === "mista" ? "in_verifica" : group.pagamento_stato];

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Month header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {open
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          <div>
            <p className="font-semibold capitalize">{group.label}</p>
            <p className="text-xs text-muted-foreground">
              {group.pratiche.length} pratica{group.pratiche.length !== 1 ? "e" : ""} completata{group.pratiche.length !== 1 ? "e" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-base">€ {fmt(group.totale)}</span>
          <Badge className={badge?.className ?? ""}>{badge?.label ?? group.pagamento_stato}</Badge>
        </div>
      </button>

      {/* Expanded practice list */}
      {open && (
        <div className="border-t divide-y bg-muted/20">
          {group.pratiche.map((p) => {
            const pb = PAGAMENTO_BADGE[p.pagamento_stato];
            return (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.titolo}</p>
                  {p.completata_at && (
                    <p className="text-xs text-muted-foreground">
                      Completata il {format(new Date(p.completata_at), "dd MMM yyyy", { locale: it })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  {p.is_free ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-muted-foreground text-xs">€ {fmt(p.prezzo)}</span>
                      <Badge className="bg-green-100 text-green-700 text-xs">Gratuita</Badge>
                    </div>
                  ) : (
                    <span className="font-semibold">€ {fmt(p.prezzo)}</span>
                  )}
                  <Badge variant="outline" className={`text-xs ${pb?.className ?? ""}`}>
                    {pb?.label ?? p.pagamento_stato}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EstrattoConto() {
  const { companyId } = useCompany();

  const { data: activeCompanyPromos = [] } = useCompanyPromos(companyId ?? undefined);

  // All practices (for KPI cards)
  const { data: allPratiche = [], isLoading } = useQuery({
    queryKey: ["estratto-conto", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, pagamento_stato, created_at, completata_at, is_free")
        .eq("company_id", companyId)
        .in("stato", ["inviata", "in_lavorazione", "in_attesa_documenti", "completata"])
        .order("completata_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as Pratica[];
    },
    enabled: !!companyId,
  });

  // ── KPI Calculations ──────────────────────────────────────────
  const completate = allPratiche.filter((p) => p.stato === "completata");
  const pratiche_gratuite = allPratiche.filter((p) => p.is_free);

  // Pratiche completate non ancora fatturate → verranno in fattura fine mese
  const daFatturare = completate.filter((p) => p.pagamento_stato === "non_pagata");
  const totDaFatturare = daFatturare.reduce((s, p) => s + (p.prezzo || 0), 0);

  // In verifica (fattura emessa, bonifico in attesa)
  const totInVerifica = completate
    .filter((p) => p.pagamento_stato === "in_verifica")
    .reduce((s, p) => s + (p.prezzo || 0), 0);

  // Già pagate
  const totPagate = completate
    .filter((p) => p.pagamento_stato === "pagata")
    .reduce((s, p) => s + (p.prezzo || 0), 0);

  // ── Monthly billing groups (only completate, grouped by completion month) ──
  const monthlyGroups = useMemo((): MonthGroup[] => {
    const map: Record<string, MonthGroup> = {};
    completate.forEach((p) => {
      // Use completata_at if available, fallback to created_at
      const dt = p.completata_at ? new Date(p.completata_at) : new Date(p.created_at);
      const key = format(dt, "yyyy-MM");
      const label = format(dt, "MMMM yyyy", { locale: it });
      if (!map[key]) {
        map[key] = { key, label, pratiche: [], totale: 0, pagamento_stato: "non_pagata" };
      }
      map[key].pratiche.push(p);
      if (!p.is_free) {
        map[key].totale += p.prezzo || 0;
      }
    });

    // Compute group-level payment status
    Object.values(map).forEach((g) => {
      const stati = g.pratiche.map((p) => p.pagamento_stato);
      if (stati.every((s) => s === "pagata")) {
        g.pagamento_stato = "pagata";
      } else if (stati.some((s) => s === "in_verifica")) {
        g.pagamento_stato = stati.every((s) => s === "in_verifica") ? "in_verifica" : "mista";
      } else {
        g.pagamento_stato = "non_pagata";
      }
    });

    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [completate]);

  // Current month key
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const currentMonthGroup = monthlyGroups.find((g) => g.key === currentMonthKey);

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <h2 className="font-display text-lg font-semibold">Nessuna azienda associata</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Estratto Conto</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Riepilogo pratiche completate e fatturazione mensile
        </p>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Da fatturare</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">€ {fmt(totDaFatturare)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {daFatturare.length} pratica{daFatturare.length !== 1 ? "e" : ""} · prossima fattura a fine mese
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fatturate</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">€ {fmt(totInVerifica)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Fattura emessa · in attesa di bonifico</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pagate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">€ {fmt(totPagate)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Bonifici confermati</p>
          </CardContent>
        </Card>

        <Card className={pratiche_gratuite.length > 0 ? "border-green-200 bg-green-50/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Gratuite</CardTitle>
            <Gift className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{pratiche_gratuite.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">pratiche con promo aziendale</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Current month alert (if there are unpaid completed practices) ── */}
      {currentMonthGroup && currentMonthGroup.pagamento_stato === "non_pagata" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Fattura in arrivo — {currentMonthGroup.label}
              </p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                Questo mese hai{" "}
                <strong>{currentMonthGroup.pratiche.length} pratica{currentMonthGroup.pratiche.length !== 1 ? "e" : ""}</strong>{" "}
                completata{currentMonthGroup.pratiche.length !== 1 ? "e" : ""} per un totale di{" "}
                <strong>€ {fmt(currentMonthGroup.totale)}</strong>.
                Riceverai la fattura a fine mese, pagamento entro il 15 del mese successivo tramite bonifico.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Info banner ── */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-primary">Come funziona la fatturazione</p>
            <p className="mt-1 text-muted-foreground">
              A fine mese ricevi una fattura con tutte le pratiche <strong>completate in quel mese</strong>.
              Il pagamento avviene tramite bonifico bancario entro il 15 del mese successivo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Premi Attivi ── */}
      {activeCompanyPromos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-4 w-4 text-green-600" />
            <h2 className="font-semibold">Premi Attivi</h2>
            <Badge variant="secondary" className="ml-auto tabular-nums">
              {activeCompanyPromos.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeCompanyPromos.map((promo) => {
              const info = getPromoDisplayInfo(promo);
              const isFreeNext = computeNextIsFree(promo);
              return (
                <Card key={promo.id} className={isFreeNext ? "border-green-300 bg-green-50/50" : ""}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Gift className={`h-5 w-5 shrink-0 mt-0.5 ${isFreeNext ? "text-green-600" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{info.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.detail}</p>
                      {isFreeNext && (
                        <Badge className="mt-1.5 text-xs bg-green-100 text-green-700">
                          Prossima pratica gratuita!
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Monthly billing groups ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Storico per mese</h2>
          <Badge variant="secondary" className="ml-auto tabular-nums">
            {completate.length} totali
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : monthlyGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nessuna pratica completata ancora.</p>
              <p className="text-xs mt-1">Le pratiche appariranno qui una volta completate.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {monthlyGroups.map((group) => (
              <MonthRow key={group.key} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
