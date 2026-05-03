// Tipi per il form pubblico cliente (multi-step) salvato in
// `enea_practices.dati_form` (jsonb) via RPC `save_form_draft_by_token` e
// `submit_form_by_token`.

export type StepId =
  | "richiedente"
  | "indirizzo"
  | "cointestazione"
  | "catastali"
  | "edificio"
  | "impianto"
  | "prodotto"
  | "recap";

export type ProdottoTipo = "infissi" | "schermature" | "impianto_termico";

export type TitoloRichiedente =
  | "proprietario_o_comproprietario"
  | "detentore_o_affittuario"
  | "familiare_o_convivente";

export type TipologiaEdificio =
  | "casa_singola_o_plurifamiliare"
  | "edificio_fino_3_piani"
  | "edificio_oltre_3_piani"
  | "edificio_industriale_o_commerciale";

export type ImpiantoTipo =
  | "autonomo"
  | "centralizzato"
  | "centralizzato_con_termostato";

export type Terminali = "caloriferi" | "riscaldamento_pavimento" | "split";

export type Combustibile =
  | "energia_elettrica"
  | "gas_metano"
  | "gpl"
  | "gasolio"
  | "teleriscaldamento";

export type TipoCaldaia =
  | "acqua_calda_standard"
  | "gas_a_condensazione"
  | "impianto_geotermico"
  | "caldaia_a_gpl"
  | "energia_elettrica"
  | "altro";

export type MaterialeInfisso = "legno" | "pvc" | "metallo";
export type TipoVetro = "singolo" | "doppio" | "triplo";

export type SchermaturaTipo = "tende_da_sole" | "pergotenda" | "pergola" | "altro";
export type SchermaturaDirezione = "sud" | "sud_est" | "sud_ovest" | "est" | "ovest";

export interface RichiedenteData {
  nome: string;
  cognome: string;
  comune_nascita: string;
  provincia_nascita: string;
  data_nascita: string;
  cf: string;
  email: string;
  telefono: string;
  abitazione_principale: boolean | null;
}

export interface ResidenzaData {
  comune: string;
  provincia: string;
  indirizzo: string;
  civico: string;
  cap: string;
  stesso_indirizzo_lavori: boolean | null;
}

export interface AppartamentoLavoriData {
  comune: string;
  provincia: string;
  indirizzo: string;
  numero: string;
  cap: string;
}

export interface CointestazioneData {
  presente: boolean | null;
  nome: string;
  cognome: string;
  cf: string;
}

export interface CatastaliData {
  foglio: string;
  mappale: string;
  subalterno: string;
  recupero_richiesto: boolean;
  proprietario_nome: string;
  proprietario_cognome: string;
  proprietario_cf: string;
}

export interface EdificioData {
  anno_costruzione: string;
  superficie_mq: string;
  numero_appartamenti: string;
  titolo_richiedente: TitoloRichiedente | "";
  tipologia: TipologiaEdificio | "";
}

export interface ImpiantoData {
  tipo: ImpiantoTipo | "";
  terminali: Terminali | "";
  combustibile: Combustibile | "";
  tipo_caldaia: TipoCaldaia | "";
  aria_condizionata: boolean | null;
  libretto_url?: string;
}

export interface ProdottoInfissiData {
  tipo: "infissi";
  vecchi_materiale: MaterialeInfisso | "";
  vecchi_vetro: TipoVetro | "";
  nuovi_materiale: MaterialeInfisso | "";
  nuovi_vetro: TipoVetro | "";
  zanzariere_tapparelle: boolean | null;
}

export interface SchermaturaItem {
  tipo: SchermaturaTipo | "";
  direzione: SchermaturaDirezione | "";
}

export interface ProdottoSchermatureData {
  tipo: "schermature";
  items: SchermaturaItem[];
}

export interface ProdottoImpiantoTermicoData {
  tipo: "impianto_termico";
  // libretto già su impianto.libretto_url; nessun campo extra al momento
}

export type ProdottoData =
  | ProdottoInfissiData
  | ProdottoSchermatureData
  | ProdottoImpiantoTermicoData;

export interface FormClienteData {
  richiedente: RichiedenteData;
  residenza: ResidenzaData;
  appartamento_lavori: AppartamentoLavoriData;
  cointestazione: CointestazioneData;
  catastali: CatastaliData;
  edificio: EdificioData;
  impianto: ImpiantoData;
  prodotto: ProdottoData;
}

export const STEPS: { id: StepId; label: string }[] = [
  { id: "richiedente", label: "Dati richiedente" },
  { id: "indirizzo", label: "Indirizzo" },
  { id: "cointestazione", label: "Cointestazione" },
  { id: "catastali", label: "Dati catastali" },
  { id: "edificio", label: "Edificio" },
  { id: "impianto", label: "Impianto termico" },
  { id: "prodotto", label: "Dati prodotto" },
  { id: "recap", label: "Riepilogo" },
];

// ── Helper: detection variante prodotto da `prodotto_installato` ───────────────
export function detectProdottoTipo(prodottoInstallato: string | null | undefined): ProdottoTipo {
  const v = (prodottoInstallato ?? "").toLowerCase();
  if (v.includes("infiss")) return "infissi";
  if (v.includes("schermat") || v.includes("tend") || v.includes("pergot")) return "schermature";
  if (v.includes("termico") || v.includes("pompa") || v.includes("calor")) return "impianto_termico";
  // fallback: infissi è la variante più comune; il recap mostrerà comunque tutto
  return "infissi";
}

export function emptyFormData(): FormClienteData {
  return {
    richiedente: {
      nome: "",
      cognome: "",
      comune_nascita: "",
      provincia_nascita: "",
      data_nascita: "",
      cf: "",
      email: "",
      telefono: "",
      abitazione_principale: null,
    },
    residenza: {
      comune: "",
      provincia: "",
      indirizzo: "",
      civico: "",
      cap: "",
      stesso_indirizzo_lavori: null,
    },
    appartamento_lavori: {
      comune: "",
      provincia: "",
      indirizzo: "",
      numero: "",
      cap: "",
    },
    cointestazione: {
      presente: null,
      nome: "",
      cognome: "",
      cf: "",
    },
    catastali: {
      foglio: "",
      mappale: "",
      subalterno: "",
      recupero_richiesto: false,
      proprietario_nome: "",
      proprietario_cognome: "",
      proprietario_cf: "",
    },
    edificio: {
      anno_costruzione: "",
      superficie_mq: "",
      numero_appartamenti: "",
      titolo_richiedente: "",
      tipologia: "",
    },
    impianto: {
      tipo: "",
      terminali: "",
      combustibile: "",
      tipo_caldaia: "",
      aria_condizionata: null,
    },
    prodotto: {
      tipo: "infissi",
      vecchi_materiale: "",
      vecchi_vetro: "",
      nuovi_materiale: "",
      nuovi_vetro: "",
      zanzariere_tapparelle: null,
    },
  };
}

// ── Validation regex (riusati dall'originale FormPubblico) ─────────────────────
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CF_RE = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 13;
}

// ── Labels umani per il recap ──────────────────────────────────────────────────
export const TITOLO_LABELS: Record<TitoloRichiedente, string> = {
  proprietario_o_comproprietario: "Proprietario / comproprietario",
  detentore_o_affittuario: "Detentore / affittuario",
  familiare_o_convivente: "Familiare / convivente",
};

export const TIPOLOGIA_LABELS: Record<TipologiaEdificio, string> = {
  casa_singola_o_plurifamiliare: "Casa singola o plurifamiliare",
  edificio_fino_3_piani: "Edificio fino a 3 piani",
  edificio_oltre_3_piani: "Edificio oltre 3 piani (4+)",
  edificio_industriale_o_commerciale: "Edificio industriale o commerciale",
};

export const IMPIANTO_TIPO_LABELS: Record<ImpiantoTipo, string> = {
  autonomo: "Autonomo",
  centralizzato: "Centralizzato",
  centralizzato_con_termostato: "Centralizzato con termostato nell'appartamento",
};

export const TERMINALI_LABELS: Record<Terminali, string> = {
  caloriferi: "Caloriferi",
  riscaldamento_pavimento: "Riscaldamento a pavimento",
  split: "Split",
};

export const COMBUSTIBILE_LABELS: Record<Combustibile, string> = {
  energia_elettrica: "Energia elettrica",
  gas_metano: "Gas metano",
  gpl: "GPL",
  gasolio: "Gasolio",
  teleriscaldamento: "Teleriscaldamento",
};

export const CALDAIA_LABELS: Record<TipoCaldaia, string> = {
  acqua_calda_standard: "Acqua calda standard",
  gas_a_condensazione: "Gas a condensazione",
  impianto_geotermico: "Impianto geotermico",
  caldaia_a_gpl: "Caldaia a GPL",
  energia_elettrica: "Energia elettrica",
  altro: "Altro",
};

export const MATERIALE_LABELS: Record<MaterialeInfisso, string> = {
  legno: "Legno",
  pvc: "PVC",
  metallo: "Metallo",
};

export const VETRO_LABELS: Record<TipoVetro, string> = {
  singolo: "Singolo",
  doppio: "Doppio",
  triplo: "Triplo",
};

export const SCHERMATURA_TIPO_LABELS: Record<SchermaturaTipo, string> = {
  tende_da_sole: "Tende da sole",
  pergotenda: "Pergotenda",
  pergola: "Pergola",
  altro: "Altro",
};

export const SCHERMATURA_DIREZIONE_LABELS: Record<SchermaturaDirezione, string> = {
  sud: "Sud",
  sud_est: "Sud-Est",
  sud_ovest: "Sud-Ovest",
  est: "Est",
  ovest: "Ovest",
};
