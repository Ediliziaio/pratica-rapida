import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Settings, Clock, Building2, Users, FolderOpen, Save, Sliders, Plus, Pencil, Trash2, GripVertical, X, Mail, MessageCircle, Puzzle, Eye, EyeOff, CheckCircle, XCircle, Layers } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import type { CustomField, CustomFieldType, CustomFieldEntity } from "@/integrations/supabase/types";

// ─── Integration Section ──────────────────────────────────────────────────────

interface IntegField {
  key: string;
  label: string;
  placeholder: string;
  description?: string;
  secret?: boolean;
}

function IntegrationSection({
  title,
  description,
  fields,
  settingKey,
}: {
  title: string;
  description: string;
  fields: IntegField[];
  settingKey: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  const { data: row } = useQuery({
    queryKey: ["platform-settings", settingKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("id, value")
        .eq("key", settingKey)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (row?.value) {
      setForm(row.value as Record<string, string>);
    }
  }, [row]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (row?.id) {
        const { error } = await supabase
          .from("platform_settings")
          .update({ value: form as unknown as Record<string, never>, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("platform_settings")
          .insert([{ key: settingKey, value: form as unknown as Record<string, never> }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", settingKey] });
      toast({ title: "Configurazione salvata" });
      setDirty(false);
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const handleChange = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const toggleSecret = (key: string) => setShowSecrets(s => ({ ...s, [key]: !s[key] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 max-w-2xl">
          {fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <div className="relative">
                <Input
                  id={f.key}
                  type={f.secret && !showSecrets[f.key] ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={form[f.key] ?? ""}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className={f.secret ? "pr-10 font-mono text-sm" : ""}
                />
                {f.secret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => toggleSecret(f.key)}
                  >
                    {showSecrets[f.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !dirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Salvataggio..." : dirty ? "Salva modifiche" : "Salvato"}
          </Button>
          {testStatus === "ok" && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle className="h-4 w-4" />Connessione OK
            </span>
          )}
          {testStatus === "error" && (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <XCircle className="h-4 w-4" />Connessione fallita
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Custom Fields ────────────────────────────────────────────────────────────

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

const FIELD_TYPE_COLORS: Record<CustomFieldType, string> = {
  text: "bg-gray-100 text-gray-700",
  textarea: "bg-gray-100 text-gray-700",
  number: "bg-blue-100 text-blue-700",
  date: "bg-purple-100 text-purple-700",
  boolean: "bg-green-100 text-green-700",
  select: "bg-orange-100 text-orange-700",
  multi_select: "bg-orange-100 text-orange-700",
  email: "bg-blue-100 text-blue-700",
  phone: "bg-teal-100 text-teal-700",
  url: "bg-indigo-100 text-indigo-700",
};

const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  enea_practice: "Pratiche ENEA",
  reseller: "Rivenditori",
  cliente: "Clienti",
};

interface SelectOption {
  value: string;
  label: string;
}

interface FieldFormData {
  field_label: string;
  field_key: string;
  field_type: CustomFieldType;
  group_name: string;
  placeholder: string;
  description: string;
  is_required: boolean;
  is_visible_reseller: boolean;
  options: SelectOption[];
}

const DEFAULT_FIELD_FORM: FieldFormData = {
  field_label: "",
  field_key: "",
  field_type: "text",
  group_name: "",
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

function FieldTypeBadge({ type }: { type: CustomFieldType }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${FIELD_TYPE_COLORS[type]}`}>
      {FIELD_TYPE_LABELS[type]}
    </span>
  );
}

function CampiPersonalizzati() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeEntity, setActiveEntity] = useState<CustomFieldEntity>("enea_practice");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [form, setForm] = useState<FieldFormData>(DEFAULT_FIELD_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [newOption, setNewOption] = useState({ value: "", label: "" });

  const { data: fields = [], isLoading: fieldsLoading } = useQuery<CustomField[]>({
    queryKey: ["custom_fields"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_fields").select("*").order("order_index");
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
  });

  const entityFields = fields.filter((f) => f.entity === activeEntity);

  const openCreate = () => {
    setEditingField(null);
    setForm(DEFAULT_FIELD_FORM);
    setDialogOpen(true);
  };

  const openEdit = (field: CustomField) => {
    setEditingField(field);
    setForm({
      field_label: field.field_label,
      field_key: field.field_key,
      field_type: field.field_type,
      group_name: field.group_name ?? "",
      placeholder: field.placeholder ?? "",
      description: field.description ?? "",
      is_required: field.is_required,
      is_visible_reseller: field.is_visible_reseller,
      options: field.options ?? [],
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FieldFormData) => {
      if (editingField) {
        const { error } = await supabase
          .from("custom_fields")
          .update({
            field_label: data.field_label,
            field_type: data.field_type,
            group_name: data.group_name,
            placeholder: data.placeholder || null,
            description: data.description || null,
            is_required: data.is_required,
            is_visible_reseller: data.is_visible_reseller,
            options: data.options,
          })
          .eq("id", editingField.id);
        if (error) throw error;
      } else {
        const maxOrder =
          entityFields.length > 0 ? Math.max(...entityFields.map((f) => f.order_index)) : -1;
        const { error } = await supabase.from("custom_fields").insert({
          entity: activeEntity,
          field_key: data.field_key,
          field_label: data.field_label,
          field_type: data.field_type,
          group_name: data.group_name,
          placeholder: data.placeholder || null,
          description: data.description || null,
          is_required: data.is_required,
          is_visible_reseller: data.is_visible_reseller,
          is_visible_admin: true,
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
    onError: (err) => toast({ variant: "destructive", title: "Errore", description: String(err) }),
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
    onError: (err) => toast({ variant: "destructive", title: "Errore", description: String(err) }),
  });

  const handleLabelChange = (value: string) => {
    setForm((f) => ({
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
    setForm((f) => ({ ...f, options: [...f.options, { ...newOption }] }));
    setNewOption({ value: "", label: "" });
  };

  const removeOption = (index: number) => {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  };

  const showOptions = form.field_type === "select" || form.field_type === "multi_select";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gestisci i campi custom e le loro mappature (stile GHL). Le chiavi sono usate come variabili nelle automazioni.
        </p>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Aggiungi campo
        </Button>
      </div>

      <Tabs value={activeEntity} onValueChange={(v) => setActiveEntity(v as CustomFieldEntity)}>
        <TabsList>
          <TabsTrigger value="enea_practice">Pratiche ENEA</TabsTrigger>
          <TabsTrigger value="reseller">Rivenditori</TabsTrigger>
          <TabsTrigger value="cliente">Clienti</TabsTrigger>
        </TabsList>

        {(["enea_practice", "reseller", "cliente"] as CustomFieldEntity[]).map((entity) => {
          const efs = fields.filter((f) => f.entity === entity);
          return (
            <TabsContent key={entity} value={entity} className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Campi — {ENTITY_LABELS[entity]}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {fieldsLoading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Caricamento...
                    </div>
                  ) : efs.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      Nessun campo. Usa il pulsante "Aggiungi campo".
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="w-8 px-3 py-2" />
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Etichetta
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Chiave
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Tipo
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Gruppo
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                              Obbligatorio
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                              Azioni
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {efs.map((field) => (
                            <tr key={field.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 text-muted-foreground">
                                <GripVertical className="h-4 w-4" />
                              </td>
                              <td className="px-3 py-2 font-medium">{field.field_label}</td>
                              <td className="px-3 py-2">
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                                  {`{{custom.${field.field_key}}}`}
                                </code>
                              </td>
                              <td className="px-3 py-2">
                                <FieldTypeBadge type={field.field_type} />
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">
                                {field.group_name || "—"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Switch
                                  checked={field.is_required}
                                  disabled
                                  className="pointer-events-none"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openEdit(field)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setDeleteTarget(field)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {efs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Riferimento mappatura</CardTitle>
                    <CardDescription className="text-xs">
                      Usa queste chiavi come variabili nei template delle automazioni
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Etichetta
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Variabile template
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Tipo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {efs.map((field) => (
                            <tr key={field.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">{field.field_label}</td>
                              <td className="px-3 py-2">
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                                  {`{{custom.${field.field_key}}}`}
                                </code>
                              </td>
                              <td className="px-3 py-2">
                                <FieldTypeBadge type={field.field_type} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
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
            <div className="space-y-1">
              <Label htmlFor="cf_label">
                Etichetta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cf_label"
                value={form.field_label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="es. Numero pratica catastale"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf_key">
                Chiave <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cf_key"
                value={form.field_key}
                onChange={(e) => !editingField && setForm({ ...form, field_key: e.target.value })}
                readOnly={!!editingField}
                className={`font-mono text-sm ${editingField ? "bg-muted cursor-not-allowed" : ""}`}
                placeholder="es. numero_pratica_catastale"
              />
              {editingField && (
                <p className="text-xs text-muted-foreground">
                  La chiave non può essere modificata dopo la creazione.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Tipo campo</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) =>
                  setForm({ ...form, field_type: v as CustomFieldType, options: [] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {FIELD_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Gruppo</Label>
              <Input
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                placeholder="es. Dati catastali"
              />
            </div>
            <div className="space-y-1">
              <Label>Placeholder</Label>
              <Input
                value={form.placeholder}
                onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                placeholder="Testo placeholder..."
              />
            </div>
            <div className="space-y-1">
              <Label>Descrizione</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrizione opzionale..."
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Campo obbligatorio</p>
                <p className="text-xs text-muted-foreground">
                  Il compilatore dovrà riempire questo campo
                </p>
              </div>
              <Switch
                checked={form.is_required}
                onCheckedChange={(v) => setForm({ ...form, is_required: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Visibile al rivenditore</p>
                <p className="text-xs text-muted-foreground">
                  Il rivenditore potrà vedere questo campo
                </p>
              </div>
              <Switch
                checked={form.is_visible_reseller}
                onCheckedChange={(v) => setForm({ ...form, is_visible_reseller: v })}
              />
            </div>
            {showOptions && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Opzioni</p>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">
                      {opt.value}
                    </code>
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
                    onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                    placeholder="valore"
                    className="flex-1 text-xs font-mono"
                  />
                  <Input
                    value={newOption.label}
                    onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                    placeholder="etichetta"
                    className="flex-1 text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? "Salvataggio..."
                  : editingField
                  ? "Aggiorna"
                  : "Crea campo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina campo</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il campo{" "}
              <strong>{deleteTarget?.field_label}</strong>? Tutti i valori associati andranno persi.
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

// ─── SLA Settings ─────────────────────────────────────────────────────────────

interface SLASettings {
  presaInCaricoOre: number;
  completamentoOre: number;
}

export default function ImpostazioniPiattaforma() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: slaRow } = useQuery({
    queryKey: ["platform-settings", "sla_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("id, value")
        .eq("key", "sla_settings")
        .maybeSingle();
      return data;
    },
  });

  const [sla, setSla] = useState<SLASettings>({ presaInCaricoOre: 24, completamentoOre: 120 });
  const [slaErrors, setSlaErrors] = useState<{ presaInCaricoOre?: string; completamentoOre?: string }>({});

  useEffect(() => {
    if (slaRow?.value) {
      const val = slaRow.value as unknown as SLASettings;
      setSla({ presaInCaricoOre: val.presaInCaricoOre ?? 24, completamentoOre: val.completamentoOre ?? 120 });
    }
  }, [slaRow]);

  const { data: stats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [companies, pratiche, profiles] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("pratiche").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        aziende: companies.count || 0,
        pratiche: pratiche.count || 0,
        utenti: profiles.count || 0,
      };
    },
  });

  const [saving, setSaving] = useState(false);

  const saveSLA = async () => {
    // Validate
    const errors: typeof slaErrors = {};
    if (!Number.isInteger(sla.presaInCaricoOre) || sla.presaInCaricoOre < 1) {
      errors.presaInCaricoOre = "Deve essere un intero positivo (≥ 1)";
    }
    if (!Number.isInteger(sla.completamentoOre) || sla.completamentoOre < 1) {
      errors.completamentoOre = "Deve essere un intero positivo (≥ 1)";
    }
    if (sla.completamentoOre <= sla.presaInCaricoOre) {
      errors.completamentoOre = "Deve essere maggiore del tempo di presa in carico";
    }
    setSlaErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (slaRow?.id) {
        await supabase
          .from("platform_settings")
          .update({ value: sla as unknown as Record<string, never>, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("id", slaRow.id);
      } else {
        await supabase
          .from("platform_settings")
          .insert([{ key: "sla_settings", value: sla as unknown as Record<string, never>, updated_by: user?.id }]);
      }
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast({ title: "Soglie SLA salvate" });
    } catch {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" /> Impostazioni Piattaforma
          </h1>
          <p className="text-muted-foreground">Configurazione globale della piattaforma</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/campi")} className="gap-2 shrink-0">
          <Layers className="h-4 w-4" />Campi Personalizzati
        </Button>
      </div>

      <Tabs defaultValue="sla">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="sla"><Clock className="mr-1.5 h-4 w-4" />SLA</TabsTrigger>
          <TabsTrigger value="email"><Mail className="mr-1.5 h-4 w-4" />Email</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</TabsTrigger>
          <TabsTrigger value="integrazioni"><Puzzle className="mr-1.5 h-4 w-4" />Integrazioni</TabsTrigger>
          <TabsTrigger value="info"><Building2 className="mr-1.5 h-4 w-4" />Info</TabsTrigger>
        </TabsList>

        <TabsContent value="sla" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Soglie SLA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Definisci i tempi target per il monitoraggio delle performance operative. Questi valori vengono usati nella Dashboard per evidenziare le pratiche fuori SLA.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
                <div className="space-y-2">
                  <Label>Presa in carico (ore)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={sla.presaInCaricoOre}
                    onChange={e => {
                      setSla(s => ({ ...s, presaInCaricoOre: Number(e.target.value) }));
                      setSlaErrors(prev => ({ ...prev, presaInCaricoOre: undefined }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "inviata" a "in_lavorazione"</p>
                  {slaErrors.presaInCaricoOre && <p className="text-xs text-destructive">{slaErrors.presaInCaricoOre}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Completamento (ore)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={sla.completamentoOre}
                    onChange={e => {
                      setSla(s => ({ ...s, completamentoOre: Number(e.target.value) }));
                      setSlaErrors(prev => ({ ...prev, completamentoOre: undefined }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "in_lavorazione" a "completata"</p>
                  {slaErrors.completamentoOre && <p className="text-xs text-destructive">{slaErrors.completamentoOre}</p>}
                </div>
              </div>
              <Button onClick={saveSLA} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Salvataggio..." : "Salva Soglie"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <IntegrationSection
            title="Configurazione Email (Resend)"
            description="Imposta il dominio mittente e le credenziali Resend per l'invio di email transazionali."
            fields={[
              { key: "email_from_address", label: "Indirizzo mittente", placeholder: "noreply@tuodominio.it", description: "Es. noreply@praticaapida.it" },
              { key: "email_from_name", label: "Nome mittente", placeholder: "Pratica Rapida", description: "Nome visualizzato nella casella email del destinatario" },
              { key: "email_reply_to", label: "Reply-To", placeholder: "supporto@tuodominio.it", description: "Indirizzo di risposta (opzionale)" },
              { key: "resend_api_key", label: "Resend API Key", placeholder: "re_xxxxxxxxxxxx", secret: true, description: "Chiave API da dashboard Resend" },
            ]}
            settingKey="email_config"
          />
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          <IntegrationSection
            title="WhatsApp Cloud API (Meta)"
            description="Configura l'integrazione WhatsApp Business per l'invio di messaggi ai clienti."
            fields={[
              { key: "wa_phone_number_id", label: "Phone Number ID", placeholder: "123456789012345", description: "ID numero di telefono da Meta Business Manager" },
              { key: "wa_waba_id", label: "WABA ID", placeholder: "123456789012345", description: "WhatsApp Business Account ID" },
              { key: "wa_access_token", label: "Access Token", placeholder: "EAAxxxxxxxxx...", secret: true, description: "Token di accesso permanente (non temporaneo)" },
              { key: "wa_webhook_verify_token", label: "Webhook Verify Token", placeholder: "token_segreto_webhook", secret: true, description: "Token personalizzato per la verifica del webhook Meta" },
            ]}
            settingKey="whatsapp_config"
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Template WhatsApp approvati</CardTitle>
              <CardDescription className="text-xs">I template devono essere approvati da Meta Business Manager prima dell'uso</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: "pratica_ricevuta", status: "pending", desc: "Conferma ricezione pratica" },
                  { name: "sollecito_documenti", status: "pending", desc: "Sollecito caricamento documenti" },
                  { name: "pratica_completata", status: "pending", desc: "Notifica pratica completata" },
                  { name: "recensione_request", status: "pending", desc: "Richiesta recensione" },
                  { name: "appuntamento_reminder", status: "pending", desc: "Reminder appuntamento call" },
                ].map(t => (
                  <div key={t.name} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <code className="text-xs font-mono text-muted-foreground">{t.name}</code>
                      <p className="text-sm">{t.desc}</p>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-200 text-xs gap-1">
                      <Clock className="h-3 w-3" />In attesa approvazione
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrazioni" className="space-y-4">
          <IntegrationSection
            title="ElevenLabs Conversational AI"
            description="Configura l'integrazione per le chiamate AI outbound ai clienti."
            fields={[
              { key: "elevenlabs_api_key", label: "API Key", placeholder: "el_xxxxxxxxxxxx", secret: true, description: "Chiave API da dashboard ElevenLabs" },
              { key: "elevenlabs_agent_id", label: "Agent ID (default)", placeholder: "agent_xxxxxxxxxxxx", description: "ID dell'agente conversazionale default" },
              { key: "elevenlabs_caller_id", label: "Caller ID (numero chiamante)", placeholder: "+39xxxxxxxxxx", description: "Numero telefonico registrato in ElevenLabs" },
            ]}
            settingKey="elevenlabs_config"
          />
          <IntegrationSection
            title="n8n / Google Sheets"
            description="Sincronizza le pratiche con un foglio Google Sheets tramite n8n webhook."
            fields={[
              { key: "n8n_webhook_url", label: "n8n Webhook URL", placeholder: "https://n8n.tuodominio.it/webhook/xxxx", description: "URL del webhook n8n per la sincronizzazione" },
              { key: "gsheets_spreadsheet_id", label: "Google Sheets ID (opzionale)", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", description: "ID del foglio Google (dalla URL)" },
            ]}
            settingKey="n8n_config"
          />
        </TabsContent>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Aziende</CardTitle>
                <Building2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.aziende ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Utenti</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.utenti ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
                <FolderOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.pratiche ?? "—"}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Versione piattaforma</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pratica Rapida</span>
                <Badge variant="outline">v2.0.0</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Database</span>
                <Badge variant="outline">Supabase</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ambiente</span>
                <Badge variant="outline" className="text-emerald-600 border-emerald-200">Produzione</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
