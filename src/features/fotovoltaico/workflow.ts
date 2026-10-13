export type PhotovoltaicStatus =
  | "bozza"
  | "ricevuta_da_controllare"
  | "da_contattare_proprietario"
  | "attesa_proprietario"
  | "attesa_rivenditore"
  | "pronta_presentazione"
  | "presso_distributore"
  | "attivazione_gse"
  | "conclusa";

export type PipelineColumn = {
  key: Exclude<PhotovoltaicStatus, "bozza">;
  title: string;
  help: string;
  color: string;
};

export const PHOTOVOLTAICO_PIPELINE: PipelineColumn[] = [
  { key: "ricevuta_da_controllare", title: "Nuova – da controllare", help: "Appena inviata dal rivenditore", color: "border-amber-400" },
  { key: "da_contattare_proprietario", title: "Da contattare il proprietario", help: "Contatto ancora da eseguire", color: "border-sky-400" },
  { key: "attesa_proprietario", title: "In attesa del proprietario", help: "Dati, documenti o firme", color: "border-violet-400" },
  { key: "attesa_rivenditore", title: "In attesa del rivenditore", help: "Solo materiale tecnico mancante", color: "border-orange-400" },
  { key: "pronta_presentazione", title: "Pronta da presentare", help: "Fascicolo controllato e completo", color: "border-emerald-400" },
  { key: "presso_distributore", title: "Pratica presso il distributore", help: "Presentata o in integrazione", color: "border-blue-500" },
  { key: "attivazione_gse", title: "Attivazione e GSE", help: "Attivazione, GAUDÌ e GSE", color: "border-cyan-500" },
  { key: "conclusa", title: "Conclusa", help: "Pratica completata", color: "border-slate-500" },
];

export const PHOTOVOLTAICO_RESELLER_LABELS: Record<PhotovoltaicStatus, string> = {
  bozza: "Bozza",
  ricevuta_da_controllare: "Ricevuta",
  da_contattare_proprietario: "Ricevuta",
  attesa_proprietario: "Raccolta documenti",
  attesa_rivenditore: "Raccolta documenti",
  pronta_presentazione: "In lavorazione",
  presso_distributore: "Attesa gestore",
  attivazione_gse: "Attesa gestore / GSE",
  conclusa: "Completata",
};
