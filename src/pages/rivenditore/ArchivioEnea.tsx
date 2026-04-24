import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEneaPractices } from "@/hooks/useEneaPractices";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  FileText,
  Archive,
  Folder,
  FolderOpen,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type PracticeWithCompany = EneaPractice & {
  pipeline_stages: PipelineStage | null;
  companies: { id: string; ragione_sociale: string } | null;
};

interface FatturaInsolutaRow {
  id: string;
  reseller_id: string;
  filename: string;
  storage_path: string;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("enea-documents")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function downloadPath(path: string, filename: string): Promise<boolean> {
  const url = await createSignedUrl(path);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

function filenameFromPath(path: string): string {
  return path.split("/").pop() ?? path;
}

// ── Download button for a single storage path ─────────────────────────────────

function DownloadButton({ path }: { path: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const filename = filenameFromPath(path);

  const handleClick = async () => {
    setLoading(true);
    const ok = await downloadPath(path, filename);
    setLoading(false);
    if (!ok) {
      toast({
        variant: "destructive",
        title: "Impossibile scaricare il file",
        description: "Il file potrebbe essere stato rimosso o non hai i permessi. Contatta il supporto.",
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50 transition-opacity"
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      ) : (
        <Download className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate max-w-[200px]">{filename}</span>
    </button>
  );
}

// ── Single practice card ──────────────────────────────────────────────────────

function PracticeCard({ practice, showReseller }: { practice: PracticeWithCompany; showReseller: boolean }) {
  const urls: string[] = practice.pratica_enea_conclusa_urls ?? [];

  return (
    <Card className="border-border/60">
      <CardContent className="pt-4 pb-4 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-medium text-sm">
              {practice.cliente_nome} {practice.cliente_cognome}
            </p>
            {practice.prodotto_installato && (
              <p className="text-xs text-muted-foreground mt-0.5">{practice.prodotto_installato}</p>
            )}
          </div>
          {showReseller && practice.companies?.ragione_sociale && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {practice.companies.ragione_sociale}
            </Badge>
          )}
        </div>

        {urls.length > 0 ? (
          <div className="space-y-1 pt-1">
            {urls.map((path) => (
              <DownloadButton key={path} path={path} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nessun documento caricato</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Year accordion group ──────────────────────────────────────────────────────

function YearGroup({
  year,
  monthGroups,
  showReseller,
}: {
  year: number;
  monthGroups: Map<string, PracticeWithCompany[]>;
  showReseller: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-base font-semibold hover:text-primary transition-colors"
      >
        {open ? (
          <FolderOpen className="h-5 w-5 text-primary" />
        ) : (
          <Folder className="h-5 w-5 text-muted-foreground" />
        )}
        {year}
        <span className="text-xs font-normal text-muted-foreground ml-1">
          ({Array.from(monthGroups.values()).reduce((n, arr) => n + arr.length, 0)} pratiche)
        </span>
      </button>

      {open && (
        <div className="pl-5 space-y-5 border-l border-border/40 ml-2.5">
          {Array.from(monthGroups.entries()).map(([monthLabel, practices]) => (
            <div key={monthLabel} className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground capitalize">{monthLabel}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {practices.map((p) => (
                  <PracticeCard key={p.id} practice={p} showReseller={showReseller} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fatture insolute section ──────────────────────────────────────────────────

function FattureInsolute({
  isInternal,
  resellerId,
}: {
  isInternal: boolean;
  resellerId: string | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Per l'operatore interno: seleziona il rivenditore a cui caricare la fattura
  const [selectedResellerId, setSelectedResellerId] = useState<string>("");

  // Lista rivenditori (solo per operatori interni)
  const { data: companies = [] } = useQuery<{ id: string; ragione_sociale: string }[]>({
    queryKey: ["companies-for-fatture"],
    enabled: isInternal,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .order("ragione_sociale");
      return data ?? [];
    },
  });

  const { data: fatture = [], isLoading, isError: fattureError } = useQuery<FatturaInsolutaRow[]>({
    queryKey: ["fatture_insolute", isInternal ? "all" : resellerId],
    queryFn: async () => {
      let q = supabase
        .from("fatture_insolute")
        .select("*")
        .order("uploaded_at", { ascending: false });

      if (!isInternal && resellerId) {
        q = q.eq("reseller_id", resellerId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FatturaInsolutaRow[];
    },
  });

  // Determina il reseller_id effettivo per l'upload
  const effectiveResellerId = isInternal ? selectedResellerId : (resellerId ?? "");

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!effectiveResellerId) throw new Error("Seleziona prima un rivenditore");
      const storagePath = `fatture-insolute/${effectiveResellerId}/${crypto.randomUUID()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("enea-documents")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("fatture_insolute").insert({
        reseller_id: effectiveResellerId,
        filename: file.name,
        storage_path: storagePath,
        uploaded_by: user?.id ?? null,
        note: null,
      });
      if (insertError) {
        // Rollback: rimuovi il file orfano dallo storage
        await supabase.storage.from("enea-documents").remove([storagePath]).catch(() => {
          // best-effort cleanup; file resterà orfano ma il DB non ha riferimenti
        });
        throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture_insolute"] });
      toast({ title: "Fattura caricata con successo" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore upload", description: err.message });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Fatture Insolute</h2>
        </div>
        {isInternal && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seleziona rivenditore prima di caricare */}
            <Select value={selectedResellerId} onValueChange={setSelectedResellerId}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Seleziona rivenditore" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.ragione_sociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending || !selectedResellerId}
              className="gap-2 h-8"
            >
              {uploadMutation.isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Carica PDF
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : fattureError ? (
        <p className="text-sm text-destructive">
          Errore nel caricamento delle fatture. Ricarica la pagina o contatta il supporto.
        </p>
      ) : fatture.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nessuna fattura insoluta.</p>
      ) : (
        <div className="space-y-2">
          {fatture.map((f) => (
            <Card key={f.id} className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10">
              <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(f.uploaded_at), "d MMM yyyy", { locale: it })}
                    {f.note && <span> · {f.note}</span>}
                  </p>
                </div>
                <DownloadButton path={f.storage_path} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ArchivioEnea() {
  const { isInternal, resellerId } = useAuth();
  const [limit, setLimit] = useState(100);
  const { data: archivedRaw = [], isLoading, isError } = useEneaPractices({
    archivedOnly: true,
    limit,
  });
  const archived = archivedRaw as PracticeWithCompany[];

  // Group by year → month
  const byYear = new Map<number, Map<string, PracticeWithCompany[]>>();

  for (const practice of archived) {
    const dateStr = practice.archived_at ?? practice.updated_at;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const monthLabel = format(date, "MMMM yyyy", { locale: it });

    if (!byYear.has(year)) byYear.set(year, new Map());
    const monthMap = byYear.get(year)!;
    if (!monthMap.has(monthLabel)) monthMap.set(monthLabel, []);
    monthMap.get(monthLabel)!.push(practice);
  }

  // Sort years descending
  const sortedYears = Array.from(byYear.keys()).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Archive className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Archivio Pratiche</h1>
      </div>

      {/* Archive section */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive/60 mb-3" />
            <p className="text-sm font-medium mb-1">Impossibile caricare le pratiche archiviate</p>
            <p className="text-xs text-muted-foreground">Ricarica la pagina o riprova più tardi.</p>
          </CardContent>
        </Card>
      ) : archived.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Archive className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nessuna pratica archiviata.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedYears.map((year) => (
            <YearGroup
              key={year}
              year={year}
              monthGroups={byYear.get(year)!}
              showReseller={isInternal}
            />
          ))}

          {archived.length === limit && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={() => setLimit((l) => l + 100)}>
                Carica altre 100
              </Button>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Fatture insolute */}
      <FattureInsolute isInternal={isInternal} resellerId={resellerId} />
    </div>
  );
}
