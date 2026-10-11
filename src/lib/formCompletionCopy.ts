export type FormCompletionCopy = {
  title: string;
  message: string;
};

/**
 * La conferma di pagamento e' ammessa soltanto per un percorso che richiedeva
 * davvero il pagamento. Per le pratiche a carico del rivenditore confermiamo
 * esclusivamente la ricezione dei dati.
 */
export function getFormCompletionCopy(
  paymentRequired: boolean,
  /**
   * Chi ha preso in carico la pratica. E' un parametro e non una costante
   * perche' questo modulo serve due marchi, e il nome di uno non deve
   * nemmeno finire dentro al pacchetto dell'altro.
   */
  marchio: string,
): FormCompletionCopy {
  if (paymentRequired) {
    return {
      title: "Pagamento effettuato e pratica inviata ✓",
      message: "Pagamento effettuato. La fattura è stata inviata allo SDI e all’indirizzo e-mail indicato. Grazie.",
    };
  }
  return {
    title: "Pratica inviata ✓",
    message: `I dati sono stati registrati correttamente. La pratica è stata presa in carico da ${marchio}.`,
  };
}
