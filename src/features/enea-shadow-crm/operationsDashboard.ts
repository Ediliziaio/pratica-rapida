import type { EneaLabSourcePractice } from "@/features/enea-lab/types";
import type { ShadowCrmPracticeState } from "./workflow";

export type OperationalStatus = "automatic_active" | "operator_required" | "manual_work" | "waiting_customer" | "waiting_supplier" | "waiting_operator" | "completed";

export interface OperationsDashboardItem {
  practiceId: string;
  code: string;
  status: OperationalStatus;
  lastEvent: string | null;
  lastEventAt: string | null;
  lastEventRelative: string;
  lastResponsible: "automazione" | "operatore" | "nessuno";
  activeBlock: string | null;
  nextAction: string;
  appliedRules: string[];
  historicalTest: boolean;
}

function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "nessun evento";
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  return `${Math.floor(hours / 24)} g fa`;
}

function responsible(eventType: string | null): OperationsDashboardItem["lastResponsible"] {
  if (!eventType) return "nessuno";
  return eventType.startsWith("automation-") ? "automazione" : "operatore";
}

export function dashboardItem(practice: EneaLabSourcePractice, state: ShadowCrmPracticeState, now = new Date()): OperationsDashboardItem {
  const last = state.audit.at(-1) ?? null;
  const activeException = state.exceptions.find((item) => item.status === "requested_operator") ?? null;
  const automationRunning = last?.type === "automation-work-started";
  let status: OperationalStatus;
  if (state.stage === "completed") status = "completed";
  else if (state.operatorStatus === "manual_work") status = "manual_work";
  else if (activeException) status = "operator_required";
  else if (practice.queueStatus === "waiting_client") status = "waiting_customer";
  else if (automationRunning) status = "automatic_active";
  else status = "waiting_operator";

  const nextAction = status === "completed" ? "Nessuna: pratica completata"
    : status === "operator_required" ? `Risolvere il dubbio su ${activeException!.field}`
      : status === "manual_work" ? "Assegnare e lavorare manualmente con motivo"
        : status === "waiting_customer" ? "Attendere i dati richiesti al cliente"
          : status === "waiting_supplier" ? "Attendere i dati richiesti al fornitore"
            : status === "automatic_active" ? "Attendere la conclusione dell'azione automatica corrente"
              : state.stage === "received" ? "Assegnare la pratica" : state.stage === "assigned" ? "Avviare la lavorazione" : state.stage === "processing" ? "Proseguire o inviare a revisione" : "Preparare la bozza locale e concludere";
  return {
    practiceId: practice.id,
    code: practice.code,
    status,
    lastEvent: last?.type ?? null,
    lastEventAt: last?.at ?? null,
    lastEventRelative: relativeTime(last?.at ?? null, now),
    lastResponsible: responsible(last?.type ?? null),
    activeBlock: activeException?.reason ?? null,
    nextAction,
    appliedRules: state.exceptions.filter((item) => item.status === "rule_defined").map((item) => item.field),
    historicalTest: state.audit.some((event) => event.type === "historical-deadline-override"),
  };
}

export function dashboardHealth(items: OperationsDashboardItem[]) {
  const advancing = items.filter((item) => item.status === "automatic_active").length;
  const blocked = items.filter((item) => ["operator_required", "manual_work", "waiting_customer", "waiting_supplier"].includes(item.status));
  return {
    advancing,
    blocked: blocked.length,
    waitingOperator: items.filter((item) => item.status === "waiting_operator").length,
    completed: items.filter((item) => item.status === "completed").length,
    reasons: blocked.reduce<Record<string, number>>((result, item) => {
      const reason = item.status === "operator_required" ? "dubbio operativo" : item.status === "manual_work" ? "lavorazione manuale" : item.status === "waiting_customer" ? "attesa cliente" : "attesa fornitore";
      result[reason] = (result[reason] ?? 0) + 1;
      return result;
    }, {}),
  };
}
