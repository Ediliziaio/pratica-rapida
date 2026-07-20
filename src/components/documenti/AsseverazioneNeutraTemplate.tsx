/**
 * AsseverazioneNeutraTemplate — la "Dichiarazione Requisiti Tecnici" in bianco.
 *
 * Stesso documento che nella scheda pratica esce precompilato coi dati del
 * cliente e dell'azienda, ma qui completamente vuoto: tutti i campi a trattini
 * e tutte le caselle da spuntare a mano. Serve al rivenditore che vuole il
 * modello neutro da compilare a penna, scaricabile da "Documenti utili".
 *
 * Il markup NON vive qui: arriva da @shared/dichiarazione.ts, la stessa fonte
 * usata dall'edge function e dall'anteprima precompilata — così il modello
 * neutro e quello compilato restano lo stesso documento.
 */

import DichiarazioneTecnicaTemplate from "./DichiarazioneTecnicaTemplate";
import type { DichiarazioneTecnicaData } from "@shared/dichiarazione.ts";

// Tutto vuoto: i campi testo diventano trattini, le caselle restano da barrare.
const VUOTA: DichiarazioneTecnicaData = {
  azienda_nome: "", azienda_citta: "", azienda_provincia: "",
  azienda_via: "", azienda_civico: "", azienda_piva: "",
  immobile_citta: "", immobile_provincia: "", immobile_cap: "",
  immobile_via: "", immobile_civico: "",
  cliente_nome: "", cliente_cognome: "", cliente_citta: "",
  cliente_via: "", cliente_civico: "", cliente_cf: "",
  caratteristiche_infissi: { rispetta_trasmittanza: false },
  caratteristiche_schermature: {
    norma_en: false, marchiatura_ce: false, gtot_inferiore: false,
    esposizione: false, superficie_vetrata: false, solidale_edificio: false,
  },
  importo_congruo: false,
  lavori_ultimati: false,
  // Il body stampa comunque entrambe le sezioni (infissi + schermature): questo
  // valore non cambia cosa si vede, resta solo per completezza del tipo.
  tipo_intervento: "entrambi",
};

export default function AsseverazioneNeutraTemplate() {
  return <DichiarazioneTecnicaTemplate data={VUOTA} />;
}
