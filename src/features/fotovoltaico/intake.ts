export type PlantStatus =
  | ""
  | "lavori_non_iniziati"
  | "lavori_in_corso"
  | "installato_non_connesso"
  | "gia_connesso";

export type TriState = "" | "si" | "no" | "non_so";

export type PhotovoltaicIntake = {
  statoImpianto: PlantStatus;
  parte1: TriState;
  proprietarioNome: string;
  proprietarioTelefono: string;
  proprietarioEmail: string;
  indirizzoImpianto: string;
  noteFinali: string;
  confermaDati: boolean;
  accettaCosto: boolean;
};

export const PHOTOVOLTAICO_PRICE_EUR = 240;
export const PHOTOVOLTAICO_IVA_PERCENT = 22;

export const EMPTY_PHOTOVOLTAICO_INTAKE: PhotovoltaicIntake = {
  statoImpianto: "",
  parte1: "",
  proprietarioNome: "",
  proprietarioTelefono: "",
  proprietarioEmail: "",
  indirizzoImpianto: "",
  noteFinali: "",
  confermaDati: false,
  accettaCosto: false,
};

const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
const validPhone = (value: string) => value.replace(/\D/g, "").length >= 8;

export function validatePhotovoltaicSubmission(data: PhotovoltaicIntake): string[] {
  const errors: string[] = [];
  if (!data.statoImpianto) errors.push("Indica lo stato reale dell'impianto.");
  if (!data.parte1) errors.push("Indica se la Parte I è già stata presentata.");
  if (!data.proprietarioNome.trim()) errors.push("Inserisci nome e cognome del proprietario.");
  if (!validPhone(data.proprietarioTelefono)) errors.push("Inserisci il telefono del proprietario.");
  if (!validEmail(data.proprietarioEmail)) errors.push("Inserisci un'e-mail valida del proprietario.");
  if (!data.indirizzoImpianto.trim()) errors.push("Inserisci l'indirizzo dell'impianto.");
  if (!data.confermaDati) errors.push("Conferma la correttezza dei dati trasmessi.");
  if (!data.accettaCosto) errors.push("Accetta il costo della pratica per procedere con l'invio.");
  return errors;
}
