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
  items: any[];
  total: number;
  pageCount: number;
}

export interface AllResult {
  items: any[];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: PraticheServerFilters): any {
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
    queryKey: ["pratiche-server", "paged", filters, page, select],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let q: any = supabase
        .from("pratiche")
        .select(select, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      q = applyFilters(q, filters);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        items:     data ?? [],
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
    queryKey: ["pratiche-server", "all", filters, select],
    queryFn: async () => {
      let q: any = supabase
        .from("pratiche")
        .select(select, { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(PIPELINE_CAP);

      q = applyFilters(q, filters);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        items:  data ?? [],
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
      const scope = (q: any) =>
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
        (s: number, p: any) => s + (p.prezzo || 0),
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
