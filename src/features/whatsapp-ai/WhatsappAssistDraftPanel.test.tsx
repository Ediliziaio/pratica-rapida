import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WhatsappAssistDraftPanel } from "./WhatsappAssistDraftPanel";

const draft = {
  kind: "operator_draft" as const,
  category: "practice_status" as const,
  text: "La pratica è in lavorazione.",
  confidence: 0.96,
  groundingNote: "Stato verificato sul CRM",
  requiresApproval: true as const,
};

describe("WhatsappAssistDraftPanel", () => {
  it("mostra la bozza ma non espone alcun comando di invio", () => {
    render(
      <WhatsappAssistDraftPanel
        draft={draft}
        onApplyDraft={() => undefined}
        onDiscard={() => undefined}
      />,
    );

    expect(screen.getByText("La pratica è in lavorazione.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /usa nel messaggio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^invia/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nessun messaggio viene inviato/i)).toBeInTheDocument();
  });

  it("applica soltanto il testo al composer tramite callback", () => {
    const onApplyDraft = vi.fn();
    render(
      <WhatsappAssistDraftPanel
        draft={draft}
        onApplyDraft={onApplyDraft}
        onDiscard={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /usa nel messaggio/i }));
    expect(onApplyDraft).toHaveBeenCalledOnce();
    expect(onApplyDraft).toHaveBeenCalledWith("La pratica è in lavorazione.");
  });

  it("permette di scartare senza effetti collaterali", () => {
    const onDiscard = vi.fn();
    render(
      <WhatsappAssistDraftPanel
        draft={draft}
        onApplyDraft={() => undefined}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /scarta/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
