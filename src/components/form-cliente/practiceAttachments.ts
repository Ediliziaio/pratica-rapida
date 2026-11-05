import type { FormClienteData } from "@/types/form-cliente";
import type { FormSchema } from "@/types/form-module";

export interface PracticeAttachments {
  fatture_urls: string[];
  documenti_aggiuntivi_urls: string[];
}

export const emptyPracticeAttachments: PracticeAttachments = {
  fatture_urls: [],
  documenti_aggiuntivi_urls: [],
};

function uniquePaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.filter((path): path is string =>
    typeof path === "string" && path.trim().length > 0))];
}

export function normalizePracticeAttachments(value: unknown): PracticeAttachments {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    fatture_urls: uniquePaths(row.fatture_urls),
    documenti_aggiuntivi_urls: uniquePaths(row.documenti_aggiuntivi_urls),
  };
}

export function allPracticeAttachmentPaths(attachments: PracticeAttachments): string[] {
  return uniquePaths([...attachments.fatture_urls, ...attachments.documenti_aggiuntivi_urls]);
}

// dati_form can remember the field in which a customer uploaded a file, but
// only the practice columns establish whether that file still belongs to the
// practice. The form must never render a stale path from the answer snapshot.
function visibleFieldPaths(value: unknown, available: ReadonlySet<string>): string[] {
  const paths = Array.isArray(value) ? value : [value];
  return paths.filter((path): path is string => typeof path === "string" && available.has(path));
}

export function hydrateHardcodedAttachments(
  data: FormClienteData,
  attachments: PracticeAttachments,
  pendingUploads: ReadonlySet<string> = new Set(),
): FormClienteData {
  const available = new Set([...allPracticeAttachmentPaths(attachments), ...pendingUploads]);
  const pendingInvoice = visibleFieldPaths(data.documenti.fattura_url, pendingUploads);
  const rememberedBonifico = visibleFieldPaths(data.documenti.bonifico_url, available);
  return {
    ...data,
    documenti: {
      ...data.documenti,
      fattura_url: pendingInvoice.at(-1) ?? attachments.fatture_urls.at(-1) ?? "",
      bonifico_url: rememberedBonifico.at(-1) ?? "",
    },
  };
}

export function hydrateDynamicAttachments(
  data: Record<string, Record<string, unknown>>,
  schema: FormSchema | null,
  attachments: PracticeAttachments,
  pendingUploads: ReadonlySet<string> = new Set(),
): Record<string, Record<string, unknown>> {
  if (!schema) return data;
  const available = new Set([...allPracticeAttachmentPaths(attachments), ...pendingUploads]);
  const next = { ...data };
  for (const step of schema.steps) {
    for (const field of step.fields) {
      if (field.type !== "upload") continue;
      const remembered = visibleFieldPaths(data[step.key]?.[field.key], available);
      const isInvoice = /fattur|invoice/i.test(`${field.key} ${field.label}`);
      const paths = isInvoice
        ? uniquePaths([...attachments.fatture_urls, ...remembered.filter((path) => pendingUploads.has(path))])
        : remembered;
      next[step.key] = {
        ...(next[step.key] ?? {}),
        [field.key]: field.multiple ? paths : paths.at(-1) ?? "",
      };
    }
  }
  return next;
}
