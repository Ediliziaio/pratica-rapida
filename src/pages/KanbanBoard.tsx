import { useState, useCallback, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  usePipelineStages,
  useEneaPractices,
  useMoveStage,
  useUpdateEneaPractice,
} from "@/hooks/useEneaPractices";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { BulkSendDialog } from "@/components/kanban/BulkSendDialog";
import { PracticeChatDialog } from "@/components/kanban/PracticeChatDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Building2,
  MessageCircle,
  Mail,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  Columns,
  Tag,
  MoveHorizontal,
  ChevronDown,
  ChevronsUpDown,
  Phone,
  Link,
  Archive,
  RotateCcw,
  Pencil,
  X,
  Plus,
  Check,
  Download,
  Filter,
  FilterX,
  HelpCircle,
  FileWarning,
  FileText,
  CheckSquare,
  Columns3,
  List,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import DichiarazioneTecnicaDialog from "@/components/documenti/DichiarazioneTecnicaDialog";
import type { EneaPractice, PipelineStage } from "@/integrations/supabase/types";
import { PipelineSettingsDrawer } from "@/components/pratiche/PipelineSettingsDrawer";

type PracticeWithRelations = EneaPractice & {
  pipeline_stages: PipelineStage | null;
  companies: { id: string; ragione_sociale: string } | null;
};

type SortOption = "recenti" | "vecchie" | "stage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(val: string | null | undefined) {
  if (!val) return 0;
  return Math.floor((Date.now() - new Date(val).getTime()) / 86400000);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── FileDownloadLink ──────────────────────────────────────────────────────────

function FileDownloadLink({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    // Tentativi sui bucket noti per i documenti pratiche.
    // `documenti` ospita dichiarazioni tecniche generate, fatture, identità.
    // `enea-documents` ospita gli output ENEA legacy e i documenti aggiuntivi
    // caricati dal rivenditore dal form nuova-pratica.
    const tryBuckets = async () => {
      for (const bucket of ["documenti", "enea-documents"]) {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (data?.signedUrl) {
          if (!cancelled) setUrl(data.signedUrl);
          return;
        }
      }
      if (!cancelled) setFailed(true);
    };
    tryBuckets().catch((err) => {
      if (!cancelled) {
        console.warn("[FileDownloadLink] signed URL failed:", err);
        setFailed(true);
      }
    });

    return () => { cancelled = true; };
  }, [path]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 py-0.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate" title="File non trovato nel storage">{label} — non disponibile</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
        <Loader2 className="h-3.5 w-3.5 shrink-0 opacity-40 animate-spin" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-primary hover:underline py-0.5"
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

// ── CommLogSection ────────────────────────────────────────────────────────────

type CommLogEntry = {
  id: string;
  practice_id: string;
  channel: string;
  subject: string | null;
  body_preview: string | null;
  sent_at: string;
  outcome: string | null;
  notes: string | null;
};

function CommLogSection({
  practiceId,
  isInternal,
}: {
  practiceId: string;
  isInternal: boolean;
}) {
  const { toast } = useToast();
  const [showCallForm, setShowCallForm] = useState(false);
  const [callOutcome, setCallOutcome] = useState("risposta_ottenuta");
  const [callNotes, setCallNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: commLog = [], refetch, isError: commLogError } = useQuery<CommLogEntry[]>({
    queryKey: ["comm-log", practiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_log_public")
        .select("*")
        .eq("practice_id", practiceId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommLogEntry[];
    },
  });

  async function submitCallLog() {
    // try/finally garantisce setSubmitting(false) anche se insert lancia
    // exception (network drop, RLS reject, ecc.). Senza, in caso di errore
    // network il bottone restava bloccato in "Invio..." per sempre.
    setSubmitting(true);
    try {
      const { error } = await supabase.from("communication_log").insert({
        practice_id: practiceId,
        channel: "phone",
        direction: "outbound",
        recipient: "manual",
        subject: callOutcome === "risposta_ottenuta" ? "Risposta ottenuta" : "Non risposto",
        body_preview: callNotes.trim() || null,
        status: "sent",
        sent_at: new Date().toISOString(),
        outcome: callOutcome,
        notes: callNotes.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Chiamata registrata" });
      setShowCallForm(false);
      setCallNotes("");
      setCallOutcome("risposta_ottenuta");
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore registrazione chiamata";
      toast({ title: "Errore", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function channelIcon(channel: string) {
    if (channel === "email") return <Mail className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
    if (channel === "whatsapp") return <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />;
    return <Phone className="h-3.5 w-3.5 shrink-0 text-violet-500" />;
  }

  function channelLabel(channel: string) {
    if (channel === "email") return "Email";
    if (channel === "whatsapp") return "WhatsApp";
    if (channel === "sms") return "SMS";
    return "Telefono";
  }

  return (
    <section className="border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Log comunicazioni
        </h3>
        {isInternal && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowCallForm((v) => !v)}
          >
            <Phone className="h-3 w-3" />
            Registra chiamata
          </Button>
        )}
      </div>

      {/* Inline call log form */}
      {showCallForm && (
        <div className="mb-3 rounded-lg border p-3 space-y-2 bg-muted/30">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Esito chiamata</label>
            <Select value={callOutcome} onValueChange={setCallOutcome}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="risposta_ottenuta">Risposta ottenuta</SelectItem>
                <SelectItem value="non_risposto">Non risposto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Note (opzionale)</label>
            <Textarea
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              rows={2}
              placeholder="Es: ha detto che invierà i documenti entro venerdì..."
              className="text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={submitCallLog}
              disabled={submitting}
            >
              {submitting ? "Salvataggio…" : "Salva"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowCallForm(false)}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}

      {commLogError ? (
        <p className="text-sm text-destructive">
          Errore nel caricamento del log. <button onClick={() => refetch()} className="underline hover:no-underline">Riprova</button>
        </p>
      ) : commLog.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nessuna comunicazione registrata.</p>
      ) : (
        <div className="space-y-2">
          {commLog.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-xs">
              <div className="mt-0.5">{channelIcon(entry.channel)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-foreground">
                    {/* Contenuto (subject) visibile solo agli operatori interni (§7.1) */}
                    {isInternal ? (entry.subject ?? channelLabel(entry.channel)) : channelLabel(entry.channel)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{channelLabel(entry.channel)}</span>
                </div>
                {/* body_preview visibile solo agli operatori interni (§7.1) */}
                {isInternal && entry.body_preview && (
                  <p className="text-muted-foreground truncate">{entry.body_preview}</p>
                )}
                <p className="text-muted-foreground/70 mt-0.5">
                  {format(new Date(entry.sent_at), "d MMM yyyy, HH:mm", { locale: it })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── PracticeDetailSheet ───────────────────────────────────────────────────────

function PracticeDetailSheet({
  practice,
  isInternal,
  stages,
  allPractices,
  onClose,
  onMove,
  onOpenChat,
}: {
  practice: PracticeWithRelations | null;
  isInternal: boolean;
  stages: PipelineStage[];
  allPractices: PracticeWithRelations[];
  onClose: () => void;
  onMove: (args: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => void;
  /**
   * Apre il PracticeChatDialog (WhatsApp + Email) per la pratica passata.
   * Indispensabile come prop perché lo stato `chatDialogPractice` vive in
   * KanbanBoard (root) e PracticeDetailSheet è una funzione separata: senza
   * questa prop il vecchio `onClick={() => setChatDialogPractice(practice)}`
   * referenziava un identifier fuori scope → ReferenceError a runtime, click
   * silenziosamente no-op (typecheck non lo intercetta perché strict:false).
   */
  onOpenChat: (practice: PracticeWithRelations) => void;
}) {
  const { toast } = useToast();
  const updatePractice = useUpdateEneaPractice();
  const [editMode, setEditMode] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editNoteInterne, setEditNoteInterne] = useState("");
  const [editDocs, setEditDocs] = useState<string[]>([]);
  const [editOperatoreId, setEditOperatoreId] = useState<string>("");
  const [editPrezzo, setEditPrezzo] = useState<string>("");
  const [editPagamentoStato, setEditPagamentoStato] = useState<string>("non_pagata");
  const [newDoc, setNewDoc] = useState("");
  const [uploadingConclusa, setUploadingConclusa] = useState(false);
  const [deleteConclusaPath, setDeleteConclusaPath] = useState<string | null>(null);
  const [showDichiarazione, setShowDichiarazione] = useState(false);
  const conclusaInputRef = useRef<HTMLInputElement>(null);

  // Eliminazione pratica — solo super_admin.
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const sheetQueryClient = useQueryClient();
  const [showDeletePractice, setShowDeletePractice] = useState(false);
  const [deletingPractice, setDeletingPractice] = useState(false);

  async function handleDeletePractice() {
    if (!practice) return;
    setDeletingPractice(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-practice", {
        body: { practice_id: practice.id },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res?.success) throw new Error(res?.error ?? "Eliminazione fallita");
      toast({ title: "Pratica eliminata", description: "La pratica e i dati collegati sono stati rimossi." });
      setShowDeletePractice(false);
      sheetQueryClient.invalidateQueries({ queryKey: ["enea_practices"] });
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Errore eliminazione", description: err instanceof Error ? err.message : "Riprova." });
    } finally {
      setDeletingPractice(false);
    }
  }

  // Memoize operatorIds: without useMemo the spread produces a new array every
  // render, invalidating the react-query cache key and refetching on each render.
  const operatorIds = useMemo(
    () =>
      [...new Set(allPractices.map((p) => p.operatore_id).filter(Boolean))] as string[],
    [allPractices],
  );

  const { data: allOperators = [] } = useQuery({
    queryKey: ["sheet-operators", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  // Documenti precompilati (Dichiarazione Requisiti Tecnici) generati e
  // confermati dal super_admin via "Doc. tecnico". Visibili sia allo staff
  // sia al rivenditore (RLS controlla company_id + visibilita).
  const { data: precompiledDocs = [] } = useQuery<Array<{ id: string; nome_file: string; storage_path: string }>>({
    queryKey: ["practice-precompiled-docs", practice?.id],
    enabled: !!practice?.id,
    queryFn: async () => {
      if (!practice?.id) return [];
      const { data } = await supabase
        .from("documenti")
        .select("id, nome_file, storage_path")
        .eq("pratica_id", practice.id)
        .eq("tipo", "dichiarazione_tecnica")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  function enterEditMode() {
    if (!practice) return;
    setEditNote(practice.note ?? "");
    setEditNoteInterne(practice.note_interne ?? "");
    setEditDocs([...(practice.documenti_mancanti ?? [])]);
    setEditOperatoreId(practice.operatore_id ?? "");
    setEditPrezzo(practice.prezzo != null ? String(practice.prezzo) : "");
    setEditPagamentoStato(practice.pagamento_stato ?? "non_pagata");
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setNewDoc("");
  }

  async function handleSave() {
    if (!practice) return;
    // Financial fields (staff only): set data_incasso automatically when
    // flipping to "pagata", clear it otherwise — mirrors the inline-select
    // behavior in PracticeTable so the two code paths stay in sync.
    const financialUpdates: Partial<EneaPractice> = {};
    if (isInternal) {
      const parsedPrezzo =
        editPrezzo.trim() === "" ? null : Number(editPrezzo.replace(",", "."));
      const prezzoChanged =
        (practice.prezzo ?? null) !== (parsedPrezzo ?? null);
      const statoChanged =
        (practice.pagamento_stato ?? "non_pagata") !== editPagamentoStato;
      if (prezzoChanged && !Number.isNaN(parsedPrezzo as number)) {
        financialUpdates.prezzo = parsedPrezzo;
      }
      if (statoChanged) {
        financialUpdates.pagamento_stato = editPagamentoStato as EneaPractice["pagamento_stato"];
        financialUpdates.data_incasso =
          editPagamentoStato === "pagata" ? new Date().toISOString() : null;
      }
    }
    try {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: {
          note: editNote || null,
          note_interne: isInternal ? editNoteInterne || null : undefined,
          documenti_mancanti: editDocs,
          // operatore_id: invia solo se realmente cambiato, e mai stringa vuota
          // (gli uuid in postgres rigettano '' → "invalid input syntax for type uuid")
          operatore_id: isInternal
            ? (editOperatoreId.trim() === "" ? null : editOperatoreId) !== (practice.operatore_id ?? null)
              ? (editOperatoreId.trim() === "" ? null : editOperatoreId)
              : undefined
            : undefined,
          ...financialUpdates,
        },
      });
      toast({ title: "Pratica aggiornata" });
      setEditMode(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Errore sconosciuto durante il salvataggio";
      toast({
        title: "Salvataggio fallito",
        description: msg,
        variant: "destructive",
      });
      console.error("[KanbanBoard handleSave]", err);
    }
  }

  async function handleArchive() {
    if (!practice) return;
    const restoring = !!practice.archived_at;
    try {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { archived_at: restoring ? null : new Date().toISOString() },
      });
      toast({ title: restoring ? "Pratica ripristinata" : "Pratica archiviata" });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Errore imprevisto";
      toast({
        title: restoring ? "Ripristino fallito" : "Archiviazione fallita",
        description: msg,
        variant: "destructive",
      });
      console.error("[KanbanBoard handleArchive]", err);
    }
  }

  function copyFormLink() {
    if (!practice) return;
    const url = `${window.location.origin}/form/${practice.form_token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copiato!" });
    });
  }

  const [resendingLink, setResendingLink] = useState(false);
  async function resendFormLink() {
    if (!practice) return;
    setResendingLink(true);
    try {
      const { error } = await supabase.functions.invoke("on-practice-created", {
        body: { practice_id: practice.id, is_resend: true },
      });
      if (error) throw error;
      toast({
        title: "Link reinviato",
        description: "Email e WhatsApp di richiesta form rispediti al cliente.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Errore invio",
        description: "Non è stato possibile reinviare il link. Riprova o contatta il supporto.",
      });
      console.error("resendFormLink failed:", err);
    } finally {
      setResendingLink(false);
    }
  }

  async function handleUploadConclusa(e: React.ChangeEvent<HTMLInputElement>) {
    if (!practice || !e.target.files?.length) return;
    setUploadingConclusa(true);
    const files = Array.from(e.target.files);
    const newPaths: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${practice.id}/conclusa/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("enea-documents").upload(path, file, { upsert: false });
      if (error) {
        console.error(`Upload failed for ${file.name}:`, error);
        failed.push({ name: file.name, reason: error.message });
      } else {
        newPaths.push(path);
      }
    }

    if (newPaths.length) {
      const existing = practice.pratica_enea_conclusa_urls ?? [];
      try {
        await updatePractice.mutateAsync({
          id: practice.id,
          updates: { pratica_enea_conclusa_urls: [...existing, ...newPaths] },
        });
        toast({
          title: `${newPaths.length} file caricati`,
          description: failed.length > 0 ? `${failed.length} file non caricati (vedi console)` : undefined,
        });
      } catch (err) {
        console.error("DB update failed:", err);
        toast({
          variant: "destructive",
          title: "File caricati ma DB non aggiornato",
          description: "I file sono nel bucket ma l'associazione alla pratica è fallita. Ricarica la pagina.",
        });
      }
    }

    if (failed.length > 0 && newPaths.length === 0) {
      toast({
        variant: "destructive",
        title: "Upload fallito",
        description: `Nessun file caricato. Errore: ${failed[0].reason}`,
      });
    }

    setUploadingConclusa(false);
    if (conclusaInputRef.current) conclusaInputRef.current.value = "";
  }

  async function handleDeleteConclusa(path: string) {
    if (!practice) return;
    try {
      const { error: storageErr } = await supabase.storage
        .from("enea-documents").remove([path]);
      // storageErr non blocca: il file potrebbe già essere stato rimosso —
      // l'importante è aggiornare il riferimento nella pratica.
      if (storageErr) console.warn("[handleDeleteConclusa] storage remove warning:", storageErr.message);
      const updated = (practice.pratica_enea_conclusa_urls ?? []).filter((p) => p !== path);
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { pratica_enea_conclusa_urls: updated },
      });
      toast({ title: "File rimosso" });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Errore imprevisto";
      toast({
        title: "Rimozione fallita",
        description: msg,
        variant: "destructive",
      });
      console.error("[KanbanBoard handleDeleteConclusa]", err);
    }
  }

  return (
    <Sheet
      open={!!practice}
      onOpenChange={(open) => {
        if (!open) {
          setEditMode(false);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {practice && (
          <>
            <SheetHeader className="mb-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  style={{
                    backgroundColor: practice.brand === "enea" ? "#3b82f6" : "#f97316",
                    color: "white",
                  }}
                  className="text-xs"
                >
                  {practice.brand === "enea" ? "ENEA" : "Conto Termico"}
                </Badge>
                {practice.pipeline_stages && (
                  <Badge variant="outline" className="text-xs">
                    {/* Mostra nome rivenditore se non interno */}
                    {isInternal
                      ? practice.pipeline_stages.name
                      : (practice.pipeline_stages.name_reseller ?? practice.pipeline_stages.name)}
                  </Badge>
                )}
                {/* tipo_servizio — classificazione interna, visibile solo ai superadmin/operatori (§3.3) */}
                {isInternal && (
                  practice.tipo_servizio === "servizio_completo" ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                      ✦ Servizio Completo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      Documenti Forniti
                    </span>
                  )
                )}
                {/* Badge CF — solo operatori interni */}
                {isInternal && practice.tipo_fatturazione === "cliente_finale" && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    CF
                  </span>
                )}
                {practice.archived_at && (
                  <Badge variant="secondary" className="text-xs">
                    Archiviata
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-lg leading-tight">
                {practice.cliente_nome} {practice.cliente_cognome}
              </SheetTitle>
              {isInternal && practice.companies && (
                <SheetDescription className="text-xs">
                  {practice.companies.ragione_sociale}
                </SheetDescription>
              )}
            </SheetHeader>

            {/* Action buttons row */}
            {!editMode && (
              <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b">
                {/* Stage select — solo staff. Aziende e rivenditori sono read-only sullo stage. */}
                {isInternal && (
                  <Select
                    value={practice.current_stage_id ?? ""}
                    onValueChange={(newStageId) => {
                      if (!newStageId || newStageId === practice.current_stage_id) return;
                      const newStage = stages.find((s) => s.id === newStageId);
                      const oldStage = stages.find((s) => s.id === practice.current_stage_id);
                      onMove({
                        practiceId: practice.id,
                        newStageId,
                        oldStageName: oldStage?.name ?? "—",
                        newStageName: newStage?.name ?? "—",
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-auto gap-1 pr-2">
                      <MoveHorizontal className="h-3.5 w-3.5 mr-1" />
                      <SelectValue placeholder="Sposta stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Conversazione in-app: WhatsApp chat + Email log + composer.
                    Sostituisce i precedenti bottoni mailto: e wa.me che aprivano
                    app esterne senza tenere traccia dei messaggi nella nostra
                    cronologia. Adesso: tutto in-app, tutto loggato, tutto
                    cercabile in /admin/whatsapp-chat e log email. */}
                {(practice.cliente_telefono || practice.cliente_email) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => onOpenChat(practice)}
                    title="Apri chat in-app: invia template/email, vedi storico messaggi"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Conversazione
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled title="Nessun contatto cliente disponibile">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Conversazione
                  </Button>
                )}

                {/* Bottone "Scheda completa" rimosso: linkava a /pratiche/:id
                    (PraticaDetail) che legge dalla tabella `pratiche` legacy,
                    mentre le pratiche del Kanban sono tutte in `enea_practices`
                    (schema diverso). Risultato: 100% delle click portavano a
                    "Pratica non trovata". La sheet di dettaglio aperta a destra
                    (PracticeDetailSheet) fornisce già tutte le info necessarie:
                    dati cliente, doc tecnico, log comunicazioni, modifica. Se
                    serve una vista full-width in futuro, va creata una nuova
                    pagina dedicata a enea_practices, non riusare la legacy. */}

                {/* Copy form link — utile a tutti (anche azienda lo passa al cliente) */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={copyFormLink}
                >
                  <Link className="h-3.5 w-3.5" />
                  Copia link form
                </Button>

                {/* Resend form link — solo staff (azione che invia email+WA reali) */}
                {isInternal && !practice.form_compilato_at && practice.tipo_servizio === "servizio_completo" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={resendFormLink}
                    disabled={resendingLink}
                    title="Reinvia email + WhatsApp con il link del form al cliente"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {resendingLink ? "Invio…" : "Reinvia link"}
                  </Button>
                )}

                {/* Elimina pratica — solo super_admin (rimuove pratica + dati collegati) */}
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => setShowDeletePractice(true)}
                    title="Elimina definitivamente la pratica e tutti i dati collegati"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina pratica
                  </Button>
                )}

                {/* Archivia/Ripristina — solo staff. Azienda è read-only. */}
                {isInternal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={handleArchive}
                  >
                    {practice.archived_at ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Ripristina
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        Archivia
                      </>
                    )}
                  </Button>
                )}

                {/* Dichiarazione tecnica precompilata — solo staff */}
                {isInternal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setShowDichiarazione(true)}
                    title="Genera Dichiarazione Requisiti Tecnici precompilata"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Doc. tecnico
                  </Button>
                )}

                {/* Modifica — solo staff. Azienda non può editare nulla. */}
                {isInternal && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={enterEditMode}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modifica
                  </Button>
                )}
              </div>
            )}

            {/* Edit mode */}
            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Note
                  </label>
                  <Textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                    placeholder="Note sulla pratica..."
                  />
                </div>

                {isInternal && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Note interne
                    </label>
                    <Textarea
                      value={editNoteInterne}
                      onChange={(e) => setEditNoteInterne(e.target.value)}
                      rows={3}
                      placeholder="Note interne (non visibili al rivenditore)..."
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Documenti mancanti
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editDocs.map((doc, i) => (
                      <span
                        key={doc}
                        className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5"
                      >
                        {doc}
                        <button
                          type="button"
                          onClick={() => setEditDocs(editDocs.filter((_, j) => j !== i))}
                          className="hover:text-red-600"
                          aria-label={`Rimuovi ${doc}`}
                          title={`Rimuovi ${doc}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {editDocs.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nessun documento mancante</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newDoc}
                      onChange={(e) => setNewDoc(e.target.value)}
                      placeholder="Aggiungi documento..."
                      className="text-xs h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDoc.trim()) {
                          setEditDocs([...editDocs, newDoc.trim()]);
                          setNewDoc("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        if (newDoc.trim()) {
                          setEditDocs([...editDocs, newDoc.trim()]);
                          setNewDoc("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isInternal && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Operatore
                    </label>
                    {/* Radix Select NON accetta value="" (lo riserva per
                        "deseleziona" interno). Useremo "__none__" come
                        sentinel e convertiamo ai bordi: state interno resta
                        "" per "nessun operatore" (così handleSave continua
                        a tradurlo in null DB), ma il Select riceve/restituisce
                        "__none__". Crash precedente:
                        > A <Select.Item /> must have a value prop that is not
                        > an empty string. */}
                    <Select
                      value={editOperatoreId === "" ? "__none__" : editOperatoreId}
                      onValueChange={(v) => setEditOperatoreId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Nessun operatore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nessun operatore</SelectItem>
                        {allOperators.map((op) => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.nome} {op.cognome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Financial fields — staff only */}
                {isInternal && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Importo (€)
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={editPrezzo}
                        onChange={(e) => setEditPrezzo(e.target.value)}
                        placeholder="0.00"
                        className="text-sm h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Pagamento
                      </label>
                      <Select value={editPagamentoStato} onValueChange={setEditPagamentoStato}>
                        <SelectTrigger className="text-sm h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAGAMENTO_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-sm">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={updatePractice.isPending}
                    className="gap-1"
                  >
                    <Check className="h-4 w-4" />
                    Salva
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* 1. Dati cliente UNIFICATO */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Dati cliente
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="font-medium">
                        {[practice.cliente_nome, practice.cliente_cognome].filter(Boolean).join(" ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <p className="font-medium">{practice.cliente_telefono || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium break-all">{practice.cliente_email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Codice fiscale</p>
                      <p className="font-medium">{practice.cliente_cf || "—"}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Indirizzo</p>
                      <p className="font-medium">{practice.cliente_indirizzo || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Prodotto installato</p>
                      <p className="font-medium">{practice.prodotto_installato || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fornitore</p>
                      <p className="font-medium">{practice.fornitore || "—"}</p>
                    </div>
                  </div>
                  {/* Note — sempre visibili se presenti; placeholder modifica solo per staff */}
                  {(practice.note || isInternal) && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Note</p>
                      {practice.note ? (
                        <p className="text-sm whitespace-pre-wrap">{practice.note}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Nessuna nota. Clicca <span className="font-medium">Modifica</span> per aggiungerne una.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {/* 1.5 — Dati completi form cliente (collapsible, sempre visibili se compilati) */}
                {practice.dati_form && Object.keys(practice.dati_form as Record<string, unknown>).length > 0 && (
                  <FormDataDetails dati={practice.dati_form as Record<string, unknown>} />
                )}

                {/* 1b. Finanziario (solo isInternal) */}
                {isInternal && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Finanziario
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Importo</p>
                        <p className="font-medium">
                          {practice.prezzo != null
                            ? `€ ${Number(practice.prezzo).toFixed(2)}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pagamento</p>
                        <span
                          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium mt-0.5 ${pagamentoBadgeClass(
                            practice.pagamento_stato,
                          )}`}
                        >
                          {PAGAMENTO_LABELS[practice.pagamento_stato ?? "non_pagata"] ?? "—"}
                        </span>
                      </div>
                      {practice.data_incasso && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Data incasso</p>
                          <p className="font-medium">
                            {format(new Date(practice.data_incasso), "dd/MM/yyyy")}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* 2. Note interne (solo isInternal) */}
                {isInternal && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Note interne
                    </h3>
                    {practice.note_interne ? (
                      <p className="text-sm whitespace-pre-wrap">{practice.note_interne}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Nessuna nota interna.</p>
                    )}
                  </section>
                )}

                {/* 3. Documenti richiesti (amber box) — solo se stage === documenti_mancanti con nota */}
                {practice.pipeline_stages?.stage_type === "documenti_mancanti" && practice.note_documenti_mancanti && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Documenti richiesti
                    </h3>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                      <FileWarning className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">
                        {practice.note_documenti_mancanti}
                      </p>
                    </div>
                  </section>
                )}

                {/* 4. Zona documenti UNIFICATA */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Documenti
                    </h3>
                    {isInternal && (
                      <>
                        <input
                          ref={conclusaInputRef}
                          type="file"
                          accept=".pdf,.p7m,.zip"
                          multiple
                          className="hidden"
                          onChange={handleUploadConclusa}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={uploadingConclusa}
                          onClick={() => conclusaInputRef.current?.click()}
                        >
                          <Plus className="h-3 w-3" />
                          {uploadingConclusa ? "Caricamento…" : "Carica pratica conclusa"}
                        </Button>
                      </>
                    )}
                  </div>
                  {(() => {
                    const groups: { title: string; files: { label: string; path: string; canDelete: boolean }[] }[] = [
                      {
                        title: "Fatture",
                        files: (practice.fatture_urls ?? []).map((p, i) => ({
                          label: `Fattura ${i + 1}`,
                          path: p,
                          canDelete: false,
                        })),
                      },
                      {
                        title: "Documenti aggiuntivi",
                        files: (practice.documenti_aggiuntivi_urls ?? []).map((p, i) => ({
                          label: `Doc. aggiuntivo ${i + 1}`,
                          path: p,
                          canDelete: false,
                        })),
                      },
                      {
                        title: "Documenti ENEA",
                        files: (practice.documenti_enea_urls ?? []).map((p, i) => ({
                          label: `Doc. ENEA ${i + 1}`,
                          path: p,
                          canDelete: false,
                        })),
                      },
                      {
                        title: "Documenti precompilati",
                        files: precompiledDocs.map((d) => ({
                          label: d.nome_file.replace(/\.html$/i, ""),
                          path: d.storage_path,
                          canDelete: false,
                        })),
                      },
                      {
                        title: "Pratica ENEA conclusa",
                        files: (practice.pratica_enea_conclusa_urls ?? []).map((p, i) => ({
                          label: `Pratica conclusa ${i + 1}`,
                          path: p,
                          canDelete: true,
                        })),
                      },
                    ];
                    const totalFiles = groups.reduce((sum, g) => sum + g.files.length, 0);
                    if (totalFiles === 0) {
                      return (
                        <p className="text-sm text-muted-foreground italic">
                          Nessun documento disponibile.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {groups.map((g) =>
                          g.files.length === 0 ? null : (
                            <div key={g.title}>
                              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                                {g.title}
                              </p>
                              <div className="space-y-1">
                                {g.files.map((f) => (
                                  <div key={f.path} className="flex items-center gap-1">
                                    <div className="flex-1 min-w-0">
                                      <FileDownloadLink label={f.label} path={f.path} />
                                    </div>
                                    {isInternal && f.canDelete && (
                                      <button
                                        type="button"
                                        onClick={() => setDeleteConclusaPath(f.path)}
                                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded shrink-0"
                                        title="Rimuovi file"
                                        aria-label="Rimuovi file"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })()}
                </section>

                {/* 5. Log comunicazioni — collapsed by default */}
                <details className="group">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-primary">
                    Log comunicazioni
                  </summary>
                  <div className="mt-3">
                    <CommLogSection practiceId={practice.id} isInternal={isInternal} />
                  </div>
                </details>
              </div>
            )}
          </>
        )}
      </SheetContent>

      {/* Confirm delete "pratica conclusa" file */}
      <AlertDialog
        open={!!deleteConclusaPath}
        onOpenChange={(o) => !o && setDeleteConclusaPath(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il file?</AlertDialogTitle>
            <AlertDialogDescription>
              Il file verrà eliminato definitivamente dall'archivio. L'operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConclusaPath) handleDeleteConclusa(deleteConclusaPath);
                setDeleteConclusaPath(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm elimina pratica — solo super_admin */}
      <AlertDialog open={showDeletePractice} onOpenChange={(o) => !o && setShowDeletePractice(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la pratica?</AlertDialogTitle>
            <AlertDialogDescription>
              {practice ? (
                <>
                  La pratica di <strong>{practice.cliente_nome} {practice.cliente_cognome}</strong> verrà
                  eliminata <strong>definitivamente</strong> insieme a documenti, messaggi e log collegati.
                  Le automazioni su questa pratica si interromperanno. L'operazione non può essere annullata.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPractice}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeletePractice(); }}
              disabled={deletingPractice}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingPractice ? "Eliminazione…" : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dichiarazione Requisiti Tecnici — documento precompilato per ENEA */}
      <DichiarazioneTecnicaDialog
        open={showDichiarazione}
        onOpenChange={setShowDichiarazione}
        practice={practice}
      />
    </Sheet>
  );
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  intent = "default",
}: {
  label: string;
  value: number | string;
  intent?: "default" | "warning" | "danger" | "success";
}) {
  const colors: Record<string, string> = {
    default: "bg-muted/60 text-foreground",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  };
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs whitespace-nowrap ${colors[intent]}`}
    >
      <span className="font-normal opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// ── FormDataDetails ───────────────────────────────────────────────────────────
// Mostra dati_form jsonb in modo leggibile. Collapsible per non saturare la card.

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  let display: string;
  if (typeof value === "boolean") display = value ? "Sì" : "No";
  else if (typeof value === "number") display = String(value);
  else display = String(value);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{display}</p>
    </div>
  );
}

function FormDataDetails({ dati }: { dati: Record<string, unknown> }) {
  const richiedente = (dati.richiedente as Record<string, unknown>) || {};
  const residenza = (dati.residenza as Record<string, unknown>) || {};
  const apparlavori = (dati.appartamento_lavori as Record<string, unknown>) || {};
  const cointest = (dati.cointestazione as Record<string, unknown>) || {};
  const catastali = (dati.catastali as Record<string, unknown>) || {};
  const edificio = (dati.edificio as Record<string, unknown>) || {};
  const impianto = (dati.impianto as Record<string, unknown>) || {};
  const prodotto = (dati.prodotto as Record<string, unknown>) || {};

  const hasApparLavori = residenza.stesso_indirizzo_lavori === false && Object.keys(apparlavori).length > 0;
  const hasCointest = cointest.presente === true;
  const hasRecuperoCatastale = catastali.recupero_richiesto === true;

  const prodottoTipo = prodotto.tipo as string | undefined;

  return (
    <details className="rounded-lg border bg-card group">
      <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3 hover:bg-muted/40">
        <h3 className="text-sm font-semibold">Dati form cliente</h3>
        <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 space-y-5">
        {/* Richiedente */}
        {Object.keys(richiedente).length > 0 && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Richiedente</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Nome" value={richiedente.nome} />
              <Field label="Cognome" value={richiedente.cognome} />
              <Field label="Comune nascita" value={richiedente.comune_nascita} />
              <Field label="Provincia nascita" value={richiedente.provincia_nascita} />
              <Field label="Data nascita" value={richiedente.data_nascita} />
              <Field label="Codice fiscale" value={richiedente.cf} />
              <Field label="Email" value={richiedente.email} />
              <Field label="Telefono" value={richiedente.telefono} />
              <Field label="Abitazione principale" value={richiedente.abitazione_principale} />
            </div>
          </section>
        )}

        {/* Residenza */}
        {Object.keys(residenza).length > 0 && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Residenza</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Comune" value={residenza.comune} />
              <Field label="Provincia" value={residenza.provincia} />
              <Field label="Indirizzo" value={residenza.indirizzo} />
              <Field label="Civico" value={residenza.civico} />
              <Field label="CAP" value={residenza.cap} />
              <Field label="Stesso indirizzo dei lavori" value={residenza.stesso_indirizzo_lavori} />
            </div>
          </section>
        )}

        {/* Appartamento lavori (se diverso) */}
        {hasApparLavori && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Appartamento dei lavori</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Comune" value={apparlavori.comune} />
              <Field label="Provincia" value={apparlavori.provincia} />
              <Field label="Indirizzo" value={apparlavori.indirizzo} />
              <Field label="Numero" value={apparlavori.numero} />
              <Field label="CAP" value={apparlavori.cap} />
            </div>
          </section>
        )}

        {/* Cointestazione */}
        {hasCointest && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Cointestatario</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Nome" value={cointest.nome} />
              <Field label="Cognome" value={cointest.cognome} />
              <Field label="Codice fiscale" value={cointest.cf} />
            </div>
          </section>
        )}

        {/* Catastali */}
        {Object.keys(catastali).length > 0 && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Dati catastali</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
              <Field label="Foglio" value={catastali.foglio} />
              <Field label="Mappale" value={catastali.mappale} />
              <Field label="Subalterno" value={catastali.subalterno} />
            </div>
            {hasRecuperoCatastale && (
              <div className="mt-3 rounded bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Cliente ha richiesto recupero catastale (+€10)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 mt-1">
                  <Field label="Proprietario nome" value={catastali.proprietario_nome} />
                  <Field label="Proprietario cognome" value={catastali.proprietario_cognome} />
                  <Field label="Proprietario CF" value={catastali.proprietario_cf} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Edificio */}
        {Object.keys(edificio).length > 0 && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Edificio</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Anno costruzione" value={edificio.anno_costruzione} />
              <Field label="Superficie (mq)" value={edificio.superficie_mq} />
              <Field label="N. appartamenti edificio" value={edificio.numero_appartamenti} />
              <Field label="Titolo richiedente" value={edificio.titolo_richiedente} />
              <Field label="Tipologia" value={edificio.tipologia} />
            </div>
          </section>
        )}

        {/* Impianto */}
        {Object.keys(impianto).length > 0 && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Impianto termico</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Tipo impianto" value={impianto.tipo} />
              <Field label="Terminali" value={impianto.terminali} />
              <Field label="Combustibile" value={impianto.combustibile} />
              <Field label="Tipo caldaia" value={impianto.tipo_caldaia} />
              <Field label="Aria condizionata" value={impianto.aria_condizionata} />
            </div>
          </section>
        )}

        {/* Variante prodotto */}
        {prodottoTipo && (
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Dati prodotto · {
                prodottoTipo === "infissi" ? "Infissi"
                : prodottoTipo === "schermature" ? "Schermature solari"
                : prodottoTipo === "insufflaggio" ? "Insufflaggio tetti"
                : "Impianto termico"
              }
            </p>
            {prodottoTipo === "infissi" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Materiale vecchi" value={prodotto.materiale_vecchi} />
                <Field label="Vetro vecchi" value={prodotto.vetro_vecchi} />
                <Field label="Materiale nuovi" value={prodotto.materiale_nuovi} />
                <Field label="Vetro nuovi" value={prodotto.vetro_nuovi} />
                <Field label="Zanzariere/tapparelle/persiane" value={prodotto.zanzariere_tapparelle_persiane} />
              </div>
            )}
            {prodottoTipo === "schermature" && Array.isArray(prodotto.schermature) && (
              <div className="space-y-2">
                {(prodotto.schermature as Array<Record<string, string>>).map((s, i) => (
                  <div key={i} className="rounded border bg-muted/30 px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
                    <p className="text-xs text-muted-foreground sm:col-span-3 font-medium">Schermatura #{i + 1}</p>
                    <Field label="Tipo" value={s.tipo_prodotto} />
                    <Field label="Direzione" value={s.direzione} />
                  </div>
                ))}
              </div>
            )}
            {prodottoTipo === "impianto_termico" && (
              <div>
                {prodotto.libretto_url ? (
                  <FileDownloadLink label="📄 Libretto impianto" path={prodotto.libretto_url as string} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">Libretto non caricato dal cliente.</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </details>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "amber";
}) {
  const colorClasses =
    color === "green"
      ? "text-green-700 dark:text-green-400"
      : color === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${colorClasses}`}>{value}</p>
    </div>
  );
}

// ── Pagamento helpers ─────────────────────────────────────────────────────────

const PAGAMENTO_LABELS: Record<string, string> = {
  non_pagata: "Non pagata",
  pagata: "Pagata",
  in_verifica: "In verifica",
  rimborsata: "Rimborsata",
};

function pagamentoBadgeClass(stato: string | null | undefined) {
  switch (stato) {
    case "pagata":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900";
    case "in_verifica":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900";
    case "rimborsata":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900";
    case "non_pagata":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900";
  }
}

// ── PracticeCard ──────────────────────────────────────────────────────────────

function PracticeCard({
  practice,
  index,
  isInternal,
  operatorMap,
  onOpen,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}: {
  practice: PracticeWithRelations;
  index: number;
  isInternal: boolean;
  operatorMap: Record<string, string>;
  onOpen: (p: PracticeWithRelations) => void;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const days = daysAgo(practice.updated_at);
  const hasMissingDocs = practice.documenti_mancanti?.length > 0;
  const stageType = practice.pipeline_stages?.stage_type;
  const operatorName = practice.operatore_id ? operatorMap[practice.operatore_id] : null;

  const agingIntent =
    days > 7 ? "text-destructive" : days >= 4 ? "text-amber-500" : "text-muted-foreground";

  // DnD attivo SOLO per staff (super_admin/operatore senza impersonation).
  // Aziende e rivenditori vedono read-only — possono cliccare per aprire detail
  // ma NON spostare le card tra fasi.
  const dragDisabled = selectable || !isInternal;

  return (
    <Draggable draggableId={practice.id} index={index} isDragDisabled={dragDisabled}>
      {(provided, snapshot) => {
        // Quando la card è in drag, la rendiamo via React Portal su <body>
        // per sfuggire a qualsiasi ancestor con `transform`/`filter`/`will-change`
        // che creerebbe un containing block per `position: fixed` (default di
        // @hello-pangea/dnd). Senza Portal, l'offset del cursore vs. la card
        // si scombina e la card "scivola" rispetto al puntatore.
        // Inoltre disabilitiamo la transition `transition-all` durante il drag
        // — qualunque transition CSS sulla `transform` interferisce con quella
        // inline applicata dal library.
        const inDrag = snapshot.isDragging;
        const card = (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onClick={(e) => {
              if (inDrag) return;
              if (selectable) {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect?.(practice.id);
                return;
              }
              onOpen(practice);
            }}
            style={{
              ...provided.draggableProps.style,
              // Durante il drag rimuovi qualsiasi transition CSS che potrebbe
              // animare `transform` / `top` / `left` in conflitto col library.
              transition: inDrag ? "none" : provided.draggableProps.style?.transition,
            }}
            className={`group relative rounded-lg bg-background border p-3 space-y-2 text-sm ${
              inDrag ? "" : "transition-all duration-150"
            } ${
              selectable ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
            } ${
              inDrag
                ? "shadow-xl ring-2 ring-primary/30"
                : isSelected
                ? "shadow-md ring-2 ring-primary border-primary"
                : "shadow-sm hover:shadow-md hover:-translate-y-0.5"
            }`}
          >
          {/* Top: name + brand + CF badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {selectable && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(practice.id);
                  }}
                  className="shrink-0 mt-0.5"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect?.(practice.id)}
                    aria-label={`Seleziona pratica di ${practice.cliente_nome} ${practice.cliente_cognome}`}
                  />
                </div>
              )}
              <span className="font-semibold leading-snug truncate text-[13px]">
                {practice.cliente_nome} {practice.cliente_cognome}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* CF badge — solo visibile agli operatori interni */}
              {isInternal && practice.tipo_fatturazione === "cliente_finale" && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  CF
                </span>
              )}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  practice.brand === "enea"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                }`}
              >
                {practice.brand === "enea" ? "ENEA" : "CT"}
              </span>
            </div>
          </div>

          {/* Company (internal only) */}
          {isInternal && practice.companies && (
            <p className="text-[11px] text-muted-foreground truncate">
              {practice.companies.ragione_sociale}
            </p>
          )}

          {/* Product */}
          {practice.prodotto_installato && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Tag className="h-3 w-3 shrink-0" />
              {practice.prodotto_installato}
            </p>
          )}

          {/* Form status dot */}
          {practice.form_compilato_at ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Form compilato</span>
            </div>
          ) : stageType === "attesa_compilazione" ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[11px] text-amber-600 dark:text-amber-400">In attesa form</span>
            </div>
          ) : null}

          {/* Operator (internal only) */}
          {isInternal && operatorName && (
            <div className="flex items-center gap-1.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                {getInitials(operatorName)}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{operatorName}</span>
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center justify-between pt-0.5">
            <span className={`text-[11px] font-medium ${agingIntent}`}>{days}g fa</span>
            <div className="flex items-center gap-1.5">
              {hasMissingDocs && (
                <span className="flex items-center gap-0.5 text-[11px] text-amber-600 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {practice.documenti_mancanti.length}
                </span>
              )}
              {practice.conteggio_solleciti > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-blue-500">
                  <MessageCircle className="h-3 w-3" />
                  {practice.conteggio_solleciti}
                </span>
              )}
            </div>
          </div>
        </div>
        );
        // Durante il drag, rendiamo via Portal su <body> per sfuggire al
        // containing block creato dagli ancestor con transform (page-enter
        // animation, sidebar transform, ecc.). Solo così il cursore segue
        // esattamente la card senza offset orizzontale.
        return inDrag ? createPortal(card, document.body) : card;
      }}
    </Draggable>
  );
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const { user, isInternal: realIsInternal } = useAuth();
  const { isImpersonating } = useCompany();
  // Quando super_admin impersona un'azienda, l'UI deve comportarsi COME SE fosse
  // l'azienda (vista semplificata, no drag, no admin actions, nomi reseller).
  // Lato DB l'utente resta super_admin (RLS filtra via useEneaPractices).
  const isInternal = realIsInternal && !isImpersonating;
  const { toast } = useToast();
  const moveStage = useMoveStage();
  const queryClient = useQueryClient();

  // View mode (staff only): pipeline (kanban) vs tabella (flat table)
  const [viewMode, setViewMode] = useState<"pipeline" | "tabella">("pipeline");

  // Bulk selection state (internal users only)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveStageId, setBulkMoveStageId] = useState<string>("");
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  // Bulk send (WhatsApp / Email) — apre dialog con selettore template
  const [bulkSendChannel, setBulkSendChannel] = useState<"whatsapp" | "email" | null>(null);

  // Practice chat dialog (WhatsApp + email in-app, sostituisce wa.me + mailto:)
  // Stato: la practice corrente da mostrare nel dialog (null = chiuso).
  const [chatDialogPractice, setChatDialogPractice] = useState<PracticeWithRelations | null>(null);

  // (Deep-link auto-open practice sheet via ?practice=<id> — useEffect
  //  spostato sotto la dichiarazione di `practices` per evitare TDZ.)

  // Clear selection when leaving select mode
  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set());
  }, [selectMode]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkMoveMutation = useMutation({
    mutationFn: async (args: { ids: string[]; stageId: string }) => {
      const { error } = await (supabase as any)
        .from("enea_practices")
        .update({ current_stage_id: args.stageId })
        .in("id", args.ids);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
      setSelectedIds(new Set());
      setBulkMoveStageId("");
      toast({ title: `${variables.ids.length} pratiche spostate` });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Errore spostamento",
        description: err.message || "Impossibile spostare le pratiche.",
      });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (args: { ids: string[] }) => {
      const { error } = await (supabase as any)
        .from("enea_practices")
        .update({ archived_at: new Date().toISOString() })
        .in("id", args.ids);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
      setSelectedIds(new Set());
      setBulkArchiveConfirm(false);
      toast({ title: `${variables.ids.length} pratiche archiviate` });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Errore archiviazione",
        description: err.message || "Impossibile archiviare le pratiche.",
      });
    },
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [brandFilter, setBrandFilter] = useState<string>(() => {
    if (!isInternal) return "all";
    const urlBrand = searchParams.get("brand");
    if (urlBrand && ["enea", "conto_termico", "all"].includes(urlBrand)) return urlBrand;
    return "all";
  });
  const [search, setSearch] = useState("");
  // useDeferredValue (React 18 nativo, zero dipendenze): mentre l'utente
  // sta digitando rapidamente, React mantiene il valore "deferred" stabile
  // e aggiorna la UI urgenti (input visivo) per primi. La query DB usa la
  // versione deferred, evitando una fetch a ogni keystroke. Risultato:
  // input fluido + query solo quando l'utente pausa digitazione.
  // È più safe e leggero di un useDebounce custom + non richiede lib esterne.
  const deferredSearch = useDeferredValue(search);
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState<PracticeWithRelations | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("recenti");
  const [operatoreFilter, setOperatoreFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const location = useLocation();
  const [aziendaFilter, setAziendaFilter] = useState<string>(
    (location.state as { aziendaFilter?: string } | null)?.aziendaFilter ?? "all"
  );
  const [clienteFilter, setClienteFilter] = useState("");
  const [aziendaComboboxOpen, setAziendaComboboxOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [archiveConfirm, setArchiveConfirm] = useState<{
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  } | null>(null);

  // Popup obbligatorio quando si sposta una pratica in "Documenti mancanti"
  const [docMissPopup, setDocMissPopup] = useState<{
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  } | null>(null);
  const [docMissText, setDocMissText] = useState("");

  // Sync URL when brandFilter changes (staff only — reseller stays at /kanban)
  useEffect(() => {
    if (isInternal) {
      if (brandFilter === "all") {
        if (searchParams.has("brand")) {
          searchParams.delete("brand");
          setSearchParams(searchParams, { replace: true });
        }
      } else {
        if (searchParams.get("brand") !== brandFilter) {
          searchParams.set("brand", brandFilter);
          setSearchParams(searchParams, { replace: true });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, isInternal]);

  // Sync state when user navigates via sidebar (URL → brandFilter)
  useEffect(() => {
    if (!isInternal) return;
    const urlBrand = searchParams.get("brand");
    const expected =
      urlBrand && ["enea", "conto_termico"].includes(urlBrand) ? urlBrand : "all";
    if (expected !== brandFilter) setBrandFilter(expected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isInternal]);

  const { data: rawStages = [] } = usePipelineStages(
    brandFilter !== "all" ? brandFilter : undefined
  );

  // Deduplicazione stages: nel DB esistono stages "globali" (reseller_id IS
  // NULL) E stages personalizzati per ogni reseller, MOLTIPLICATI PER BRAND
  // (enea + conto_termico). Risultato: per N reseller × 2 brand × 8 stages
  // possiamo avere fino a 16N righe, con MOLTI nomi duplicati.
  //
  // V1 di questo dedup usava key `(brand, name)`: riduceva i duplicati
  // per-brand ma non eliminava i duplicati cross-brand quando brandFilter=all
  // (l'admin vedeva "Pronte da fare" 2 volte: una enea + una CT).
  // V2 (questo): usa SOLO `stage_type` come key (es. "pronte_da_fare",
  // enum stabile DB-side) + preferenza per stage globale (reseller_id NULL),
  // poi per brand="enea" come primario. Risultato: max 8 voci nel select.
  //
  // Side effect: il select del PracticeDetailSheet — che potrebbe avere una
  // pratica brand="conto_termico" — riceverà l'id dello stage brand="enea".
  // È OK: il backend UPDATE su current_stage_id non valida cross-brand (è
  // un FK semplice), e il join successivo `pipeline_stages(...)` segue
  // semplicemente l'id. Visivamente il name mostrato non cambia per brand.
  const stages = useMemo(() => {
    const byType = new Map<string, PipelineStage>();
    for (const s of rawStages) {
      const key = s.stage_type as string;
      const existing = byType.get(key);
      if (!existing) {
        byType.set(key, s);
        continue;
      }
      // Priorità: 1) stage globale (reseller_id NULL), 2) brand="enea"
      const existingIsGlobal = existing.reseller_id == null;
      const candidateIsGlobal = s.reseller_id == null;
      if (candidateIsGlobal && !existingIsGlobal) {
        byType.set(key, s);
      } else if (candidateIsGlobal === existingIsGlobal && s.brand === "enea" && existing.brand !== "enea") {
        byType.set(key, s);
      }
    }
    return Array.from(byType.values()).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }, [rawStages]);

  const { data: practices = [], isLoading, isError: practicesError } = useEneaPractices({
    brand: brandFilter !== "all" ? brandFilter : undefined,
    // Usa deferredSearch invece di search: la fetch DB parte solo quando
    // l'utente pausa digitazione, non a ogni keystroke. Comportamento
    // identico per l'utente (la lista si aggiorna), ma con meno fetch.
    search: deferredSearch.length > 1 ? deferredSearch : undefined,
    includeArchived: showArchived,
  });

  // Deep-link auto-open: se l'URL ha `?practice=<id>` apri la sheet di
  // dettaglio della pratica corrispondente. Usato dal redirect smart in
  // PraticaDetail quando l'utente arriva su /pratiche/:id con un id che
  // appartiene a enea_practices (non a pratiche legacy).
  useEffect(() => {
    const target = searchParams.get("practice");
    if (!target || selectedPractice?.id === target) return;
    const found = practices.find((p) => p.id === target);
    if (found) {
      setSelectedPractice(found);
      // One-shot: rimuovo il query param così se l'utente refresha non
      // riapre la sheet (sarebbe fastidioso).
      const next = new URLSearchParams(searchParams);
      next.delete("practice");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, practices, selectedPractice?.id, setSearchParams]);

  // Operator map for cards and sheet. Memoized to avoid creating a new array
  // reference per render (which would invalidate the query cache key).
  const operatorIds = useMemo(
    () =>
      [...new Set(practices.map((p) => p.operatore_id).filter(Boolean))] as string[],
    [practices],
  );

  const { data: operators = [] } = useQuery({
    queryKey: ["kanban-operators", operatorIds],
    queryFn: async () => {
      if (operatorIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, cognome")
        .in("id", operatorIds);
      return data || [];
    },
    enabled: operatorIds.length > 0,
  });

  // Memo: senza, Object.fromEntries(map(...)) crea nuovo oggetto ad ogni
  // render → usato in CSV export, table cells, badge → invalida memo
  // dipendenti anche quando `operators` non è cambiato.
  const operatorMap = useMemo(
    () => Object.fromEntries(operators.map((o) => [o.id, `${o.nome} ${o.cognome}`.trim()])),
    [operators],
  );

  // All companies from DB (for internal filter - loads all, not just from loaded practices)
  const { data: allCompaniesFromDB = [] } = useQuery({
    queryKey: ["kanban-all-companies"],
    enabled: isInternal,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, ragione_sociale")
        .order("ragione_sociale");
      return data ?? [];
    },
  });

  // Stats: collapsed in singolo useMemo + single-pass O(n) per evitare
  // 3 filter() sequenziali ad ogni render. Senza memo:
  //   - activePractices (full array allocato ogni render)
  //   - pronteDaFare.length (rifiltra activePractices)
  //   - staleCount.length (rifiltra activePractices, +daysAgo per ogni p)
  // Su 500-1000 pratiche × 3 filter = 1500-3000 op inutili per render parent.
  // Ora: 1 passata, 3 contatori. Result memoizzato su [practices].
  const { activePractices, pronteDaFare, staleCount } = useMemo(() => {
    const active: typeof practices = [];
    let pronte = 0;
    let stale = 0;
    for (const p of practices) {
      if (!p.archived_at) {
        active.push(p);
        if (p.pipeline_stages?.stage_type === "pronte_da_fare") pronte++;
        if (daysAgo(p.updated_at) > 7) stale++;
      }
    }
    return { activePractices: active, pronteDaFare: pronte, staleCount: stale };
  }, [practices]);

  // Apply all client-side filters.
  // Memoized: `filteredPractices` è usato come dipendenza da `kpis` (useMemo),
  // dal raggruppamento Kanban (line 2267+), dagli export CSV/XLSX e
  // dalle row PracticeTable. Senza memo, ogni render ricreava una nuova
  // array ref → kpis si ricalcola, ogni .map() figlio rigenera children
  // anche se gli stessi filtri non sono cambiati (es. apertura sheet
  // dettaglio: setSelectedPractice triggera render del parent ma i
  // filtri non sono cambiati). Su 500+ pratiche con 5+ filtri sequenziali
  // = ~3-5ms di lavoro inutile per ogni render.
  const filteredPractices = useMemo(() => practices.filter((p) => {
    if (isInternal && operatoreFilter !== "all" && p.operatore_id !== operatoreFilter) return false;
    if (isInternal && aziendaFilter !== "all" && p.companies?.id !== aziendaFilter) return false;
    if (stageFilter !== "all" && p.current_stage_id !== stageFilter) return false;
    if (dateFrom && p.created_at < dateFrom) return false;
    if (dateTo && p.created_at > dateTo + "T23:59:59") return false;
    if (clienteFilter.trim()) {
      const q = clienteFilter.trim().toLowerCase();
      const fullName = `${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""}`.toLowerCase();
      const email = (p.cliente_email ?? "").toLowerCase();
      const cf = (p.cliente_cf ?? "").toLowerCase();
      if (!fullName.includes(q) && !email.includes(q) && !cf.includes(q)) return false;
    }
    return true;
  }), [practices, isInternal, operatoreFilter, aziendaFilter, stageFilter, dateFrom, dateTo, clienteFilter]);

  const activeFilterCount = [
    dateFrom, dateTo,
    aziendaFilter !== "all",
    operatoreFilter !== "all",
    stageFilter !== "all",
    clienteFilter.trim() !== "",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  // KPI aggregates (staff only)
  const kpis = useMemo(() => {
    if (!isInternal) return null;
    const active = filteredPractices.filter((p) => !p.archived_at);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const sum = (arr: typeof active) =>
      arr.reduce((s, p) => s + Number(p.prezzo ?? 0), 0);
    return {
      fatturato: sum(active),
      incassato: sum(active.filter((p) => p.pagamento_stato === "pagata")),
      daIncassare: sum(active.filter((p) => p.pagamento_stato === "non_pagata")),
      mese: sum(active.filter((p) => p.created_at?.startsWith(currentMonth))),
    };
  }, [filteredPractices, isInternal]);

  // Inline pagamento_stato update (staff only)
  const updatePagamentoMutation = useMutation({
    mutationFn: async (args: { id: string; pagamento_stato: string }) => {
      const { error } = await (supabase as any)
        .from("enea_practices")
        .update({
          pagamento_stato: args.pagamento_stato,
          data_incasso:
            args.pagamento_stato === "pagata" ? new Date().toISOString() : null,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enea_practices"] });
      toast({ title: "Stato pagamento aggiornato" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Errore aggiornamento pagamento",
        description: err.message || "Impossibile aggiornare lo stato pagamento.",
      });
    },
  });

  // Export to CSV
  const exportCSV = () => {
    const headers = [
      "Nome", "Cognome", "Email", "Telefono", "Codice Fiscale", "Brand",
      "Azienda", "Stage", "Prodotto", "Fornitore", "Note",
      "Guadagno Netto (€)", "Guadagno Lordo (€)", "Solleciti",
      "Form Compilato", "Operatore", "Archiviata", "Creata il", "Aggiornata il",
    ];
    const rows = filteredPractices.map((p) => [
      p.cliente_nome,
      p.cliente_cognome,
      p.cliente_email ?? "",
      p.cliente_telefono ?? "",
      p.cliente_cf ?? "",
      p.brand === "enea" ? "ENEA" : "Conto Termico",
      p.companies?.ragione_sociale ?? "",
      p.pipeline_stages?.name ?? "",
      p.prodotto_installato ?? "",
      p.fornitore ?? "",
      (p.note ?? "").replace(/[\r\n]+/g, " "),
      p.guadagno_netto != null ? p.guadagno_netto.toFixed(2) : "",
      p.guadagno_lordo != null ? p.guadagno_lordo.toFixed(2) : "",
      p.conteggio_solleciti ?? 0,
      p.form_compilato_at ? format(new Date(p.form_compilato_at), "dd/MM/yyyy") : "No",
      p.operatore_id ? (operatorMap[p.operatore_id] ?? "") : "",
      p.archived_at ? "Sì" : "No",
      format(new Date(p.created_at), "dd/MM/yyyy HH:mm"),
      format(new Date(p.updated_at), "dd/MM/yyyy HH:mm"),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Esportate ${filteredPractices.length} pratiche` });
  };

  // Export to XLSX
  const exportXLSX = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredPractices.map((p) => ({
      Nome: p.cliente_nome ?? "",
      Cognome: p.cliente_cognome ?? "",
      Email: p.cliente_email ?? "",
      Telefono: p.cliente_telefono ?? "",
      "Codice Fiscale": p.cliente_cf ?? "",
      Brand: p.brand === "enea" ? "ENEA" : "Conto Termico",
      Azienda: p.companies?.ragione_sociale ?? "",
      Stage: p.pipeline_stages?.name ?? "",
      Prodotto: p.prodotto_installato ?? "",
      Importo: Number(p.prezzo ?? 0),
      Pagamento: p.pagamento_stato ?? "",
      "Data incasso": p.data_incasso
        ? format(new Date(p.data_incasso), "dd/MM/yyyy")
        : "",
      Note: (p.note ?? "").replace(/[\r\n]+/g, " "),
      "Form compilato": p.form_compilato_at
        ? format(new Date(p.form_compilato_at), "dd/MM/yyyy")
        : "",
      Solleciti: p.conteggio_solleciti ?? 0,
      "Creata il": format(new Date(p.created_at), "dd/MM/yyyy"),
      Archiviata: p.archived_at ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pratiche");
    XLSX.writeFile(wb, `pratiche-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Esportate ${rows.length} pratiche (xlsx)` });
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setAziendaFilter("all");
    setOperatoreFilter("all");
    setClienteFilter("");
    setStageFilter("all");
  };

  // Map each stage.id → the "virtual column id" it belongs to.
  //
  // - Reseller: stages sharing the same `name_reseller` collapse into one
  //   virtual column (first occurrence by order_index wins).
  //
  // - Staff con filtro brand specifico (enea o conto_termico): identity
  //   mapping — il deduped contiene tutti gli stage del brand, ognuno è una
  //   colonna a sé.
  //
  // - Staff con filtro "all": gli stage in DB sono duplicati (uno per brand)
  //   ma `deduped` ne mostra UNO per stage_type. Le pratiche dell'altro brand
  //   hanno `current_stage_id` puntato all'altro record → senza mappatura
  //   per `stage_type`, sparirebbero dal kanban. Quindi raggruppiamo per
  //   stage_type: tutti gli stage con lo stesso `stage_type` puntano alla
  //   stessa colonna virtuale (lo stage con order_index minore vince).
  // stageToColumn DEVE essere costruito da rawStages (TUTTI gli stage DB, non
  // solo quelli deduped) altrimenti le pratiche con current_stage_id puntante
  // a uno stage reseller-specific (non nel deduped) spariscono dal kanban.
  //
  // Bug originale user-reported: "drag&drop, la card si blocca sopra e al
  // refresh torna alla pipeline precedente". Cause concorrenti:
  //  1) trigger DB sync_pratiche_to_enea sovrascrive current_stage_id allo
  //     stage globale equivalente per stage_type
  //  2) prima del fix, stageToColumn usava `stages` (deduped) — quindi se la
  //     pratica aveva un id reseller-specific (non in deduped), la card non
  //     compariva in nessuna colonna
  //
  // Fix: costruisci il map da rawStages, mappando ogni stage_id al column id
  // della colonna deduped corrispondente per (stage_type) o (name_reseller).
  const stageToColumn = useMemo(() => {
    const map = new Map<string, string>();

    if (isInternal) {
      // Per ogni stage_type, identifica il "column owner" = il deduped stage.id
      // (sorted per order_index). TUTTI gli stage rawStages con quel stage_type
      // mappano allo stesso column owner.
      const ownerByType = new Map<string, string>();
      for (const s of stages) {
        if (!ownerByType.has(s.stage_type as string)) {
          ownerByType.set(s.stage_type as string, s.id);
        }
      }
      // Brand=all: collassa entrambi i brand sullo stesso column_id (deduped)
      // Brand specifico: il deduped già contiene solo quel brand → identity-like
      for (const s of rawStages) {
        const ownerId = ownerByType.get(s.stage_type as string);
        if (ownerId) map.set(s.id, ownerId);
      }
      return map;
    }

    // Reseller: raggruppa per name_reseller. Usa rawStages per non perdere
    // pratiche con current_stage_id su stage non-deduped.
    const ownerByLabel = new Map<string, string>();
    for (const s of stages) {
      if (s.is_visible_reseller === false) continue;
      const key = s.name_reseller ?? s.name;
      if (!ownerByLabel.has(key)) ownerByLabel.set(key, s.id);
    }
    for (const s of rawStages) {
      if (s.is_visible_reseller === false) continue;
      const key = s.name_reseller ?? s.name;
      const ownerId = ownerByLabel.get(key);
      if (ownerId) map.set(s.id, ownerId);
    }
    return map;
  }, [stages, rawStages, isInternal]);

  const byStage = useCallback(
    (stageId: string) => {
      // Tutti i casi usano ora la stessa logica: map current_stage_id alla
      // sua colonna virtuale e confronta con la colonna richiesta.
      // - Staff brand specifico: identity mapping → match diretto
      // - Staff brand="all": pratiche di entrambi i brand confluiscono nella
      //   colonna del loro stage_type
      // - Reseller: pratiche con stesso name_reseller confluiscono insieme
      const targetColumn = stageToColumn.get(stageId);
      let cards = filteredPractices.filter((p) => {
        if (!p.current_stage_id) return false;
        const pColumn = stageToColumn.get(p.current_stage_id);
        return pColumn !== undefined && pColumn === targetColumn;
      });
      if (sortOption === "recenti") {
        cards = cards.slice().sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortOption === "vecchie") {
        cards = cards.slice().sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      } else if (sortOption === "stage") {
        cards = cards.slice().sort(
          (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );
      }
      return cards;
    },
    [filteredPractices, sortOption, isInternal, stageToColumn]
  );

  const updatePracticeForDocMiss = useUpdateEneaPractice();

  const doMove = ({
    practiceId,
    newStageId,
    oldStageName,
    newStageName,
    noteDocMancanti,
  }: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
    noteDocMancanti?: string;
  }) => {
    const newStage = stages.find((s) => s.id === newStageId);
    moveStage.mutate(
      { practiceId, newStageId, oldStageName, newStageName, userId: user?.id ?? "" },
      {
        onError: (err: Error) => {
          toast({
            variant: "destructive",
            title: "Errore spostamento",
            description: err.message || "Impossibile spostare la pratica. Riprova.",
          });
        },
        onSuccess: async () => {
          if (newStage?.stage_type === "pronte_da_fare") {
            toast({ title: "Pratica pronta!", description: "Assegna un operatore." });
          }
          // Salva nota documenti mancanti se presente.
          // Wrappato in try/catch: il primary action (move stage) è già OK,
          // ma se il save della nota fallisce vogliamo:
          //  1) Loggare l'errore (no silent error nella console del browser)
          //  2) Informare l'utente con toast (no crash)
          //  3) NON propagare (il move è già committato — re-throw farebbe
          //     un toast generico onError sopra inutile)
          if (newStage?.stage_type === "documenti_mancanti" && noteDocMancanti?.trim()) {
            try {
              await updatePracticeForDocMiss.mutateAsync({
                id: practiceId,
                updates: { note_documenti_mancanti: noteDocMancanti.trim() },
              });
            } catch (err) {
              console.error("[KanbanBoard] save note_documenti_mancanti failed:", err);
              toast({
                variant: "destructive",
                title: "Nota documenti non salvata",
                description: "Lo spostamento è OK ma la nota non è stata salvata. Riapri la card e riprova.",
              });
            }
          }
          // Imposta archivio_path quando la pratica viene inviata al cliente.
          // Idem: try/catch per evitare silent error se l'archivio_path update
          // fallisce (es. RLS, network). Lo spostamento stage è già committato.
          if (newStage?.stage_type === "da_inviare") {
            const practice = practices.find((p) => p.id === practiceId);
            if (practice) {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, "0");
              const clientName = `${practice.cliente_nome ?? ""}_${practice.cliente_cognome ?? ""}`.replace(/\s+/g, "_").toLowerCase();
              const archivioPath = `archivio/${year}/${month}/${clientName}_${practiceId}/`;
              try {
                await updatePracticeForDocMiss.mutateAsync({
                  id: practiceId,
                  updates: { archivio_path: archivioPath },
                });
              } catch (err) {
                console.error("[KanbanBoard] save archivio_path failed:", err);
                // No toast: l'archivio_path è metadato interno per future
                // archiviazioni, l'utente non vede / non agisce su questo
                // campo direttamente. Log silente è sufficiente.
              }
            }
          }
          // Fire automation triggers (non-blocking, but surface failures to user)
          if (
            newStage?.stage_type === "documenti_mancanti" ||
            newStage?.stage_type === "da_inviare" ||
            newStage?.stage_type === "pronte_da_fare"
          ) {
            const practice = practices.find((p) => p.id === practiceId);
            if (practice?.tipo_servizio === "servizio_completo") {
              supabase.functions
                .invoke("on-stage-changed", {
                  body: {
                    practice_id: practiceId,
                    new_stage_type: newStage.stage_type,
                    note_docs_mancanti: noteDocMancanti ?? null,
                  },
                })
                .catch((err) => {
                  console.error("on-stage-changed invoke failed:", err);
                  toast({
                    variant: "destructive",
                    title: "Automazione non eseguita",
                    description:
                      "Lo spostamento è stato salvato, ma l'invio di email/WhatsApp al cliente non è riuscito. Contatta il supporto.",
                  });
                });
            }
          }
        },
      }
    );
  };

  const tryMove = (args: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => {
    const newStage = stages.find((s) => s.id === args.newStageId);
    // Intercetta archivio
    if (newStage?.stage_type === "archiviate") {
      setArchiveConfirm(args);
      return;
    }
    // Intercetta documenti_mancanti → popup obbligatorio
    if (newStage?.stage_type === "documenti_mancanti") {
      setDocMissText("");
      setDocMissPopup(args);
      return;
    }
    doMove(args);
  };

  const handleMoveFromSheet = ({
    practiceId,
    newStageId,
    oldStageName,
    newStageName,
  }: {
    practiceId: string;
    newStageId: string;
    oldStageName: string;
    newStageName: string;
  }) => {
    tryMove({ practiceId, newStageId, oldStageName, newStageName });
  };

  const onDragEnd = (result: DropResult) => {
    // Resellers see a read-only board — they cannot reassign pipeline stages.
    if (!isInternal) return;
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const practice = practices.find((p) => p.id === draggableId);
    if (!practice || practice.current_stage_id === newStageId) return;

    const newStage = stages.find((s) => s.id === newStageId);
    const oldStage = stages.find((s) => s.id === practice.current_stage_id);

    tryMove({
      practiceId: practice.id,
      newStageId,
      oldStageName: oldStage?.name ?? "—",
      newStageName: newStage?.name ?? "—",
    });
  };

  const deduped = useMemo(() => {
    const filtered = (
      brandFilter === "all"
        ? stages.filter(
            (s, i, arr) => arr.findIndex((x) => x.stage_type === s.stage_type) === i
          )
        : stages
    ).filter((s) => isInternal || s.is_visible_reseller !== false);

    if (isInternal) return filtered;

    // For resellers, collapse stages sharing the same `name_reseller` into a
    // single column (keep the first occurrence — stages are ordered by
    // order_index from the query).
    const seen = new Set<string>();
    return filtered.filter((s) => {
      const key = s.name_reseller ?? s.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [stages, brandFilter, isInternal]);

  // ── Auto-archive client-side (fallback) ─────────────────────────────────
  // La logica primaria gira nel cron `process-automations` (sposta in
  // "archiviate" le pratiche in stage "recensione" da >10 giorni). Questo
  // effect è un fallback se il cron è in ritardo: l'utente staff che apre
  // il kanban completa l'archiviazione manualmente. Stessa logica del cron
  // (stage_type="recensione", current_stage_entered_at >10 giorni).
  const autoArchivedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Solo staff può eseguire UPDATE su enea_practices via RLS — per rivenditori/azienda
    // questo effect produrrebbe mutation fallite silenti + toast fuorviante.
    if (!isInternal) return;
    if (!stages.length || !practices.length) return;
    const recensioneStage = stages.find((s) => s.stage_type === "recensione");
    const archiviateStage = stages.find((s) => s.stage_type === "archiviate");
    if (!recensioneStage || !archiviateStage) return;

    const allEligible = practices.filter(
      (p) => {
        const stageEnteredAt =
          (p as { current_stage_entered_at?: string }).current_stage_entered_at ?? p.updated_at;
        return (
          p.current_stage_id === recensioneStage.id &&
          !p.archived_at &&
          daysAgo(stageEnteredAt) >= 10 &&
          !autoArchivedRef.current.has(p.id)
        );
      },
    );

    // Limit a max 3 mutation in parallelo per evitare:
    // - Race condition su update concorrenti dello stesso row
    // - Spam toast (10+ "archiviata automaticamente" sarebbe rumoroso)
    // - Throttling Supabase su molte UPDATE simultanee
    // Le pratiche eccedenti verranno processate al prossimo refetch.
    const toArchive = allEligible.slice(0, 3);

    toArchive.forEach((p) => {
      autoArchivedRef.current.add(p.id);
      moveStage.mutate({
        practiceId: p.id,
        newStageId: archiviateStage.id,
        oldStageName: recensioneStage.name,
        newStageName: archiviateStage.name,
        userId: user?.id ?? "",
      });
    });

    if (toArchive.length > 0) {
      const remaining = allEligible.length - toArchive.length;
      toast({
        title: `${toArchive.length} ${toArchive.length === 1 ? "pratica archiviata" : "pratiche archiviate"} automaticamente`,
        description: remaining > 0
          ? `${remaining} altre verranno archiviate al prossimo refresh.`
          : "Pratiche in 'Recensione' da più di 10 giorni.",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, practices]);

  const sortLabels: Record<SortOption, string> = {
    recenti: "Più recenti",
    vecchie: "Più vecchie",
    stage: "Più in stage",
  };

  return (
    <div
      className="flex flex-col -m-4 md:-m-6 lg:-m-8 overflow-hidden"
      style={{ height: "calc(100vh - 3.5rem)" }}
    >
      {/* ── Toolbar row 1: title · search · actions ────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background shrink-0">
        {/* Title + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-semibold text-sm tracking-tight">
            {isInternal && brandFilter === "enea"
              ? "Pipeline ENEA"
              : isInternal && brandFilter === "conto_termico"
              ? "Pipeline Conto Termico"
              : "Pipeline"}
          </span>
          <span className="inline-flex h-5 min-w-[1.25rem] px-1.5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {filteredPractices.length}
          </span>
          {isInternal && aziendaFilter !== "all" && (
            <button
              onClick={() => setAziendaFilter("all")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
              title="Rimuovi filtro azienda"
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="max-w-[140px] truncate">
                {allCompaniesFromDB.find((c) => c.id === aziendaFilter)?.ragione_sociale ?? "Azienda"}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm mx-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca cliente, CF, email..."
            className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus-visible:border-input focus-visible:bg-background transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Cancella ricerca"
              title="Cancella ricerca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-0.5 ml-auto">
          {isInternal && (
            <Button
              variant="default"
              size="sm"
              className="h-8 px-2.5 gap-1.5 text-xs mr-1"
              onClick={() => navigate("/enea/nuova")}
              title="Crea una nuova pratica (direct-channel)"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nuova pratica</span>
            </Button>
          )}
          <Button
            variant={hasActiveFilters ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5 gap-1.5 relative text-xs"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtri</span>
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Esporta</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV}>CSV (.csv)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportXLSX}>Excel (.xlsx)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isInternal && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              title="Impostazioni pipeline"
              aria-label="Impostazioni pipeline"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Toolbar row 2: brand segment · view toggle · archive · sort ─────── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-background shrink-0">
        {isInternal && (
          <div className="inline-flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {(["all", "enea", "conto_termico"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBrandFilter(b)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-150 ${
                  brandFilter === b
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {b === "all" ? "Tutti" : b === "enea" ? "ENEA" : "Conto Termico"}
              </button>
            ))}
          </div>
        )}

        {isInternal && (
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === "pipeline" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("pipeline")}
              className="h-7 px-2 gap-1 text-xs"
            >
              <Columns3 className="h-3.5 w-3.5" /> Pipeline
            </Button>
            <Button
              variant={viewMode === "tabella" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("tabella")}
              className="h-7 px-2 gap-1 text-xs"
            >
              <List className="h-3.5 w-3.5" /> Tabella
            </Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {isInternal && (
            <button
              onClick={() => setSelectMode((v) => !v)}
              className={`flex items-center gap-1 text-xs transition-colors ${
                selectMode
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Attiva/disattiva modalità selezione multipla"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "Esci selezione" : "Selezione multipla"}
            </button>
          )}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`text-xs transition-colors ${
              showArchived
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {showArchived ? "Nascondi archiviate" : "Archiviate"}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground">
                {sortLabels[sortOption]}
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortOption("recenti")}>Più recenti</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("vecchie")}>Più vecchie</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption("stage")}>Più in stage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── KPI cards (staff only) ────────────────────────────────────────── */}
      {isInternal && kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pt-3 shrink-0">
          <KpiCard label="Fatturato" value={`€ ${kpis.fatturato.toFixed(2)}`} />
          <KpiCard
            label="Incassato"
            value={`€ ${kpis.incassato.toFixed(2)}`}
            color="green"
          />
          <KpiCard
            label="Da incassare"
            value={`€ ${kpis.daIncassare.toFixed(2)}`}
            color="amber"
          />
          <KpiCard label="Mese corrente" value={`€ ${kpis.mese.toFixed(2)}`} />
        </div>
      )}

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-background/80 border-b shrink-0 overflow-x-auto">
        <StatPill label="Attive" value={activePractices.length} />
        <StatPill
          label="Pronte da fare"
          value={pronteDaFare}
          intent={pronteDaFare > 0 ? "warning" : "default"}
        />
        <StatPill
          label="Stale >7g"
          value={staleCount}
          intent={staleCount > 0 ? "danger" : "default"}
        />
        {hasActiveFilters && (
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredPractices.length} filtrate
          </span>
        )}
      </div>

      {/* ── Filters Sheet (right side) ─────────────────────────────────── */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-80 flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-4 border-b">
            <SheetTitle className="text-base">Filtri pipeline</SheetTitle>
            <SheetDescription className="text-xs">
              Filtra le pratiche per data, cliente, stage e operatore.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Nome, cognome, CF, email..."
                  className="pl-8 h-9 text-sm"
                  value={clienteFilter}
                  onChange={(e) => setClienteFilter(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Periodo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Periodo creazione
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Dal</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Al</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Stage */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stage
              </label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Tutti gli stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stage</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Azienda (internal only) */}
            {isInternal && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Azienda
                  </label>
                  <Popover open={aziendaComboboxOpen} onOpenChange={setAziendaComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={aziendaComboboxOpen}
                        className="w-full h-9 justify-between text-sm font-normal"
                      >
                        <span className="truncate">
                          {aziendaFilter === "all"
                            ? "Tutte le aziende"
                            : (allCompaniesFromDB.find((c) => c.id === aziendaFilter)?.ragione_sociale ?? "Azienda")}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca azienda..." className="h-9 text-sm" />
                        <CommandEmpty>Nessuna azienda trovata.</CommandEmpty>
                        <CommandGroup className="max-h-56 overflow-y-auto">
                          <CommandItem
                            value="__all__"
                            onSelect={() => { setAziendaFilter("all"); setAziendaComboboxOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", aziendaFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Tutte le aziende
                          </CommandItem>
                          {allCompaniesFromDB.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.ragione_sociale}
                              onSelect={() => { setAziendaFilter(c.id); setAziendaComboboxOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-3.5 w-3.5", aziendaFilter === c.id ? "opacity-100" : "opacity-0")} />
                              {c.ragione_sociale}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Operatore (internal only) */}
            {isInternal && operators.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Operatore
                  </label>
                  <Select value={operatoreFilter} onValueChange={setOperatoreFilter}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Tutti gli operatori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli operatori</SelectItem>
                      {operators.map((op) => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.nome} {op.cognome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <SheetFooter className="px-5 py-4 border-t flex-row gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => { clearFilters(); }}
              >
                <FilterX className="h-3.5 w-3.5" />
                Rimuovi ({activeFilterCount})
              </Button>
            )}
            <SheetClose asChild>
              <Button size="sm" className="flex-1">
                Mostra {filteredPractices.length} pratiche
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Board */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : practicesError ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Errore di caricamento</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Non è stato possibile caricare le pratiche. Controlla la connessione e riprova.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Ricarica pagina
          </Button>
        </div>
      ) : deduped.length === 0 ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Columns className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Nessuno stage configurato</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Configura gli stage della pipeline per iniziare a gestire le pratiche nel Kanban.
            </p>
          </div>
          {isInternal && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Configura pipeline
            </Button>
          )}
        </div>
      ) : viewMode === "tabella" && isInternal ? (
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <PracticeTable
            practices={filteredPractices}
            stages={stages}
            onRowClick={setSelectedPractice}
            isInternal={isInternal}
            onUpdatePagamento={(id, stato) =>
              updatePagamentoMutation.mutate({ id, pagamento_stato: stato })
            }
          />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-1 min-h-0 gap-3 overflow-x-auto p-4 pb-6">
            {deduped.map((stage) => {
              const cards = byStage(stage.id);
              const isArchived = stage.stage_type === "archiviate";
              const columnRevenue = isInternal
                ? cards.reduce((sum, p) => sum + (p.guadagno_netto ?? 0), 0)
                : 0;

              return (
                <div
                  key={stage.id}
                  className={`flex flex-col w-72 flex-shrink-0 rounded-lg border transition-opacity ${
                    isArchived ? "bg-muted/20 opacity-60" : "bg-muted/40"
                  }`}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-t-lg"
                    style={{ borderTop: `3px solid ${isArchived ? "#9ca3af" : stage.color}` }}
                  >
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <div className="flex items-center gap-1">
                        <span
                          className={`font-semibold text-xs uppercase tracking-wider truncate ${
                            isArchived ? "text-muted-foreground" : "text-foreground/80"
                          }`}
                        >
                          {isInternal ? stage.name : (stage.name_reseller ?? stage.name)}
                        </span>
                        {!isInternal && stage.tooltip_text && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground/50 shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="text-xs">{stage.tooltip_text}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      {isInternal && columnRevenue > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          € {columnRevenue.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] px-1.5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                        isArchived
                          ? "bg-muted text-muted-foreground"
                          : "text-white"
                      }`}
                      style={isArchived ? {} : { backgroundColor: stage.color }}
                    >
                      {cards.length}
                    </span>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-col gap-2 p-2 flex-1 min-h-[80px] overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-primary/5" : ""
                        }`}
                      >
                        {cards.length === 0 && !snapshot.isDraggingOver ? (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/40 text-xs">
                            <MoveHorizontal className="h-6 w-6 mb-1" />
                            Nessuna pratica
                          </div>
                        ) : (
                          cards.map((practice, index) => (
                            <PracticeCard
                              key={practice.id}
                              practice={practice}
                              index={index}
                              isInternal={isInternal}
                              operatorMap={operatorMap}
                              onOpen={setSelectedPractice}
                              selectable={isInternal && selectMode}
                              isSelected={selectedIds.has(practice.id)}
                              onToggleSelect={toggleSelect}
                            />
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Archive confirm dialog */}
      <AlertDialog
        open={!!archiveConfirm}
        onOpenChange={(o) => !o && setArchiveConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiviare la pratica?</AlertDialogTitle>
            <AlertDialogDescription>
              La pratica verrà spostata in "Archiviate". Puoi sempre ripristinarla in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveConfirm) doMove(archiveConfirm);
                setArchiveConfirm(null);
              }}
            >
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Documenti mancanti — dialog con textarea. Chiusura (X/ESC/backdrop) =
          annulla lo spostamento (doMove non viene chiamato, la pratica resta
          nella colonna originale al re-render). */}
      <Dialog open={!!docMissPopup} onOpenChange={(o) => { if (!o) setDocMissPopup(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Documenti mancanti — specifica cosa serve</DialogTitle>
            <DialogDescription>
              Descrivi quali documenti servono per completare la pratica. Verranno mostrati
              al cliente nella sua area riservata. Chiudi questo popup per annullare lo
              spostamento e tenere la pratica nella colonna attuale.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={docMissText}
              onChange={(e) => setDocMissText(e.target.value)}
              placeholder="Es. Certificato di trasmittanza, libretto impianto, scheda tecnica prodotto..."
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDocMissPopup(null)}
            >
              Annulla
            </Button>
            <Button
              disabled={!docMissText.trim()}
              onClick={() => {
                if (docMissPopup) {
                  doMove({ ...docMissPopup, noteDocMancanti: docMissText });
                  setDocMissPopup(null);
                }
              }}
            >
              Conferma e sposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Practice detail sheet — sempre risolto via lookup live in `practices` per
          evitare snapshot stale dopo upload/edit. selectedPractice tiene SOLO l'id. */}
      <PracticeDetailSheet
        practice={
          selectedPractice
            ? (practices.find((p) => p.id === selectedPractice.id) ?? selectedPractice)
            : null
        }
        isInternal={isInternal}
        stages={stages}
        allPractices={practices}
        onClose={() => setSelectedPractice(null)}
        onMove={handleMoveFromSheet}
        onOpenChat={(p) => setChatDialogPractice(p)}
      />

      <PipelineSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Floating bulk-action bar */}
      {isInternal && selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background shadow-lg px-4 py-3">
          <span className="text-sm font-medium">
            {selectedIds.size} {selectedIds.size === 1 ? "selezionata" : "selezionate"}
          </span>
          <Separator orientation="vertical" className="h-6" />
          <Select
            value={bulkMoveStageId}
            onValueChange={(stageId) => {
              // Guard contro double-click rapido durante mutation in flight:
              // senza, l'utente che clicca rapidamente 2 stages diversi
              // triggera 2 mutate() in parallelo → race condition (la
              // seconda può completare prima della prima, ordering
              // inconsistente nel DB). Il Select disabled chiude la
              // tendina durante la mutation e ignora click successivi.
              if (bulkMoveMutation.isPending) return;
              setBulkMoveStageId(stageId);
              bulkMoveMutation.mutate({ ids: Array.from(selectedIds), stageId });
            }}
            disabled={bulkMoveMutation.isPending}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder={bulkMoveMutation.isPending ? "Spostamento…" : "Sposta in..."} />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setBulkSendChannel("whatsapp")}
            title="Invia WhatsApp a tutte le pratiche selezionate"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setBulkSendChannel("email")}
            title="Invia email a tutte le pratiche selezionate"
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setBulkArchiveConfirm(true)}
            disabled={bulkArchiveMutation.isPending}
          >
            <Archive className="h-3.5 w-3.5" />
            Archivia
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" />
            Annulla
          </Button>
        </div>
      )}

      {/* Practice chat dialog: WhatsApp chat + Email log per UNA pratica */}
      {chatDialogPractice && (
        <PracticeChatDialog
          practiceId={chatDialogPractice.id}
          clienteNome={chatDialogPractice.cliente_nome}
          clienteCognome={chatDialogPractice.cliente_cognome}
          clienteTelefono={chatDialogPractice.cliente_telefono}
          clienteEmail={chatDialogPractice.cliente_email}
          formToken={chatDialogPractice.form_token}
          onClose={() => setChatDialogPractice(null)}
        />
      )}

      {/* Bulk send dialog (WhatsApp/Email) — Channel guida il default tab */}
      {bulkSendChannel && (
        <BulkSendDialog
          defaultChannel={bulkSendChannel}
          practices={practices
            .filter((p) => selectedIds.has(p.id))
            .map((p) => ({
              id: p.id,
              cliente_nome: p.cliente_nome,
              cliente_cognome: p.cliente_cognome,
              cliente_telefono: p.cliente_telefono,
              cliente_email: p.cliente_email,
              form_token: p.form_token,
            }))}
          onClose={() => setBulkSendChannel(null)}
        />
      )}

      {/* Bulk archive confirm dialog */}
      <AlertDialog open={bulkArchiveConfirm} onOpenChange={setBulkArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archiviare {selectedIds.size} {selectedIds.size === 1 ? "pratica" : "pratiche"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le pratiche selezionate verranno spostate in archivio. Puoi sempre ripristinarle in seguito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkArchiveMutation.mutate({ ids: Array.from(selectedIds) });
              }}
              disabled={bulkArchiveMutation.isPending}
            >
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── PracticeTable (flat table view) ──────────────────────────────────────────

function PracticeTable({
  practices,
  stages,
  onRowClick,
  isInternal,
  onUpdatePagamento,
}: {
  practices: PracticeWithRelations[];
  stages: PipelineStage[];
  onRowClick: (p: PracticeWithRelations) => void;
  isInternal: boolean;
  onUpdatePagamento?: (id: string, pagamento_stato: string) => void;
}) {
  const stageMap = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach((s) => m.set(s.id, isInternal ? s.name : (s.name_reseller ?? s.name)));
    return m;
  }, [stages, isInternal]);

  const colSpan = isInternal ? 9 : 5;

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Cliente</th>
            {isInternal && <th className="text-left px-3 py-2">Azienda</th>}
            <th className="text-left px-3 py-2">Brand</th>
            <th className="text-left px-3 py-2">Stage</th>
            <th className="text-left px-3 py-2">Prodotto</th>
            {isInternal && <th className="text-left px-3 py-2">Importo</th>}
            {isInternal && <th className="text-left px-3 py-2">Pagamento</th>}
            <th className="text-left px-3 py-2">Creata</th>
            {isInternal && <th className="text-left px-3 py-2">Operatore</th>}
          </tr>
        </thead>
        <tbody>
          {practices.map((p) => (
            <tr
              key={p.id}
              onClick={() => onRowClick(p)}
              className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2 font-medium">
                {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
              </td>
              {isInternal && (
                <td className="px-3 py-2 text-muted-foreground">
                  {p.companies?.ragione_sociale ?? "—"}
                </td>
              )}
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-[10px]">
                  {p.brand === "enea" ? "ENEA" : "Conto Termico"}
                </Badge>
              </td>
              <td className="px-3 py-2 text-xs">
                {p.current_stage_id ? stageMap.get(p.current_stage_id) ?? "—" : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {p.prodotto_installato ?? "—"}
              </td>
              {isInternal && (
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {p.prezzo != null ? `€ ${Number(p.prezzo).toFixed(2)}` : "—"}
                </td>
              )}
              {isInternal && (
                <td
                  className="px-3 py-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${pagamentoBadgeClass(
                        p.pagamento_stato
                      )}`}
                    >
                      {PAGAMENTO_LABELS[p.pagamento_stato ?? "non_pagata"] ?? "—"}
                    </span>
                    {onUpdatePagamento && (
                      <Select
                        value={p.pagamento_stato ?? "non_pagata"}
                        onValueChange={(val) => onUpdatePagamento(p.id, val)}
                      >
                        <SelectTrigger
                          className="h-7 w-[130px] text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAGAMENTO_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-xs">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </td>
              )}
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}
              </td>
              {isInternal && (
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {p.operatore_id ? "assegnato" : "—"}
                </td>
              )}
            </tr>
          ))}
          {practices.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="text-center py-12 text-muted-foreground text-sm">
                Nessuna pratica
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
