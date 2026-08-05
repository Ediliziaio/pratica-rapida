import type { FormClienteData } from "@/types/form-cliente";
import type { EneaLabSourcePractice } from "./types";

const completeForm: FormClienteData = {
  richiedente: {
    nome: "Cliente",
    cognome: "Demo Uno",
    comune_nascita: "Comune Demo Nord",
    provincia_nascita: "ZZ",
    data_nascita: "1978-04-16",
    cf: "CF-DEMO-001-NON-VALIDO",
    email: "cliente.uno@example.test",
    telefono: "+39 000 000 0001",
    abitazione_principale: true,
  },
  residenza: {
    comune: "Comune Demo Nord",
    provincia: "ZZ",
    indirizzo: "Via Laboratorio",
    civico: "24",
    cap: "00001",
    stesso_indirizzo_lavori: true,
  },
  appartamento_lavori: { comune: "", provincia: "", indirizzo: "", numero: "", cap: "" },
  cointestazione: { presente: false, nome: "", cognome: "", cf: "" },
  catastali: {
    foglio: "12",
    mappale: "348",
    subalterno: "7",
    recupero_richiesto: false,
    proprietario_nome: "Cliente",
    proprietario_cognome: "Demo Uno",
    proprietario_cf: "CF-DEMO-001-NON-VALIDO",
  },
  edificio: {
    anno_costruzione: "1998",
    superficie_mq: "112",
    numero_appartamenti: "1",
    titolo_richiedente: "proprietario_o_comproprietario",
    tipologia: "casa_singola_o_plurifamiliare",
  },
  impianto: {
    tipo: "autonomo",
    terminali: "caloriferi",
    combustibile: "gas_metano",
    tipo_caldaia: "gas_a_condensazione",
    aria_condizionata: true,
    libretto_url: "mock://libretto-impianto.pdf",
  },
  prodotto: {
    tipo: "schermature",
    items: [
      { tipo: "tende_da_sole", direzione: "sud" },
      { tipo: "tende_da_sole", direzione: "ovest" },
    ],
  },
  documenti: {
    finanziamento: "no",
    fattura_url: "mock://fattura-01.pdf",
    bonifico_url: "mock://bonifico.pdf",
  },
};

const incompleteForm: FormClienteData = {
  ...completeForm,
  richiedente: {
    ...completeForm.richiedente,
    nome: "Cliente",
    cognome: "Demo Due",
    comune_nascita: "",
    provincia_nascita: "",
    telefono: "",
  },
  residenza: {
    comune: "Comune Demo Ovest",
    provincia: "ZZ",
    indirizzo: "Via Dimostrazione",
    civico: "8",
    cap: "00002",
    stesso_indirizzo_lavori: false,
  },
  appartamento_lavori: {
    comune: "Comune Demo Sud",
    provincia: "ZZ",
    indirizzo: "Viale Prova",
    numero: "11",
    cap: "00003",
  },
  catastali: {
    ...completeForm.catastali,
    foglio: "",
    mappale: "",
    subalterno: "",
    recupero_richiesto: true,
  },
  impianto: {
    ...completeForm.impianto,
    tipo_caldaia: "",
    libretto_url: undefined,
  },
  prodotto: {
    tipo: "schermature",
    items: [{ tipo: "pergotenda", direzione: "sud_est" }],
  },
  documenti: { finanziamento: null },
};

export const ENEA_LAB_MOCK_PRACTICES: EneaLabSourcePractice[] = [
  {
    id: "lab-schermature-001",
    code: "LAB-SCH-001",
    reseller: "Rivenditore Demo Uno",
    clienteNome: "Cliente",
    clienteCognome: "Demo Uno",
    prodottoInstallato: "Schermature solari",
    ricevutaAt: "2026-08-05T09:24:00.000Z",
    dataFineLavori: "2026-07-31",
    fattureCount: 2,
    documentiCount: 1,
    queueStatus: "ready",
    form: completeForm,
  },
  {
    id: "lab-schermature-002",
    code: "LAB-SCH-002",
    reseller: "Rivenditore Demo Due",
    clienteNome: "Cliente",
    clienteCognome: "Demo Due",
    prodottoInstallato: "Pergotenda",
    ricevutaAt: "2026-08-05T10:05:00.000Z",
    dataFineLavori: null,
    fattureCount: 0,
    documentiCount: 0,
    queueStatus: "waiting_client",
    form: incompleteForm,
  },
];
