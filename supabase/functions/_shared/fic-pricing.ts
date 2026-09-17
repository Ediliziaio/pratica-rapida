export type PaymentLineCode = "PR-CF" | "PR-CATASTO" | "PR-TEST";

export interface PaymentLine {
  code: PaymentLineCode;
  name: string;
  netCents: number;
  vatPercent: number;
}

export interface PaymentPricing {
  pricingKey: "prezzo_cf_standard" | "prezzo_cf_sima_home" | "prezzo_servizio_catastale" | "prezzo_test_pagamento";
  cadastralService: boolean;
  lines: PaymentLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export function createTestPaymentPricing(vatPercent = 22, netCents = 82): PaymentPricing {
  if (!Number.isInteger(netCents) || netCents <= 0) throw new Error("Prezzo di collaudo non valido");
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) throw new Error("IVA di collaudo non valida");
  const vatCents = Math.round(netCents * vatPercent / 100);
  return {
    pricingKey: "prezzo_test_pagamento",
    cadastralService: false,
    lines: [{
      code: "PR-TEST",
      name: "Collaudo tecnico pagamento Pratica Rapida",
      netCents,
      vatPercent,
    }],
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
  };
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 ||
    (typeof value === "string" && ["true", "1", "si", "sì", "yes"].includes(value.trim().toLowerCase()));
}

export function isCadastralServiceRequested(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const cadastral = (data as Record<string, unknown>).catastali;
  if (!cadastral || typeof cadastral !== "object" || Array.isArray(cadastral)) return false;
  return truthy((cadastral as Record<string, unknown>).recupero_richiesto);
}

export function calculatePaymentPricing(input: {
  tipoFatturazione: string | null | undefined;
  resellerId: string | null | undefined;
  simaResellerId: string;
  standardNetCents: number;
  simaNetCents: number;
  cadastralNetCents: number;
  vatPercent: number;
  cadastralService: boolean;
  product: string;
}): PaymentPricing {
  const isCf = input.tipoFatturazione === "cliente_finale";
  if (!isCf && !input.cadastralService) {
    throw new Error("La pratica non richiede un pagamento al cliente finale");
  }

  const lines: PaymentLine[] = [];
  let pricingKey: PaymentPricing["pricingKey"] = "prezzo_servizio_catastale";
  if (isCf) {
    const isSima = input.resellerId === input.simaResellerId;
    pricingKey = isSima ? "prezzo_cf_sima_home" : "prezzo_cf_standard";
    lines.push({
      code: "PR-CF",
      name: `Servizio gestione pratica ${input.product || "ENEA"}`,
      netCents: isSima ? input.simaNetCents : input.standardNetCents,
      vatPercent: input.vatPercent,
    });
  }
  if (input.cadastralService) {
    lines.push({
      code: "PR-CATASTO",
      name: "Servizio ricerca dati catastali",
      netCents: input.cadastralNetCents,
      vatPercent: input.vatPercent,
    });
  }

  for (const line of lines) {
    if (!Number.isInteger(line.netCents) || line.netCents <= 0) throw new Error(`Prezzo non valido: ${line.code}`);
  }
  const netCents = lines.reduce((sum, line) => sum + line.netCents, 0);
  const vatCents = lines.reduce(
    (sum, line) => sum + Math.round(line.netCents * line.vatPercent / 100),
    0,
  );
  return {
    pricingKey,
    cadastralService: input.cadastralService,
    lines,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
  };
}
