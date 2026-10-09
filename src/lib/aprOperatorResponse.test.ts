import { describe, expect, it } from "vitest";
import { appendAprOperatorResponse, parseAprOperatorResponseState } from "./aprOperatorResponse";

describe("risposta operatore APR nel CRM", () => {
  const note = [
    "Domanda APR",
    "Destinatario: titolare",
    "Quali sono larghezza e altezza della seconda tenda?",
    "Lavoro completato: prima tenda riconosciuta.",
    "Risposta operatore:",
  ].join("\n");

  it("mostra soltanto una vera domanda destinata al titolare", () => {
    expect(parseAprOperatorResponseState(note)).toMatchObject({
      issuedNote: note,
      question: expect.stringContaining("seconda tenda"),
      answer: null,
    });
    expect(parseAprOperatorResponseState("Guasto APR. Lettore fermo.\nNon serve una risposta del titolare"))
      .toBeNull();
  });

  it("accoda la risposta senza modificare la domanda emessa da APR", () => {
    const answered = appendAprOperatorResponse(note, "Larghezza 350 cm, altezza 250 cm");
    expect(answered).toBe(`${note}\nLarghezza 350 cm, altezza 250 cm`);
    expect(parseAprOperatorResponseState(answered)?.answer).toBe("Larghezza 350 cm, altezza 250 cm");
  });
});
