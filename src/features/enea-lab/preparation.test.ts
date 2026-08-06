import { describe, expect, it } from "vitest";
import { ENEA_LAB_MOCK_PRACTICES } from "./mockPractices";
import { mapSchermaturaPractice } from "./mapper";
import type { EneaLabMappedPractice } from "./types";
import { buildEneaPayload, fingerprintPreparedPractice, validatePreparedPractice } from "./preparation";

describe("preparazione pacchetto ENEA", () => {
  it("include le convenzioni nel test ma le esclude dal pacchetto ufficiale", () => {
    const mapped = mapSchermaturaPractice(ENEA_LAB_MOCK_PRACTICES[0]);
    const issues = validatePreparedPractice(ENEA_LAB_MOCK_PRACTICES[0], mapped);
    const now = new Date("2026-08-05T12:00:00.000Z");
    const testPayload = buildEneaPayload(mapped, issues, "test", now);
    const officialPayload = buildEneaPayload(mapped, issues, "official", now);

    expect(testPayload.fields["impianto.potenza"]).toMatch(/kW$/);
    expect(testPayload.portalFields.find(({ id }) => id === "impianto.potenza")).toMatchObject({
      value: expect.stringMatching(/^\d{2},\d$/),
      sectionId: "impianto",
      testOnly: true,
    });
    expect(officialPayload.fields["impianto.potenza"]).toBeUndefined();
    expect(officialPayload.portalFields.some(({ id }) => id === "impianto.potenza")).toBe(false);
    expect(officialPayload.excludedTestFields).toEqual(expect.arrayContaining([
      "impianto.potenza",
      "impianto.rendimento",
    ]));
    expect(officialPayload.readyForOfficialSubmission).toBe(false);
    expect(officialPayload.excludedUnverifiedFields).toContain("immobile.codice_comune");
    expect(Object.values(officialPayload.fields)).not.toContain("Intervento umano richiesto");
    expect(officialPayload.interventionRequired.length).toBeGreaterThan(0);
  });

  it("blocca una pratica ancora in attesa del cliente", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[1];
    const mapped = mapSchermaturaPractice(source);
    const issues = validatePreparedPractice(source, mapped);

    expect(issues).toContainEqual(expect.objectContaining({
      code: "client-form-not-ready",
      severity: "blocker",
    }));
  });

  it("invalida l'impronta del pacchetto quando cambia un dato", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const first = mapSchermaturaPractice(source);
    const firstIssues = validatePreparedPractice(source, first);
    const corrected = mapSchermaturaPractice(source, undefined, {
      overrides: { "immobile.codice_comune": "H501" },
    });
    const correctedIssues = validatePreparedPractice(source, corrected);

    expect(fingerprintPreparedPractice(first, firstIssues)).not.toBe(
      fingerprintPreparedPractice(corrected, correctedIssues),
    );
    expect(fingerprintPreparedPractice(first, firstIssues)).toBe(
      fingerprintPreparedPractice(first, firstIssues),
    );
  });

  it("usa le date corrette localmente per i controlli incrociati", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.dataFineLavori = "2099-12-31";
    const corrected = mapSchermaturaPractice(source, undefined, {
      overrides: {
        "intervento.data_inizio": "01/07/2026",
        "intervento.data_fine": "10/07/2026",
      },
    });
    const issues = validatePreparedPractice(source, corrected);

    expect(issues.some(({ code }) => code === "future-finish-date")).toBe(false);
    expect(issues.some(({ code }) => code === "start-after-finish")).toBe(false);
  });

  it("non dichiara pronta la bozza ufficiale finche un campo obbligatorio e da confermare", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = structuredClone(mapSchermaturaPractice(source)) as EneaLabMappedPractice;
    const requiredFields = mapped.sections.flatMap((section) => section.fields).filter((field) => field.required);
    requiredFields.forEach((field) => { field.status = "ready"; });
    const fieldToReview = requiredFields.find((field) => field.id === "documenti.fatture");
    expect(fieldToReview).toBeDefined();
    fieldToReview!.status = "review";

    const issues = validatePreparedPractice(source, mapped);
    const payload = buildEneaPayload(mapped, issues, "official");

    expect(issues).toContainEqual(expect.objectContaining({
      code: "review-documenti.fatture",
      severity: "blocker",
    }));
    expect(payload.readyForOfficialSubmission).toBe(false);
    expect(payload.fields["documenti.fatture"]).toBeUndefined();
  });

  it("mantiene il blocco di sicurezza anche se il chiamante omette gli errori di validazione", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mapped = structuredClone(mapSchermaturaPractice(source)) as EneaLabMappedPractice;
    const requiredFields = mapped.sections.flatMap((section) => section.fields).filter((field) => field.required);
    requiredFields.forEach((field) => { field.status = "ready"; });
    requiredFields[0].status = "review";

    expect(buildEneaPayload(mapped, [], "official").readyForOfficialSubmission).toBe(false);
  });

  it("rimuove il blocco sul conteggio soltanto dopo la conferma esplicita", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const mismatchedAnalysis = {
      items: [{
        widthMm: 1200,
        heightMm: 1000,
        surfaceM2: 1.2,
        gTot: 0.2,
        description: "Schermatura",
        sourcePath: "fattura.pdf",
      }],
      invoiceTotal: 1000,
      creditTotal: 0,
      eligibleExpense: 1000,
      firstInvoiceDate: "2026-07-01",
      documents: [],
      blockers: [],
      warnings: [],
    };
    const before = mapSchermaturaPractice(source, mismatchedAnalysis);
    expect(validatePreparedPractice(source, before, mismatchedAnalysis)).toContainEqual(
      expect.objectContaining({ code: "screening-count-mismatch" }),
    );

    const confirmed = mapSchermaturaPractice(source, mismatchedAnalysis, {
      confirmedFieldIds: new Set(["schermature.numero"]),
    });
    expect(validatePreparedPractice(source, confirmed, mismatchedAnalysis).some(
      ({ code }) => code === "screening-count-mismatch",
    )).toBe(false);
  });

  it("consente il recupero manuale quando il parser non riconosce le righe", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const failedAnalysis = {
      items: [],
      invoiceTotal: 1000,
      creditTotal: 0,
      eligibleExpense: 1000,
      firstInvoiceDate: "2026-07-01",
      documents: [],
      blockers: ["Nessuna riga di schermatura con dimensioni e gTot riconosciuta nelle fatture."],
      warnings: [],
    };
    const mapped = mapSchermaturaPractice(source, failedAnalysis, {
      overrides: {
        "schermature.0.dimensioni": "1200 × 1000 mm",
        "schermature.0.gtot": "0,20",
        "schermature.1.dimensioni": "1500 × 1000 mm",
        "schermature.1.gtot": "0,20",
      },
    });

    expect(validatePreparedPractice(source, mapped, failedAnalysis).some(
      ({ message }) => message.startsWith("Nessuna riga di schermatura"),
    )).toBe(false);
  });

  it("ricostruisce manualmente l'elenco quando il modulo non contiene schermature", () => {
    const source = structuredClone(ENEA_LAB_MOCK_PRACTICES[0]);
    source.form.prodotto = { tipo: "schermature", items: [] };
    const mapped = mapSchermaturaPractice(source, undefined, {
      overrides: {
        "schermature.numero": "1",
        "schermature.0.dimensioni": "1200 × 1000 mm",
        "schermature.0.gtot": "0,20",
      },
    });

    expect(mapped.sections.flatMap((section) => section.fields)
      .find((field) => field.id === "schermature.0.superficie")?.value).toBe("1,2 m²");
    expect(validatePreparedPractice(source, mapped).some(
      ({ code }) => code === "screening-list-empty",
    )).toBe(false);
  });

  it("consente di sostituire manualmente una spesa non riconosciuta", () => {
    const source = ENEA_LAB_MOCK_PRACTICES[0];
    const failedAnalysis = {
      items: [],
      invoiceTotal: 0,
      creditTotal: 0,
      eligibleExpense: null,
      firstInvoiceDate: null,
      documents: [],
      blockers: ["Il totale di almeno un documento fiscale non è stato riconosciuto."],
      warnings: [],
    };
    const mapped = mapSchermaturaPractice(source, failedAnalysis, {
      overrides: { "schermature.spesa": "13.924,00 €" },
    });

    expect(validatePreparedPractice(source, mapped, failedAnalysis).some(
      ({ message }) => message.startsWith("Il totale di almeno un documento"),
    )).toBe(false);
    const payload = buildEneaPayload(mapped, validatePreparedPractice(source, mapped, failedAnalysis), "test");
    expect(payload.portalFields.find(({ id }) => id === "schermature.spesa")?.value).toBe("13924,00");
  });
});
