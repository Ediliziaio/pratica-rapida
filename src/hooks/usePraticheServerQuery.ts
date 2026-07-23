/**
 * Server-side paginated & filtered queries for Pratiche.
 *
 * Strategy:
 *   - List / Table views  → usePratichePagedQuery   (50 rows per page)
 *   - Pipeline / Kanban   → usePraticheAllQuery      (server-filtered, capped at 300)
 *   - KPI counters        → useCompanyPraticheKpi / useAdminPraticheKpi  (HEAD-only counts)
 *
 * All heavy filtering happens in Postgres (not in the browser), so thousands
 * of rows never hit the network unless the user explicitly loads them.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PraticaUI } from "@/types/pratica";

/**
 * Tipo del query builder di Supabase per le query su `pratiche`.
 * Nota: qui il `.select()` riceve una STRINGA DINAMICA (il parametro `select`),
 * caso che supabase-js non riesce a tipizzare — il builder risultante è opaco.
 * È un limite noto della libreria: manteniamo `any` SOLO in questo alias, con
 * disable mirato, per poter tipizzare `applyFilters`/`scope` in modo coerente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PraticheQuery = any;

// ── Constants ──────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50;
export const PIPELINE_CAP = 300;

// ── Filter bag ─────────────────────────────────────────────────────────────────

export interface PraticheServerFilters {
  /** Scope to a single company (company-user view) */
  companyId?: string | null;
  /** Force-restrict to a specific assegnatario (operatore without see_all) */
  restrictToUserId?: string | null;

  // Shared
  search?: string;
  stato?: string;                            // "" | "all" → ignored
  brand?: "all" | "enea" | "conto_termico";
  dateFrom?: string;                         // "YYYY-MM-DD"
  dateTo?: string;                           // "YYYY-MM-DD"

  // Company view
  clienteId?: string;

  // Admin view
  aziendaId?: string;                        // "all" → ignored
  pagamento?: string;                        // "all" → ignored
  operatoreId?: string;                      // "all" | "unassigned" | uuid
}

// ── Result shapes ──────────────────────────────────────────────────────────────

export interface PagedResult {
  items: PraticaUI[];
  total: number;
  pageCount: number;
}

export interface AllResult {
  items: PraticaUI[];
  total: number;
  /** true when the DB has more rows than PIPELINE_CAP */
  capped: boolean;
}

export interface CompanyKpi {
  totale: number;
  inLavorazione: number;
  attesaDoc: number;
  completateMese: number;
}

export interface AdminKpi {
  totale: number;
  attive: number;
  completate: number;
  daFatturare: number;
}

// ── Internal helper ────────────────────────────────────────────────────────────

/**
 * Serializza i filtri in una stringa stabile per la queryKey di React Query.
 *
 * Senza questo, ogni nuovo riferimento a `filters` (anche con stessi valori)
 * genera una queryKey "diversa" da TanStack → cache miss → refetch inutile.
 * Es. il parent passa `{ brand: "all", stato: "active" }` e poi
 * `{ stato: "active", brand: "all" }` — stesso filtro logico ma object refs
 * diverse + ordine chiavi diverso, cache miss in entrambi i casi.
 *
 * Normalizzando: sort keys + JSON.stringify → stessa stringa per stessi valori.
 * Cache hit garantito quando i filtri logici non sono cambiati.
 */
function filterKey(f: PraticheServerFilters): string {
  const keys = Object.keys(f).sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (f as Record<string, unknown>)[k];
    // skippa undefined/null/stringa vuota — non discriminano logicamente
    if (v === undefined || v === null || v === "") continue;
    obj[k] = v;
  }
  return JSON.stringify(obj);
}

function applyFilters(q: PraticheQuery, f: PraticheServerFilters): PraticheQuery {
  if (f.companyId)         q = q.eq("company_id", f.companyId);
  if (f.restrictToUserId)  q = q.eq("assegnatario_id", f.restrictToUserId);

  if (f.search?.trim())    q = q.ilike("titolo", `%${f.search.trim()}%`);

  if (f.stato && f.stato !== "" && f.stato !== "all")
    q = q.eq("stato", f.stato);

  if (f.brand === "conto_termico")
    q = q.filter("dati_pratica->>brand", "eq", "conto_termico");
  else if (f.brand === "enea")
    q = q.or("dati_pratica->>brand.eq.enea,dati_pratica->>brand.is.null");

  if (f.dateFrom) q = q.gte("created_at", `${f.dateFrom}T00:00:00`);
  if (f.dateTo)   q = q.lte("created_at", `${f.dateTo}T23:59:59`);

  if (f.clienteId)                            q = q.eq("cliente_finale_id", f.clienteId);
  if (f.aziendaId   && f.aziendaId   !== "all") q = q.eq("company_id", f.aziendaId);
  if (f.pagamento   && f.pagamento   !== "all") q = q.eq("pagamento_stato", f.pagamento);

  if (f.operatoreId && f.operatoreId !== "all") {
    if (f.operatoreId === "unassigned") q = q.is("assegnatario_id", null);
    else                                q = q.eq("assegnatario_id", f.operatoreId);
  }

  return q;
}

// ── Paginated query (list / table) ─────────────────────────────────────────────

export function usePratichePagedQuery(
  filters: PraticheServerFilters,
  page: number,
  select: string,
  enabled = true,
) {
  return useQuery<PagedResult>({
    queryKey: ["pratiche-server", "paged", filterKey(filters), page, select],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let q: PraticheQuery = supabase
        .from("pratiche")
        .select(select, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      q = applyFilters(q, filters);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        items:     (data as PraticaUI[] | null) ?? [],
        total:     count ?? 0,
        pageCount: Math.ceil((count ?? 0) / PAGE_SIZE),
      };
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

// ── All-records query (pipeline / kanban) ──────────────────────────────────────

export function usePraticheAllQuery(
  filters: PraticheServerFilters,
  select: string,
  enabled = true,
) {
  return useQuery<AllResult>({
    queryKey: ["pratiche-server", "all", filterKey(filters), select],
    queryFn: async () => {
      let q: PraticheQuery = supabase
        .from("pratiche")
        .select(select, { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(PIPELINE_CAP);

      q = applyFilters(q, filters);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        items:  (data as PraticaUI[] | null) ?? [],
        total:  count ?? 0,
        capped: (count ?? 0) > PIPELINE_CAP,
      };
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

// ── Company KPI counts ─────────────────────────────────────────────────────────

export function useCompanyPraticheKpi(companyId: string | null) {
  return useQuery<CompanyKpi>({
    queryKey: ["pratiche-kpi", "company", companyId],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [tot, lav, att, comp] = await Promise.all([
        supabase
          .from("pratiche").select("*", { count: "exact", head: true })
          .eq("company_id", companyId!),
        supabase
          .from("pratiche").select("*", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("stato", "in_lavorazione"),
        supabase
          .from("pratiche").select("*", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("stato", "in_attesa_documenti"),
        supabase
          .from("pratiche").select("*", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("stato", "completata")
          .gte("updated_at", startOfMonth.toISOString()),
      ]);

      // Se una delle count query fallisce (RLS / network / column non esiste)
      // dobbiamo far surface l'errore: altrimenti il dashboard mostra "0" e
      // l'utente pensa di non avere pratiche, mentre invece la query è rotta.
      const firstError = [tot, lav, att, comp].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      return {
        totale:        tot.count  ?? 0,
        inLavorazione: lav.count  ?? 0,
        attesaDoc:     att.count  ?? 0,
        completateMese: comp.count ?? 0,
      };
    },
    enabled:   !!companyId,
    staleTime: 60_000, // 1 min
  });
}

// ── Admin KPI counts ───────────────────────────────────────────────────────────

export function useAdminPraticheKpi(seeAll: boolean, userId: string | null) {
  return useQuery<AdminKpi>({
    queryKey: ["pratiche-kpi", "admin", seeAll, userId],
    queryFn: async () => {
      const scope = (q: PraticheQuery) =>
        !seeAll && userId ? q.eq("assegnatario_id", userId) : q;

      const [tot, att, comp] = await Promise.all([
        scope(supabase.from("pratiche").select("*", { count: "exact", head: true })),
        scope(supabase.from("pratiche").select("*", { count: "exact", head: true }))
          .in("stato", ["inviata", "in_lavorazione", "in_attesa_documenti"]),
        scope(supabase.from("pratiche").select("*", { count: "exact", head: true }))
          .eq("stato", "completata"),
      ]);

      // Fetch prezzo only for completed+unpaid rows
      const { data: dfData } = await scope(
        supabase.from("pratiche").select("prezzo"),
      ).eq("stato", "completata").eq("pagamento_stato", "non_pagata");

      const daFatturare = (dfData ?? []).reduce(
        (s: number, p) => s + (p.prezzo || 0),
        0,
      );

      return {
        totale:      tot.count  ?? 0,
        attive:      att.count  ?? 0,
        completate:  comp.count ?? 0,
        daFatturare,
      };
    },
    staleTime: 30_000, // 30 s
  });
}
