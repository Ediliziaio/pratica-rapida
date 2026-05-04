import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  Pencil,
  GripVertical,
  Save,
  X,
  ChevronRight,
  FormInput as FormInputIcon,
  FileText,
  Eye,
  EyeOff,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Link,
  ChevronDown,
  CircleDot,
  ListChecks,
  ToggleLeft,
  Hash,
  Calendar,
  Clock,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type {
  FormField,
  FormFieldOption,
  FormFieldType,
  FormModule,
  FormSchema,
  FormStep,
  VisibleIf,
} from "@/types/form-module";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FIELD_TYPE_CATALOG: Array<{
  type: FormFieldType;
  label: string;
  description: string;
  icon: LucideIcon;
  category: "Testo" | "Scelta" | "Numerico" | "Data e ora" | "Avanzato";
}> = [
  // Testo
  { type: "text", label: "Testo breve", description: "Una riga, max ~100 caratteri", icon: Type, category: "Testo" },
  { type: "textarea", label: "Testo lungo", description: "Più righe, fino a paragrafi", icon: AlignLeft, category: "Testo" },
  { type: "email", label: "Email", description: "Validazione formato email", icon: Mail, category: "Testo" },
  { type: "phone", label: "Telefono", description: "Numero di telefono", icon: Phone, category: "Testo" },
  { type: "url", label: "URL", description: "Link validato (https://...)", icon: Link, category: "Testo" },

  // Scelta
  { type: "select", label: "Scelta singola (dropdown)", description: "Menu a tendina, 1 valore", icon: ChevronDown, category: "Scelta" },
  { type: "radio", label: "Scelta singola (radio)", description: "Opzioni visibili, 1 valore", icon: CircleDot, category: "Scelta" },
  { type: "multi_select", label: "Scelta multipla", description: "Più valori selezionabili (checkbox)", icon: ListChecks, category: "Scelta" },
  { type: "boolean", label: "Sì/No", description: "Toggle vero/falso", icon: ToggleLeft, category: "Scelta" },

  // Numerico
  { type: "number", label: "Numero", description: "Intero o decimale, con min/max", icon: Hash, category: "Numerico" },

  // Data e ora
  { type: "date", label: "Data", description: "Selezione di una data", icon: Calendar, category: "Data e ora" },
  { type: "time", label: "Ora", description: "Selezione di un orario", icon: Clock, category: "Data e ora" },

  // Avanzato
  { type: "upload", label: "Caricamento file", description: "PDF, immagini, max 20MB", icon: Upload, category: "Avanzato" },
  { type: "array", label: "Lista dinamica", description: "Sotto-form ripetibile (es. + Aggiungi)", icon: Plus, category: "Avanzato" },
];

const FIELD_TYPE_CATEGORIES = ["Testo", "Scelta", "Numerico", "Data e ora", "Avanzato"] as const;

function emptySchema(): FormSchema {
  return { steps: [] };
}

function totalFields(schema: FormSchema): number {
  return schema.steps.reduce((sum, s) => sum + (s.fields?.length ?? 0), 0);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// `from("form_modules")` — la tabella non è (ancora) nei types generati.
// Cast a `any` localmente per evitare narrow typing su una tabella nuova.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from("form_modules" as any);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Moduli() {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (editingId) {
    return (
      <ModuloEditor
        moduleId={editingId}
        onBack={() => setEditingId(null)}
      />
    );
  }
  return <ModuliList onEdit={(id) => setEditingId(id)} />;
}

// ─── List view ──────────────────────────────────────────────────────────────

function ModuliList({ onEdit }: { onEdit: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: modules = [], isLoading, error: loadError } = useQuery<FormModule[]>({
    queryKey: ["form-modules"],
    queryFn: async () => {
      const { data, error } = await table()
        .select("*")
        .order("order_index");
      if (error) throw error;
      return (data as unknown as FormModule[]) ?? [];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleActiveMut = useMutation({
    mutationFn: async (vars: { id: string; is_active: boolean }) => {
      const { error } = await table()
        .update({ is_active: vars.is_active })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-modules"] }),
    onError: (e) =>
      toast({ variant: "destructive", title: "Errore", description: String(e) }),
  });

  const createMut = useMutation({
    mutationFn: async (vars: { name: string; slug: string }) => {
      const maxOrder =
        modules.length > 0
          ? Math.max(...modules.map((m) => m.order_index)) + 100
          : 100;
      const { data, error } = await table()
        .insert({
          name: vars.name,
          slug: vars.slug,
          description: null,
          prodotto_match: [],
          schema: emptySchema(),
          is_active: true,
          order_index: maxOrder,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["form-modules"] });
      toast({ title: "Modulo creato" });
      if (created?.id) onEdit(created.id);
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Errore", description: String(e) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-modules"] });
      toast({ title: "Modulo eliminato" });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Errore", description: String(e) }),
  });

  const duplicateMut = useMutation({
    mutationFn: async (m: FormModule) => {
      // Find a slug that doesn't collide: "<slug>-copia", "<slug>-copia-2", ...
      const existing = new Set(modules.map((x) => x.slug));
      let newSlug = `${m.slug}-copia`;
      let i = 2;
      while (existing.has(newSlug)) {
        newSlug = `${m.slug}-copia-${i++}`;
      }
      const maxOrder =
        modules.length > 0
          ? Math.max(...modules.map((x) => x.order_index)) + 100
          : 100;
      const { error } = await table().insert({
        slug: newSlug,
        name: `${m.name} (copia)`,
        description: m.description,
        prodotto_match: m.prodotto_match,
        schema: m.schema,
        is_active: false,
        order_index: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-modules"] });
      toast({ title: "Modulo duplicato" });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Errore", description: String(e) }),
  });

  // ── New module dialog ─────────────────────────────────────────────────────

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  function openNew() {
    setNewName("");
    setNewSlug("");
    setNewOpen(true);
  }

  function submitNew() {
    if (!newName.trim() || !newSlug.trim()) {
      toast({
        variant: "destructive",
        title: "Campi mancanti",
        description: "Nome e slug sono obbligatori",
      });
      return;
    }
    createMut.mutate({ name: newName.trim(), slug: newSlug.trim() });
    setNewOpen(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <FormInputIcon className="h-7 w-7 text-primary" />
            Moduli Form
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci i moduli del form pubblico cliente senza toccare codice.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nuovo modulo
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Caricamento moduli…
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive font-medium">
              Impossibile caricare i moduli.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {String((loadError as Error)?.message ?? loadError)}
            </p>
          </CardContent>
        </Card>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nessun modulo ancora creato.</p>
            <Button className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" /> Crea il primo modulo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <ModuleCard
              key={m.id}
              m={m}
              onEdit={() => onEdit(m.id)}
              onDuplicate={() => duplicateMut.mutate(m)}
              onDelete={() => deleteMut.mutate(m.id)}
              onToggleActive={(v) =>
                toggleActiveMut.mutate({ id: m.id, is_active: v })
              }
            />
          ))}
        </div>
      )}

      {/* New module dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo modulo</DialogTitle>
            <DialogDescription>
              Crea un modulo vuoto. Potrai aggiungere step e campi nell&apos;editor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome modulo</Label>
              <Input
                value={newName}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewName(v);
                  // Auto-slug se non già modificato
                  setNewSlug((curr) =>
                    curr === slugify(newName) || curr === "" ? slugify(v) : curr,
                  );
                }}
                placeholder="es. ENEA — Infissi"
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="es. enea-infissi"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identificatore univoco, solo lettere minuscole e trattini.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Annulla
            </Button>
            <Button onClick={submitNew}>Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleCard({
  m,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
}: {
  m: FormModule;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleActive: (v: boolean) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stepsCount = m.schema?.steps?.length ?? 0;
  const fieldsCount = m.schema ? totalFields(m.schema) : 0;

  return (
    <Card className={m.is_active ? "" : "opacity-70"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{m.name}</CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
              {m.slug}
            </p>
          </div>
          <Switch checked={m.is_active} onCheckedChange={onToggleActive} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {m.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {m.description}
          </p>
        )}

        {m.prodotto_match && m.prodotto_match.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.prodotto_match.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{stepsCount}</strong> step
          </span>
          <span>·</span>
          <span>
            <strong className="text-foreground">{fieldsCount}</strong> campi
          </span>
          <span>·</span>
          {m.is_active ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <Eye className="h-3 w-3" /> Attivo
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <EyeOff className="h-3 w-3" /> Disattivato
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={onEdit} className="flex-1 gap-1">
            <Pencil className="h-3.5 w-3.5" /> Edita
          </Button>
          <Button size="sm" variant="outline" onClick={onDuplicate} className="gap-1">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmDelete(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il modulo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{m.name}</strong>. L&apos;azione è
              irreversibile e disattiverà il form pubblico per i prodotti
              corrispondenti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function ModuloEditor({
  moduleId,
  onBack,
}: {
  moduleId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: original, isLoading } = useQuery<FormModule | null>({
    queryKey: ["form-module", moduleId],
    queryFn: async () => {
      const { data, error } = await table()
        .select("*")
        .eq("id", moduleId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as FormModule) ?? null;
    },
  });

  // Local working copy
  const [draft, setDraft] = useState<FormModule | null>(null);
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);

  // Sync once when original loads (or whenever the underlying module id changes).
  // Effect (not render-time setState) avoids React state-update-during-render warnings.
  useEffect(() => {
    if (original) {
      setDraft({
        ...original,
        schema: original.schema ?? emptySchema(),
      });
      setSelectedStepIdx(0);
    }
    // We intentionally watch the id only: re-syncing on every `original` object
    // identity change would clobber the user's in-progress edits after refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original?.id]);

  const updateMut = useMutation({
    mutationFn: async (m: FormModule) => {
      const { error } = await table()
        .update({
          name: m.name,
          slug: m.slug,
          description: m.description,
          prodotto_match: m.prodotto_match,
          schema: m.schema,
          is_active: m.is_active,
        })
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-modules"] });
      qc.invalidateQueries({ queryKey: ["form-module", moduleId] });
      toast({ title: "Modulo salvato" });
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Errore", description: String(e) }),
  });

  if (isLoading || !draft) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-muted-foreground">
          Caricamento modulo…
        </div>
      </div>
    );
  }

  // ── Mutations on draft (in-memory) ────────────────────────────────────────

  function setSchema(updater: (s: FormSchema) => FormSchema) {
    setDraft((d) => (d ? { ...d, schema: updater(d.schema) } : d));
  }

  function addStep() {
    let newIdx = 0;
    setSchema((s) => {
      newIdx = s.steps.length;
      return {
        steps: [
          ...s.steps,
          {
            key: `step_${s.steps.length + 1}`,
            label: `Nuovo step ${s.steps.length + 1}`,
            fields: [],
          },
        ],
      };
    });
    setSelectedStepIdx(newIdx);
  }

  function deleteStep(idx: number) {
    setSchema((s) => ({
      steps: s.steps.filter((_, i) => i !== idx),
    }));
    setSelectedStepIdx((i) => Math.max(0, i >= idx ? i - 1 : i));
  }

  function updateStep(idx: number, patch: Partial<FormStep>) {
    setSchema((s) => ({
      steps: s.steps.map((st, i) => (i === idx ? { ...st, ...patch } : st)),
    }));
  }

  function moveStep(from: number, to: number) {
    setSchema((s) => {
      const arr = [...s.steps];
      const [it] = arr.splice(from, 1);
      arr.splice(to, 0, it);
      return { steps: arr };
    });
    if (selectedStepIdx === from) setSelectedStepIdx(to);
  }

  function onStepDragEnd(r: DropResult) {
    if (!r.destination) return;
    if (r.source.index === r.destination.index) return;
    moveStep(r.source.index, r.destination.index);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const currentStep = draft.schema.steps[selectedStepIdx];

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Torna alla lista
            </Button>
            <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <h1 className="text-lg font-semibold truncate hidden sm:block">
              {draft.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Switch
                checked={draft.is_active}
                onCheckedChange={(v) =>
                  setDraft((d) => (d ? { ...d, is_active: v } : d))
                }
              />
              <span className="text-sm">{draft.is_active ? "Attivo" : "Disattivo"}</span>
            </div>
            <Button
              onClick={() => draft && updateMut.mutate(draft)}
              disabled={updateMut.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {updateMut.isPending ? "Salvataggio…" : "Salva modulo"}
            </Button>
          </div>
        </div>
      </div>

      {/* Module meta */}
      <div className="border-b bg-muted/30 px-4 sm:px-6 py-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, name: e.target.value } : d))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={draft.slug}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, slug: e.target.value } : d))
              }
              className="font-mono"
            />
          </div>
          <div className="lg:col-span-2">
            <Label className="text-xs">Descrizione</Label>
            <Input
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, description: e.target.value || null } : d,
                )
              }
              placeholder="Descrizione opzionale"
            />
          </div>
          <div className="lg:col-span-4">
            <Label className="text-xs">
              Pattern prodotto (match il <code>prodotto_installato</code> della pratica)
            </Label>
            <ChipInput
              value={draft.prodotto_match}
              onChange={(arr) =>
                setDraft((d) => (d ? { ...d, prodotto_match: arr } : d))
              }
              placeholder="es. infiss, serrament — premi Invio per aggiungere"
            />
          </div>
        </div>
      </div>

      {/* Body: sidebar steps + canvas */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Steps sidebar */}
        <aside className="lg:w-72 border-b lg:border-b-0 lg:border-r bg-muted/10 p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Step ({draft.schema.steps.length})
            </h3>
          </div>
          <DragDropContext onDragEnd={onStepDragEnd}>
            <Droppable droppableId="steps-list">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-1"
                >
                  {draft.schema.steps.map((s, i) => (
                    <Draggable key={i} draggableId={`step-${i}`} index={i}>
                      {(p) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className={`flex items-center gap-2 rounded-md border px-2 py-2 cursor-pointer transition-colors ${
                            selectedStepIdx === i
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card hover:bg-muted"
                          }`}
                          onClick={() => setSelectedStepIdx(i)}
                        >
                          <div {...p.dragHandleProps}>
                            <GripVertical
                              className={`h-4 w-4 ${
                                selectedStepIdx === i
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {s.label || s.key}
                            </div>
                            <div
                              className={`text-xs truncate ${
                                selectedStepIdx === i
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {s.fields.length} campi
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 gap-2"
            onClick={addStep}
          >
            <Plus className="h-4 w-4" /> Aggiungi step
          </Button>
        </aside>

        {/* Step canvas */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!currentStep ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Crea il primo step per iniziare a configurare il modulo.</p>
            </div>
          ) : (
            <StepEditor
              step={currentStep}
              onChange={(patch) => updateStep(selectedStepIdx, patch)}
              onDelete={() => deleteStep(selectedStepIdx)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Step editor ────────────────────────────────────────────────────────────

function StepEditor({
  step,
  onChange,
  onDelete,
}: {
  step: FormStep;
  onChange: (patch: Partial<FormStep>) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  function setFields(updater: (arr: FormField[]) => FormField[]) {
    onChange({ fields: updater(step.fields) });
  }

  function addFieldWithType(type: FormFieldType) {
    setFields((arr) => {
      const base: FormField = {
        key: `field_${arr.length + 1}`,
        label: `Nuovo campo ${arr.length + 1}`,
        type,
      };
      if (type === "select" || type === "radio" || type === "multi_select") {
        base.options = [];
      } else if (type === "upload") {
        base.accept = ["pdf"];
        base.max_size_mb = 20;
      } else if (type === "array") {
        base.item_template = { fields: [] };
      }
      return [...arr, base];
    });
  }

  function updateField(idx: number, patch: Partial<FormField>) {
    setFields((arr) =>
      arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  }

  function deleteField(idx: number) {
    setFields((arr) => arr.filter((_, i) => i !== idx));
  }

  function onFieldDragEnd(r: DropResult) {
    if (!r.destination) return;
    if (r.source.index === r.destination.index) return;
    setFields((arr) => {
      const next = [...arr];
      const [it] = next.splice(r.source.index, 1);
      next.splice(r.destination!.index, 0, it);
      return next;
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">Configurazione step</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina step
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Key (interno)</Label>
              <Input
                value={step.key}
                onChange={(e) => onChange({ key: e.target.value })}
                className="font-mono"
              />
            </div>
            <div>
              <Label>Label (mostrato all&apos;utente)</Label>
              <Input
                value={step.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
          </div>
          <VisibleIfEditor
            value={step.visible_if}
            onChange={(v) => onChange({ visible_if: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Campi ({step.fields.length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowTypePicker(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Aggiungi campo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {step.fields.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Nessun campo. Aggiungi il primo campo per iniziare.
            </div>
          ) : (
            <DragDropContext onDragEnd={onFieldDragEnd}>
              <Droppable droppableId="fields-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {step.fields.map((f, i) => (
                      <Draggable
                        key={i}
                        draggableId={`field-${i}`}
                        index={i}
                      >
                        {(p) => (
                          <div
                            ref={p.innerRef}
                            {...p.draggableProps}
                            className="bg-muted/30 rounded-md border"
                          >
                            <FieldRow
                              dragHandleProps={p.dragHandleProps}
                              field={f}
                              onChange={(patch) => updateField(i, patch)}
                              onDelete={() => deleteField(i)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare lo step?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno persi tutti i {step.fields.length} campi configurati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FieldTypePicker
        open={showTypePicker}
        onOpenChange={setShowTypePicker}
        onSelect={addFieldWithType}
      />
    </div>
  );
}

// ─── Field type picker (Dialog visivo a tile) ──────────────────────────────

function FieldTypePicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (type: FormFieldType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scegli il tipo di campo</DialogTitle>
          <DialogDescription>
            Seleziona il tipo che meglio rappresenta il dato che vuoi raccogliere
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {FIELD_TYPE_CATEGORIES.map((cat) => (
            <div key={cat}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {cat}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FIELD_TYPE_CATALOG.filter((t) => t.category === cat).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.type}
                      onClick={() => {
                        onSelect(t.type);
                        onOpenChange(false);
                      }}
                      className="text-left rounded-lg border bg-card hover:border-primary hover:shadow-sm transition-all p-3 group"
                    >
                      <div className="flex items-start gap-2">
                        <div className="rounded-md bg-primary/10 group-hover:bg-primary/20 p-2 shrink-0 transition-colors">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">{t.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {t.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field row (collapsible) ────────────────────────────────────────────────

function FieldRow({
  field,
  onChange,
  onDelete,
  dragHandleProps,
}: {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onDelete: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: any;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-2">
      <div className="flex items-center gap-2">
        <div {...dragHandleProps} className="cursor-grab text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <button
          type="button"
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          onClick={() => setOpen((o) => !o)}
        >
          <Badge variant="outline" className="font-mono text-[10px]">
            {field.type}
          </Badge>
          <span className="font-medium text-sm truncate">{field.label}</span>
          <span className="text-xs text-muted-foreground font-mono truncate">
            ({field.key})
          </span>
          {field.required && (
            <Badge variant="secondary" className="text-[10px]">
              obbligatorio
            </Badge>
          )}
          {field.visible_if && (
            <Badge variant="outline" className="text-[10px]">
              condizionale
            </Badge>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-7 w-7 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 pl-7 pr-2 pb-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Key</Label>
              <Input
                value={field.key}
                onChange={(e) => onChange({ key: e.target.value })}
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={field.type}
                onValueChange={(v) => onChange({ type: v as FormFieldType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_CATEGORIES.map((cat) => (
                    <SelectGroup key={cat}>
                      <SelectLabel>{cat}</SelectLabel>
                      {FIELD_TYPE_CATALOG.filter((t) => t.category === cat).map((t) => (
                        <SelectItem key={t.type} value={t.type}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) =>
                  onChange({ placeholder: e.target.value || undefined })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Help text</Label>
              <Input
                value={field.help_text ?? ""}
                onChange={(e) =>
                  onChange({ help_text: e.target.value || undefined })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={!!field.required}
                onCheckedChange={(v) => onChange({ required: v || undefined })}
              />
              <span className="text-sm">Obbligatorio</span>
            </div>
          </div>

          {/* Type-specific settings */}
          {field.type === "number" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Minimo</Label>
                <Input
                  type="number"
                  value={field.min ?? ""}
                  onChange={(e) =>
                    onChange({
                      min: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Massimo</Label>
                <Input
                  type="number"
                  value={field.max ?? ""}
                  onChange={(e) =>
                    onChange({
                      max: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          )}

          {field.type === "upload" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Dimensione max (MB)</Label>
                <Input
                  type="number"
                  value={field.max_size_mb ?? ""}
                  onChange={(e) =>
                    onChange({
                      max_size_mb:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">
                  Estensioni accettate (separa con virgole, senza punto)
                </Label>
                <Input
                  value={(field.accept ?? []).join(",")}
                  placeholder="pdf,jpg,png"
                  onChange={(e) =>
                    onChange({
                      accept: e.target.value
                        .split(",")
                        .map((s) => s.trim().toLowerCase())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}

          {(field.type === "select" ||
            field.type === "radio" ||
            field.type === "multi_select") && (
            <OptionsEditor
              value={field.options ?? []}
              onChange={(opts) => onChange({ options: opts })}
            />
          )}

          {field.type === "array" && (
            <ItemTemplateEditor
              value={field.item_template?.fields ?? []}
              onChange={(fields) =>
                onChange({ item_template: { fields } })
              }
            />
          )}

          <VisibleIfEditor
            value={field.visible_if}
            onChange={(v) => onChange({ visible_if: v })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Options editor (per select) ────────────────────────────────────────────

function OptionsEditor({
  value,
  onChange,
}: {
  value: FormFieldOption[];
  onChange: (opts: FormFieldOption[]) => void;
}) {
  function add() {
    onChange([...value, { value: "", label: "" }]);
  }
  function update(i: number, patch: Partial<FormFieldOption>) {
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-semibold">Opzioni tendina</Label>
        <Button size="sm" variant="outline" onClick={add} className="gap-1">
          <Plus className="h-3 w-3" /> Opzione
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nessuna opzione. Clicca &ldquo;Opzione&rdquo; per aggiungerne.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="value (interno)"
                value={opt.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className="font-mono text-xs"
              />
              <Input
                placeholder="label (mostrato)"
                value={opt.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => remove(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Item template editor (per array) ───────────────────────────────────────

function ItemTemplateEditor({
  value,
  onChange,
}: {
  value: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  function add() {
    onChange([
      ...value,
      {
        key: `subfield_${value.length + 1}`,
        label: `Sub-campo ${value.length + 1}`,
        type: "text",
      },
    ]);
  }
  function update(i: number, patch: Partial<FormField>) {
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-semibold">
          Template elemento (sotto-campi ripetuti)
        </Label>
        <Button size="sm" variant="outline" onClick={add} className="gap-1">
          <Plus className="h-3 w-3" /> Sub-campo
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nessun sub-campo configurato.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((f, i) => (
            <div
              key={i}
              className="grid gap-2 grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] items-center"
            >
              <Input
                placeholder="key"
                className="font-mono text-xs"
                value={f.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <Input
                placeholder="label"
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Select
                value={f.type}
                onValueChange={(v) => update(i, { type: v as FormFieldType })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.filter((t) => t.value !== "array").map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => remove(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Per condizioni complesse o campi annidati ulteriori, modifica direttamente
        il JSON del modulo via DB.
      </p>
    </div>
  );
}

// ─── Visible-if editor ──────────────────────────────────────────────────────

function VisibleIfEditor({
  value,
  onChange,
}: {
  value: VisibleIf | undefined;
  onChange: (v: VisibleIf | undefined) => void;
}) {
  const enabled = !!value;
  const [type, setType] = useState<"string" | "number" | "boolean">(
    typeof value?.equals === "boolean"
      ? "boolean"
      : typeof value?.equals === "number"
        ? "number"
        : "string",
  );

  function setEnabled(v: boolean) {
    if (v) onChange({ path: "", equals: "" });
    else onChange(undefined);
  }

  function setEqualsRaw(raw: string, t: "string" | "number" | "boolean") {
    if (!value) return;
    let parsed: VisibleIf["equals"] = raw;
    if (t === "boolean") parsed = raw === "true";
    else if (t === "number") parsed = raw === "" ? 0 : Number(raw);
    onChange({ ...value, equals: parsed });
  }

  return (
    <div className="border rounded-md p-3 bg-muted/20">
      <div className="flex items-center gap-2 mb-2">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label className="text-xs font-semibold">
          Mostra solo se… (condizionale)
        </Label>
      </div>
      {enabled && value && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Path (step.field)</Label>
            <Input
              value={value.path}
              placeholder="es. residenza.stesso_indirizzo_lavori"
              className="font-mono"
              onChange={(e) => onChange({ ...value, path: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Tipo valore</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                const next = v as "string" | "number" | "boolean";
                setType(next);
                if (next === "boolean") onChange({ ...value, equals: false });
                else if (next === "number") onChange({ ...value, equals: 0 });
                else onChange({ ...value, equals: "" });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Testo</SelectItem>
                <SelectItem value="number">Numero</SelectItem>
                <SelectItem value="boolean">Sì/No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Equals</Label>
            {type === "boolean" ? (
              <Select
                value={String(value.equals)}
                onValueChange={(v) => setEqualsRaw(v, "boolean")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Vero</SelectItem>
                  <SelectItem value="false">Falso</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={type === "number" ? "number" : "text"}
                value={String(value.equals ?? "")}
                onChange={(e) => setEqualsRaw(e.target.value, type)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chip input ─────────────────────────────────────────────────────────────

function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...value, t]);
    setDraft("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  // Memo unused; kept for clarity
  const list = useMemo(() => value, [value]);

  return (
    <div className="border rounded-md px-2 py-1.5 bg-card flex flex-wrap items-center gap-1.5 min-h-[2.25rem]">
      {list.map((chip, i) => (
        <Badge key={chip + i} variant="secondary" className="gap-1">
          {chip}
          <button
            type="button"
            onClick={() => remove(i)}
            className="hover:text-destructive ml-0.5"
            aria-label={`Rimuovi ${chip}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            remove(value.length - 1);
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

