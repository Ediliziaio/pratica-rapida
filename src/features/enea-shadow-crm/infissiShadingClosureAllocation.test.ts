import { describe, expect, it } from "vitest";
import { resolveAprInfissiShadingClosureAllocation } from "./infissiShadingClosureAllocation";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

const invoice = (sourceId: string, body: string) => ({ sourceId, text: `FATTURA\n${body}` });

describe("allocazione chiusure oscuranti Infissi in ordine fattura", () => {
  it("assegna due chiusure ai primi due di tre infissi e deduplica acconto/saldo identici", () => {
    const body = "Tapparella N° 1 da 143 x 185 cm N° 1 da 283,5 x 185 cm Gtot 0,060";
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("acconto", body), invoice("saldo", body)],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "portal_order_partial", documentedClosureCount: 2, flags: [true, true, false] });
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable);
  });

  // Regola generale di Giuliano, 14/09/2026, nata su Nicla Biagioni: fattura
  // "serramenti in PVC e zanzariere", form "si'", nessun numero da nessuna
  // parte. «Cambio tot finestre, metto le zanzariere sulle finestre che ho
  // cambiato.»
  it("regola Biagioni: chiusure nominate senza numero valgono una per infisso", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "Fornitura e posa serramenti in PVC e zanzariere\nTotale documento 4.120,00")],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_mention_all", documentedClosureCount: 2, flags: [true, true], blocker: null });
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.closureMentionWithoutCountEqualsWindows);
  });

  it("regola Biagioni: una quantita scritta in un documento prevale sulla menzione senza numero", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("fattura", "Serramenti in PVC e zanzariere"), invoice("ordine", "N. 1 zanzariera 700 x 1200 mm")],
      technicalRowSourceKind: "invoice",
      invoiceEvidenceComplete: true,
    });
    expect(result.mode).not.toBe("invoice_mention_all");
    expect(result.documentedClosureCount).toBe(1);
  });

  it("regola Biagioni: senza alcuna menzione non si deducono chiusure", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "Fornitura e posa serramenti in PVC\nTotale documento 4.120,00")],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_none", flags: [false, false] });
  });

  it("non applica la regola parziale quando le chiusure non sono meno degli infissi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "N. 2 tapparelle 1000 x 1800 mm")],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: true,
    });
    expect(result.mode).toBe("invoice_all");
    expect(result.flags).toEqual([true, true]);
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable);
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures);
  });

  it("assegna le chiusure ai primi infissi nell'ordine portale anche se le righe tecniche provengono dal certificato", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("fattura", "Tapparella N° 1 da 143 x 185 cm N° 1 da 283,5 x 185 cm")],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "portal_order_partial", flags: [true, true, false], blocker: null, audit: { technicalRowSourceKind: "technical_document" } });
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiClosureMeasurementsNotApplicable);
  });

  it("usa NO documentale quando ogni infisso dichiara Senza schermo e la fattura non contiene chiusure", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "N. 2 infissi PVC 100 x 180 cm")],
      technicalEvidenceSources: [{
        sourceId: "schede-tecniche",
        text: "Scheda 1 Schermatura: Senza schermo Scheda 2 Schermatura: Senza schermo",
      }],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({
      mode: "technical_explicit_none",
      flags: [false, false],
      blocker: null,
      audit: {
        explicitNoScreenCount: 2,
        explicitNoScreenSourceIds: ["schede-tecniche"],
        invoiceClosureMentionSourceIds: [],
      },
    });
    expect(result.audit.appliedRuleIds).toEqual(expect.arrayContaining([
      USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures,
      USER_AUTHORIZED_RULE_IDS.infissiExplicitNoScreenNegativeClosureEvidence,
    ]));
  });

  it("usa il silenzio della fattura completa anche con Senza schermo parziale, ma non contro una chiusura fatturata", () => {
    const partial = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "N. 2 infissi PVC 100 x 180 cm")],
      technicalEvidenceSources: [{ sourceId: "scheda-parziale", text: "Schermatura: Senza schermo" }],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(partial).toMatchObject({ mode: "invoice_none", flags: [false, false], blocker: null });

    const contradictory = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [invoice("fattura", "N. 1 tapparella 100 x 180 cm")],
      technicalEvidenceSources: [{ sourceId: "schede", text: "Schermatura: Senza schermo Schermatura: Senza schermo" }],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(contradictory.mode).not.toBe("technical_explicit_none");
    expect(contradictory.audit.invoiceClosureMentionSourceIds).toEqual(["fattura"]);
  });

  it("accetta il valore estratto su colonna separata e ignora il solo boilerplate impianto", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [{ sourceId: "fascicolo", text: "NOTA: DA COMPILARE SEMPRE ANCHE SE SI SONO FORNITE SOLO CHIUSURE OSCURANTI O SCHERMATURE SOLARI." }],
      technicalEvidenceSources: [{ sourceId: "fascicolo", text: "Schermatura\nSenza schermo\nSchermatura\nSenza schermo" }],
      technicalRowSourceKind: "invoice",
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "technical_explicit_none", flags: [false, false], blocker: null });
    expect(result.audit).toMatchObject({ explicitNoScreenCount: 2, invoiceClosureMentionSourceIds: [] });
  });

  it("resta fail-closed quando la fattura nomina davvero una chiusura anche se le schede dicono senza schermo", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 2,
      invoiceSources: [{ sourceId: "fattura", text: "Fornitura e posa di persiane abbinate ai serramenti" }],
      technicalEvidenceSources: [{ sourceId: "schede", text: "Senza schermo\nSenza schermo" }],
      technicalRowSourceKind: "invoice",
      invoiceEvidenceComplete: true,
    });
    expect(result.mode).toBe("unresolved");
    expect(result.blocker).toBe("infissi_shading_closures_form_answer_missing_or_ambiguous");
    expect(result.audit.invoiceClosureMentionSourceIds).toEqual(["fattura"]);
  });

  it("regressione Stricelli: la fattura completa comanda anche quando tace e sovrascrive il SI del form con NO", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 7,
      invoiceSources: [
        invoice("fattura-acconto", "Fornitura e posa di serramenti BluEvolution 82"),
        invoice("fattura-saldo", "Saldo sostituzione finestre e portefinestre"),
      ],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({
      mode: "invoice_none",
      flags: [false, false, false, false, false, false, false],
      blocker: null,
      audit: {
        invoiceEvidenceComplete: true,
        invoiceClosureMentionSourceIds: [],
        ignoredFormAlsoInstalledClosures: true,
      },
    });
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures);
  });

  it("resta fail-closed e non usa il silenzio se l'acquisizione delle fatture non e completa", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 1,
      invoiceSources: [invoice("fattura-parziale", "Fornitura di un serramento PVC")],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: false,
    });
    expect(result).toMatchObject({
      mode: "unresolved",
      flags: [],
      blocker: "infissi_invoice_evidence_incomplete_for_shading_closure_resolution",
      audit: { invoiceEvidenceComplete: false },
    });
  });

  it("regressione Giuga: la zanzariera fatturata nella pratica Infissi vale come chiusura aggiuntiva anche se il form dice NO", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 5,
      invoiceSources: [invoice("fattura-297-fe", "Fattura per produzione e posa zanzariera + saldo fine lavori comm 921/25")],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({
      mode: "invoice_first_window_zanzariera",
      flags: [true, false, false, false, false],
      blocker: null,
      audit: {
        invoiceZanzarieraMentionSourceIds: ["fattura-297-fe"],
        ignoredFormAlsoInstalledClosures: false,
      },
    });
    expect(result.audit.appliedRuleIds).toEqual(expect.arrayContaining([
      USER_AUTHORIZED_RULE_IDS.infissiInvoiceAuthoritativeShadingClosures,
      USER_AUTHORIZED_RULE_IDS.zanzarieraInfissiInstallationContext,
      USER_AUTHORIZED_RULE_IDS.zanzarieraFirstWindowAllocation,
    ]));
  });

  it("assegna piu zanzariere ai primi infissi senza usare alcuna somiglianza di misure", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 5,
      invoiceSources: [invoice("fattura-zanzariere", "Fattura per produzione e posa di n. 2 zanzariere")],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "portal_order_partial", flags: [true, true, false, false, false], blocker: null });
  });

  it("resta fail-closed sulla quantita, non sulle misure, se le chiusure superano gli infissi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 1,
      invoiceSources: [invoice("fattura-zanzariere", "Fattura per produzione e posa di n. 2 zanzariere")],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "unresolved", flags: [], blocker: "infissi_shading_closure_count_exceeds_physical_windows" });
  });

  it("regressione Cigognetti: legge la quantita scritta dopo la descrizione e non somma tipi diversi sulle stesse finestre", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 7,
      invoiceSources: [invoice("fattura-grk", [
        "Installazione finestra con coprifili 7 pzz",
        "Installazione zanzariera 7 pzz",
        "Installazione tapparella (solo telo avvolgibile) 7 pzz",
        "Installazione kit avvolgibile completo (manuale o elettrico, guide comprese) 7 pzz",
      ].join("\n"))],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_all", documentedClosureCount: 7, blocker: null });
    expect(result.flags).toEqual(Array.from({ length: 7 }, () => true));
  });

  it("non conta come chiusura fornita una menzione consigliata, ipotetica, sostituita o a cura di terzi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 6,
      invoiceSources: [invoice("rilievo-sellati", [
        "Si consiglia di distanziare tra finestre e persiane almeno 7 cm per le maniglie ed eventuali zanzariere di 5 cm",
        "Imbotti esterni tra persiana e zanzariera a cura del fabbro",
        "Esternamente la cliente monterà grate fisse anziché le persiane",
        "Eventuale zanzariera da montare sul controtelaio in ferro (da fare dopo la posa degli imbotti a cura del fabbro)",
      ].join("\n"))],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_none", documentedClosureCount: 0, blocker: null });
    expect(result.audit.invoiceClosureMentionSourceIds).toEqual([]);
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiClosureMentionNotSuppliedEvidence);
  });

  it("non conta come chiusura fornita la ragione sociale del fornitore", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 5,
      invoiceSources: [
        invoice("acconto-lm", "LM TENDE DA SOLE E ZANZARIERE S.R.L.\nAcconto fornitura e posa infissi"),
        invoice("saldo-lm", "LM TENDE DA SOLE E ZANZARIERE S.R.L.\nSaldo fornitura e posa infissi"),
      ],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_none", documentedClosureCount: 0, blocker: null });
    expect(result.audit.invoiceClosureMentionSourceIds).toEqual([]);
  });

  it("regressione Giuga: la stessa unica zanzariera su acconto e saldo resta una sola chiusura sulla prima finestra", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 5,
      invoiceSources: [
        invoice("pagamento", "zanzariera + saldo fine lavori"),
        invoice("fattura-297", "Fattura per produzione e posa zanzariera + saldo fine lavori comm"),
      ],
      technicalRowSourceKind: "technical_document",
      formAlsoInstalledClosures: true,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_first_window_zanzariera", documentedClosureCount: 1, blocker: null });
    expect(result.flags).toEqual([true, false, false, false, false]);
  });

  // Fino al 14/09/2026 questo caso restava fail-closed. Con la regola
  // Biagioni due chiusure nominate senza numero — zanzariera e persiane — non
  // sono un'ambiguita': sono chiusure sui serramenti, una per infisso, e i
  // tipi non si sommano perche' il flag ENEA e' uno per finestra.
  it("con la regola Biagioni due chiusure di tipo diverso nominate senza numero valgono una per infisso, senza sommarsi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 5,
      invoiceSources: [
        invoice("fattura-297", "Fattura per produzione e posa zanzariera + saldo fine lavori comm"),
        invoice("fattura-altra", "Fornitura persiane in alluminio per il soggiorno"),
      ],
      technicalRowSourceKind: "technical_document",
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "invoice_mention_all", documentedClosureCount: 5, blocker: null });
    expect(result.flags).toEqual([true, true, true, true, true]);
  });

  it("conta la chiusura realmente fornita anche quando il documento contiene altrove note a cura di terzi", () => {
    const result = resolveAprInfissiShadingClosureAllocation({
      physicalWindowCount: 3,
      invoiceSources: [invoice("fattura-mista", [
        "LM TENDE DA SOLE E ZANZARIERE S.R.L.",
        "Imbotti esterni tra persiana e zanzariera a cura del fabbro",
        "N. 2 tapparelle 1000 x 1800 mm",
      ].join("\n"))],
      technicalRowSourceKind: "invoice",
      formAlsoInstalledClosures: false,
      invoiceEvidenceComplete: true,
    });
    expect(result).toMatchObject({ mode: "portal_order_partial", documentedClosureCount: 2, blocker: null });
    expect(result.flags).toEqual([true, true, false]);
  });
});
