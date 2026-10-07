export type MonthlyFinancialPractice = {
  created_at: string;
  prezzo: number | string | null;
  prezzo_listino?: number | string | null;
  pagamento_stato: string | null;
};

export type MonthlyFinancialKpis = {
  fatturato: number;
  incassato: number;
  daIncassare: number;
  pratiche: number;
};

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

  for (const practice of practices) {
    const createdAt = new Date(practice.created_at);
    if (Number.isNaN(createdAt.getTime()) || monthKey(createdAt) !== currentMonth) continue;

    pratiche += 1;
    const amount = netAmount(practice);
    if (practice.pagamento_stato === "rimborsata") continue;

    fatturato += amount;
    if (practice.pagamento_stato === "pagata") {
      incassato += amount;
    } else {
      // non_pagata, in_verifica e valori legacy/null restano da incassare.
      daIncassare += amount;
    }
  }

  return { fatturato, incassato, daIncassare, pratiche };
}
