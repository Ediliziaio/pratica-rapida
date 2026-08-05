import type { FormClienteData } from "@/types/form-cliente";

export type EneaLabFieldStatus = "ready" | "review" | "missing";
export type EneaLabQueueStatus = "waiting_client" | "ready";

export interface EneaLabSourcePractice {
  id: string;
  code: string;
  reseller: string;
  clienteNome: string;
  clienteCognome: string;
  prodottoInstallato: string;
  ricevutaAt: string;
  dataFineLavori: string | null;
  fattureCount: number;
  documentiCount: number;
  queueStatus: EneaLabQueueStatus;
  form: FormClienteData;
}

export interface EneaLabField {
  id: string;
  label: string;
  value: string;
  source: "Pratica CRM" | "Modulo cliente" | "Fattura" | "Calcolo ENEA";
  status: EneaLabFieldStatus;
  note?: string;
}

export interface EneaLabSection {
  id: string;
  title: string;
  description: string;
  fields: EneaLabField[];
}

export interface EneaLabMappedPractice {
  source: EneaLabSourcePractice;
  sections: EneaLabSection[];
  summary: Record<EneaLabFieldStatus, number>;
}
