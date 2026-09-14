import { describe, expect, it } from "vitest";
import {
  buildManualCommunicationRequest,
  isManualCommunicationFormComplete,
  type ManualCommunicationForm,
} from "./manualCommunication";

describe("manual communications", () => {
  it("builds the payload expected by send-email", () => {
    const form: ManualCommunicationForm = {
      channel: "email",
      recipient: "  cliente@example.com ",
      subject: "  Aggiornamento pratica ",
      body: "  Il testo della comunicazione. ",
    };

    expect(buildManualCommunicationRequest(form)).toEqual({
      functionName: "send-email",
      payload: {
        to: "cliente@example.com",
        template: "chat_messaggio_diretto",
        data: {
          subject: "Aggiornamento pratica",
          messaggio: "Il testo della comunicazione.",
        },
      },
    });
  });

  it("builds the free-text payload expected by send-whatsapp", () => {
    const form: ManualCommunicationForm = {
      channel: "whatsapp",
      recipient: "  +39 333 0000000 ",
      subject: "",
      body: "  Messaggio WhatsApp ",
    };

    expect(buildManualCommunicationRequest(form)).toEqual({
      functionName: "send-whatsapp",
      payload: {
        to: "+39 333 0000000",
        text_body: "Messaggio WhatsApp",
      },
    });
  });

  it("requires a subject for email but not for WhatsApp", () => {
    const base = {
      recipient: "destinatario@example.com",
      subject: "",
      body: "Messaggio",
    };

    expect(isManualCommunicationFormComplete({ ...base, channel: "email" })).toBe(false);
    expect(isManualCommunicationFormComplete({ ...base, channel: "whatsapp" })).toBe(true);
    expect(
      isManualCommunicationFormComplete({
        ...base,
        channel: "email",
        subject: "Oggetto",
      }),
    ).toBe(true);
  });
});
