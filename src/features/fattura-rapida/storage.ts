import type { Workspace } from "./domain";

export const FATTURA_RAPIDA_STORAGE_PREFIX = "fattura-rapida:workspace:v1:";

export function emptyWorkspace(companyId: string): Workspace {
  return { schemaVersion: 1, companyId, quotes: [], invoices: [], requests: [] };
}

function isWorkspace(value: unknown, companyId: string): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Workspace>;
  return candidate.schemaVersion === 1
    && candidate.companyId === companyId
    && Array.isArray(candidate.quotes)
    && Array.isArray(candidate.invoices)
    && Array.isArray(candidate.requests)
    && candidate.quotes.every((quote) => quote.companyId === companyId)
    && candidate.invoices.every((invoice) => invoice.companyId === companyId)
    && candidate.requests.every((request) => request.companyId === companyId);
}

export function loadWorkspace(storage: Pick<Storage, "getItem">, companyId: string): Workspace {
  try {
    const raw = storage.getItem(`${FATTURA_RAPIDA_STORAGE_PREFIX}${companyId}`);
    if (!raw) return emptyWorkspace(companyId);
    const parsed: unknown = JSON.parse(raw);
    return isWorkspace(parsed, companyId) ? parsed : emptyWorkspace(companyId);
  } catch {
    return emptyWorkspace(companyId);
  }
}

export function saveWorkspace(storage: Pick<Storage, "setItem">, workspace: Workspace): boolean {
  try {
    storage.setItem(`${FATTURA_RAPIDA_STORAGE_PREFIX}${workspace.companyId}`, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
