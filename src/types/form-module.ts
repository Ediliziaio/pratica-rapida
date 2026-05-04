// ============================================================
// Form Module — schema dei moduli del form pubblico cliente
//
// Questi tipi descrivono lo schema JSONB della tabella `form_modules`
// gestita dal super_admin via /admin/moduli (CMS).
//
// FormPubblico.tsx legge questo schema dal DB con fallback al codice
// TS hardcoded esistente (vedi src/types/form-cliente.ts).
// ============================================================

export type FormFieldType =
  | "text"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "boolean"
  | "select"
  | "textarea"
  | "upload"
  | "array";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface VisibleIf {
  /** Path dot-notation, es. "residenza.stesso_indirizzo_lavori" */
  path: string;
  equals: string | number | boolean;
}

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  options?: FormFieldOption[];
  visible_if?: VisibleIf;
  /** per type="number" */
  min?: number;
  /** per type="number" */
  max?: number;
  /** per type="upload", in MB */
  max_size_mb?: number;
  /** per type="upload", estensioni accettate (senza punto), es. ["pdf","jpg"] */
  accept?: string[];
  /** per type="array", template di sub-fields per ogni elemento */
  item_template?: { fields: FormField[] };
}

export interface FormStep {
  key: string;
  label: string;
  visible_if?: VisibleIf;
  fields: FormField[];
}

export interface FormSchema {
  steps: FormStep[];
}

export interface FormModule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  prodotto_match: string[];
  schema: FormSchema;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}
