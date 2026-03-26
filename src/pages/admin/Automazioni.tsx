import { useState } from "react";
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
} from "lucide-react";
import type { AutomationRule } from "@/integrations/supabase/types";

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

const TRIGGER_TYPES = [
  {
    value: "practice_created",
    label: "Pratica Creata",
    description: "Quando una nuova pratica ENEA/CT viene inviata al sistema",
    icon: FilePlus,
  },
  {
    value: "stage_changed",
    label: "Stage Cambiato",
    description: "Quando la pratica viene spostata in un nuovo stage Kanban",
    icon: ArrowRight,
  },
  {
    value: "days_in_stage",
    label: "Giorni nello Stage",
    description: "Quando la pratica è ferma nello stesso stage per N giorni",
    icon: Clock,
  },
  {
    value: "form_submitted",
    label: "Form Compilato",
    description: "Quando il cliente compila il form pubblico inviato via link",
    icon: CheckCircle2,
  },
  {
    value: "call_completed",
    label: "Chiamata AI Completata",
    description: "Quando una chiamata ElevenLabs Conversational AI termina",
    icon: Phone,
  },
  {
    value: "manual",
    label: "Manuale",
    description: "Eseguita solo manualmente dall'operatore (no trigger automatico)",
    icon: Play,
  },
];

const CONDITION_FIELDS = [
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
    value: "has_all_documents",
    label: "Documenti completi",
    operators: [{ value: "eq", label: "è" }],
    valueType: "boolean" as const,
    options: ["true", "false"],
  },
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
];

const ACTION_TYPES = [
  { value: "send_email", label: "Invia Email", icon: Mail, color: "border-blue-200 bg-blue-50" },
  {
    value: "send_whatsapp",
    label: "Invia WhatsApp",
    icon: MessageCircle,
    color: "border-green-200 bg-green-50",
  },
  {
    value: "move_to_stage",
    label: "Sposta Stage",
    icon: ArrowRight,
    color: "border-purple-200 bg-purple-50",
  },
  {
    value: "elevenlabs_call",
    label: "Chiamata AI (ElevenLabs)",
    icon: Phone,
    color: "border-rose-200 bg-rose-50",
  },
  {
    value: "wait_days",
    label: "Attendi N giorni",
    icon: Clock,
    color: "border-amber-200 bg-amber-50",
  },
];

const EMAIL_TEMPLATES = [
  { value: "pratica_ricevuta", label: "Pratica ricevuta" },
  { value: "sollecito_privato", label: "Sollecito privato" },
  { value: "sollecito_fornitore", label: "Sollecito fornitore" },
  { value: "form_compilato", label: "Form compilato" },
  { value: "pratica_inviata", label: "Pratica inviata ENEA" },
  { value: "recensione", label: "Richiesta recensione" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return crypto.randomUUID();
}

function parseFlow(rule: AutomationRule): AutomationFlow {
  const config = rule.trigger_config as Record<string, unknown>;
  if (config?.__v === 2) return config as unknown as AutomationFlow;
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
function actionLabel(type: string) {
  return ACTION_TYPES.find((a) => a.value === type)?.label ?? type;
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
          <p className="font-semibold text-sm">{def?.label ?? trigger.type}</p>
          {def?.description && (
            <p className="text-xs text-muted-foreground truncate">{def.description}</p>
          )}
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
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(action.type === "send_email" || action.type === "send_whatsapp") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Template</Label>
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
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
}) {
  const flow = parseFlow(rule);
  const actionsCount = flow.actions.length;
  const conditionsCount = flow.conditions.length;

  return (
    <div className="group rounded-xl border bg-card hover:shadow-md transition-shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
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
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={onDuplicate}
          title="Duplica"
        >
          <Copy className="h-3.5 w-3.5" />
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
  const [expandedBlock, setExpandedBlock] = useState<string | null>("trigger");

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
      };

      if (editingRule) {
        const { error } = await supabase
          .from("automation_rules")
          .update(payload)
          .eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const maxOrder = rules.length > 0 ? Math.max(...rules.map((r) => r.order_index)) + 1 : 0;
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
      const maxOrder = rules.length > 0 ? Math.max(...rules.map((r) => r.order_index)) + 1 : 0;
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

  // ── Builder helpers ───────────────────────────────────────────────────────

  const openBuilder = (rule?: AutomationRule) => {
    if (rule) {
      setEditingRule(rule);
      setFlow(parseFlow(rule));
      setRuleName(rule.name);
      setRuleEnabled(rule.is_enabled);
      setRuleDesc(rule.description ?? "");
    } else {
      setEditingRule(null);
      setFlow(newFlow());
      setRuleName("Nuova Automazione");
      setRuleEnabled(false);
      setRuleDesc("");
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
    <div className="p-4 space-y-5 max-w-5xl">
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

          {/* Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule) => (
              <AutomationCard
                key={rule.id}
                rule={rule}
                onEdit={() => openBuilder(rule)}
                onToggle={(enabled) => toggleMutation.mutate({ id: rule.id, is_enabled: enabled })}
                onDuplicate={() => duplicateMutation.mutate(rule)}
              />
            ))}
          </div>

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
    </div>
  );
}
