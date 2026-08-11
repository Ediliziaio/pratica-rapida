import type { FormClienteData } from "@/types/form-cliente";

export type EneaLabFieldStatus = "ready" | "review" | "missing";
export type EneaLabQueueStatus = "waiting_client" | "ready" | "historical";
export type EneaLabFieldSource =
  | "Pratica CRM"
  | "Modulo cliente"
  | "Fattura"
  | "Calcolo ENEA"
  | "Regola controllata"
  | "Convenzione di prova"
  | "Inserimento operatore";

export type EneaLabDocumentKind =
  | "invoice"
  | "additional"
  | "plant_book"
  | "bank_transfer";

export interface EneaLabDocumentPath {
  kind: EneaLabDocumentKind;
  path: string;
}

export interface EneaLabScreeningItem {
  widthMm: number;
  heightMm: number;
  surfaceM2: number;
  gTot: number | null;
  description: string;
  sourcePath: string;
}

export interface EneaLabDocumentResult {
  path: string;
  status: "parsed" | "unsupported" | "failed";
  documentType: "invoice" | "credit_note" | "unknown";
  total: number | null;
  itemCount: number;
  documentNumber?: string;
  documentDate?: string;
  message?: string;
}

export interface EneaLabDocumentAnalysis {
  items: EneaLabScreeningItem[];
  invoiceTotal: number;
  creditTotal: number;
  eligibleExpense: number | null;
  firstInvoiceDate: string | null;
  lastInvoiceDate: string | null;
  documents: EneaLabDocumentResult[];
  blockers: string[];
  warnings: string[];
}

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
  documentPaths: EneaLabDocumentPath[];
  completedEneaPaths?: string[];
  queueStatus: EneaLabQueueStatus;
  form: FormClienteData;
}

export interface EneaLabField {
  id: string;
  label: string;
  value: string;
  source: EneaLabFieldSource;
  status: EneaLabFieldStatus;
  required: boolean;
  editable: boolean;
  testOnly: boolean;
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

export interface EneaLabIssue {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  fieldId?: string;
}

export type EneaLabOverrides = Record<string, string>;

export interface EneaLabMapOptions {
  overrides?: EneaLabOverrides;
  confirmedFieldIds?: ReadonlySet<string>;
  includeTestConventions?: boolean;
}

export interface EneaLabPreparedSnapshot {
  fingerprint: string;
  generatedAt: string;
}

export interface EneaLabPayload {
  schemaVersion: 1;
  mode: "test" | "official";
  readyForOfficialSubmission: boolean;
  generatedAt: string;
  practiceCode: string;
  fields: Record<string, string>;
  portalFields: Array<{
    id: string;
    label: string;
    sectionId: string;
    sectionTitle: string;
    value: string;
    source: EneaLabFieldSource;
    testOnly: boolean;
  }>;
  excludedTestFields: string[];
  excludedUnverifiedFields: string[];
  interventionRequired: string[];
}
