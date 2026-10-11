import { describe, expect, it } from "vitest";

import { ENEASUBITO, PRATICA_RAPIDA } from "./marchio";

describe("i due marchi del modulo pubblico", () => {
  // Questo e' il punto delicato: il modulo decide se incassare guardando
  // `tipo_fatturazione = cliente_finale`, che e' vero per tutte e due. Senza
  // questo interruttore un cliente di EneaSubito, che ha gia' pagato 99 € con
  // Stripe, verrebbe mandato a pagare una seconda volta con l'altra societa'.
  it("EneaSubito non incassa dal modulo: ha gia' incassato prima", () => {
    expect(ENEASUBITO.incassaDalModulo).toBe(false);
  });

  it("Pratica Rapida continua a incassare dal modulo, come sempre", () => {
    expect(PRATICA_RAPIDA.incassaDalModulo).toBe(true);
  });

  it("ognuno manda l'assistenza al proprio indirizzo", () => {
    expect(ENEASUBITO.assistenzaEmail).toBe("assistenza@eneasubito.it");
    expect(PRATICA_RAPIDA.assistenzaEmail).toBe("supporto@praticarapida.it");
  });

  it("EneaSubito non promette un numero a cui non risponde", () => {
    expect(ENEASUBITO.whatsapp).toBeNull();
  });

  // Il nome di un marchio non deve comparire dentro l'altro.
  it("i due nomi non si mescolano", () => {
    expect(ENEASUBITO.nome).toBe("EneaSubito");
    expect(JSON.stringify(ENEASUBITO)).not.toMatch(/pratica ?rapida/i);
  });
});
