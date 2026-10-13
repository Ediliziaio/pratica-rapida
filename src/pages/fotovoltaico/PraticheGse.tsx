import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus2, RefreshCw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  PHOTOVOLTAICO_PIPELINE,
  PHOTOVOLTAICO_RESELLER_LABELS,
  type PhotovoltaicStatus,
} from "@/features/fotovoltaico/workflow";

type PracticeRow = {
  id: string;
  status: PhotovoltaicStatus;
  riferimento_interno: string | null;
  proprietario_nome: string | null;
  proprietario_telefono: string | null;
  proprietario_email: string | null;
  indirizzo_impianto: string | null;
  stato_impianto: string | null;
  pod: string | null;
  distributore: string | null;
  updated_at: string;
  submitted_at: string | null;
  companies?: { ragione_sociale?: string | null } | null;
};

const plantLabels: Record<string, string> = {
  lavori_non_iniziati: "Lavori non iniziati",
  lavori_in_corso: "Lavori in corso",
  installato_non_connesso: "Installato, non connesso",
  gia_connesso: "Già connesso",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PracticeCard({ practice, isInternal, moving, onMove }: {
  practice: PracticeRow;
  isInternal: boolean;
  moving: boolean;
  onMove: (id: string, status: PhotovoltaicStatus) => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardTitle className="text-sm leading-snug">{practice.proprietario_nome || "Proprietario da indicare"}</CardTitle>
        <CardDescription className="text-xs">{practice.companies?.ragione_sociale || practice.riferimento_interno || "Fotovoltaico / GSE"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-1 text-xs">
        <p><span className="text-muted-foreground">Impianto:</span> {practice.stato_impianto ? plantLabels[practice.stato_impianto] ?? practice.stato_impianto : "-"}</p>
        <p><span className="text-muted-foreground">Telefono:</span> {practice.proprietario_telefono || "-"}</p>
        <p className="line-clamp-2"><span className="text-muted-foreground">Indirizzo:</span> {practice.indirizzo_impianto || "-"}</p>
        <p className="text-[11px] text-muted-foreground">Aggiornata {format(new Date(practice.updated_at), "d MMM, HH:mm", { locale: it })}</p>
        {isInternal && practice.status !== "bozza" && (
          <div className="border-t pt-2">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Sposta manualmente in</label>
            <select className={selectClass} value={practice.status} disabled={moving} onChange={(event) => onMove(practice.id, event.target.value as PhotovoltaicStatus)}>
              {PHOTOVOLTAICO_PIPELINE.map((column) => <option key={column.key} value={column.key}>{column.title}</option>)}
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PraticheGse() {
  const { isInternal } = useAuth();
  const [rows, setRows] = useState<PracticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await (supabase as any)
      .from("fotovoltaico_practices")
      .select("id, status, riferimento_interno, proprietario_nome, proprietario_telefono, proprietario_email, indirizzo_impianto, stato_impianto, pod, distributore, updated_at, submitted_at, companies(ragione_sociale)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setRows((data ?? []) as PracticeRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const submittedRows = useMemo(() => rows.filter((practice) => practice.status !== "bozza"), [rows]);

  const movePractice = async (id: string, status: PhotovoltaicStatus) => {
    if (!isInternal) return;
    const previousRows = rows;
    setMovingId(id);
    setRows((current) => current.map((practice) => practice.id === id ? { ...practice, status } : practice));
    const { error: updateError } = await (supabase as any).from("fotovoltaico_practices").update({ status }).eq("id", id);
    if (updateError) {
      setRows(previousRows);
      toast.error("Spostamento non riuscito", { description: updateError.message });
    } else {
      toast.success("Pratica spostata", { description: "Nessun messaggio è stato inviato." });
    }
    setMovingId(null);
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><Sun className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">Pratiche Fotovoltaico / GSE</h1><p className="text-sm text-muted-foreground">Pipeline separata dalle pratiche ENEA.</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Aggiorna</Button>
          <Button asChild><Link to="/fotovoltaico/nuova"><FilePlus2 className="mr-2 h-4 w-4" /> Fotovoltaico / GSE</Link></Button>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Gestione manuale:</strong> gli spostamenti non inviano e-mail o WhatsApp e non avviano automatismi.</div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {isInternal ? (
        <div className="flex gap-4 overflow-x-auto pb-5">
          {PHOTOVOLTAICO_PIPELINE.map((column) => {
            const practices = submittedRows.filter((practice) => practice.status === column.key);
            return (
              <section key={column.key} className={`w-72 min-w-72 rounded-xl border-t-4 bg-muted/35 p-3 ${column.color}`}>
                <div className="mb-3 min-h-14">
                  <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-semibold leading-tight">{column.title}</h2><Badge variant="secondary">{practices.length}</Badge></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{column.help}</p>
                </div>
                <div className="space-y-3">
                  {practices.map((practice) => <PracticeCard key={practice.id} practice={practice} isInternal moving={movingId === practice.id} onMove={movePractice} />)}
                  {!loading && practices.length === 0 && <div className="rounded-lg border border-dashed bg-background/70 p-5 text-center text-xs text-muted-foreground">Nessuna pratica</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((practice) => (
            <Card key={practice.id}>
              <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{practice.proprietario_nome || "Proprietario da indicare"}</CardTitle><CardDescription>{practice.riferimento_interno || "Fotovoltaico / GSE"}</CardDescription></div><Badge variant={practice.status === "conclusa" ? "default" : "secondary"}>{PHOTOVOLTAICO_RESELLER_LABELS[practice.status]}</Badge></div></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Impianto:</span> {practice.stato_impianto ? plantLabels[practice.stato_impianto] ?? practice.stato_impianto : "-"}</p>
                <p><span className="text-muted-foreground">Telefono:</span> {practice.proprietario_telefono || "-"}</p>
                <p className="pt-2 text-xs text-muted-foreground">Aggiornata {format(new Date(practice.updated_at), "d MMM yyyy, HH:mm", { locale: it })}</p>
                {practice.status === "bozza" && <Button asChild variant="outline" size="sm" className="mt-2 w-full"><Link to={`/fotovoltaico/nuova?draft=${practice.id}`}>Continua la compilazione</Link></Button>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && rows.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">Non ci sono ancora pratiche Fotovoltaico / GSE.</CardContent></Card>}
    </div>
  );
}
