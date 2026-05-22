import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { EmailBuilder } from "@/components/EmailBuilder";
import type { EmailTmplRow } from "@/components/EmailBuilder";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Play,
  Clock,
  FilePlus,
  Filter,
  Mail,
  MessageCircle,
  Phone,
  ArrowRight,
  Loader2,
  Settings,
  GitBranch,
  X,
  CheckCircle2,
  Pencil,
  Copy,
  GripVertical,
  PlayCircle,
} from "lucide-react";
import type { AutomationRule } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriggerDef {
  type: string;
  config: Record<string, string | number>;
}

interface ConditionDef {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface ActionDef {
  id: string;
  type: string;
  config: Record<string, string | number>;
}

interface AutomationFlow {
  __v: 2;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Trigger raggruppati per categoria. Ogni trigger dichiara `category` per
 * il render del Select con header di gruppo. La logica di esecuzione vive
 * in `supabase/functions/process-automations/index.ts` (cron daily) +
 * `on-practice-created` / `on-stage-changed` (webhook trigger immediati).
 *
 * Aggiungere un trigger qui = renderlo selezionabile dall'admin. Per
 * cablarlo davvero serve corrispondente handler nelle edge function.
 */
const TRIGGER_TYPES = [
  // ─── 📋 Ciclo pratica ─────────────────────────────────────────────────────
  {
    value: "practice_created",
    label: "Pratica Creata",
    description: "Quando una nuova pratica ENEA/CT viene inviata al sistema",
    icon: FilePlus,
    category: "Ciclo pratica",
  },
  {
    value: "stage_changed",
    label: "Stage Cambiato (qualsiasi)",
    description: "Quando la pratica viene spostata in un nuovo stage Kanban",
    icon: ArrowRight,
    category: "Ciclo pratica",
  },
  {
    value: "stage_in_lavorazione",
    label: "Stage → In lavorazione",
    description: "Quando la pratica entra nello stage 'In lavorazione'",
    icon: ArrowRight,
    category: "Ciclo pratica",
  },
  {
    value: "stage_completata",
    label: "Stage → Completata",
    description: "Quando la pratica entra nello stage 'Completata'",
    icon: CheckCircle2,
    category: "Ciclo pratica",
  },
  {
    value: "stage_da_inviare",
    label: "Stage → Da inviare",
    description: "Pratica pronta per essere inviata a ENEA",
    icon: ArrowRight,
    category: "Ciclo pratica",
  },
  {
    value: "pratica_archiviata",
    label: "Pratica Archiviata",
    description: "Quando la pratica viene archiviata (manuale o auto dopo 10gg)",
    icon: FilePlus,
    category: "Ciclo pratica",
  },

  // ─── ⏰ Trigger temporali (cron daily) ────────────────────────────────────
  {
    value: "days_in_stage",
    label: "Giorni nello Stage",
    description: "Quando la pratica è ferma nello stesso stage per N giorni",
    icon: Clock,
    category: "Tempo",
  },
  {
    value: "days_waiting_7",
    label: "Cliente non compila (7gg)",
    description: "Cliente non ha compilato il modulo dopo 7 giorni dall'invio link",
    icon: Clock,
    category: "Tempo",
  },
  {
    value: "days_waiting_fornitore_30",
    label: "Rivenditore inattivo (30gg)",
    description: "Pratica ferma 30 giorni senza aggiornamenti dal rivenditore",
    icon: Clock,
    category: "Tempo",
  },
  {
    value: "days_waiting_fornitore_60",
    label: "Rivenditore inattivo (60gg)",
    description: "Pratica ferma 60 giorni — escalation",
    icon: Clock,
    category: "Tempo",
  },
  {
    value: "days_waiting_fornitore_90",
    label: "Rivenditore inattivo (90gg)",
    description: "Pratica ferma 90 giorni — possibile chiusura",
    icon: Clock,
    category: "Tempo",
  },
  {
    value: "days_since_form_sent",
    label: "Giorni dall'invio modulo",
    description: "N giorni da quando hai inviato il link form al cliente",
    icon: Clock,
    category: "Tempo",
  },

  // ─── 👤 Eventi cliente ────────────────────────────────────────────────────
  {
    value: "form_submitted",
    label: "Form Compilato",
    description: "Quando il cliente compila il form pubblico inviato via link",
    icon: CheckCircle2,
    category: "Cliente",
  },
  {
    value: "form_iniziato",
    label: "Form Iniziato (non completato)",
    description: "Cliente apre il link ma non finisce — utile per remarketing",
    icon: CheckCircle2,
    category: "Cliente",
  },
  {
    value: "documenti_caricati",
    label: "Documenti Caricati",
    description: "Cliente ha caricato tutti i documenti richiesti",
    icon: CheckCircle2,
    category: "Cliente",
  },
  {
    value: "recensione_7d_followup",
    label: "Sollecito recensione (7gg)",
    description: "7 giorni dopo la richiesta recensione, se non ancora ricevuta",
    icon: Clock,
    category: "Cliente",
  },
  {
    value: "recensione_ricevuta",
    label: "Recensione Ricevuta",
    description: "Cliente ha lasciato una recensione",
    icon: CheckCircle2,
    category: "Cliente",
  },
  {
    value: "cliente_risponde_whatsapp",
    label: "Cliente risponde su WhatsApp",
    description: "Cliente invia un messaggio WhatsApp al nostro numero business",
    icon: MessageCircle,
    category: "Cliente",
  },
  {
    value: "call_completed",
    label: "Chiamata AI Completata",
    description: "Quando una chiamata ElevenLabs Conversational AI termina",
    icon: Phone,
    category: "Cliente",
  },

  // ─── 💰 Pagamento ────────────────────────────────────────────────────────
  {
    value: "pratica_pagata",
    label: "Pratica Pagata",
    description: "Stato pagamento aggiornato a 'pagata'",
    icon: CheckCircle2,
    category: "Pagamento",
  },
  {
    value: "pratica_non_pagata_30g",
    label: "Pratica non pagata (30gg)",
    description: "Pratica creata da 30 giorni ma ancora non pagata",
    icon: Clock,
    category: "Pagamento",
  },
  {
    value: "fattura_emessa",
    label: "Fattura Emessa",
    description: "Fattura generata e inviata al cliente / SDI",
    icon: FilePlus,
    category: "Pagamento",
  },
  {
    value: "fattura_scaduta",
    label: "Fattura Scaduta",
    description: "Fattura non pagata oltre la data di scadenza",
    icon: Clock,
    category: "Pagamento",
  },

  // ─── 📄 Documenti ────────────────────────────────────────────────────────
  {
    value: "documento_uploadato",
    label: "Documento Caricato",
    description: "Cliente carica un singolo documento (anche se non tutti completi)",
    icon: FilePlus,
    category: "Documenti",
  },
  {
    value: "documenti_completi",
    label: "Documenti Completi",
    description: "Tutti i documenti obbligatori sono stati caricati",
    icon: CheckCircle2,
    category: "Documenti",
  },
  {
    value: "documenti_mancanti_3g",
    label: "Documenti mancanti (3gg)",
    description: "Cliente ha caricato alcuni documenti ma non tutti, fermo da 3gg",
    icon: Clock,
    category: "Documenti",
  },

  // ─── 📧 Tracking comunicazioni ──────────────────────────────────────────
  {
    value: "email_aperta",
    label: "Email Aperta",
    description: "Cliente apre un'email inviata dal sistema (richiede tracking pixel)",
    icon: Mail,
    category: "Comunicazioni",
  },
  {
    value: "email_link_cliccato",
    label: "Email Link Cliccato",
    description: "Cliente clicca un link dentro un'email",
    icon: Mail,
    category: "Comunicazioni",
  },
  {
    value: "email_bounce",
    label: "Email Rimbalzata",
    description: "Email non consegnata (indirizzo invalido o casella piena)",
    icon: Mail,
    category: "Comunicazioni",
  },
  {
    value: "whatsapp_letto",
    label: "WhatsApp Letto",
    description: "Doppia spunta blu — cliente ha letto il messaggio",
    icon: MessageCircle,
    category: "Comunicazioni",
  },
  {
    value: "whatsapp_fallito",
    label: "WhatsApp Fallito",
    description: "Invio fallito (numero non WhatsApp, blocco, ecc.)",
    icon: MessageCircle,
    category: "Comunicazioni",
  },

  // ─── 👨‍💼 Staff / Assignment ───────────────────────────────────────────
  {
    value: "pratica_assegnata",
    label: "Pratica Assegnata",
    description: "Pratica viene assegnata a un operatore specifico",
    icon: Play,
    category: "Staff",
  },
  {
    value: "pratica_non_assegnata_24h",
    label: "Pratica non assegnata (24h)",
    description: "Pratica nuova senza operatore assegnato da 24h",
    icon: Clock,
    category: "Staff",
  },
  {
    value: "nota_aggiunta",
    label: "Nota Aggiunta",
    description: "Operatore aggiunge una nota interna alla pratica",
    icon: FilePlus,
    category: "Staff",
  },

  // ─── 📥 Lead / Ticket ─────────────────────────────────────────────────
  {
    value: "lead_creato",
    label: "Lead Creato",
    description: "Nuovo lead dal form pubblico del sito",
    icon: FilePlus,
    category: "Lead & Ticket",
  },
  {
    value: "ticket_aperto",
    label: "Ticket Aperto",
    description: "Cliente apre un ticket di supporto",
    icon: FilePlus,
    category: "Lead & Ticket",
  },
  {
    value: "ticket_chiuso",
    label: "Ticket Chiuso",
    description: "Ticket risolto e chiuso",
    icon: CheckCircle2,
    category: "Lead & Ticket",
  },

  // ─── ⚠️ Errori / Sistema ────────────────────────────────────────────────
  {
    value: "errore_invio_whatsapp",
    label: "Errore Invio WhatsApp",
    description: "Token WhatsApp scaduto o errore Meta API",
    icon: MessageCircle,
    category: "Sistema",
  },
  {
    value: "portale_enea_bloccato",
    label: "Portale ENEA Bloccato",
    description: "Il portale ENEA non è raggiungibile (segnalazione manuale)",
    icon: Clock,
    category: "Sistema",
  },
  {
    value: "anniversario_pratica",
    label: "Anniversario Pratica Completata",
    description: "1 anno dalla pratica completata — follow-up annuale",
    icon: Clock,
    category: "Sistema",
  },
  {
    value: "data_specifica",
    label: "Data/Ora Specifica",
    description: "Esegui automazione a una data e ora pianificata (one-shot)",
    icon: Clock,
    category: "Sistema",
  },

  // ─── 🛠 Manuale ──────────────────────────────────────────────────────────
  {
    value: "manual",
    label: "Manuale",
    description: "Eseguita solo manualmente dall'operatore (no trigger automatico)",
    icon: Play,
    category: "Manuale",
  },
];

// Categorie nell'ordine di visualizzazione del Select
const TRIGGER_CATEGORIES = [
  "Ciclo pratica",
  "Tempo",
  "Cliente",
  "Documenti",
  "Comunicazioni",
  "Pagamento",
  "Staff",
  "Lead & Ticket",
  "Sistema",
  "Manuale",
];

/**
 * Set dei trigger CABLATI nel backend (cron `process-automations` o
 * webhook `on-*` dedicati). I trigger non in questo set sono
 * configurabili ma il cron li skippa silenziosamente.
 *
 * UPDATE QUESTO SET quando aggiungi un handler backend per un nuovo
 * trigger. La UI mostra un badge "Backend attivo" / "Solo UI" per
 * permettere all'admin di capire se la rule funzionerà davvero.
 *
 * Sincronizzato con supabase/functions/process-automations/index.ts
 * e supabase/functions/on-{practice-created,stage-changed}/index.ts.
 */
const BACKEND_CABLED_TRIGGERS = new Set([
  "practice_created",
  "stage_changed",
  "days_waiting_7",
  "days_waiting_fornitore_30",
  "days_waiting_fornitore_60",
  "days_waiting_fornitore_90",
  "recensione_7d_followup",
  "form_submitted",
  "pratica_pagata",
  "manual",
]);

function isTriggerBackendCabled(triggerValue: string): boolean {
  return BACKEND_CABLED_TRIGGERS.has(triggerValue);
}

/**
 * Filtri (condizioni) applicabili a una rule per restringere il pubblico.
 * Permettono di differenziare automazioni: es. "sollecito_compilazione
 * solo per pratiche infissi ENEA non ancora pagate".
 *
 * Le condizioni vengono valutate da process-automations leggendo i campi
 * della pratica corrispondente. Salvate in `automation_rules.trigger_config`
 * sotto la chiave `conditions`.
 */
const CONDITION_FIELDS = [
  // ─── Identità pratica ─────────────────────────────────────────────────────
  {
    value: "brand",
    label: "Brand pratica",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: ["ENEA", "CT"],
  },
  {
    value: "prodotto_tipo",
    label: "Tipo prodotto",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: ["infissi", "schermature", "impianto_termico", "caldaia", "fotovoltaico"],
  },
  {
    value: "tipo_servizio",
    label: "Tipo servizio",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: ["servizio_completo", "solo_invio", "consulenza"],
  },
  {
    value: "tipo_intervento",
    label: "Tipo intervento",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
      { value: "contains", label: "contiene" },
    ],
    valueType: "text" as const,
    options: [],
  },

  // ─── Stato pratica ───────────────────────────────────────────────────────
  {
    value: "stage_name",
    label: "Nome stage attuale",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
      { value: "contains", label: "contiene" },
    ],
    valueType: "text" as const,
    options: [],
  },
  {
    value: "stage_type",
    label: "Tipo stage",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: [
      "contatta_cliente",
      "modulo_da_inviare",
      "in_lavorazione",
      "da_inserire_excel",
      "da_inviare",
      "recensione",
      "completata",
      "archiviata",
    ],
  },
  {
    value: "days_in_stage",
    label: "Giorni nello stage",
    operators: [
      { value: "gte", label: "≥" },
      { value: "lte", label: "≤" },
      { value: "eq", label: "=" },
    ],
    valueType: "number" as const,
    options: [],
  },
  {
    value: "priorita",
    label: "Priorità",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: ["alta", "normale", "bassa"],
  },

  // ─── Documenti ───────────────────────────────────────────────────────────
  {
    value: "has_all_documents",
    label: "Documenti completi",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },
  {
    value: "form_compilato",
    label: "Form cliente compilato",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },

  // ─── Pagamento ───────────────────────────────────────────────────────────
  {
    value: "pagamento_stato",
    label: "Stato pagamento",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: ["pagata", "non_pagata", "pagamento_parziale"],
  },
  {
    value: "is_free",
    label: "Pratica gratuita (promo)",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },

  // ─── Cliente ─────────────────────────────────────────────────────────────
  {
    value: "cliente_ha_email",
    label: "Cliente ha email",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },
  {
    value: "cliente_ha_whatsapp",
    label: "Cliente ha WhatsApp",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },
  {
    value: "cliente_provincia",
    label: "Provincia cliente",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
      { value: "contains", label: "contiene" },
    ],
    valueType: "text" as const,
    options: [],
  },
  {
    value: "cliente_regione",
    label: "Regione cliente",
    operators: [
      { value: "eq", label: "è" },
      { value: "neq", label: "non è" },
    ],
    valueType: "select" as const,
    options: [
      "Lombardia", "Lazio", "Campania", "Sicilia", "Veneto", "Emilia-Romagna",
      "Piemonte", "Puglia", "Toscana", "Calabria", "Sardegna", "Liguria",
      "Marche", "Abruzzo", "Friuli-Venezia Giulia", "Trentino-Alto Adige",
      "Umbria", "Basilicata", "Molise", "Valle d'Aosta",
    ],
  },

  // ─── Valore pratica ──────────────────────────────────────────────────────
  {
    value: "prezzo_netto",
    label: "Prezzo netto pratica",
    operators: [
      { value: "gte", label: "≥" },
      { value: "lte", label: "≤" },
      { value: "eq", label: "=" },
    ],
    valueType: "number" as const,
    options: [],
  },
  {
    value: "giorni_da_creazione",
    label: "Giorni dalla creazione",
    operators: [
      { value: "gte", label: "≥" },
      { value: "lte", label: "≤" },
    ],
    valueType: "number" as const,
    options: [],
  },

  // ─── Tag ─────────────────────────────────────────────────────────────────
  {
    value: "tag_contains",
    label: "Tag pratica contiene",
    operators: [
      { value: "contains", label: "contiene" },
      { value: "not_contains", label: "non contiene" },
    ],
    valueType: "text" as const,
    options: [],
  },
];

/**
 * Azioni disponibili nel flow editor. Ogni azione ha:
 * - value: chiave salvata in DB (automation_rules.trigger_config.actions[].type)
 * - label: visualizzato nel selettore
 * - icon: rendering accanto al label
 * - color: tinta delle card action editor
 * - category: raggruppamento nel dropdown
 *
 * Backend: handler in supabase/functions/process-automations/index.ts
 * + dedicate edge functions (send-whatsapp, send-email, ecc.)
 */
const ACTION_TYPES = [
  // ─── 📧 Comunicazioni outbound ────────────────────────────────────────
  { value: "send_email",
    label: "Invia Email",
    icon: Mail,
    color: "border-blue-200 bg-blue-50",
    category: "Comunicazioni" },
  { value: "send_whatsapp",
    label: "Invia WhatsApp",
    icon: MessageCircle,
    color: "border-green-200 bg-green-50",
    category: "Comunicazioni" },
  { value: "send_sms",
    label: "Invia SMS",
    icon: MessageCircle,
    color: "border-cyan-200 bg-cyan-50",
    category: "Comunicazioni" },
  { value: "send_internal_email",
    label: "Email interna staff",
    icon: Mail,
    color: "border-indigo-200 bg-indigo-50",
    category: "Comunicazioni" },
  { value: "create_notification",
    label: "Notifica in-app",
    icon: CheckCircle2,
    color: "border-violet-200 bg-violet-50",
    category: "Comunicazioni" },

  // ─── 🤖 AI / Voice ──────────────────────────────────────────────────────
  { value: "elevenlabs_call",
    label: "Chiamata AI (ElevenLabs)",
    icon: Phone,
    color: "border-rose-200 bg-rose-50",
    category: "AI & Voice" },

  // ─── 📋 Modifica pratica ──────────────────────────────────────────────
  { value: "move_to_stage",
    label: "Sposta Stage",
    icon: ArrowRight,
    color: "border-purple-200 bg-purple-50",
    category: "Modifica pratica" },
  { value: "change_priority",
    label: "Cambia priorità",
    icon: ArrowRight,
    color: "border-purple-200 bg-purple-50",
    category: "Modifica pratica" },
  { value: "update_pagamento_stato",
    label: "Aggiorna stato pagamento",
    icon: CheckCircle2,
    color: "border-emerald-200 bg-emerald-50",
    category: "Modifica pratica" },
  { value: "add_tag",
    label: "Aggiungi tag",
    icon: FilePlus,
    color: "border-amber-200 bg-amber-50",
    category: "Modifica pratica" },
  { value: "remove_tag",
    label: "Rimuovi tag",
    icon: FilePlus,
    color: "border-amber-200 bg-amber-50",
    category: "Modifica pratica" },
  { value: "add_note",
    label: "Aggiungi nota interna",
    icon: FilePlus,
    color: "border-slate-200 bg-slate-50",
    category: "Modifica pratica" },
  { value: "archive_practice",
    label: "Archivia pratica",
    icon: FilePlus,
    color: "border-slate-200 bg-slate-50",
    category: "Modifica pratica" },

  // ─── 👨‍💼 Assignment ────────────────────────────────────────────────
  { value: "assign_user",
    label: "Assegna a operatore",
    icon: Play,
    color: "border-teal-200 bg-teal-50",
    category: "Assignment" },
  { value: "create_task",
    label: "Crea task per operatore",
    icon: CheckCircle2,
    color: "border-teal-200 bg-teal-50",
    category: "Assignment" },

  // ─── 📄 Documenti / Fatturazione ────────────────────────────────────
  { value: "request_documents",
    label: "Richiedi documenti al cliente",
    icon: FilePlus,
    color: "border-lime-200 bg-lime-50",
    category: "Documenti" },
  { value: "generate_invoice",
    label: "Genera fattura",
    icon: FilePlus,
    color: "border-lime-200 bg-lime-50",
    category: "Documenti" },

  // ─── ⏱ Flow control ──────────────────────────────────────────────────
  { value: "wait_days",
    label: "Attendi N giorni",
    icon: Clock,
    color: "border-amber-200 bg-amber-50",
    category: "Flow control" },
  { value: "wait_hours",
    label: "Attendi N ore",
    icon: Clock,
    color: "border-amber-200 bg-amber-50",
    category: "Flow control" },

  // ─── 🔌 Integrazioni esterne ──────────────────────────────────────────
  { value: "trigger_webhook",
    label: "Webhook esterno (HTTP)",
    icon: Play,
    color: "border-orange-200 bg-orange-50",
    category: "Integrazioni" },
];

// Categorie azioni nell'ordine di visualizzazione del Select
const ACTION_CATEGORIES = [
  "Comunicazioni",
  "AI & Voice",
  "Modifica pratica",
  "Assignment",
  "Documenti",
  "Flow control",
  "Integrazioni",
];

const EMAIL_TEMPLATES = [
  { value: "pratica_ricevuta", label: "Pratica ricevuta" },
  { value: "sollecito_privato", label: "Sollecito privato" },
  { value: "sollecito_fornitore", label: "Sollecito fornitore" },
  { value: "form_compilato", label: "Form compilato" },
  { value: "pratica_inviata", label: "Pratica inviata ENEA" },
  { value: "recensione", label: "Richiesta recensione" },
];

/**
 * Select template WhatsApp che legge dal DB i template APPROVED + attivi.
 * Sostituisce la lista hardcoded EMAIL_TEMPLATES per le action send_whatsapp.
 * Mostra anche un hint con il body preview + categoria + lingua.
 */
function WhatsappTemplateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates-approved-for-automation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, meta_template_name, language, body_text, category, status, is_active, mapped_trigger_event")
        .eq("status", "APPROVED")
        .eq("is_active", true)
        .order("meta_template_name");
      if (error) throw error;
      return (data as Array<{
        id: string;
        meta_template_name: string;
        language: string;
        body_text: string;
        category: string | null;
        status: string;
        is_active: boolean;
        mapped_trigger_event: string | null;
      }>) ?? [];
    },
  });

  return (
    <>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder={isLoading ? "Caricamento…" : "Scegli template WhatsApp..."} />
        </SelectTrigger>
        <SelectContent>
          {templates && templates.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Nessun template approvato disponibile.
              <br />
              <a href="/admin/whatsapp-config" className="text-primary hover:underline">
                Vai a /admin/whatsapp-config
              </a> per crearne.
            </div>
          )}
          {templates?.map((t) => (
            <SelectItem key={t.id} value={t.meta_template_name}>
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs">{t.meta_template_name}</code>
                <span className="text-[10px] text-muted-foreground">({t.language})</span>
                {t.category && (
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground/70">{t.category}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Preview del body se selezionato */}
      {value && templates && (() => {
        const selected = templates.find((t) => t.meta_template_name === value);
        if (!selected) return null;
        return (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-2 text-[11px] space-y-1">
            <p className="text-emerald-800 font-semibold">Preview body</p>
            <pre className="whitespace-pre-wrap break-words text-slate-700 font-sans">{selected.body_text}</pre>
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Le variabili {`{{1}}, {{2}}, ...`} vengono popolate automaticamente dal cron con: nome cliente, link form, giorni rimanenti (ordine dipende dal template — vedi /admin/whatsapp-config).
            </p>
          </div>
        );
      })()}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID();
}

// ─── Email Moduli Cliente Editor ──────────────────────────────────────────────

// EmailTmpl is now EmailTmplRow from EmailBuilder
type EmailTmpl = EmailTmplRow;

const MODULO_TEMPLATES = [
  { event: "modulo_cliente_invio", label: "Primo Invio", description: "Inviata quando si genera e condivide il link al cliente" },
  { event: "modulo_cliente_reminder", label: "Reminder", description: "Inviata automaticamente dopo 3 giorni se il modulo non è stato compilato" },
];

function EmailModuliClienteSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EmailTmpl | null>(null);

  const { data: templates = [] } = useQuery<EmailTmpl[]>({
    queryKey: ["email_templates_modulo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .in("trigger_event", ["modulo_cliente_invio", "modulo_cliente_reminder"]);
      if (error) throw error;
      return data as EmailTmpl[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("email_templates").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email_templates_modulo"] }),
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Email Moduli Cliente
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Personalizza i testi delle email inviate ai clienti per la compilazione dei moduli ENEA.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {MODULO_TEMPLATES.map(mt => {
          const tmpl = templates.find(t => t.trigger_event === mt.event);
          return (
            <Card key={mt.event} className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-blue-500" />
                    {mt.label}
                  </span>
                  {tmpl && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{tmpl.is_active ? "Attiva" : "Disattivata"}</span>
                      <Switch
                        checked={tmpl.is_active}
                        onCheckedChange={v => toggleActive.mutate({ id: tmpl.id, is_active: v })}
                      />
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <p className="text-xs text-muted-foreground">{mt.description}</p>
                {tmpl ? (
                  <>
                    <div className="bg-muted/40 rounded-md px-3 py-2 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Oggetto</p>
                      <p className="text-xs font-medium truncate">{tmpl.subject}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 h-8 text-xs"
                      onClick={() => setEditing(tmpl)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifica template
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Template non trovato in DB</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing && (
        <EmailBuilder
          tmpl={editing}
          onClose={() => setEditing(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["email_templates_modulo"] })}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function parseFlow(rule: AutomationRule): AutomationFlow {
  const config = rule.trigger_config as Record<string, unknown>;
  if (config?.__v === 2) {
    // Le rule v2 hanno il flow completo dentro trigger_config. Però se per
    // qualsiasi motivo `config.trigger.type` è vuoto/null/undefined (es.
    // rule importata da seed legacy + migrata a v2 ma senza setting del
    // trigger), il Select sarebbe vuoto e l'admin vedrebbe "trigger non
    // collegato". Fallback: leggi rule.trigger_event (la colonna piatta
    // del DB, mantenuta sincronizzata da saveMutation), così almeno
    // mostriamo il valore reale.
    const flow = config as unknown as AutomationFlow;
    const triggerType = (flow.trigger?.type as string | undefined) ?? "";
    if (!triggerType || triggerType.trim() === "") {
      return {
        ...flow,
        trigger: {
          ...(flow.trigger ?? { config: {} }),
          type: rule.trigger_event || "manual",
        },
      };
    }
    return flow;
  }
  // Migrate legacy seeded rules
  const legacyAction: ActionDef[] =
    rule.channel && rule.channel !== ("none" as string)
      ? [
          {
            id: genId(),
            type:
              rule.channel === "email"
                ? "send_email"
                : rule.channel === "whatsapp"
                ? "send_whatsapp"
                : "send_email",
            config: { template: rule.template_id ?? "", body: rule.template_body ?? "" },
          },
        ]
      : [];
  return {
    __v: 2,
    trigger: { type: rule.trigger_event || "manual", config: {} },
    conditions: [],
    actions: legacyAction,
  };
}

function newFlow(): AutomationFlow {
  return {
    __v: 2,
    trigger: { type: "practice_created", config: {} },
    conditions: [],
    actions: [],
  };
}

function triggerLabel(type: string) {
  return TRIGGER_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FlowConnector({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 my-1">
      <div className="w-px h-4 bg-border" />
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed rounded-full px-3 py-1 hover:border-primary transition-colors"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
      <div className="w-px h-4 bg-border" />
      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

function TriggerBlock({
  trigger,
  expanded,
  onToggle,
  onChange,
}: {
  trigger: TriggerDef;
  expanded: boolean;
  onToggle: () => void;
  onChange: (t: TriggerDef) => void;
}) {
  const def = TRIGGER_TYPES.find((t) => t.value === trigger.type);
  const Icon = def?.icon ?? Zap;
  // Quando trigger.type non è in TRIGGER_TYPES (es. valore legacy "manual"
  // o trigger_event raw che il backend ha ma la UI non gestisce), mostra
  // comunque il valore raw + badge giallo. Senza questo, l'admin vedeva il
  // blocco trigger "vuoto" pensando che la rule non fosse collegata,
  // mentre in realtà funzionava nel backend.
  const isUnknown = !def && !!trigger.type;

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-violet-100/60 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Trigger</p>
          <p className="font-semibold text-sm flex items-center gap-1.5">
            {def?.label ?? trigger.type ?? "Non configurato"}
            {isUnknown && (
              <span className="text-[9px] px-1.5 py-0 rounded bg-amber-100 text-amber-700 font-semibold">
                LEGACY
              </span>
            )}
          </p>
          {def?.description ? (
            <p className="text-xs text-muted-foreground truncate">{def.description}</p>
          ) : isUnknown ? (
            <p className="text-xs text-amber-700 truncate">
              Trigger legacy <code className="text-[10px]">{trigger.type}</code> — clicca per riassegnarlo.
            </p>
          ) : null}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-violet-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-violet-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-violet-200 p-4 space-y-3 bg-white/60">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Evento trigger</Label>
            <Select
              value={trigger.type}
              onValueChange={(v) => onChange({ ...trigger, type: v, config: {} })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-96">
                {TRIGGER_CATEGORIES.map((category) => {
                  const inCategory = TRIGGER_TYPES.filter((t) => t.category === category);
                  if (inCategory.length === 0) return null;
                  return (
                    <div key={category}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold sticky top-0 bg-white">
                        {category}
                      </div>
                      {inCategory.map((t) => {
                        const cabled = isTriggerBackendCabled(t.value);
                        return (
                          <SelectItem key={t.value} value={t.value}>
                            <div className="flex flex-col items-start gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">{t.label}</span>
                                {cabled ? (
                                  <span className="text-[9px] px-1.5 py-0 rounded bg-emerald-100 text-emerald-700 font-semibold">
                                    ATTIVO
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0 rounded bg-amber-100 text-amber-700 font-semibold">
                                    SOLO UI
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
            {/* Warning se il trigger selezionato non è ancora cablato nel
                backend (UI only). Eviti la sorpresa di "ho configurato
                la rule ma il cron non la esegue mai". */}
            {trigger.type && !isTriggerBackendCabled(trigger.type) && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                <span className="text-amber-600 shrink-0">⚠️</span>
                <span>
                  <strong>Solo UI</strong>: questo trigger è configurabile ma il backend non lo esegue ancora. La rule verrà salvata ma il cron la skipperà finché non aggiungiamo l'handler dedicato. Per ora usa uno dei trigger con badge "ATTIVO".
                </span>
              </div>
            )}
          </div>

          {trigger.type === "days_in_stage" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Giorni di attesa</Label>
              <Input
                type="number"
                min={1}
                value={(trigger.config.days as number) ?? 7}
                onChange={(e) =>
                  onChange({
                    ...trigger,
                    config: { ...trigger.config, days: Number(e.target.value) },
                  })
                }
                className="bg-white max-w-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                Quanti giorni prima di attivare l'automazione
              </p>
            </div>
          )}

          {trigger.type === "stage_changed" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Stage di destinazione (opzionale)</Label>
              <Input
                value={(trigger.config.stage_name as string) ?? ""}
                onChange={(e) =>
                  onChange({
                    ...trigger,
                    config: { ...trigger.config, stage_name: e.target.value },
                  })
                }
                placeholder="es. In Lavorazione (lascia vuoto = qualsiasi)"
                className="bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConditionBlock({
  condition,
  expanded,
  index,
  onToggle,
  onChange,
  onDelete,
}: {
  condition: ConditionDef;
  expanded: boolean;
  index: number;
  onToggle: () => void;
  onChange: (c: ConditionDef) => void;
  onDelete: () => void;
}) {
  const fieldDef = CONDITION_FIELDS.find((f) => f.value === condition.field);
  const operators = fieldDef?.operators ?? [{ value: "eq", label: "=" }];
  const opLabel = operators.find((o) => o.value === condition.operator)?.label ?? condition.operator;

  const summary =
    condition.field && condition.value
      ? `${fieldDef?.label ?? condition.field} ${opLabel} ${condition.value}`
      : "Configura condizione";

  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-amber-100/60 transition-colors"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
            Se (condizione {index + 1})
          </p>
          <p className="text-sm font-medium truncate">{summary}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 p-4 space-y-3 bg-white/60">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Campo</Label>
              <Select
                value={condition.field}
                onValueChange={(v) =>
                  onChange({
                    ...condition,
                    field: v,
                    operator: CONDITION_FIELDS.find((f) => f.value === v)?.operators[0]?.value ?? "eq",
                    value: "",
                  })
                }
              >
                <SelectTrigger className="bg-white text-xs">
                  <SelectValue placeholder="Campo..." />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Operatore</Label>
              <Select
                value={condition.operator}
                onValueChange={(v) => onChange({ ...condition, operator: v })}
              >
                <SelectTrigger className="bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Valore</Label>
              {fieldDef?.valueType === "select" ? (
                <Select
                  value={condition.value}
                  onValueChange={(v) => onChange({ ...condition, value: v })}
                >
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="Scegli..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldDef.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : fieldDef?.valueType === "boolean" ? (
                <Select
                  value={condition.value}
                  onValueChange={(v) => onChange({ ...condition, value: v })}
                >
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="Scegli..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sì</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={fieldDef?.valueType === "number" ? "number" : "text"}
                  value={condition.value}
                  onChange={(e) => onChange({ ...condition, value: e.target.value })}
                  className="bg-white text-xs"
                  placeholder="Valore..."
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBlock({
  action,
  expanded,
  index,
  onToggle,
  onChange,
  onDelete,
}: {
  action: ActionDef;
  expanded: boolean;
  index: number;
  onToggle: () => void;
  onChange: (a: ActionDef) => void;
  onDelete: () => void;
}) {
  const def = ACTION_TYPES.find((a) => a.value === action.type);
  const Icon = def?.icon ?? Zap;

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${def?.color ?? "border-blue-200 bg-blue-50"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:brightness-95 transition-all"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/80 text-background">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Azione {index + 1}
          </p>
          <p className="text-sm font-medium">{def?.label ?? action.type}</p>
          {action.config.template && (
            <p className="text-xs text-muted-foreground truncate">
              Template: {action.config.template}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-3 bg-white/70">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tipo azione</Label>
            <Select
              value={action.type}
              onValueChange={(v) => onChange({ ...action, type: v, config: {} })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-96">
                {ACTION_CATEGORIES.map((category) => {
                  const inCategory = ACTION_TYPES.filter((a) => a.category === category);
                  if (inCategory.length === 0) return null;
                  return (
                    <div key={category}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold sticky top-0 bg-white">
                        {category}
                      </div>
                      {inCategory.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {(action.type === "send_email" || action.type === "send_whatsapp") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Template {action.type === "send_whatsapp" ? "WhatsApp" : "email"}
                </Label>
                {action.type === "send_whatsapp" ? (
                  <WhatsappTemplateSelect
                    value={(action.config.template as string) ?? ""}
                    onChange={(v) =>
                      onChange({ ...action, config: { ...action.config, template: v } })
                    }
                  />
                ) : (
                  <Select
                    value={(action.config.template as string) ?? ""}
                    onValueChange={(v) =>
                      onChange({ ...action, config: { ...action.config, template: v } })
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Scegli template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EMAIL_TEMPLATES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Corpo personalizzato{" "}
                  <span className="text-muted-foreground font-normal">(opzionale, sovrascrive template)</span>
                </Label>
                <Textarea
                  rows={4}
                  value={(action.config.body as string) ?? ""}
                  onChange={(e) =>
                    onChange({ ...action, config: { ...action.config, body: e.target.value } })
                  }
                  className="bg-white font-mono text-xs"
                  placeholder="Usa {{nome}}, {{brand}}, {{link}}, {{giorni}} come variabili"
                />
              </div>
              {action.type === "send_email" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Oggetto email (opzionale)</Label>
                  <Input
                    value={(action.config.subject as string) ?? ""}
                    onChange={(e) =>
                      onChange({ ...action, config: { ...action.config, subject: e.target.value } })
                    }
                    placeholder="es. La tua pratica ENEA è pronta"
                    className="bg-white"
                  />
                </div>
              )}
            </>
          )}

          {action.type === "move_to_stage" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nome stage destinazione</Label>
              <Input
                value={(action.config.stage_name as string) ?? ""}
                onChange={(e) =>
                  onChange({ ...action, config: { ...action.config, stage_name: e.target.value } })
                }
                placeholder="es. Completata"
                className="bg-white"
              />
            </div>
          )}

          {action.type === "elevenlabs_call" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Destinatario chiamata</Label>
                <Select
                  value={(action.config.phone_target as string) ?? "client"}
                  onValueChange={(v) =>
                    onChange({ ...action, config: { ...action.config, phone_target: v } })
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="reseller">Rivenditore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Agent ID ElevenLabs</Label>
                <Input
                  value={(action.config.agent_id as string) ?? ""}
                  onChange={(e) =>
                    onChange({ ...action, config: { ...action.config, agent_id: e.target.value } })
                  }
                  placeholder="agent_xxxxxxxx"
                  className="bg-white font-mono text-xs"
                />
              </div>
            </>
          )}

          {action.type === "wait_days" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Giorni di attesa</Label>
              <Input
                type="number"
                min={1}
                value={(action.config.days as number) ?? 1}
                onChange={(e) =>
                  onChange({ ...action, config: { ...action.config, days: Number(e.target.value) } })
                }
                className="bg-white max-w-[120px]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Automation Card (list view) ──────────────────────────────────────────────

function AutomationCard({
  rule,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete,
  onTest,
  dragHandleProps,
  isDragging,
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTest?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}) {
  const flow = parseFlow(rule);
  const actionsCount = flow.actions.length;
  const conditionsCount = flow.conditions.length;

  return (
    <div
      className={`group rounded-xl border bg-card ${
        isDragging ? "shadow-lg ring-2 ring-primary/40" : "hover:shadow-md"
      } transition-shadow p-4 space-y-3`}
    >
      <div className="flex items-start justify-between gap-2">
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="shrink-0 -ml-1 mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            title="Trascina per riordinare"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{rule.name}</p>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.description}</p>
          )}
        </div>
        <Switch
          checked={rule.is_enabled}
          onCheckedChange={onToggle}
          className="shrink-0"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs gap-1">
          <Zap className="h-3 w-3 text-violet-500" />
          {triggerLabel(flow.trigger.type)}
        </Badge>
        {conditionsCount > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Filter className="h-3 w-3 text-amber-500" />
            {conditionsCount} condizione{conditionsCount > 1 ? "i" : ""}
          </Badge>
        )}
        {actionsCount > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Zap className="h-3 w-3 text-blue-500" />
            {actionsCount} azione{actionsCount > 1 ? "i" : ""}
          </Badge>
        )}
        {rule.is_enabled ? (
          <Badge className="text-xs bg-green-100 text-green-700 border-green-200 ml-auto">
            Attiva
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground ml-auto">
            Disattivata
          </Badge>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Modifica
        </Button>
        {onTest && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-primary"
            onClick={onTest}
            title="Test"
            aria-label="Test automazione"
          >
            <PlayCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={onDuplicate}
          title="Duplica"
          aria-label="Duplica automazione"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Elimina"
          aria-label="Elimina automazione"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Automazioni() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // View state
  const [view, setView] = useState<"list" | "builder">("list");
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Builder state
  const [flow, setFlow] = useState<AutomationFlow>(newFlow());
  const [ruleName, setRuleName] = useState("");
  const [ruleEnabled, setRuleEnabled] = useState(false);
  const [ruleDesc, setRuleDesc] = useState("");
  const [ruleMinHour, setRuleMinHour] = useState<number>(9);
  const [ruleMaxHour, setRuleMaxHour] = useState<number>(18);
  const [expandedBlock, setExpandedBlock] = useState<string | null>("trigger");

  // Optimistic local ordering (mirrors query, but allows instant drag feedback)
  const [localOrder, setLocalOrder] = useState<AutomationRule[] | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["automation_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .order("order_index");
      if (error) throw error;
      return data as AutomationRule[];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from("automation_rules")
        .update({ is_enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation_rules"] }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: ruleName,
        description: ruleDesc || null,
        is_enabled: ruleEnabled,
        trigger_event: flow.trigger.type,
        channel: flow.actions.find((a) => a.type === "send_email")
          ? ("email" as const)
          : flow.actions.find((a) => a.type === "send_whatsapp")
          ? ("whatsapp" as const)
          : ("email" as const),
        trigger_config: flow as unknown as Record<string, unknown>,
        template_id:
          (flow.actions.find((a) => a.type === "send_email" || a.type === "send_whatsapp")
            ?.config.template as string) ?? null,
        template_body:
          (flow.actions.find((a) => a.type === "send_email" || a.type === "send_whatsapp")
            ?.config.body as string) ?? null,
        min_hour: ruleMinHour,
        max_hour: ruleMaxHour,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("automation_rules")
          .update(payload)
          .eq("id", editingRule.id);
        if (error) throw error;
      } else {
        // Race-safe order_index: fetch fresh il max corrente dal DB invece
        // di leggere dallo stato locale (che può essere stale se 2 admin
        // creano regole in parallelo o se la cache react-query non è in
        // sync con l'ultimo insert).
        const { data: maxRow } = await supabase
          .from("automation_rules")
          .select("order_index")
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        const maxOrder = (maxRow?.order_index ?? -1) + 1;
        const { error } = await supabase.from("automation_rules").insert({
          ...payload,
          category: "custom",
          order_index: maxOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation_rules"] });
      toast({ title: editingRule ? "Automazione aggiornata" : "Automazione creata" });
      setView("list");
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Errore", description: String(err) });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (rule: AutomationRule) => {
      // Race-safe order_index: fetch FRESH dal DB il max corrente, non
      // leggere da `rules` (state locale react-query) che può essere stale
      // se 2 admin duplicano in parallelo o se la cache non si è ancora
      // ri-sincronizzata dopo l'ultimo insert. Senza, 2 admin duplicate
      // simultaneamente ricevono lo stesso `maxOrder` → 2 insert con
      // stesso order_index → ordering inconsistente.
      // Stesso pattern già usato nel saveMutation, ora applicato anche qui.
      const { data: maxRow } = await supabase
        .from("automation_rules")
        .select("order_index")
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      const maxOrder = (maxRow?.order_index ?? -1) + 1;
      const { error } = await supabase.from("automation_rules").insert({
        name: `${rule.name} (copia)`,
        description: rule.description,
        category: rule.category,
        channel: rule.channel,
        trigger_event: rule.trigger_event,
        trigger_config: rule.trigger_config,
        template_id: rule.template_id,
        template_body: rule.template_body,
        is_enabled: false,
        order_index: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation_rules"] });
      toast({ title: "Automazione duplicata" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; order_index: number }[]) => {
      // Critico: il vecchio codice ignorava gli errori sulle singole update,
      // quindi il toast diceva "Ordine aggiornato" anche se solo metà delle
      // update aveva avuto successo. In caso di failure parziale l'ordering
      // mostrato al prossimo refresh è inconsistente. Ora rileviamo qualsiasi
      // errore e lo propaghiamo a onError → toast "Errore riordino".
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("automation_rules").update({ order_index: u.order_index }).eq("id", u.id),
        ),
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation_rules"] });
      setLocalOrder(null);
      toast({ title: "Ordine aggiornato" });
    },
    onError: (err) => {
      setLocalOrder(null);
      toast({ variant: "destructive", title: "Errore riordino", description: String(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation_rules"] });
      toast({ title: "Automazione eliminata" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Errore", description: String(err) });
    },
  });

  const [ruleToDelete, setRuleToDelete] = useState<AutomationRule | null>(null);

  // Test automation state
  const [testTarget, setTestTarget] = useState<AutomationRule | null>(null);
  const [testPracticeId, setTestPracticeId] = useState<string>("");

  const { data: testPractices = [] } = useQuery({
    queryKey: ["test-practices-for-automation"],
    enabled: !!testTarget,
    queryFn: async () => {
      const { data } = await supabase
        .from("enea_practices_public")
        .select("id, cliente_nome, cliente_cognome, cliente_email, cliente_telefono, brand")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ rule, practiceId }: { rule: AutomationRule; practiceId: string }) => {
      if (rule.trigger_event === "practice_created") {
        return await supabase.functions.invoke("on-practice-created", {
          body: { practice_id: practiceId },
        });
      }
      if (["stage_changed", "form_compiled"].includes(rule.trigger_event)) {
        const stageMap: Record<string, string> = {
          form_compiled: "pronte_da_fare",
          stage_changed: "da_inviare",
        };
        return await supabase.functions.invoke("on-stage-changed", {
          body: {
            practice_id: practiceId,
            new_stage_type: stageMap[rule.trigger_event] ?? "da_inviare",
          },
        });
      }
      if (
        rule.trigger_event.startsWith("days_waiting") ||
        rule.trigger_event === "recensione_7d_followup"
      ) {
        return await supabase.functions.invoke("process-automations", { body: {} });
      }
      throw new Error(`Test non supportato per trigger: ${rule.trigger_event}`);
    },
    onSuccess: (_data, vars) => {
      toast({
        title: "Test inviato",
        description: `Automazione "${vars.rule.name}" eseguita. Controlla email/WA del cliente.`,
      });
      setTestTarget(null);
      setTestPracticeId("");
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Errore test",
        description: err.message,
      });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const base = localOrder ?? rules;
    const next = Array.from(base);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalOrder(next);
    const updates = next.map((r, idx) => ({ id: r.id, order_index: idx }));
    reorderMutation.mutate(updates);
  };

  // ── Builder helpers ───────────────────────────────────────────────────────

  const openBuilder = (rule?: AutomationRule) => {
    if (rule) {
      setEditingRule(rule);
      setFlow(parseFlow(rule));
      setRuleName(rule.name);
      setRuleEnabled(rule.is_enabled);
      setRuleDesc(rule.description ?? "");
      setRuleMinHour(rule.min_hour ?? 9);
      setRuleMaxHour(rule.max_hour ?? 18);
    } else {
      setEditingRule(null);
      setFlow(newFlow());
      setRuleName("Nuova Automazione");
      setRuleEnabled(false);
      setRuleDesc("");
      setRuleMinHour(9);
      setRuleMaxHour(18);
    }
    setExpandedBlock("trigger");
    setView("builder");
  };

  const addCondition = () => {
    const c: ConditionDef = {
      id: genId(),
      field: "brand",
      operator: "eq",
      value: "ENEA",
    };
    setFlow((f) => ({ ...f, conditions: [...f.conditions, c] }));
    setExpandedBlock(c.id);
  };

  const updateCondition = (id: string, updated: ConditionDef) => {
    setFlow((f) => ({
      ...f,
      conditions: f.conditions.map((c) => (c.id === id ? updated : c)),
    }));
  };

  const removeCondition = (id: string) => {
    setFlow((f) => ({ ...f, conditions: f.conditions.filter((c) => c.id !== id) }));
  };

  const addAction = () => {
    const a: ActionDef = { id: genId(), type: "send_email", config: {} };
    setFlow((f) => ({ ...f, actions: [...f.actions, a] }));
    setExpandedBlock(a.id);
  };

  const updateAction = (id: string, updated: ActionDef) => {
    setFlow((f) => ({
      ...f,
      actions: f.actions.map((a) => (a.id === id ? updated : a)),
    }));
  };

  const removeAction = (id: string) => {
    setFlow((f) => ({ ...f, actions: f.actions.filter((a) => a.id !== id) }));
  };

  const toggleExpand = (id: string) => {
    setExpandedBlock((prev) => (prev === id ? null : id));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // ── Builder view ──────────────────────────────────────────────────────────
  if (view === "builder") {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className="gap-1.5 text-muted-foreground"
          >
            ← Automazioni
          </Button>
          <div className="flex-1">
            <Input
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              className="h-8 font-semibold border-0 shadow-none px-0 focus-visible:ring-0 text-base bg-transparent"
              placeholder="Nome automazione..."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {ruleEnabled ? "Attiva" : "Disattivata"}
            </span>
            <Switch checked={ruleEnabled} onCheckedChange={setRuleEnabled} />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setView("list")}
            className="text-muted-foreground"
          >
            Annulla
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !ruleName.trim()}
            className="gap-1.5"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Salva
          </Button>
        </div>

        {/* Builder canvas */}
        <div className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="max-w-xl mx-auto space-y-0">
            {/* Description */}
            <div className="mb-4">
              <Input
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="Descrizione opzionale..."
                className="text-sm bg-background border-dashed"
              />
            </div>

            {/* Time window */}
            <div className="mb-4 rounded-lg border bg-background p-3">
              <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Finestra oraria di invio (default 9-18)
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Da (ora)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={ruleMinHour}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || "0", 10);
                      if (Number.isFinite(v)) setRuleMinHour(Math.max(0, Math.min(23, v)));
                    }}
                    className="h-8"
                  />
                </div>
                <span className="text-muted-foreground text-sm mt-4">—</span>
                <div className="flex-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">A (ora)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={ruleMaxHour}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || "0", 10);
                      if (Number.isFinite(v)) setRuleMaxHour(Math.max(0, Math.min(24, v)));
                    }}
                    className="h-8"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Orario Europa/Roma. L'automazione parte solo se l'ora corrente è ≥ Da e &lt; A.
              </p>
            </div>

            {/* Trigger block */}
            <TriggerBlock
              trigger={flow.trigger}
              expanded={expandedBlock === "trigger"}
              onToggle={() => toggleExpand("trigger")}
              onChange={(t) => setFlow((f) => ({ ...f, trigger: t }))}
            />

            {/* Conditions */}
            {flow.conditions.length > 0 && (
              <>
                <div className="flex flex-col items-center my-1">
                  <div className="w-px h-4 bg-border" />
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  {flow.conditions.map((cond, i) => (
                    <div key={cond.id}>
                      {i > 0 && (
                        <div className="flex items-center gap-2 my-2">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs font-bold text-amber-600 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200">
                            E
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <ConditionBlock
                        condition={cond}
                        expanded={expandedBlock === cond.id}
                        index={i}
                        onToggle={() => toggleExpand(cond.id)}
                        onChange={(c) => updateCondition(cond.id, c)}
                        onDelete={() => removeCondition(cond.id)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Add condition connector */}
            <FlowConnector onAdd={addCondition} label="Aggiungi condizione (SE)" />

            {/* Actions */}
            {flow.actions.length > 0 && (
              <div className="space-y-2">
                {flow.actions.map((action, i) => (
                  <div key={action.id}>
                    {i > 0 && (
                      <div className="flex flex-col items-center my-1">
                        <div className="w-px h-4 bg-border" />
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <ActionBlock
                      action={action}
                      expanded={expandedBlock === action.id}
                      index={i}
                      onToggle={() => toggleExpand(action.id)}
                      onChange={(a) => updateAction(action.id, a)}
                      onDelete={() => removeAction(action.id)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Add action connector */}
            <div className="flex flex-col items-center my-2">
              {flow.actions.length > 0 && <div className="w-px h-4 bg-border" />}
              <button
                onClick={addAction}
                className="flex items-center gap-2 text-sm font-medium text-primary border-2 border-dashed border-primary/30 rounded-xl px-6 py-3 hover:border-primary hover:bg-primary/5 transition-all w-full justify-center mt-1"
              >
                <Plus className="h-4 w-4" />
                Aggiungi azione
              </button>
            </div>

            {/* Empty state for actions */}
            {flow.actions.length === 0 && (
              <p className="text-center text-xs text-muted-foreground pb-4">
                Aggiungi almeno un'azione per completare l'automazione
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Automazioni
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea flussi automatici basati su trigger, condizioni e azioni
          </p>
        </div>
        <Button onClick={() => openBuilder()} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova Automazione
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <EmailModuliClienteSection />

      {!isLoading && rules.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Zap className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold">Nessuna automazione</p>
          <p className="text-sm text-muted-foreground mt-1">
            Crea la tua prima automazione per iniziare
          </p>
          <Button className="mt-4 gap-2" onClick={() => openBuilder()}>
            <Plus className="h-4 w-4" />
            Crea Automazione
          </Button>
        </div>
      )}

      {!isLoading && rules.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">
                {rules.filter((r) => r.is_enabled).length}
              </strong>{" "}
              attive
            </span>
            <span>
              <strong className="text-foreground">{rules.length}</strong> totali
            </span>
          </div>

          {/* Drag-and-drop list */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="automation_rules">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="flex flex-col gap-3"
                >
                  {(localOrder ?? rules).map((rule, i) => (
                    <Draggable key={rule.id} draggableId={rule.id} index={i}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                        >
                          <AutomationCard
                            rule={rule}
                            onEdit={() => openBuilder(rule)}
                            onToggle={(enabled) =>
                              toggleMutation.mutate({ id: rule.id, is_enabled: enabled })
                            }
                            onDuplicate={() => duplicateMutation.mutate(rule)}
                            onDelete={() => setRuleToDelete(rule)}
                            onTest={() => setTestTarget(rule)}
                            dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                            isDragging={snapshot.isDragging}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Help text */}
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Come funziona
            </p>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>
                <strong>Trigger</strong>: definisce quando si attiva l'automazione (evento)
              </li>
              <li>
                <strong>Condizioni (SE)</strong>: filtra per brand, stage, giorni attesa ecc.
              </li>
              <li>
                <strong>Azioni</strong>: cosa fare — invia email/WA, sposta stage, chiama AI
              </li>
              <li>
                Il cron orario elabora le automazioni basate su tempo (giorni_in_stage)
              </li>
            </ul>
          </div>
        </>
      )}

      {/* Confirm delete automation */}
      <AlertDialog
        open={!!ruleToDelete}
        onOpenChange={(o) => !o && setRuleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'automazione?</AlertDialogTitle>
            <AlertDialogDescription>
              {ruleToDelete
                ? `"${ruleToDelete.name}" verrà eliminata definitivamente. L'operazione non può essere annullata.`
                : "L'automazione verrà eliminata definitivamente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ruleToDelete) deleteMutation.mutate(ruleToDelete.id);
                setRuleToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test automation dialog */}
      <Dialog
        open={!!testTarget}
        onOpenChange={(o) => {
          if (!o) {
            setTestTarget(null);
            setTestPracticeId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test automazione</DialogTitle>
            <DialogDescription>
              Invia l'automazione "{testTarget?.name}" su una pratica reale per verificare il template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Pratica di test</Label>
              <Select value={testPracticeId} onValueChange={setTestPracticeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona pratica" />
                </SelectTrigger>
                <SelectContent>
                  {testPractices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.cliente_nome} {p.cliente_cognome} · {p.brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Attenzione: il test invia email/WhatsApp reali al cliente della pratica scelta. Usa una pratica di test se possibile.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestTarget(null)}>
              Annulla
            </Button>
            <Button
              onClick={() =>
                testMutation.mutate({ rule: testTarget!, practiceId: testPracticeId })
              }
              disabled={!testPracticeId || testMutation.isPending}
            >
              {testMutation.isPending ? "Invio..." : "Invia test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
