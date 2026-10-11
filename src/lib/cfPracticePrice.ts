export type CfPriceSettingRow = {
  key: string;
  value: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveCents(value: unknown, key: string): number {
  const cents = Number(record(value).imponibile_cents);
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error(`Prezzo CF non configurato: ${key}`);
  }
  return cents;
}

/**
 * Restituisce l'imponibile CF in euro usando la stessa configurazione
 * server-side del checkout. Non usa mai il listino del rivenditore: il badge
 * CF significa che il servizio viene pagato dal cliente finale.
 */
export function cfNetPriceEurFromSettings(rows: CfPriceSettingRow[], resellerId: string): number {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const simaId = String(record(byKey.get("cf_sima_home_company_id")).company_id ?? "").trim();
  const pricingKey = simaId && resellerId === simaId
    ? "prezzo_cf_sima_home"
    : "prezzo_cf_standard";
  return positiveCents(byKey.get(pricingKey), pricingKey) / 100;
}
