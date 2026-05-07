import { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { findSlugCollision, slugify } from "@/lib/news";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** ID of the article being edited (excluded from collision check). */
  excludeId?: string;
  /** Callback invoked when the user clicks the "regenerate from title" button. */
  onRegenerate?: () => void;
}

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

/**
 * Slug field with live availability check (debounced 400ms) against the DB.
 * Stores the raw input but slugifies on blur so the user can type freely
 * without per-keystroke filtering.
 */
export default function SlugInput({ value, onChange, excludeId, onRegenerate }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) { setStatus("idle"); return; }
    if (trimmed !== slugify(trimmed)) {
      // Slug not in normalized form yet — still valid as a draft input
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    const t = setTimeout(async () => {
      const collisionId = await findSlugCollision(trimmed, excludeId);
      setStatus(collisionId ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
  }, [value, excludeId]);

  const indicator = (() => {
    if (!touched && status === "idle") return null;
    if (status === "checking") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
    if (status === "available") return <Check className="h-3.5 w-3.5 text-emerald-600" />;
    if (status === "taken") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    if (status === "invalid") return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    return null;
  })();

  const message = (() => {
    if (status === "available") return "Slug disponibile";
    if (status === "taken") return "Slug già in uso da un altro articolo";
    if (status === "invalid") return "Verrà normalizzato (solo a-z, 0-9, trattini)";
    return null;
  })();

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">/blog/</span>
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => { setTouched(true); onChange(e.target.value); }}
            onBlur={() => onChange(slugify(value))}
            placeholder="guida-pratica-enea-2026"
            className={
              status === "taken"
                ? "border-destructive focus-visible:ring-destructive/40 pr-9"
                : status === "available"
                  ? "border-emerald-500 focus-visible:ring-emerald-500/30 pr-9"
                  : "pr-9"
            }
          />
          {indicator && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{indicator}</span>
          )}
        </div>
        {onRegenerate && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  onClick={onRegenerate}
                  aria-label="Rigenera dallo slug"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Rigenera dal titolo</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <p
        className={`text-[11px] mt-1 ${
          status === "taken" ? "text-destructive font-medium"
            : status === "available" ? "text-emerald-700"
            : status === "invalid" ? "text-amber-600"
            : "text-muted-foreground"
        }`}
      >
        {message ?? "URL pubblico — solo a-z, 0-9 e trattini. Generato automaticamente dal titolo."}
      </p>
    </div>
  );
}
