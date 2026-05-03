import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  CheckSquare,
  Columns3,
  List,
  ExternalLink,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { it } from "date-fns/locale";
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

  useEffect(() => {
    supabase.storage
      .from("enea-documents")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  if (!url) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
        <Download className="h-3.5 w-3.5 shrink-0 opacity-40" />
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
    setSubmitting(true);
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
    setSubmitting(false);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Chiamata registrata" });
      setShowCallForm(false);
      setCallNotes("");
      setCallOutcome("risposta_ottenuta");
      refetch();
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
  const conclusaInputRef = useRef<HTMLInputElement>(null);

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
    let financialUpdates: Partial<EneaPractice> = {};
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
    await updatePractice.mutateAsync({
      id: practice.id,
      updates: {
        note: editNote || null,
        note_interne: isInternal ? editNoteInterne || null : undefined,
        documenti_mancanti: editDocs,
        operatore_id: isInternal ? editOperatoreId || null : undefined,
        ...financialUpdates,
      },
    });
    toast({ title: "Pratica aggiornata" });
    setEditMode(false);
  }

  async function handleArchive() {
    if (!practice) return;
    if (practice.archived_at) {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { archived_at: null },
      });
      toast({ title: "Pratica ripristinata" });
    } else {
      await updatePractice.mutateAsync({
        id: practice.id,
        updates: { archived_at: new Date().toISOString() },
      });
      toast({ title: "Pratica archiviata" });
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
    await supabase.storage.from("enea-documents").remove([path]);
    const updated = (practice.pratica_enea_conclusa_urls ?? []).filter((p) => p !== path);
    await updatePractice.mutateAsync({
      id: practice.id,
      updates: { pratica_enea_conclusa_urls: updated },
    });
    toast({ title: "File rimosso" });
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

                {/* Email */}
                {practice.cliente_email ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a href={`mailto:${practice.cliente_email}`}>
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </Button>
                )}

                {/* WhatsApp */}
                {practice.cliente_telefono ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a
                      href={`https://wa.me/${practice.cliente_telefono.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled>
                    <Phone className="h-3.5 w-3.5" />
                    WhatsApp
                  </Button>
                )}

                {/* Apri scheda completa (PraticaDetail legacy con upload+timeline+messaggi) */}
                {/* Scheda completa — solo staff (legacy /pratiche/:id route) */}
                {isInternal && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => window.open(`/pratiche/${practice.id}`, "_blank")}
                    title="Apri scheda completa con upload documenti, timeline e messaggi"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Scheda completa
                  </Button>
                )}

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
                    <Select value={editOperatoreId} onValueChange={setEditOperatoreId}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Nessun operatore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nessun operatore</SelectItem>
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
              Dati prodotto · {prodottoTipo === "infissi" ? "Infissi" : prodottoTipo === "schermature" ? "Schermature solari" : "Impianto termico"}
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
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={(e) => {
            if (snapshot.isDragging) return;
            if (selectable) {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect?.(practice.id);
              return;
            }
            onOpen(practice);
          }}
          className={`group relative rounded-lg bg-background border p-3 space-y-2 text-sm transition-all duration-150 ${
            selectable ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
          } ${
            snapshot.isDragging
              ? "shadow-xl ring-2 ring-primary/30 rotate-1"
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
      )}
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

  const { data: stages = [] } = usePipelineStages(
    brandFilter !== "all" ? brandFilter : undefined
  );

  const { data: practices = [], isLoading, isError: practicesError } = useEneaPractices({
    brand: brandFilter !== "all" ? brandFilter : undefined,
    search: search.length > 1 ? search : undefined,
    includeArchived: showArchived,
  });

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

  const operatorMap = Object.fromEntries(
    operators.map((o) => [o.id, `${o.nome} ${o.cognome}`.trim()])
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

  // Stats
  const activePractices = practices.filter((p) => !p.archived_at);
  const pronteDaFare = activePractices.filter(
    (p) => p.pipeline_stages?.stage_type === "pronte_da_fare"
  ).length;
  const staleCount = activePractices.filter(
    (p) => daysAgo(p.updated_at) > 7
  ).length;

  // Apply all client-side filters
  const filteredPractices = practices.filter((p) => {
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
  });

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
  // For internal users this is the identity mapping.
  // For resellers, stages sharing the same `name_reseller` collapse into a single
  // virtual column whose id is the first (by order_index) stage of the group.
  const stageToColumn = useMemo(() => {
    const map = new Map<string, string>();
    if (isInternal) {
      for (const s of stages) map.set(s.id, s.id);
      return map;
    }
    const groups = new Map<string, string>(); // name_reseller key → virtual column id
    for (const s of stages) {
      if (s.is_visible_reseller === false) continue;
      const key = s.name_reseller ?? s.name;
      if (!groups.has(key)) groups.set(key, s.id);
      map.set(s.id, groups.get(key)!);
    }
    return map;
  }, [stages, isInternal]);

  const byStage = useCallback(
    (stageId: string) => {
      let cards: typeof filteredPractices;
      if (isInternal) {
        cards = filteredPractices.filter((p) => p.current_stage_id === stageId);
      } else {
        // For resellers, include all practices whose current stage maps to the
        // same virtual column as `stageId`.
        const targetColumn = stageToColumn.get(stageId);
        cards = filteredPractices.filter((p) => {
          if (!p.current_stage_id) return false;
          const pColumn = stageToColumn.get(p.current_stage_id);
          return pColumn !== undefined && pColumn === targetColumn;
        });
      }
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
          // Salva nota documenti mancanti se presente
          if (newStage?.stage_type === "documenti_mancanti" && noteDocMancanti?.trim()) {
            await updatePracticeForDocMiss.mutateAsync({
              id: practiceId,
              updates: { note_documenti_mancanti: noteDocMancanti.trim() },
            });
          }
          // Imposta archivio_path quando la pratica viene inviata al cliente
          if (newStage?.stage_type === "da_inviare") {
            const practice = practices.find((p) => p.id === practiceId);
            if (practice) {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, "0");
              const clientName = `${practice.cliente_nome ?? ""}_${practice.cliente_cognome ?? ""}`.replace(/\s+/g, "_").toLowerCase();
              const archivioPath = `archivio/${year}/${month}/${clientName}_${practiceId}/`;
              await updatePracticeForDocMiss.mutateAsync({
                id: practiceId,
                updates: { archivio_path: archivioPath },
              });
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

  // ── Auto-archive: sposta in "archiviate" le pratiche in "da_inviare" da >10 giorni ──
  // Ref to prevent firing mutations multiple times for the same practice before the DB propagates.
  const autoArchivedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Solo staff può eseguire UPDATE su enea_practices via RLS — per rivenditori/azienda
    // questo effect produrrebbe mutation fallite silenti + toast fuorviante.
    if (!isInternal) return;
    if (!stages.length || !practices.length) return;
    const daInviareStage = stages.find((s) => s.stage_type === "da_inviare");
    const archiviateStage = stages.find((s) => s.stage_type === "archiviate");
    if (!daInviareStage || !archiviateStage) return;

    const toArchive = practices.filter(
      (p) =>
        p.current_stage_id === daInviareStage.id &&
        !p.archived_at &&
        daysAgo(p.updated_at) >= 10 &&
        !autoArchivedRef.current.has(p.id)
    );

    toArchive.forEach((p) => {
      autoArchivedRef.current.add(p.id);
      moveStage.mutate({
        practiceId: p.id,
        newStageId: archiviateStage.id,
        oldStageName: daInviareStage.name,
        newStageName: archiviateStage.name,
        userId: user?.id ?? "",
      });
    });

    if (toArchive.length > 0) {
      toast({
        title: `${toArchive.length} ${toArchive.length === 1 ? "pratica archiviata" : "pratiche archiviate"} automaticamente`,
        description: "Pratiche in 'Pratica inviata' da più di 10 giorni.",
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

      {/* Documenti mancanti — dialog obbligatorio con textarea */}
      <Dialog open={!!docMissPopup} onOpenChange={(o) => { if (!o && !docMissText.trim()) return; if (!o) setDocMissPopup(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Documenti mancanti — specifica cosa serve</DialogTitle>
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
          <DialogFooter>
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
              setBulkMoveStageId(stageId);
              bulkMoveMutation.mutate({ ids: Array.from(selectedIds), stageId });
            }}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Sposta in..." />
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
            Annulla selezione
          </Button>
        </div>
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
