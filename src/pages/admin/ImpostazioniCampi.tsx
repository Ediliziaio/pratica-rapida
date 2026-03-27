import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  Copy, Check, FolderOpen, Plus, Pencil, Trash2, Search, Tag, Database, X,
} from "lucide-react";
import type { CustomField, CustomFieldType, CustomFieldEntity } from "@/integrations/supabase/types";

// ─── Entity config ────────────────────────────────────────────────────────────

type EntityConfig = {
  label: string;
  prefix: string;
  color: string; // tailwind classes for badge
};

const ENTITY_CONFIG: Record<CustomFieldEntity, EntityConfig> = {
  contatto:      { label: "Contatto",      prefix: "contact",  color: "bg-blue-100 text-blue-700" },
  azienda:       { label: "Impresa",        prefix: "business", color: "bg-violet-100 text-violet-700" },
  pratica:       { label: "Pratica",        prefix: "pratica",  color: "bg-green-100 text-green-700" },
  enea_practice: { label: "ENEA",           prefix: "enea",     color: "bg-orange-100 text-orange-700" },
  reseller:      { label: "Rivenditore",    prefix: "reseller", color: "bg-teal-100 text-teal-700" },
  cliente:       { label: "Cliente",        prefix: "cliente",  color: "bg-pink-100 text-pink-700" },
};

const ALL_ENTITIES = Object.keys(ENTITY_CONFIG) as CustomFieldEntity[];

// ─── System fields (hardcoded, read-only) ────────────────────────────────────

interface SystemField {
  id: string; // synthetic
  entity: CustomFieldEntity;
  field_label: string;
  field_key: string;
  folder: string;
  is_system: true;
}

const SYSTEM_FIELDS: SystemField[] = [
  // CONTATTO
  { id: "sys_contact_first_name",   entity: "contatto", field_label: "Nome",           field_key: "contact.first_name",      folder: "Informazioni Contatto" },
  { id: "sys_contact_last_name",    entity: "contatto", field_label: "Cognome",         field_key: "contact.last_name",       folder: "Informazioni Contatto" },
  { id: "sys_contact_full_name",    entity: "contatto", field_label: "Nome Completo",   field_key: "contact.full_name",       folder: "Informazioni Contatto" },
  { id: "sys_contact_email",        entity: "contatto", field_label: "Email",           field_key: "contact.email",           folder: "Informazioni Contatto" },
  { id: "sys_contact_phone",        entity: "contatto", field_label: "Telefono",        field_key: "contact.phone",           folder: "Informazioni Contatto" },
  { id: "sys_contact_address",      entity: "contatto", field_label: "Indirizzo",       field_key: "contact.address",         folder: "Informazioni Contatto" },
  { id: "sys_contact_city",         entity: "contatto", field_label: "Città",           field_key: "contact.city",            folder: "Informazioni Contatto" },
  { id: "sys_contact_postal_code",  entity: "contatto", field_label: "CAP",             field_key: "contact.postal_code",     folder: "Informazioni Contatto" },
  { id: "sys_contact_cf",           entity: "contatto", field_label: "Codice Fiscale",  field_key: "contact.codice_fiscale",  folder: "Informazioni Contatto" },
  // AZIENDA
  { id: "sys_biz_name",             entity: "azienda",  field_label: "Ragione Sociale", field_key: "business.name",           folder: "Impresa Info" },
  { id: "sys_biz_vat",              entity: "azienda",  field_label: "P.IVA",           field_key: "business.vat",            folder: "Impresa Info" },
  { id: "sys_biz_email",            entity: "azienda",  field_label: "Email",           field_key: "business.email",          folder: "Impresa Info" },
  { id: "sys_biz_phone",            entity: "azienda",  field_label: "Telefono",        field_key: "business.phone",          folder: "Impresa Info" },
  { id: "sys_biz_website",          entity: "azienda",  field_label: "Sito Web",        field_key: "business.website",        folder: "Impresa Info" },
  { id: "sys_biz_address",          entity: "azienda",  field_label: "Indirizzo",       field_key: "business.address",        folder: "Impresa Info" },
  { id: "sys_biz_city",             entity: "azienda",  field_label: "Città",           field_key: "business.city",           folder: "Impresa Info" },
  { id: "sys_biz_postal_code",      entity: "azienda",  field_label: "CAP",             field_key: "business.postal_code",    folder: "Impresa Info" },
  { id: "sys_biz_country",          entity: "azienda",  field_label: "Paese",           field_key: "business.country",        folder: "Impresa Info" },
  { id: "sys_biz_fiscal",           entity: "azienda",  field_label: "Codice Fiscale",  field_key: "business.fiscal_code",    folder: "Impresa Info" },
  { id: "sys_biz_desc",             entity: "azienda",  field_label: "Descrizione",     field_key: "business.description",    folder: "Impresa Info" },
  // PRATICA
  { id: "sys_pratica_titolo",       entity: "pratica",  field_label: "Titolo",          field_key: "pratica.titolo",          folder: "Info Pratica" },
  { id: "sys_pratica_tipo",         entity: "pratica",  field_label: "Tipo",            field_key: "pratica.tipo",            folder: "Info Pratica" },
  { id: "sys_pratica_stato",        entity: "pratica",  field_label: "Stato",           field_key: "pratica.stato",           folder: "Info Pratica" },
  { id: "sys_pratica_prezzo",       entity: "pratica",  field_label: "Prezzo",          field_key: "pratica.prezzo",          folder: "Info Pratica" },
  { id: "sys_pratica_created_at",   entity: "pratica",  field_label: "Data Creazione",  field_key: "pratica.created_at",      folder: "Info Pratica" },
  { id: "sys_pratica_note",         entity: "pratica",  field_label: "Note",            field_key: "pratica.note",            folder: "Info Pratica" },
  // ENEA
  { id: "sys_enea_cliente_nome",    entity: "enea_practice", field_label: "Cliente Nome",    field_key: "enea.cliente_nome",         folder: "ENEA Info" },
  { id: "sys_enea_cliente_cognome", entity: "enea_practice", field_label: "Cliente Cognome", field_key: "enea.cliente_cognome",      folder: "ENEA Info" },
  { id: "sys_enea_cf",              entity: "enea_practice", field_label: "Codice Fiscale",  field_key: "enea.codice_fiscale",       folder: "ENEA Info" },
  { id: "sys_enea_brand",           entity: "enea_practice", field_label: "Brand",           field_key: "enea.brand",                folder: "ENEA Info" },
  { id: "sys_enea_indirizzo",       entity: "enea_practice", field_label: "Indirizzo",       field_key: "enea.indirizzo_intervento", folder: "ENEA Info" },
  { id: "sys_enea_guadagno",        entity: "enea_practice", field_label: "Guadagno Netto",  field_key: "enea.guadagno_netto",       folder: "ENEA Info" },
  // RIVENDITORE
  { id: "sys_res_name",             entity: "reseller", field_label: "Ragione Sociale", field_key: "reseller.name",           folder: "Rivenditore Info" },
  { id: "sys_res_email",            entity: "reseller", field_label: "Email",           field_key: "reseller.email",          folder: "Rivenditore Info" },
  { id: "sys_res_phone",            entity: "reseller", field_label: "Telefono",        field_key: "reseller.phone",          folder: "Rivenditore Info" },
].map(f => ({ ...f, is_system: true as const }));

// ─── Field type helpers ───────────────────────────────────────────────────────

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Testo",
  textarea: "Area testo",
  number: "Numero",
  date: "Data",
  boolean: "Sì/No",
  select: "Selezione singola",
  multi_select: "Selezione multipla",
  email: "Email",
  phone: "Telefono",
  url: "URL",
};

interface SelectOption { value: string; label: string; }

interface FieldFormData {
  entity: CustomFieldEntity;
  field_label: string;
  field_key: string;
  field_type: CustomFieldType;
  group_name: string;
  folder: string;
  placeholder: string;
  description: string;
  is_required: boolean;
  is_visible_reseller: boolean;
  options: SelectOption[];
}

const DEFAULT_FORM: FieldFormData = {
  entity: "contatto",
  field_label: "",
  field_key: "",
  field_type: "text",
  group_name: "",
  folder: "",
  placeholder: "",
  description: "",
  is_required: false,
  is_visible_reseller: false,
  options: [],
};

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ─── CopyKeyButton ────────────────────────────────────────────────────────────

function CopyKeyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`{{${value}}}`).then(() => {
      setCopied(true);
      toast({ title: "Copiato!", description: `{{${value}}}` });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copia chiave"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─── EntityBadge ─────────────────────────────────────────────────────────────

function EntityBadge({ entity }: { entity: CustomFieldEntity }) {
  const cfg = ENTITY_CONFIG[entity];
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Unified row type ─────────────────────────────────────────────────────────

type UnifiedField =
  | (SystemField & { _kind: "system" })
  | (CustomField & { _kind: "custom" });

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZES = [10, 25, 50];
const MAIN_TABS = ["campi", "cartelle", "eliminati"] as const;
type MainTab = typeof MAIN_TABS[number];

export default function ImpostazioniCampi() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters / UI state
  const [mainTab, setMainTab] = useState<MainTab>("campi");
  const [entityFilter, setEntityFilter] = useState<CustomFieldEntity | "tutti">("tutti");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Folder management
  const [folderInput, setFolderInput] = useState("");
  const [folders, setFolders] = useState<string[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [form, setForm] = useState<FieldFormData>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [newOption, setNewOption] = useState({ value: "", label: "" });

  // Fetch DB fields
  const { data: dbFields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom_fields"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("*")
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
  });

  // Merge system + DB fields
  const allFields: UnifiedField[] = useMemo(() => {
    const sys = SYSTEM_FIELDS.map(f => ({ ...f, _kind: "system" as const }));
    const custom = dbFields.map(f => ({ ...f, _kind: "custom" as const }));
    return [...sys, ...custom];
  }, [dbFields]);

  // Filtered + searched
  const filtered = useMemo(() => {
    return allFields.filter(f => {
      if (entityFilter !== "tutti" && f.entity !== entityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          f.field_label.toLowerCase().includes(q) ||
          f.field_key.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allFields, entityFilter, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Merge key preview
  const mergeKeyPreview = useMemo(() => {
    if (!form.field_key) return null;
    const prefix = ENTITY_CONFIG[form.entity]?.prefix ?? "";
    return `{{${prefix}.${form.field_key}}}`;
  }, [form.entity, form.field_key]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FieldFormData) => {
      if (editingField) {
        const { error } = await supabase
          .from("custom_fields")
          .update({
            field_label: data.field_label,
            field_type: data.field_type,
            group_name: data.group_name,
            folder: data.folder || null,
            placeholder: data.placeholder || null,
            description: data.description || null,
            is_required: data.is_required,
            is_visible_reseller: data.is_visible_reseller,
            options: data.options,
          })
          .eq("id", editingField.id);
        if (error) throw error;
      } else {
        const entityDbFields = dbFields.filter(f => f.entity === data.entity);
        const maxOrder = entityDbFields.length > 0
          ? Math.max(...entityDbFields.map(f => f.order_index))
          : -1;
        const { error } = await supabase.from("custom_fields").insert({
          entity: data.entity,
          field_key: data.field_key,
          field_label: data.field_label,
          field_type: data.field_type,
          group_name: data.group_name,
          folder: data.folder || null,
          placeholder: data.placeholder || null,
          description: data.description || null,
          is_required: data.is_required,
          is_visible_reseller: data.is_visible_reseller,
          is_visible_admin: true,
          is_system: false,
          options: data.options,
          order_index: maxOrder + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_fields"] });
      toast({ title: editingField ? "Campo aggiornato" : "Campo creato" });
      setDialogOpen(false);
      setEditingField(null);
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Errore", description: String(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom_fields"] });
      toast({ title: "Campo eliminato" });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Errore", description: String(err) });
    },
  });

  const openCreate = () => {
    setEditingField(null);
    setForm({
      ...DEFAULT_FORM,
      entity: entityFilter !== "tutti" ? entityFilter : "contatto",
    });
    setDialogOpen(true);
  };

  const openEdit = (field: CustomField) => {
    setEditingField(field);
    setForm({
      entity: field.entity,
      field_label: field.field_label,
      field_key: field.field_key,
      field_type: field.field_type,
      group_name: field.group_name ?? "",
      folder: field.folder ?? "",
      placeholder: field.placeholder ?? "",
      description: field.description ?? "",
      is_required: field.is_required,
      is_visible_reseller: field.is_visible_reseller,
      options: field.options ?? [],
    });
    setDialogOpen(true);
  };

  const handleLabelChange = (value: string) => {
    setForm(f => ({
      ...f,
      field_label: value,
      field_key: editingField ? f.field_key : toSnakeCase(value),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.field_label || !form.field_key) {
      toast({ variant: "destructive", title: "Etichetta e chiave sono obbligatorie" });
      return;
    }
    saveMutation.mutate(form);
  };

  const addOption = () => {
    if (!newOption.value || !newOption.label) return;
    setForm(f => ({ ...f, options: [...f.options, { ...newOption }] }));
    setNewOption({ value: "", label: "" });
  };

  const removeOption = (index: number) => {
    setForm(f => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  };

  const showOptions = form.field_type === "select" || form.field_type === "multi_select";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Campi Personalizzati</h1>
          <p className="text-muted-foreground">Gestisci campi custom, chiavi merge e cartelle</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi campo
        </Button>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 border-b">
        {(["campi", "cartelle", "eliminati"] as MainTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mainTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "campi" ? "Tutti i campi" : tab === "cartelle" ? "Cartelle" : "Campi eliminati"}
          </button>
        ))}
      </div>

      {/* ── CAMPI tab ── */}
      {mainTab === "campi" && (
        <>
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Entity pills */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setEntityFilter("tutti"); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  entityFilter === "tutti"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                Tutti
              </button>
              {ALL_ENTITIES.map(entity => {
                const cfg = ENTITY_CONFIG[entity];
                return (
                  <button
                    key={entity}
                    onClick={() => { setEntityFilter(entity); setPage(1); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      entityFilter === entity
                        ? `${cfg.color} border-current`
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o chiave..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome del Campo</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Oggetto</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cartella</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chiave Univoca</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Creato Il</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">Caricamento...</td>
                  </tr>
                )}
                {!isLoading && paginated.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <Database className="mx-auto h-8 w-8 mb-2 opacity-30" />
                      <p>Nessun campo trovato.</p>
                    </td>
                  </tr>
                )}
                {paginated.map(field => (
                  <tr key={field.id} className="hover:bg-muted/10">
                    {/* Nome */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.field_label}</span>
                        {field._kind === "system" && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                            Sistema
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Oggetto */}
                    <td className="px-4 py-3">
                      <EntityBadge entity={field.entity} />
                    </td>
                    {/* Cartella */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {field.folder ? (
                        <span className="flex items-center gap-1.5">
                          <FolderOpen className="h-3.5 w-3.5" />
                          {field.folder}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    {/* Chiave */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {`{{${field.field_key}}}`}
                        </code>
                        <CopyKeyButton value={field.field_key} />
                      </span>
                    </td>
                    {/* Creato Il */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {field._kind === "system"
                        ? <span className="italic">Sistema</span>
                        : new Date((field as CustomField).created_at).toLocaleDateString("it-IT")}
                    </td>
                    {/* Azioni */}
                    <td className="px-4 py-3 text-right">
                      {field._kind === "custom" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(field as CustomField)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(field as CustomField)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Righe per pagina:</span>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map(s => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{filtered.length} totali</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Precedente
              </Button>
              <span>Pagina {page} di {totalPages}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Successiva
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── CARTELLE tab ── */}
      {mainTab === "cartelle" && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">Gestisci le cartelle per raggruppare i campi.</p>
          <div className="flex gap-2">
            <Input
              placeholder="Nome cartella..."
              value={folderInput}
              onChange={e => setFolderInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && folderInput.trim()) {
                  setFolders(prev => [...new Set([...prev, folderInput.trim()])]);
                  setFolderInput("");
                }
              }}
            />
            <Button
              onClick={() => {
                if (folderInput.trim()) {
                  setFolders(prev => [...new Set([...prev, folderInput.trim()])]);
                  setFolderInput("");
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </div>
          {folders.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border rounded-lg">
              <FolderOpen className="mx-auto h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nessuna cartella. Aggiungine una sopra.</p>
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {folders.map(folder => (
                <div key={folder} className="flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    {folder}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setFolders(prev => prev.filter(f => f !== folder))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ELIMINATI tab ── */}
      {mainTab === "eliminati" && (
        <div className="py-12 text-center text-muted-foreground border rounded-lg">
          <Tag className="mx-auto h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Funzione non ancora disponibile</p>
          <p className="text-xs mt-1">Il cestino dei campi eliminati sarà disponibile in una versione futura.</p>
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          if (!open) {
            setDialogOpen(false);
            setEditingField(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? "Modifica campo" : "Aggiungi campo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Object selector */}
            <div className="space-y-1">
              <Label htmlFor="entity">
                Oggetto <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.entity}
                onValueChange={v => setForm(f => ({ ...f, entity: v as CustomFieldEntity }))}
                disabled={!!editingField}
              >
                <SelectTrigger id="entity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ENTITIES.map(entity => (
                    <SelectItem key={entity} value={entity}>
                      {ENTITY_CONFIG[entity].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="field_label">
                Etichetta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="field_label"
                value={form.field_label}
                onChange={e => handleLabelChange(e.target.value)}
                placeholder="es. Numero pratica catastale"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="field_key">
                Chiave <span className="text-destructive">*</span>
              </Label>
              <Input
                id="field_key"
                value={form.field_key}
                onChange={e => !editingField && setForm({ ...form, field_key: e.target.value })}
                readOnly={!!editingField}
                className={`font-mono text-sm ${editingField ? "bg-muted cursor-not-allowed" : ""}`}
                placeholder="es. numero_pratica_catastale"
              />
              {editingField && (
                <p className="text-xs text-muted-foreground">La chiave non può essere modificata dopo la creazione.</p>
              )}
              {mergeKeyPreview && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Chiave merge: <code className="font-mono bg-muted px-1 rounded">{mergeKeyPreview}</code>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="field_type">Tipo campo</Label>
              <Select
                value={form.field_type}
                onValueChange={v => setForm({ ...form, field_type: v as CustomFieldType, options: [] })}
              >
                <SelectTrigger id="field_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map(type => (
                    <SelectItem key={type} value={type}>
                      {FIELD_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="folder">Cartella</Label>
              <Input
                id="folder"
                value={form.folder}
                onChange={e => setForm({ ...form, folder: e.target.value })}
                placeholder="es. Dati catastali"
                list="folder-suggestions"
              />
              <datalist id="folder-suggestions">
                {folders.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>

            <div className="space-y-1">
              <Label htmlFor="group_name">Gruppo</Label>
              <Input
                id="group_name"
                value={form.group_name}
                onChange={e => setForm({ ...form, group_name: e.target.value })}
                placeholder="es. Dati catastali"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="placeholder">Placeholder</Label>
              <Input
                id="placeholder"
                value={form.placeholder}
                onChange={e => setForm({ ...form, placeholder: e.target.value })}
                placeholder="Testo placeholder..."
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Descrizione opzionale del campo..."
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Campo obbligatorio</p>
                <p className="text-xs text-muted-foreground">Il compilatore dovrà riempire questo campo</p>
              </div>
              <Switch
                checked={form.is_required}
                onCheckedChange={v => setForm({ ...form, is_required: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Visibile al rivenditore</p>
                <p className="text-xs text-muted-foreground">Il rivenditore potrà vedere questo campo</p>
              </div>
              <Switch
                checked={form.is_visible_reseller}
                onCheckedChange={v => setForm({ ...form, is_visible_reseller: v })}
              />
            </div>

            {/* Options */}
            {showOptions && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Opzioni</p>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">{opt.value}</code>
                    <span className="flex-1 text-sm">{opt.label}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeOption(i)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newOption.value}
                    onChange={e => setNewOption({ ...newOption, value: e.target.value })}
                    placeholder="valore"
                    className="flex-1 text-xs font-mono"
                  />
                  <Input
                    value={newOption.label}
                    onChange={e => setNewOption({ ...newOption, label: e.target.value })}
                    placeholder="etichetta"
                    className="flex-1 text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Aggiungi le opzioni per la selezione</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvataggio..." : editingField ? "Aggiorna" : "Crea campo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina campo</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il campo <strong>{deleteTarget?.field_label}</strong>?
              Tutti i valori associati andranno persi. Questa azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
