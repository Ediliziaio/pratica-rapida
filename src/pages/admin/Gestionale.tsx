import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Download, Loader2, TrendingUp, ClipboardList, Search,
  Building2, User, Euro, ArrowRight, Zap, Flame,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { STATO_CONFIG, PAGAMENTO_BADGE } from "@/lib/pratiche-config";

// ─── Types ────────────────────────────────────────────────────────────────────

type BrandFilter = "all" | "enea" | "conto_termico";

type PraticaRow = {
  id: string;
  titolo: string;
  stato: string;
  prezzo: number | null;
  pagamento_stato: string;
  created_at: string;
  company_id: string;
  assegnatario_id: string | null;
  dati_pratica: unknown;
  companies: { ragione_sociale: string } | null;
  clienti_finali: { nome: string; cognome: string } | null;
};

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({
  fatturato, incassato, monthFatturato, count,
}: { fatturato: number; incassato: number; monthFatturato: number; count: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Totale fatturato",  value: `€ ${fatturato.toFixed(2)}`,      icon: TrendingUp,  color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
        { label: "Totale incassato",  value: `€ ${incassato.toFixed(2)}`,      icon: Euro,        color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950"       },
        { label: "Mese corrente",     value: `€ ${monthFatturato.toFixed(2)}`, icon: TrendingUp,  color: "text-primary",     bg: "bg-primary/10"                     },
        { label: "Pratiche visibili", value: String(count),                    icon: ClipboardList,color:"text-muted-foreground",bg: "bg-muted"                      },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg} shrink-0`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className={`font-bold text-sm ${color}`}>{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Shared Pratiche Table Tab ────────────────────────────────────────────────
// Used by all three tabs — brand="all" shows everything, "enea"/"conto_termico"
// filter by dati_pratica->>'brand' at the Supabase query level.

function PraticheTab({ brandFilter }: { brandFilter: BrandFilter }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [pagamentoFilter, setPagamentoFilter] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);

  const queryKey = ["gestionale_pratiche", brandFilter];

  const { data: pratiche = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("pratiche")
        .select("id, titolo, stato, prezzo, pagamento_stato, created_at, company_id, assegnatario_id, dati_pratica, companies(ragione_sociale), clienti_finali(nome, cognome)")
        .order("created_at", { ascending: false })
        .limit(2000);

      // Filter by brand inside the JSONB dati_pratica column
      if (brandFilter !== "all") {
        q = q.filter("dati_pratica->>brand", "eq", brandFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PraticaRow[];
    },
  });

  const { data: operators = [] } = useQuery({
    queryKey: ["gestionale-operators"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "admin_interno", "operatore"]);
      const ids = [...new Set((roles ?? []).map(r => r.user_id))];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, nome, cognome").in("id", ids);
      return data ?? [];
    },
  });

  const operatorMap = useMemo(() => {
    const m: Record<string, string> = {};
    operators.forEach(o => { m[o.id] = `${o.nome} ${o.cognome}`.trim(); });
    return m;
  }, [operators]);

  const filtered = useMemo(() => pratiche.filter(p => {
    const dati = p.dati_pratica as Record<string, unknown> | null;
    const brand = dati?.brand as string | undefined;
    const matchSearch = !search || [
      p.titolo,
      p.companies?.ragione_sociale ?? "",
      p.clienti_finali?.nome ?? "",
      p.clienti_finali?.cognome ?? "",
    ].join(" ").toLowerCase().includes(search.toLowerCase());
    const matchStato = statoFilter === "all" || p.stato === statoFilter;
    const matchPag = pagamentoFilter === "all" || p.pagamento_stato === pagamentoFilter;
    // If "all" tab: also let user further filter by brand via a pill (done in UI below)
    return matchSearch && matchStato && matchPag;
  }), [pratiche, search, statoFilter, pagamentoFilter]);

  const [brandPill, setBrandPill] = useState<"all" | "enea" | "conto_termico">("all");
  const displayRows = useMemo(() => {
    if (brandFilter !== "all" || brandPill === "all") return filtered;
    return filtered.filter(p => (p.dati_pratica as any)?.brand === brandPill);
  }, [filtered, brandFilter, brandPill]);

  const now = new Date();
  const totalFatturato = displayRows.reduce((s, p) => s + (p.prezzo ?? 0), 0);
  const monthFatturato = displayRows.filter(p => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, p) => s + (p.prezzo ?? 0), 0);
  const totalIncassato = displayRows.filter(p => p.pagamento_stato === "pagata").reduce((s, p) => s + (p.prezzo ?? 0), 0);

  const updatePagamento = useMutation({
    mutationFn: async ({ id, pagamento }: { id: string; pagamento: string }) => {
      setSaving(id);
      const { error } = await supabase.from("pratiche").update({ pagamento_stato: pagamento as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast({ title: "Salvato" }); },
    onError: () => toast({ variant: "destructive", title: "Errore nel salvataggio" }),
    onSettled: () => setSaving(null),
  });

  const exportExcel = () => {
    const rows = displayRows.map(p => ({
      ID: p.id.slice(0, 8),
      Titolo: p.titolo,
      Azienda: p.companies?.ragione_sociale ?? "",
      Cliente: p.clienti_finali ? `${p.clienti_finali.nome} ${p.clienti_finali.cognome}` : "",
      Brand: (p.dati_pratica as any)?.brand ?? "—",
      Stato: p.stato,
      Pagamento: p.pagamento_stato,
      "Importo €": (p.prezzo ?? 0).toFixed(2),
      Operatore: p.assegnatario_id ? (operatorMap[p.assegnatario_id] ?? "—") : "—",
      Data: format(new Date(p.created_at), "dd/MM/yyyy"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gestionale");
    XLSX.writeFile(wb, `gestionale_${brandFilter}.xlsx`);
  };

  const STATI = ["bozza", "inviata", "in_lavorazione", "in_attesa_documenti", "completata", "annullata"];

  return (
    <div className="space-y-4">
      <KpiCards
        fatturato={totalFatturato}
        incassato={totalIncassato}
        monthFatturato={monthFatturato}
        count={displayRows.length}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Brand pill — only visible in "Tutte le Pratiche" tab */}
        {brandFilter === "all" && (
          <div className="flex gap-1">
            {([
              ["all",           "Tutti"],
              ["enea",          "ENEA"],
              ["conto_termico", "Conto Termico"],
            ] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setBrandPill(val)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  brandPill === val
                    ? val === "enea"
                      ? "bg-blue-600 text-white border-blue-600"
                      : val === "conto_termico"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >{lbl}</button>
            ))}
          </div>
        )}

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Cerca pratica, azienda, cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Tutti gli stati" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {STATI.map(s => (
              <SelectItem key={s} value={s}>
                {STATO_CONFIG[s as keyof typeof STATO_CONFIG]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={pagamentoFilter} onValueChange={setPagamentoFilter}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Pagamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i pagamenti</SelectItem>
            <SelectItem value="non_pagata">Da fatturare</SelectItem>
            <SelectItem value="in_verifica">Fatturata</SelectItem>
            <SelectItem value="pagata">Pagata</SelectItem>
            <SelectItem value="rimborsata">Rimborsata</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={exportExcel} className="h-9 gap-1.5 shrink-0">
          <Download className="h-3.5 w-3.5" />Esporta Excel
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center py-16 text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ClipboardList className="h-6 w-6 text-destructive/60" />
          </div>
          <div>
            <p className="font-semibold">Errore nel caricamento</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Impossibile caricare le pratiche. Ricarica la pagina.
            </p>
          </div>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => window.location.reload()}
          >
            Ricarica
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 border-b backdrop-blur-sm">
                {["ID", "Azienda / Cliente", "Brand", "Stato", "Importo €", "Pagamento", "Operatore", "Data", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayRows.map(p => {
                const pagBadge = PAGAMENTO_BADGE[p.pagamento_stato] ?? PAGAMENTO_BADGE.non_pagata;
                const statoConf = STATO_CONFIG[p.stato as keyof typeof STATO_CONFIG];
                const brand = (p.dati_pratica as any)?.brand as string | undefined;
                const operatorName = p.assegnatario_id ? (operatorMap[p.assegnatario_id] ?? "—") : "—";

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-muted/20 cursor-pointer transition-colors ${saving === p.id ? "opacity-60" : ""}`}
                    onClick={() => navigate(`/pratiche/${p.id}`)}
                  >
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{p.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm truncate max-w-[200px]">{p.titolo}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.companies?.ragione_sociale ?? "—"}</span>
                        {p.clienti_finali && (
                          <span className="truncate">
                            · {p.clienti_finali?.nome} {p.clienti_finali?.cognome}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {brand ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          brand === "enea"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                        }`}>
                          {brand === "enea" ? "ENEA" : "CT"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {statoConf && (
                        <Badge variant="outline" className={`text-xs gap-1 ${statoConf.color}`}>
                          {statoConf.label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">€ {(p.prezzo ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Select
                        value={p.pagamento_stato}
                        onValueChange={val => updatePagamento.mutate({ id: p.id, pagamento: val })}
                      >
                        <SelectTrigger className={`h-7 text-xs w-32 border-0 bg-transparent p-0 focus:ring-0 ${pagBadge.className}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="non_pagata">Da fatturare</SelectItem>
                          <SelectItem value="in_verifica">Fatturata</SelectItem>
                          <SelectItem value="pagata">Pagata</SelectItem>
                          <SelectItem value="rimborsata">Rimborsata</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.assegnatario_id ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />{operatorName}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(p.created_at), "dd/MM/yyyy")}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => navigate(`/pratiche/${p.id}`)}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {displayRows.length > 0 && (
              <tfoot className="bg-muted/30 font-semibold border-t">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Totali:</td>
                  <td className="px-3 py-2 text-sm">€ {totalFatturato.toFixed(2)}</td>
                  <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground">
                    Pagato: € {totalIncassato.toFixed(2)} · Da incassare: € {(totalFatturato - totalIncassato).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          {displayRows.length === 0 && !isLoading && (
            <div className="flex flex-col items-center py-16 text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold">Nessuna pratica trovata</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {brandFilter !== "all"
                    ? `Non ci sono pratiche ${brandFilter === "enea" ? "ENEA" : "Conto Termico"}.`
                    : "Prova a modificare i filtri."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: {
  id: BrandFilter;
  label: string;
  icon: React.ElementType;
  activeClass: string;
  accentIcon: string;
}[] = [
  {
    id: "all",
    label: "Tutte le Pratiche",
    icon: ClipboardList,
    activeClass: "bg-background shadow-sm text-foreground",
    accentIcon: "text-foreground",
  },
  {
    id: "enea",
    label: "ENEA",
    icon: Zap,
    activeClass: "bg-background shadow-sm text-foreground",
    accentIcon: "text-blue-600",
  },
  {
    id: "conto_termico",
    label: "Conto Termico",
    icon: Flame,
    activeClass: "bg-background shadow-sm text-foreground",
    accentIcon: "text-orange-500",
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Gestionale() {
  const [activeTab, setActiveTab] = useState<BrandFilter>("all");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Gestionale</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">Gestionale Pratiche</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Vista finanziaria e operativa · filtrata per brand
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon, activeClass, accentIcon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? activeClass
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? accentIcon : ""}`} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content — single component, different brandFilter prop */}
      <PraticheTab key={activeTab} brandFilter={activeTab} />
    </div>
  );
}
