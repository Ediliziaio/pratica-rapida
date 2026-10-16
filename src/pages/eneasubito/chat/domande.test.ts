/**
 * La chat deve trovare la risposta giusta a chi scrive con parole sue.
 *
 * Questi non sono test di stile: ogni caso qui sotto e' una frase presa o
 * ricalcata su quelle vere dell'esportazione WhatsApp. Se un domani qualcuno
 * cambia le chiavi di ricerca e una di queste smette di funzionare, il
 * cliente si ritrova a scrivere a mano una domanda a cui sapevamo gia'
 * rispondere.
 */
import { describe, expect, it } from "vitest";

import { cerca, DOMANDE, IN_VETRINA } from "./domande";

describe("le domande salvate", () => {
  it("hanno tutte un identificativo diverso", () => {
    const visti = new Set(DOMANDE.map((d) => d.id));
    expect(visti.size).toBe(DOMANDE.length);
  });

  it("hanno tutte una risposta scritta", () => {
    for (const d of DOMANDE) {
      expect(d.risposta.trim().length, `vuota: ${d.id}`).toBeGreaterThan(10);
      expect(d.chiavi.length, `senza chiavi: ${d.id}`).toBeGreaterThan(0);
    }
  });

  // Troppe in vetrina e non le legge nessuno; troppo poche e la chat sembra
  // vuota. Otto e' il numero deciso nel copione.
  it("ne mostra un numero leggibile senza cercare", () => {
    expect(IN_VETRINA.length).toBeGreaterThanOrEqual(5);
    expect(IN_VETRINA.length).toBeLessThanOrEqual(9);
  });
});

describe("cerca", () => {
  it.each([
    ["ma voi chi siete? mi posso fidare?", "chi-siete"],
    ["avete un numero di telefono dove chiamarvi", "telefono"],
    ["quanto costa la pratica", "quanto-costa"],
    ["sono passati piu di 90 giorni dalla fine dei lavori", "oltre-90-giorni"],
    ["la casa e cointestata con mia moglie", "cointestazione"],
    ["non so quale caldaia ho", "caldaia"],
    ["ho fatto un finanziamento e non ho i bonifici", "finanziamento"],
    ["i metri quadri sono quelli commerciali?", "metri-quadri"],
    ["a che punto e la mia pratica", "a-che-punto"],
    ["dove prendo la data di fine lavori", "data-fine-lavori"],
    ["serve lo spid per fare la pratica", "spid"],
    ["e se pago e poi non si puo fare, mi rimborsate?", "non-si-puo-fare"],
  ])("su «%s» propone la risposta giusta", (scritto, atteso) => {
    const trovate = cerca(scritto);
    expect(trovate.map((d) => d.id)).toContain(atteso);
  });

  it("mette per prima la piu' pertinente", () => {
    expect(cerca("quanto costa")[0].id).toBe("quanto-costa");
    expect(cerca("telefono")[0].id).toBe("telefono");
  });

  it("non si fa fermare da accenti e maiuscole", () => {
    expect(cerca("PERCHÉ non avete un TELEFONO?").map((d) => d.id)).toContain("telefono");
  });

  // Meglio dire «questa la giro a un tecnico» che proporre una risposta a
  // caso: una risposta fuori tema su una detrazione fa piu' danno del
  // silenzio.
  it("resta zitta quando non c'entra niente", () => {
    expect(cerca("buongiorno")).toHaveLength(0);
    expect(cerca("ok grazie")).toHaveLength(0);
    expect(cerca("pizza margherita napoletana")).toHaveLength(0);
  });
});
