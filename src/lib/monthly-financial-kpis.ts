export type MonthlyFinancialPractice = {
  label?: string;
  revenue_at: string;
  prezzo: number | string | null;
  prezzo_listino?: number | string | null;
  pagamento_stato: string | null;
};

export type MonthlyFinancialKpis = {
  fatturato: number;
  incassato: number;
  daIncassare: number;
  pratiche: number;
  senzaPrezzo: number;
  senzaPrezzoLabels: string[];
};

export type MonthlyPriceFallbackInput = {
  tipoFatturazione: string | null;
  resellerName: string | null;
};

function normalizedCompanyName(value: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Listino operativo autorizzato per le pratiche che non hanno ancora il
 * prezzo salvato sulla singola riga. Gli importi sono imponibili (netto IVA).
 */
export function fallbackMonthlyPracticePrice({
  tipoFatturazione,
  resellerName,
}: MonthlyPriceFallbackInput): number {
  const company = normalizedCompanyName(resellerName);

  if (tipoFatturazione === "cliente_finale") {
    return company.includes("sima home") ? 100 : 150;
  }

  if (company.includes("brianza serramenti") || /(^| )vans( |$)/.test(company)) return 60;
  if (company.includes("rinaldi lab")) return 75;
  return 65;
}

const ROME_TIME_ZONE = "Europe/Rome";

function monthKey(value: Date, timeZone = ROME_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function netAmount(practice: MonthlyFinancialPractice): number {
  const recorded = Number(practice.prezzo ?? 0);
  const amount = recorded > 0 ? recorded : Number(practice.prezzo_listino ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Calcola il riepilogo economico del mese nel fuso operativo italiano.
 * `revenue_at` e il momento in cui la pratica e entrata nella colonna
 * "Da inserire su Excel", non la data in cui il cliente l'ha creata.
 * `prezzo` e gia l'imponibile: non va scorporata nuovamente l'IVA.
 * Le pratiche archiviate restano incluse, perche la chiusura non cancella il
 * fatturato del mese. I rimborsi, invece, non sono fatturato ne incasso.
 */
export function calculateMonthlyFinancialKpis(
  practices: MonthlyFinancialPractice[],
  now = new Date(),
): MonthlyFinancialKpis {
  const currentMonth = monthKey(now);
  let fatturato = 0;
  let incassato = 0;
  let daIncassare = 0;
  let pratiche = 0;
  let senzaPrezzo = 0;
  const senzaPrezzoLabels: string[] = [];

  for (const practice of practices) {
    const revenueAt = new Date(practice.revenue_at);
    if (Number.isNaN(revenueAt.getTime()) || monthKey(revenueAt) !== currentMonth) continue;

    pratiche += 1;
    const amount = netAmount(practice);
    if (amount === 0) {
      senzaPrezzo += 1;
      if (practice.label) senzaPrezzoLabels.push(practice.label);
    }
    if (practice.pagamento_stato === "rimborsata") continue;

    fatturato += amount;
    if (practice.pagamento_stato === "pagata") {
      incassato += amount;
    } else {
      // non_pagata, in_verifica e valori legacy/null restano da incassare.
      daIncassare += amount;
    }
  }

  return { fatturato, incassato, daIncassare, pratiche, senzaPrezzo, senzaPrezzoLabels };
}
