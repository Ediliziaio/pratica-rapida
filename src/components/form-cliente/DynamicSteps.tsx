// ============================================================
// DynamicSteps
//
// Renderer dinamico dello step corrente del form pubblico cliente,
// guidato da uno schema `FormSchema` proveniente dalla tabella DB
// `form_modules` (gestita via /admin/moduli).
//
// Strategia non-breaking: usato solo quando `useFormModuleByProdotto`
// matcha un modulo. Per pratiche senza modulo DB, FormPubblico cade
// sul renderer hardcoded `<Steps>` esistente.
//
// Tutta la validazione vive in `./dynamicValidation.ts`.
// ============================================================

import { useRef } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadPublicFormFile } from "./uploadFormFile";

import type { FormField, FormSchema, FormStep } from "@/types/form-module";
import { checkVisibleIf } from "./dynamicValidation";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DynamicStepsProps {
  schema: FormSchema;
  /** Indice rispetto agli step VISIBILI (filtrati da visible_if). */
  currentStepIndex: number;
  /** Mappa sezione → field → value (shape: dati_form jsonb). */
  formData: Record<string, Record<string, unknown>>;
  onChange: (stepKey: string, fieldKey: string, value: unknown) => void;
  errors: Record<string, string>;
  practiceId: string;
  /** Form pubblico (cliente anonimo): upload via edge function form-upload. */
  publicToken?: string;
}

// Limite ragionevole per array dinamici lato cliente
const ARRAY_MAX_ITEMS = 50;

// ── Component principale ──────────────────────────────────────────────────────

export function DynamicSteps({
  schema,
  currentStepIndex,
  formData,
  onChange,
  errors,
  practiceId,
  publicToken,
}: DynamicStepsProps) {
  // Filtriamo gli step in base a visible_if. Lo stesso filtro è applicato a
  // monte da FormPubblico per la navigazione, ma replichiamo qui per safety
  // (così questo componente è autonomo).
  const visibleSteps = (schema.steps ?? []).filter(
    (s) => !s.visible_if || checkVisibleIf(s.visible_if, formData),
  );

  const step = visibleSteps[currentStepIndex];

  // Schema malformato / step out-of-range → render benigno invece di crash.
  if (!step) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun campo da compilare in questa sezione.
      </p>
    );
  }

  const fields = step.fields ?? [];
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sezione vuota. Vai avanti per continuare.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (field.visible_if && !checkVisibleIf(field.visible_if, formData)) {
          return null;
        }
        return (
          <DynamicField
            key={field.key}
            field={field}
            stepKey={step.key}
            value={formData[step.key]?.[field.key]}
            onChange={(v) => onChange(step.key, field.key, v)}
            errors={errors}
            practiceId={practiceId}
            publicToken={publicToken}
          />
        );
      })}
    </div>
  );
}

// ── DynamicField ──────────────────────────────────────────────────────────────

interface DynamicFieldProps {
  field: FormField;
  stepKey: string;
  value: unknown;
  onChange: (value: unknown) => void;
  errors: Record<string, string>;
  practiceId: string;
  publicToken?: string;
  /** Per il renderer ricorsivo dell'array, override del path errore. */
  errorKey?: string;
  /** Quando renderizzato dentro un array, il key univoco per i RadioGroup ecc. */
  scope?: string;
}

function DynamicField({
  field,
  stepKey,
  value,
  onChange,
  errors,
  practiceId,
  publicToken,
  errorKey,
  scope,
}: DynamicFieldProps) {
  const fieldId = scope ? `${scope}-${field.key}` : `${stepKey}-${field.key}`;
  const errKey = errorKey ?? `${stepKey}.${field.key}`;
  const errorMsg = errors[errKey];

  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>

      <FieldControl
        field={field}
        fieldId={fieldId}
        value={value}
        onChange={onChange}
        errors={errors}
        practiceId={practiceId}
        publicToken={publicToken}
        errorKey={errKey}
        scope={scope}
      />

      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
    </div>
  );
}

// ── FieldControl: switch sul tipo ─────────────────────────────────────────────

interface FieldControlProps {
  field: FormField;
  fieldId: string;
  value: unknown;
  onChange: (value: unknown) => void;
  errors: Record<string, string>;
  practiceId: string;
  publicToken?: string;
  errorKey: string;
  scope?: string;
}

function FieldControl(props: FieldControlProps) {
  const { field } = props;
  switch (field.type) {
    case "text":
      return <TextControl {...props} />;
    case "textarea":
      return <TextareaControl {...props} />;
    case "number":
      return <NumberControl {...props} />;
    case "date":
      return <SimpleInputControl {...props} type="date" />;
    case "time":
      return <SimpleInputControl {...props} type="time" />;
    case "email":
      return <SimpleInputControl {...props} type="email" />;
    case "phone":
      return <SimpleInputControl {...props} type="tel" />;
    case "url":
      return <SimpleInputControl {...props} type="url" />;
    case "boolean":
      return <BooleanControl {...props} />;
    case "select":
      return <SelectControl {...props} />;
    case "radio":
      return <RadioControl {...props} />;
    case "multi_select":
      return <MultiSelectControl {...props} />;
    case "upload":
      return <UploadControl {...props} />;
    case "array":
      return <ArrayControl {...props} />;
    default:
      // Tipo sconosciuto → fallback testo per non bloccare il form.
      return <TextControl {...props} />;
  }
}

// ── Input controls ────────────────────────────────────────────────────────────

function TextControl({ field, fieldId, value, onChange }: FieldControlProps) {
  return (
    <Input
      id={fieldId}
      type="text"
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function TextareaControl({ field, fieldId, value, onChange }: FieldControlProps) {
  return (
    <Textarea
      id={fieldId}
      rows={3}
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SimpleInputControl(
  props: FieldControlProps & { type: "date" | "time" | "email" | "tel" | "url" },
) {
  const { field, fieldId, value, onChange, type } = props;
  return (
    <Input
      id={fieldId}
      type={type}
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberControl({ field, fieldId, value, onChange }: FieldControlProps) {
  // Manteniamo una stringa nello state per non perdere lo stato "vuoto".
  const display = value === undefined || value === null ? "" : String(value);
  return (
    <Input
      id={fieldId}
      type="number"
      min={field.min}
      max={field.max}
      placeholder={field.placeholder}
      value={display}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") {
          onChange("");
          return;
        }
        // Salviamo come number per permettere min/max validation downstream.
        const n = Number(v);
        onChange(Number.isNaN(n) ? v : n);
      }}
    />
  );
}

function BooleanControl({ fieldId, value, onChange }: FieldControlProps) {
  // Accetta sia boolean nativo, sia "si"/"no" string (legacy bozze).
  const current =
    value === true || value === "si" ? "si" : value === false || value === "no" ? "no" : "";
  return (
    <RadioGroup
      value={current}
      onValueChange={(v) => onChange(v === "si")}
      className="flex gap-6"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${fieldId}-si`} value="si" />
        <Label htmlFor={`${fieldId}-si`} className="font-normal">
          Sì
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${fieldId}-no`} value="no" />
        <Label htmlFor={`${fieldId}-no`} className="font-normal">
          No
        </Label>
      </div>
    </RadioGroup>
  );
}

function SelectControl({ field, fieldId, value, onChange }: FieldControlProps) {
  const options = field.options ?? [];
  const current = typeof value === "string" ? value : "";
  return (
    <Select value={current} onValueChange={(v) => onChange(v)}>
      <SelectTrigger id={fieldId}>
        <SelectValue placeholder={field.placeholder ?? "Seleziona"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RadioControl({ field, fieldId, value, onChange }: FieldControlProps) {
  const options = field.options ?? [];
  const current = typeof value === "string" ? value : "";
  return (
    <RadioGroup value={current} onValueChange={(v) => onChange(v)} className="space-y-2">
      {options.map((o) => (
        <div key={o.value} className="flex items-center gap-2">
          <RadioGroupItem id={`${fieldId}-${o.value}`} value={o.value} />
          <Label htmlFor={`${fieldId}-${o.value}`} className="font-normal">
            {o.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function MultiSelectControl({ field, fieldId, value, onChange }: FieldControlProps) {
  const options = field.options ?? [];
  const selected: string[] = Array.isArray(value)
    ? (value.filter((v) => typeof v === "string") as string[])
    : [];

  const toggle = (val: string, checked: boolean) => {
    if (checked) {
      if (selected.includes(val)) return;
      onChange([...selected, val]);
    } else {
      onChange(selected.filter((v) => v !== val));
    }
  };

  return (
    <div className="space-y-2">
      {options.map((o) => {
        const id = `${fieldId}-${o.value}`;
        const checked = selected.includes(o.value);
        return (
          <div key={o.value} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(c) => toggle(o.value, c === true)}
            />
            <Label htmlFor={id} className="font-normal">
              {o.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

// ── Upload control ────────────────────────────────────────────────────────────

function UploadControl({
  field,
  fieldId,
  value,
  onChange,
  practiceId,
  publicToken,
}: FieldControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const accept = field.accept?.length
    ? field.accept.map((e) => `.${e.replace(/^\./, "")}`).join(",")
    : undefined;
  const maxSizeMb = field.max_size_mb ?? 20;
  const multiple = !!field.multiple;

  // Normalizzazione value → array di path. Backward-compat: un vecchio valore
  // string viene trattato come lista a un elemento.
  const paths: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === "string")
    : typeof value === "string" && value
      ? [value]
      : [];

  const commit = (next: string[]) => {
    if (multiple) {
      onChange(next);
    } else {
      onChange(next[0] ?? "");
    }
  };

  const uploadOne = async (file: File): Promise<string | null> => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File troppo grande",
        description: `${file.name}: dimensione massima ${maxSizeMb}MB`,
      });
      return null;
    }
    try {
      if (publicToken) {
        return await uploadPublicFormFile(publicToken, "dynamic", file);
      }
      const { supabase } = await import("@/integrations/supabase/client");
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      const uploadPath = `${practiceId}/dynamic/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("enea-documents")
        .upload(uploadPath, file, { upsert: false });
      if (error) throw error;
      return uploadPath;
    } catch (err) {
      console.error("Dynamic upload error:", err);
      toast({
        variant: "destructive",
        title: "Caricamento fallito",
        description: `${file.name}: riprova o contatta il supporto.`,
      });
      return null;
    }
  };

  const onFiles = async (files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (multiple) {
      const results = await Promise.all(list.map(uploadOne));
      const newPaths = results.filter((p): p is string => !!p);
      if (newPaths.length) commit([...paths, ...newPaths]);
    } else {
      const p = await uploadOne(list[0]);
      if (p) commit([p]);
    }
  };

  const removeAt = (idx: number) => {
    commit(paths.filter((_, i) => i !== idx));
  };

  return (
    <>
      <input
        ref={inputRef}
        id={fieldId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {paths.length > 0 ? (
        <div className="space-y-2">
          {paths.map((p, i) => (
            <div key={`${p}-${i}`} className="rounded-md border p-3 flex items-center justify-between gap-3">
              <div className="text-sm min-w-0">
                <p className="font-medium">File caricato</p>
                <p className="text-xs text-muted-foreground break-all">
                  {p.split("/").pop()}
                </p>
              </div>
              {multiple ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeAt(i)}>
                  Rimuovi
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                  Sostituisci
                </Button>
              )}
            </div>
          ))}
          {multiple && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Aggiungi altri file
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {field.placeholder ?? (multiple ? "Carica file (più selezionabili)" : "Carica file")}
        </Button>
      )}
    </>
  );
}

// ── Array control ─────────────────────────────────────────────────────────────

function ArrayControl({
  field,
  value,
  onChange,
  errors,
  practiceId,
  errorKey,
}: FieldControlProps) {
  const itemFields = field.item_template?.fields ?? [];
  const items: Record<string, unknown>[] = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : [];

  // Garantiamo almeno un item in render (UX), senza forzare la write su onChange
  // per non triggerare loop di setState nel parent.
  const display = items.length === 0 ? [{}] : items;

  const updateItem = (idx: number, patch: Record<string, unknown>) => {
    const next = [...display];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addItem = () => {
    if (display.length >= ARRAY_MAX_ITEMS) return;
    onChange([...display, {}]);
  };

  const removeItem = (idx: number) => {
    if (display.length <= 1) return;
    const next = display.filter((_, i) => i !== idx);
    onChange(next);
  };

  if (itemFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessun sotto-campo configurato.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {display.map((item, idx) => (
        <div key={idx} className="rounded-md border p-3 space-y-3 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Elemento {idx + 1}</p>
            {display.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(idx)}
                aria-label="Rimuovi elemento"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {itemFields.map((sub) => {
            const subErrorKey = `${errorKey}.${idx}.${sub.key}`;
            const subValue = (item as Record<string, unknown>)[sub.key];
            const scope = `${errorKey}-${idx}`;
            return (
              <DynamicField
                key={sub.key}
                field={sub}
                stepKey={errorKey /* unused for array sub */}
                value={subValue}
                onChange={(v) => updateItem(idx, { [sub.key]: v })}
                errors={errors}
                practiceId={practiceId}
                errorKey={subErrorKey}
                scope={scope}
              />
            );
          })}
        </div>
      ))}

      {display.length < ARRAY_MAX_ITEMS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
        >
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi
        </Button>
      )}
    </div>
  );
}

// Silence unused: lucide Loader2 reserved for future "uploading" UX hook.
void Loader2;

// Re-exports utili
export type { FormSchema, FormStep, FormField };
