/**
 * Chi deve dare la data dell'intervento per aprire la pratica.
 *
 * La meta' importante di questi test e' la seconda: il rivenditore deve
 * restare obbligato esattamente come prima. L'esenzione serve a far passare
 * il privato della pagina pubblica, non ad aprire una porta a tutti.
 */
import { describe, expect, it } from "vitest";

import { serveLaDataDellIntervento } from "../../supabase/functions/_shared/data-intervento";

describe("il privato della pagina pubblica non deve dare la data", () => {
  it.each(["pratica-enea", "pratica-fgas"])("nemmeno su %s", (modulo) => {
    expect(serveLaDataDellIntervento({ modulo, isPrivato: true })).toBe(false);
  });
});

describe("il rivenditore la deve dare, come prima", () => {
  it.each(["pratica-enea", "pratica-fgas"])("su %s", (modulo) => {
    expect(serveLaDataDellIntervento({ modulo, isPrivato: false })).toBe(true);
  });

  // Il percorso dal CRM non manda affatto `richiedente_tipo`: li' il campo
  // arriva assente, e assente non deve mai significare esentato.
  it.each(["pratica-enea", "pratica-fgas"])("anche quando non e' dichiarato (%s)", (modulo) => {
    expect(serveLaDataDellIntervento({ modulo })).toBe(true);
    expect(serveLaDataDellIntervento({ modulo, isPrivato: undefined })).toBe(true);
  });

  // Solo il vero `true` esenta: un valore storto non deve far passare nessuno.
  it.each([null, 0, "", "si", "privato"])("un %p al posto del si' non esenta", (storto) => {
    expect(
      serveLaDataDellIntervento({
        modulo: "pratica-enea",
        isPrivato: storto as unknown as boolean,
      }),
    ).toBe(true);
  });
});

describe("gli altri moduli non l'hanno mai chiesta", () => {
  it.each([undefined, null, "", "contatto", "visura-catastale"])("%p", (modulo) => {
    expect(serveLaDataDellIntervento({ modulo })).toBe(false);
  });
});
