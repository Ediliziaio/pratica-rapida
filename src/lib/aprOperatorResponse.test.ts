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

  it("mostra anche la domanda di ripiego che APR e il sorvegliante gia' usano", () => {
    const fallback = "APR si e' fermato. Quale data di fine lavori va indicata?\nRisposta operatore:";
    expect(parseAprOperatorResponseState(fallback)).toMatchObject({
      issuedNote: fallback,
      question: "Quale data di fine lavori va indicata?",
      answer: null,
    });
    expect(parseAprOperatorResponseState(appendAprOperatorResponse(fallback, "06/10/2026"))?.answer)
      .toBe("06/10/2026");
  });

  it("non apre un campo risposta per guasti, rivenditori o note senza marcatore", () => {
    expect(parseAprOperatorResponseState("Guasto APR. Il lettore non ha risposto.\nRisposta operatore:"))
      .toBeNull();
    expect(parseAprOperatorResponseState("Domanda APR\nDestinatario: rivenditore\nQuale fattura?\nRisposta operatore:"))
      .toBeNull();
    expect(parseAprOperatorResponseState("APR si e' fermato. Il totale non e' stato letto."))
      .toBeNull();
  });
});
