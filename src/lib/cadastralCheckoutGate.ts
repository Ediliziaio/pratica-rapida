export interface CadastralCheckoutGateInput {
  isCadastralStep: boolean;
  serviceRequested: boolean;
  billingType: string | null | undefined;
  paymentConfirmed: boolean;
}

/**
 * Decide se il wizard deve fermarsi al Catasto e aprire il pagamento.
 *
 * Non usa `payment_required` letto all'apertura del form: quel valore descrive
 * la bozza precedente e rimane falso quando il cliente seleziona il servizio
 * durante la sessione corrente. Solo un pagamento realmente confermato può
 * sbloccare lo step successivo.
 */
export function shouldStartCadastralCheckout({
  isCadastralStep,
  serviceRequested,
  billingType,
  paymentConfirmed,
}: CadastralCheckoutGateInput): boolean {
  return isCadastralStep
    && serviceRequested
    && billingType !== "cliente_finale"
    && !paymentConfirmed;
}
