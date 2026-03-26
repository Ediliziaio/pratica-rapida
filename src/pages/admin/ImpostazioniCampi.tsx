import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2, GripVertical, X } from "lucide-react";
import type { CustomField, CustomFieldType, CustomFieldEntity } from "@/integrations/supabase/types";

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

const DEFAULT_FORM: FieldFormData = {
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

function FieldsTable({
  fields,
  onEdit,
  onDelete,
}: {
  fields: CustomField[];
  onEdit: (f: CustomField) => void;
  onDelete: (f: CustomField) => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="text-sm">Nessun campo personalizzato. Aggiungi il primo campo.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-8 px-3 py-2" />
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Etichetta</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Chiave</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Gruppo</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Richiesto</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Visibile rivenditore</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => (
            <tr key={field.id} className="hover:bg-muted/20">
              <td className="px-3 py-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
              </td>
              <td className="px-3 py-2 font-medium">{field.field_label}</td>
              <td className="px-3 py-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{field.field_key}</code>
              </td>
              <td className="px-3 py-2">
                <FieldTypeBadge type={field.field_type} />
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs">{field.group_name || "—"}</td>
              <td className="px-3 py-2 text-center">
                <Switch checked={field.is_required} disabled className="pointer-events-none" />
              </td>
              <td className="px-3 py-2 text-center">
                <Switch checked={field.is_visible_reseller} disabled className="pointer-events-none" />
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(field)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(field)}
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
  );
}

function MappingTable({ fields }: { fields: CustomField[] }) {
  if (fields.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Etichetta</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Chiave (riferimento)</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((field) => (
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
  );
}

export default function ImpostazioniCampi() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeEntity, setActiveEntity] = useState<CustomFieldEntity>("enea_practice");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [form, setForm] = useState<FieldFormData>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);
  const [newOption, setNewOption] = useState({ value: "", label: "" });

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
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

  const entityFields = fields.filter((f) => f.entity === activeEntity);

  const openCreate = () => {
    setEditingField(null);
    setForm(DEFAULT_FORM);
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
        const maxOrder = entityFields.length > 0
          ? Math.max(...entityFields.map((f) => f.order_index))
          : -1;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Campi Personalizzati</h1>
          <p className="text-muted-foreground">
            Gestisci i campi custom e le loro mappature
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi campo
        </Button>
      </div>

      <Tabs
        value={activeEntity}
        onValueChange={(v) => setActiveEntity(v as CustomFieldEntity)}
      >
        <TabsList>
          <TabsTrigger value="enea_practice">Pratiche ENEA</TabsTrigger>
          <TabsTrigger value="reseller">Rivenditori</TabsTrigger>
          <TabsTrigger value="cliente">Clienti</TabsTrigger>
        </TabsList>

        {(["enea_practice", "reseller", "cliente"] as CustomFieldEntity[]).map((entity) => (
          <TabsContent key={entity} value={entity} className="mt-6 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Campi — {ENTITY_LABELS[entity]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Caricamento...</div>
                ) : (
                  <FieldsTable
                    fields={fields.filter((f) => f.entity === entity)}
                    onEdit={openEdit}
                    onDelete={(f) => setDeleteTarget(f)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Mapping section */}
            {fields.filter((f) => f.entity === entity).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Mappatura campi</CardTitle>
                  <CardDescription className="text-xs">
                    Usa queste chiavi come riferimento nelle automazioni e nei template (stile GHL)
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <MappingTable fields={fields.filter((f) => f.entity === entity)} />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingField(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField ? "Modifica campo" : "Aggiungi campo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="field_label">
                Etichetta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="field_label"
                value={form.field_label}
                onChange={(e) => handleLabelChange(e.target.value)}
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
                onChange={(e) => !editingField && setForm({ ...form, field_key: e.target.value })}
                readOnly={!!editingField}
                className={`font-mono text-sm ${editingField ? "bg-muted cursor-not-allowed" : ""}`}
                placeholder="es. numero_pratica_catastale"
              />
              {editingField && (
                <p className="text-xs text-muted-foreground">La chiave non può essere modificata dopo la creazione.</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="field_type">Tipo campo</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) => setForm({ ...form, field_type: v as CustomFieldType, options: [] })}
              >
                <SelectTrigger id="field_type">
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
              <Label htmlFor="group_name">Gruppo</Label>
              <Input
                id="group_name"
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                placeholder="es. Dati catastali"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="placeholder">Placeholder</Label>
              <Input
                id="placeholder"
                value={form.placeholder}
                onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                placeholder="Testo placeholder..."
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                onCheckedChange={(v) => setForm({ ...form, is_required: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Visibile al rivenditore</p>
                <p className="text-xs text-muted-foreground">Il rivenditore potrà vedere questo campo</p>
              </div>
              <Switch
                checked={form.is_visible_reseller}
                onCheckedChange={(v) => setForm({ ...form, is_visible_reseller: v })}
              />
            </div>

            {/* Options (only for select/multi_select) */}
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
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
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
