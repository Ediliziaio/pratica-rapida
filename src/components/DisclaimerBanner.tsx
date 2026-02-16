import { Info } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2 border-t bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Impresa Leggera gestisce il flusso documentale e amministrativo. Le attività riservate a
        professionisti abilitati vengono coordinate con partner abilitati.
      </p>
    </div>
  );
}
