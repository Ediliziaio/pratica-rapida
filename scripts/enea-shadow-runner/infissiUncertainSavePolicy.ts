import type { AprEneaProductModule } from "./aprEneaBrowserWorker";

export function aprEneaProductModuleFromUnknown(value: unknown): AprEneaProductModule | undefined {
  return value === "screening" || value === "infissi" ? value : undefined;
}

export function nestedUncertainPageSaveProbeAllowed(module: AprEneaProductModule | undefined, pageId: string) {
  if (!pageId.startsWith("screening:")) return true;
  return module === "infissi" || module === "screening";
}

export function infissiRowPersistenceSurfaceOutcome(pageId: string, rowCount: number, surfaceReady: boolean): "present" | "absent" | "inconclusive" {
  const ordinal = Number(pageId.slice("screening:".length));
  if (!Number.isInteger(ordinal) || ordinal < 1 || !Number.isInteger(rowCount) || rowCount < 0 || !surfaceReady) return "inconclusive";
  if (rowCount >= ordinal) return "present";
  // Le righe vengono create in sequenza. Se tutte le N-1 righe precedenti
  // esistono nella tabella server e la N manca, l'assenza della N è provata.
  return rowCount === ordinal - 1 ? "absent" : "inconclusive";
}

export function infissiStagedRowOutcome(input: {
  pageId: string;
  visibleRowCount: number;
  paginationTotal: number | null;
  matchingVisibleRows: number;
  expectedOccurrence: number;
}): "present" | "absent" | "inconclusive" {
  const ordinal = Number(input.pageId.slice("screening:".length));
  if (!Number.isInteger(ordinal) || ordinal < 1 || !Number.isInteger(input.visibleRowCount) || input.visibleRowCount < 0 || !Number.isInteger(input.matchingVisibleRows) || input.matchingVisibleRows < 0 || !Number.isInteger(input.expectedOccurrence) || input.expectedOccurrence < 1) return "inconclusive";
  const total = input.paginationTotal === null ? input.visibleRowCount : input.paginationTotal;
  if (!Number.isInteger(total) || total < 0) return "inconclusive";
  // ENEA puo' paginare o riordinare la tabella quando viene aggiunta la riga
  // che supera la prima pagina. La prova richiede sia la cardinalita' totale N
  // sia il numero corretto di occorrenze visibili della riga corrente; non usa
  // mai la fragile posizione rows[N-1].
  // Se la tabella e' paginata, il contatore totale del widget e' una prova
  // distinta dalle sole righe DOM della pagina corrente.  In quel caso la
  // riga appena aggiunta puo' essere stata riordinata su un'altra pagina: la
  // crescita sequenziale del totale fino all'ordinale atteso prova lo staging
  // senza pretendere che la riga sia anche visibile nella pagina corrente.
  if (total >= ordinal && (input.matchingVisibleRows >= input.expectedOccurrence || input.paginationTotal !== null)) return "present";
  if (total === ordinal - 1) return "absent";
  return "inconclusive";
}
