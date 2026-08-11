export interface WhatsappCrmGroundingInput {
  conversationPracticeId: string | null;
  conversationPhone: string;
  practiceId: string | null;
  practiceCustomerPhone: string | null;
}

export interface WhatsappCrmGroundingResult {
  grounded: boolean;
  reason: string;
}

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function comparablePhone(value: string | null | undefined): string {
  const normalized = digits(value);
  // I numeri possono arrivare con/senza prefisso internazionale; per il gate
  // confrontiamo la coda significativa, ma non accettiamo valori troppo corti.
  if (normalized.length < 8) return "";
  return normalized.slice(-10);
}

/**
 * Gate di identità prima di usare dati di una pratica in una risposta WhatsApp.
 * Il semplice fatto che un modello abbia "trovato" una pratica non basta:
 * serve il collegamento persistito sulla conversazione e, quando disponibile,
 * la coerenza del telefono del cliente.
 */
export function evaluateWhatsappCrmGrounding(
  input: WhatsappCrmGroundingInput,
): WhatsappCrmGroundingResult {
  if (!input.conversationPracticeId) {
    return { grounded: false, reason: "Conversazione non collegata a una pratica CRM" };
  }

  if (!input.practiceId || input.practiceId !== input.conversationPracticeId) {
    return { grounded: false, reason: "La pratica recuperata non coincide con quella collegata alla conversazione" };
  }

  const conversationPhone = comparablePhone(input.conversationPhone);
  const practicePhone = comparablePhone(input.practiceCustomerPhone);
  if (!conversationPhone || !practicePhone) {
    return { grounded: false, reason: "Telefono cliente insufficiente per verificare l'identità" };
  }

  if (conversationPhone !== practicePhone) {
    return { grounded: false, reason: "Il telefono WhatsApp non coincide con il cliente della pratica" };
  }

  return { grounded: true, reason: "Pratica collegata e telefono cliente coerente" };
}
