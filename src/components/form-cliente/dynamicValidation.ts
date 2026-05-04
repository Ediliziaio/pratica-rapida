// ============================================================
// dynamicValidation
//
// Validazione generica per il form pubblico cliente quando lo schema
// arriva dal DB (`form_modules`). Lo schema TS hardcoded ha la sua
// validation in `./validation.ts`; questo file vale solo per il path
// dinamico.
//
// Le chiavi degli errori usano il formato "stepKey.fieldKey" così da
// matchare quanto ci si aspetta in `<DynamicSteps>`.
// ============================================================

import type { FormField, FormSchema, FormStep, VisibleIf } from "@/types/form-module";

export type DynamicErrorMap = Record<string, string>;
export type DynamicFormData = Record<string, Record<string, unknown>>;

/**
 * Verifica se la condizione `visible_if` è soddisfatta dal `formData`.
 * Path è dot-notation: "stepKey.fieldKey".
 * Ritorna `true` se la condizione passa o se non c'è `visibleIf`.
 * Ritorna `false` se il path non esiste o la condizione fallisce.
 */
export function checkVisibleIf(
  visibleIf: VisibleIf | undefined,
  formData: DynamicFormData,
): boolean {
  if (!visibleIf) return true;
  const parts = visibleIf.path.split(".");
  if (parts.length !== 2) return false;
  const [stepKey, fieldKey] = parts;
  const val = formData[stepKey]?.[fieldKey];
  // Confronto loose-coerce: visible_if.equals può essere boolean/number/string,
  // ma in DB l'utente potrebbe aver salvato la stringa "true"/"false" ecc.
  if (typeof visibleIf.equals === "boolean" && typeof val === "string") {
    return val === String(visibleIf.equals);
  }
  return val === visibleIf.equals;
}

/**
 * Validazione di un singolo step. Salta i field non visibili (visible_if).
 */
export function validateDynamicStep(
  step: FormStep,
  formData: DynamicFormData,
): DynamicErrorMap {
  const errors: DynamicErrorMap = {};
  if (!step.fields || step.fields.length === 0) return errors;

  for (const field of step.fields) {
    if (field.visible_if && !checkVisibleIf(field.visible_if, formData)) continue;

    const errKey = `${step.key}.${field.key}`;
    const value = formData[step.key]?.[field.key];
    const valueStr = typeof value === "string" ? value : String(value ?? "");
    const trimmed = valueStr.trim();
    const isEmpty =
      value === undefined ||
      value === null ||
      trimmed === "" ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && isEmpty) {
      errors[errKey] = `${field.label} è obbligatorio`;
      continue;
    }

    // Niente validazione di tipo se il campo è vuoto e non required.
    if (isEmpty) continue;

    switch (field.type) {
      case "email": {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          errors[errKey] = "Email non valida";
        }
        break;
      }
      case "url": {
        if (!/^https?:\/\/.+/i.test(trimmed)) {
          errors[errKey] = "URL deve iniziare con http:// o https://";
        }
        break;
      }
      case "phone": {
        const digits = trimmed.replace(/\D/g, "");
        if (digits.length < 9 || digits.length > 13) {
          errors[errKey] = "Numero di telefono non valido";
        }
        break;
      }
      case "number": {
        const n = Number(trimmed);
        if (Number.isNaN(n)) {
          errors[errKey] = "Numero non valido";
        } else if (field.min !== undefined && n < field.min) {
          errors[errKey] = `Minimo ${field.min}`;
        } else if (field.max !== undefined && n > field.max) {
          errors[errKey] = `Massimo ${field.max}`;
        }
        break;
      }
      case "array": {
        // Se è array di sub-form, validiamo ogni item su item_template.fields.
        if (!Array.isArray(value) || !field.item_template) break;
        const itemFields = field.item_template.fields ?? [];
        value.forEach((rawItem, idx) => {
          const item = (rawItem ?? {}) as Record<string, unknown>;
          for (const sub of itemFields) {
            const subVal = item[sub.key];
            const subStr = typeof subVal === "string" ? subVal : String(subVal ?? "");
            const subEmpty =
              subVal === undefined ||
              subVal === null ||
              subStr.trim() === "" ||
              (Array.isArray(subVal) && subVal.length === 0);
            if (sub.required && subEmpty) {
              errors[`${step.key}.${field.key}.${idx}.${sub.key}`] =
                `${sub.label} è obbligatorio`;
            }
          }
        });
        break;
      }
      default:
        // text/textarea/date/time/boolean/select/radio/multi_select/upload:
        // niente validazione extra oltre a "required".
        break;
    }
  }
  return errors;
}

/**
 * Validazione di tutti gli step visibili. Step con `visible_if` non
 * soddisfatto vengono skippati interamente.
 */
export function validateAllDynamicSteps(
  schema: FormSchema,
  formData: DynamicFormData,
): DynamicErrorMap {
  const all: DynamicErrorMap = {};
  for (const step of schema.steps ?? []) {
    if (step.visible_if && !checkVisibleIf(step.visible_if, formData)) continue;
    Object.assign(all, validateDynamicStep(step, formData));
  }
  return all;
}

/**
 * Filtra gli step "visibili" dato il formData corrente. Utile per il
 * progress bar e la step navigation.
 */
export function getVisibleSteps(schema: FormSchema, formData: DynamicFormData): FormStep[] {
  return (schema.steps ?? []).filter(
    (s) => !s.visible_if || checkVisibleIf(s.visible_if, formData),
  );
}

// Re-export per comodità nei consumer.
export type { FormField, FormSchema, FormStep };
