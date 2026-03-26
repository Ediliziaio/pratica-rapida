import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, CheckCircle, Loader2, TrendingUp, ClipboardList, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { EneaPractice } from "@/integrations/supabase/types";
import * as XLSX from "xlsx";

type PracticeRow = EneaPractice & {
  companies: { ragione_sociale: string } | null;
};

type EditableField = "data_invio_pratica" | "guadagno_lordo" | "guadagno_netto" | "note_gestionale";

function EditableCell({
  value,
  onSave,
  type = "text",
}: {
  value: string | number | null;
  onSave: (v: string) => void;
  type?: "text" | "number" | "date" | "textarea";
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const commit = () => {
    setEditing(false);
    if (local !== String(value ?? "")) onSave(local);
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 hover:bg-muted min-w-[60px] block"
        onClick={() => {
          setLocal(String(value ?? ""));
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 10);
        }}
      >
        {value ?? <span className="text-muted-foreground text-xs">—</span>}
      </span>
    );
  }

  if (type === "textarea") {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        rows={2}
        className="w-full text-sm border rounded px-1 resize-none"
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-full text-sm border rounded px-1"
    />
  );
}

export default function Gestionale() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [brandFilter, setBrandFilter] = useState("all");
  const [resellerFilter, setResellerFilter] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);

  const { data: practices = [], isLoading } = useQuery({
    queryKey: ["gestionale_practices", brandFilter, resellerFilter],
    queryFn: async () => {
      // Find gestionale stage IDs
      const { data: stageData } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("stage_type", "gestionale")
        .is("reseller_id", null);

      const stageIds = stageData?.map((s) => s.id) ?? [];

      let q = supabase
        .from("enea_practices")
        .select("*, companies:reseller_id(ragione_sociale)")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (stageIds.length > 0) {
        q = q.in("current_stage_id", stageIds);
      }
      if (brandFilter !== "all") q = q.eq("brand", brandFilter);
      if (resellerFilter !== "all") q = q.eq("reseller_id", resellerFilter);

      const { data, error } = await q;
      if (error) throw error;
      return data as PracticeRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: EditableField; value: string }) => {
      setSaving(id);
      const update: Partial<EneaPractice> = {};
      if (field === "guadagno_lordo" || field === "guadagno_netto") {
        update[field] = value ? parseFloat(value) : null;
      } else {
        (update as Record<string, string | null>)[field] = value || null;
      }
      const { error } = await supabase.from("enea_practices").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gestionale_practices"] });
      toast({ title: "Salvato" });
    },
    onError: () => toast({ variant: "destructive", title: "Errore nel salvataggio" }),
    onSettled: () => setSaving(null),
  });

  const moveToRecensione = useMutation({
    mutationFn: async (practiceId: string) => {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("stage_type", "recensione")
        .is("reseller_id", null)
        .single();
      if (!stage) throw new Error("Stage recensione non trovato");
      const { error } = await supabase
        .from("enea_practices")
        .update({ current_stage_id: stage.id })
        .eq("id", practiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gestionale_practices"] });
      toast({ title: "Pratica spostata in Recensione" });
    },
  });

  const totalLordo = practices.reduce((s, p) => s + (p.guadagno_lordo ?? 0), 0);
  const totalNetto = practices.reduce((s, p) => s + (p.guadagno_netto ?? 0), 0);

  const exportCSV = () => {
    const rows = practices.map((p) => ({
      ID: p.id.slice(0, 8),
      Cliente: `${p.cliente_nome} ${p.cliente_cognome}`,
      Rivenditore: p.companies?.ragione_sociale ?? "",
      Fornitore: p.fornitore ?? "",
      Prodotto: p.prodotto_installato ?? "",
      Brand: p.brand,
      "Data invio": p.data_invio_pratica ?? "",
      "Guadagno lordo": p.guadagno_lordo ?? "",
      "Guadagno netto": p.guadagno_netto ?? "",
      Note: p.note_gestionale ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gestionale");
    XLSX.writeFile(wb, "gestionale_pratiche.xlsx");
  };

  const thisMonth = practices.filter((p) => {
    const d = new Date(p.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthLordo = thisMonth.reduce((s, p) => s + (p.guadagno_lordo ?? 0), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Gestionale pratiche</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" />
            Esporta Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i brand</SelectItem>
            <SelectItem value="enea">ENEA</SelectItem>
            <SelectItem value="conto_termico">Conto Termico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border px-4 py-3 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-xs text-muted-foreground">Totale lordo</p>
            <p className="font-bold">€ {totalLordo.toFixed(2)}</p>
          </div>
        </div>
        <div className="rounded-lg border px-4 py-3 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          <div>
            <p className="text-xs text-muted-foreground">Totale netto</p>
            <p className="font-bold">€ {totalNetto.toFixed(2)}</p>
          </div>
        </div>
        <div className="rounded-lg border px-4 py-3 bg-primary/5">
          <p className="text-xs text-muted-foreground">Mese corrente (lordo)</p>
          <p className="font-bold text-primary">€ {monthLordo.toFixed(2)}</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["ID", "Cliente", "Rivenditore", "Brand", "Prodotto", "Data invio", "Lordo €", "Netto €", "Note", "Azione"].map(
                  (h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {practices.map((p) => (
                <tr key={p.id} className={`hover:bg-muted/20 ${saving === p.id ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{p.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {p.cliente_nome} {p.cliente_cognome}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {p.companies?.ragione_sociale ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">
                      {p.brand === "enea" ? "ENEA" : "CT"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 max-w-[140px] truncate">{p.prodotto_installato ?? "—"}</td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={p.data_invio_pratica}
                      type="date"
                      onSave={(v) => updateMutation.mutate({ id: p.id, field: "data_invio_pratica", value: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={p.guadagno_lordo}
                      type="number"
                      onSave={(v) => updateMutation.mutate({ id: p.id, field: "guadagno_lordo", value: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={p.guadagno_netto}
                      type="number"
                      onSave={(v) => updateMutation.mutate({ id: p.id, field: "guadagno_netto", value: v })}
                    />
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <EditableCell
                      value={p.note_gestionale}
                      type="textarea"
                      onSave={(v) => updateMutation.mutate({ id: p.id, field: "note_gestionale", value: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs whitespace-nowrap"
                      onClick={() => moveToRecensione.mutate(p.id)}
                      disabled={moveToRecensione.isPending}
                    >
                      <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                      Fatto
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot className="bg-muted/30 font-semibold">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-muted-foreground">
                  Totali:
                </td>
                <td className="px-3 py-2">€ {totalLordo.toFixed(2)}</td>
                <td className="px-3 py-2">€ {totalNetto.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          {practices.length === 0 && !isLoading && (
            <div className="flex flex-col items-center py-16 text-center gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <ClipboardList className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold text-base">Nessuna pratica in gestionale</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                  Le pratiche in fase di gestionale appariranno qui una volta spostate nella pipeline.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/kanban")} className="gap-2">
                <ArrowRight className="h-4 w-4" />Vai al Kanban Board
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
