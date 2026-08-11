import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WhatsappAiDraft } from "./draftContract";

export interface WhatsappAssistDraftPanelProps {
  draft: WhatsappAiDraft;
  onApplyDraft: (text: string) => void;
  onDiscard: () => void;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Pannello V1 Assist: porta il testo nel composer dell'operatore, non invia.
 * `onApplyDraft` deve esclusivamente valorizzare la bozza locale della chat.
 */
export function WhatsappAssistDraftPanel({
  draft,
  onApplyDraft,
  onDiscard,
}: WhatsappAssistDraftPanelProps) {
  return (
    <Card data-testid="whatsapp-assist-draft" className="border-sky-200 bg-sky-50/50">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bot className="h-4 w-4" />
            Bozza AI per operatore
          </CardTitle>
          <Badge variant="outline">{draft.category}</Badge>
          <Badge variant="outline">confidenza {percent(draft.confidence)}</Badge>
        </div>
        <CardDescription className="flex items-start gap-1.5 text-xs">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {draft.groundingNote || "Bozza da verificare prima dell'uso."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
          {draft.text}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onApplyDraft(draft.text)}
          >
            <Check className="mr-1.5 h-4 w-4" />
            Usa nel messaggio
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDiscard}>
            <X className="mr-1.5 h-4 w-4" />
            Scarta
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Nessun messaggio viene inviato da questo pannello. L'operatore può modificare il testo nel composer prima dell'invio manuale.
        </p>
      </CardContent>
    </Card>
  );
}
