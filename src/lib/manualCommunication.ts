export interface ManualCommunicationForm {
  channel: "email" | "whatsapp";
  recipient: string;
  subject: string;
  body: string;
}

export type ManualCommunicationRequest =
  | {
      functionName: "send-email";
      payload: {
        to: string;
        template: "chat_messaggio_diretto";
        data: {
          subject: string;
          messaggio: string;
        };
      };
    }
  | {
      functionName: "send-whatsapp";
      payload: {
        to: string;
        text_body: string;
      };
    };

export function buildManualCommunicationRequest(
  form: ManualCommunicationForm,
): ManualCommunicationRequest {
  if (form.channel === "email") {
    return {
      functionName: "send-email",
      payload: {
        to: form.recipient.trim(),
        template: "chat_messaggio_diretto",
        data: {
          subject: form.subject.trim(),
          messaggio: form.body.trim(),
        },
      },
    };
  }

  return {
    functionName: "send-whatsapp",
    payload: {
      to: form.recipient.trim(),
      text_body: form.body.trim(),
    },
  };
}

export function isManualCommunicationFormComplete(
  form: ManualCommunicationForm,
): boolean {
  if (!form.recipient.trim() || !form.body.trim()) return false;
  return form.channel !== "email" || Boolean(form.subject.trim());
}

export function normalizeManualWhatsappRecipient(recipient: string): string {
  return recipient.replace(/\D/g, "");
}
