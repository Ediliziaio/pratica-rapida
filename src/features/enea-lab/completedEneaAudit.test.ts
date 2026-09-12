import { describe, expect, it } from "vitest";
import { mapSchermaturaPractice } from "./mapper";
import { ENEA_LAB_MOCK_ANALYSIS, ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import {
  compareMappedToCompletedEnea,
  parseCompletedEneaText,
} from "./completedEneaAudit";

const COMPLETED_ENEA_TECHNICAL_EXCERPT = `
Ecobonus 2026
Riqualificazione energetica - ex legge 296/2006
Comma 345B - Schermature solari
CPID 000001-2026E-SYNTHETICFIXTURE Data chiusura 2026-07-14 9:57:39 CEST
Dati generali
1. Dati identificativi della struttura oggetto dell'intervento Ubicazione edificio
Indirizzo: Via Laboratorio 24 - 00001 Comune Demo Nord (ZZ)
Scala:
Interno:
Dati catastali
Codice nazionale del Comune: Z999
Sezione:
Foglio: 900
Particella: 90001
Subalterno: 900
2. Anno di costruzione inserire anche se stimato 2022
3. Proprietario o detentore dell'edificio o avente diritto Nome: Cliente Cognome: Demo Storico Codice fiscale: CF-SINTETICO-NON-VALIDO Sesso: M Data di nascita: 01/01/1980 Comune di nascita: Comune Demo Nord (ZZ) Residenza: Via Dimostrazione 12 - 00002 Comune Demo Ovest (ZZ)
4. Altri beneficiari (persone fisiche)
5. Altri beneficiari (persone giuridiche)
6. Titolo di possesso Proprietario o comproprietario
7. Destinazione d'uso generale Residenziale
8. Destinazione d'uso particolare Edifici adibiti a residenza e assimilabili (con carattere continuativo o saltuario)
9. Tipologia edilizia Edificio a schiera e condominio fino a tre piani
10. Superficie utile [m²] delle unità immobiliari interessate dall'intervento 140
11. Zona climatica E
12. Gradi giorno 2631
Dati intervento
1. Intervento su Singola unità immobiliare (in un edificio costituito da più unità immobiliari)
2. Unità immobiliari Numero totale delle unità immobiliari dell'edificio alla fine dei lavori 1
3. Numero di unità immobiliari oggetto dell'intervento per cui si chiede la detrazione
Si considera la situazione catastale all'inizio dei lavori 1
4. Si sono verificati degli accorpamenti di unità immobiliari? Si fa riferimento alle unità immobiliari interessate dai lavori oggetto della presente scheda descrittiva No
5. Data d'inizio dei lavori 09/04/2026
6. Data di ultimazione dei lavori (collaudo) 14/07/2026
IR. Impianto termico esistente
1. Tipo di impianto Indicare la tipologia prevalente a. impianto autonomo
2. Terminali di erogazione Indicare la tipologia prevalente f. pannelli radianti annegati nella struttura
3. Tipo di distribuzione Indicare la tipologia prevalente
4. Tipo di regolazione Indicare la tipologia prevalente
5. Generatori esistenti prima dell'inizio dei lavori
Altro (energia elettrica) 1 ƞ = 94.8 % 24.1
6. Vettore energetico Indicare la tipologia prevalente f. energia elettrica
7. Impianto di climatizzazione estiva Sì
Scheda intervento
SS. Schermature solari
# Tipo schermatura Installazione Superficie schermatura [m²] Superficie finestrata protetta [m²]
1 Altra schermatura solare Esterna 3.7 2.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
2 Altra schermatura solare Esterna 11.3 5.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
3 Altra schermatura solare Esterna 5.6 4.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
4 Altra schermatura solare Esterna 5.9 4.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
5 Altra schermatura solare Esterna 0.5 0.3 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale
Spese congrue sostenute [€] 13924
`;

function mappedScreeningCount(mapped: ReturnType<typeof mapSchermaturaPractice>): number {
  const field = mapped.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === "schermature.numero");
  return Number(field?.value ?? 0);
}

describe("audit storico PDF ENEA conclusivo", () => {
  it("estrae soltanto campi realmente compilati dal workflow e ignora i valori automatici del portale", () => {
    const snapshot = parseCompletedEneaText(COMPLETED_ENEA_TECHNICAL_EXCERPT);

    expect(snapshot.cpid).toBe("000001-2026E-SYNTHETICFIXTURE");
    expect(snapshot.fields["intervento.tipo"]).toBe("Comma 345B - Schermature solari");
    expect(snapshot.fields["immobile.comune"]).toBe("Comune Demo Nord");
    expect(snapshot.fields["immobile.indirizzo"]).toBe("Via Laboratorio");
    expect(snapshot.fields["immobile.civico"]).toBe("24");
    expect(snapshot.fields["immobile.cap"]).toBe("00001");
    expect(snapshot.fields["immobile.foglio"]).toBe("900");
    expect(snapshot.fields["immobile.mappale"]).toBe("90001");
    expect(snapshot.fields["immobile.subalterno"]).toBe("900");
    expect(snapshot.fields["immobile.anno"]).toBe("2022");
    expect(snapshot.fields["beneficiario.nome"]).toBe("Cliente");
    expect(snapshot.fields["beneficiario.cognome"]).toBe("Demo Storico");
    expect(snapshot.fields["beneficiario.comune_nascita"]).toBe("Comune Demo Nord (ZZ)");
    expect(snapshot.fields["beneficiario.comune_residenza"]).toBe("Comune Demo Ovest");
    expect(snapshot.fields["beneficiario.titolo"]).toBe("Proprietario o comproprietario");
    expect(snapshot.fields["immobile.tipologia"]).toBe("Edificio a schiera e condominio fino a tre piani");
    expect(snapshot.fields["intervento.data_inizio"]).toBe("09/04/2026");
    expect(snapshot.fields["impianto.tipo"]).toBe("a. impianto autonomo");
    expect(snapshot.fields["impianto.numero_generatori"]).toBe("1");
    expect(snapshot.fields["impianto.rendimento"]).toBe("94.8");
    expect(snapshot.fields["impianto.potenza"]).toBe("24.1");
    expect(snapshot.fields["schermature.0.superficie"]).toBe("3.7");
    expect(snapshot.fields["schermature.0.superficie_finestrata"]).toBe("2.9");
    expect(snapshot.fields["schermature.4.gtot"]).toBe("0.13");
    expect(snapshot.fields["schermature.spesa"]).toBe("13924");
    expect(snapshot.fields["schermature.0.rsupp"]).toBeUndefined();
    expect(snapshot.fields["immobile.zona_climatica"]).toBeUndefined();
    expect(snapshot.fields["immobile.gradi_giorno"]).toBeUndefined();
    expect(snapshot.fields["intervento.unita_totali"]).toBeUndefined();
    expect(snapshot.fields["impianto.generatore"]).toBeUndefined();
    expect(snapshot.screeningCount).toBe(5);
  });

  it("marca come struttura incompleta se una riga schermatura numerata non viene interpretata", () => {
    const unsupportedRow = COMPLETED_ENEA_TECHNICAL_EXCERPT.replace(
      "2 Altra schermatura solare Esterna 11.3 5.9 0.08 Sud Dichiarato dal fornitore 0.13 Misto Manuale",
      "2 Altra schermatura solare Esterna 11.3 5.9 0.08 Nord Dichiarato dal fornitore 0.13 Misto Manuale",
    );

    const snapshot = parseCompletedEneaText(unsupportedRow);

    expect(snapshot.fields["schermature.1.superficie"]).toBeUndefined();
    expect(snapshot.screeningCount).toBe(-1);
  });

  it("segnala come differenza un valore benchmark diverso dalla policy operativa del mapper", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const completed = {
      cpid: "TEST",
      screeningCount: mappedScreeningCount(mapped),
      fields: {
        "schermature.0.superficie_finestrata": "2.9",
      },
    };

    const audit = compareMappedToCompletedEnea(mapped, completed, `${source.id}/conclusa.pdf`);

    expect(audit.compared).toBe(2);
    expect(audit.matches).toBe(1);
    expect(audit.mismatches).toBe(1);
    expect(audit.matchedFieldIds).toContain("schermature.numero");
    expect(audit.differences[0]).toMatchObject({
      fieldId: "schermature.0.superficie_finestrata",
      completedValue: "2.9",
      mappedValue: "2,6 m²",
    });
  });

  it("considera equivalenti le etichette ENEA storiche e quelle normalizzate del mapper", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id], {
      overrides: {
        "beneficiario.titolo": "Proprietario / comproprietario",
        "immobile.tipologia": "Edificio fino a 3 piani",
      },
      confirmedFieldIds: new Set(["beneficiario.titolo", "immobile.tipologia"]),
    });
    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: "TEST",
      screeningCount: mappedScreeningCount(mapped),
      fields: {
        "beneficiario.titolo": "Proprietario o comproprietario",
        "immobile.tipologia": "Edificio a schiera e condominio fino a tre piani",
      },
    });

    expect(audit.mismatches).toBe(0);
    expect(audit.matches).toBe(3);
  });

  it("non certifica il mapper se il numero di schermature differisce dal PDF conclusivo", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = mapSchermaturaPractice(source, ENEA_LAB_MOCK_ANALYSIS[source.id]);
    const mappedCount = mappedScreeningCount(mapped);

    const audit = compareMappedToCompletedEnea(mapped, {
      cpid: "TEST",
      screeningCount: mappedCount + 1,
      fields: {},
    });

    expect(audit.compared).toBe(1);
    expect(audit.matches).toBe(0);
    expect(audit.mismatches).toBe(1);
    expect(audit.differences).toEqual([
      {
        fieldId: "schermature.numero",
        completedValue: String(mappedCount + 1),
        mappedValue: String(mappedCount),
      },
    ]);
  });
});
