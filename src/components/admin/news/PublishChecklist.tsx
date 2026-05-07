import { Check, AlertTriangle, X } from "lucide-react";

export interface PublishCheck {
  /** Stable identifier for the rule. */
  id: string;
  /** Short human label shown in the list. */
  label: string;
  /** Severity — error blocks publish, warning is just advisory. */
  severity: "error" | "warning";
  /** Did this check pass? */
  passed: boolean;
  /** Optional contextual hint shown when failing. */
  hint?: string;
}

interface Props {
  checks: PublishCheck[];
}

/**
 * Visual checklist of pre-publish validation rules. Shows a green check for
 * every rule that passes, and a red/amber icon + hint for the ones that fail.
 *
 * Errors block publish; warnings are advisory.
 */
export default function PublishChecklist({ checks }: Props) {
  const errors = checks.filter((c) => !c.passed && c.severity === "error");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");
  const ready = errors.length === 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center ${
            ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {ready ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-sm font-semibold">
            {ready ? "Pronto a pubblicare" : `${errors.length} problem${errors.length === 1 ? "a" : "i"} bloccant${errors.length === 1 ? "e" : "i"}`}
          </p>
          {warnings.length > 0 && (
            <p className="text-[11px] text-amber-700">
              {warnings.length} avvis{warnings.length === 1 ? "o" : "i"} non bloccant{warnings.length === 1 ? "e" : "i"}
            </p>
          )}
        </div>
      </div>

      <ul className="space-y-1.5">
        {checks.map((c) => {
          const icon = c.passed
            ? <Check className="h-3.5 w-3.5 text-emerald-600" />
            : c.severity === "error"
              ? <X className="h-3.5 w-3.5 text-destructive" />
              : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
          return (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 mt-0.5">{icon}</span>
              <div className="flex-1">
                <span className={c.passed ? "text-muted-foreground line-through" : "text-foreground"}>
                  {c.label}
                </span>
                {!c.passed && c.hint && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
