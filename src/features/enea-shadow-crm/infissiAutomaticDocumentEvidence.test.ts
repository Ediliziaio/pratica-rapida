import { describe, expect, it } from "vitest";
import { extractAprInfissiAutomaticTechnicalEvidence } from "./infissiAutomaticDocumentEvidence";
import { classifyAprInfissiTechnicalDocument } from "./infissiTechnicalDocumentClassifier";
import { USER_AUTHORIZED_RULE_IDS } from "./operationalRegistry";

describe("APR Infissi · estrazione automatica documenti reali", () => {
  it("preserva tre infissi fisici identici nell'ordine della fattura", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-righe", kind: "invoice", text: `
      FATTURA
      Infissi PVC 1 da 1390 x 1600 - 2 ante 1 da 1390 x 1600 - 2 ante 1 da 1390 x 1600 - 2 ante
      METODO DI PAGAMENTO
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("invoice-physical-row-order");
    expect(result.evidence?.rows).toHaveLength(3);
    expect(result.evidence?.rows.map((item) => [item.widthM, item.heightM])).toEqual([[1.39, 1.6], [1.39, 1.6], [1.39, 1.6]]);
  });

  it("preserva tutte le righe quando il PDF unisce 'da' alla prima misura", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-righe-attaccate", kind: "invoice", text: `
      FATTURA
      Infissi PVC 1 da 1198 x 2490 - 2 ante 1 da 695 x 1280 - 1 anta DX
      1 da 695 x 1285 - 1 anta DX 1 da1200 x 1555 - 2 ante
      METODO DI PAGAMENTO
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("invoice-physical-row-order");
    expect(result.evidence?.rows.map((item) => [item.quantity, item.widthM, item.heightM])).toEqual([
      [1, 1.198, 2.49],
      [1, 0.695, 1.28],
      [1, 0.695, 1.285],
      [1, 1.2, 1.555],
    ]);
  });

  it("non interpreta parole o numeri generici come righe fisiche senza la sequenza quantita-da-misura", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-righe-non-dimensionali", kind: "invoice", text: `
      FATTURA
      Infissi PVC: data1200 x 1555; riferimento 1 dato1200 x 1555; codice da1200 x 1555.
      METODO DI PAGAMENTO
    ` }]);
    expect(result.status).toBe("operator_required");
    expect(result.evidence).toBeNull();
  });

  it("legge fatture con righe dimensioni, pezzi e Uw preservando la cardinalita", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura", kind: "invoice", text: `
      Serramenti in PVC. Dimensioni L x H:
      1580 x 1505 mm finestra 2 A/R
      Uw = 1,2 W/mqk
      Pezzi 1
      1584 x 1505 mm finestra 2 A/R
      Uw = 1,2 W/mqk
      Pezzi 2
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.58, heightM: 1.505, thermalTransmittanceWm2K: 1.2 }),
      expect.objectContaining({ quantity: 2, widthM: 1.584, heightM: 1.505, thermalTransmittanceWm2K: 1.2 }),
    ]);
  });

  it("regressione Olteanu: legge misure 'N°<n> L mm x H mm' escludendo i cassonetti (coorte 2925)", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-olteanu", kind: "invoice", text: `
      Saldo fattura per l'esecuzione dei lavori di sostituzione (fornitura e posa) dei serramenti
      1. Sostituzione finestre
      Misure serramenti:
      N°1 940 mm x 2003 mm
      N°1 1590 mm x 2004 mm
      N°1 1057 mm x 2690 mm
      N°1 1057 mm x 2690 mm
      N°1 1111 mm x 2690 mm
      € 4.459,09
      Misure cassonetti:
      N°1 1200 mm x 320 mm
      N°1 2040 mm x 310 mm
      NOTE Saldo fattura per lavori.
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("dimension-block");
    expect(result.evidence?.rows.map((item) => [item.quantity, item.widthM, item.heightM])).toEqual([
      [1, 0.94, 2.003],
      [1, 1.59, 2.004],
      [1, 1.057, 2.69],
      [1, 1.057, 2.69],
      [1, 1.111, 2.69],
    ]);
  });

  it("regressione Codognato: legge il formato Finestra Italia '(L=NNN;A=NNN;)' anche con la misura su una riga separata dalla descrizione", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "finestra-italia-codognato", kind: "invoice", text: `
      ORDINE:38684
      Finestra 2 ante con fisso laterale - SistemaPV6K
      (L=2.235;A=1.435;)
      Portafinestra 2 ante con fissi laterale - Sistema PV6K
      (L=2.695;A=2.405;)
      Finestra 1 anta - Sistema PV6K (L=665;A=1.435;)
      Porta 2 ante - Sistema PV6K (L=1.310;A=2.228;)
      Totale fornitura e posa in opera
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("finestra-italia-positional-dimensions");
    expect(result.evidence?.rows.map((item) => [item.quantity, item.widthM, item.heightM])).toEqual([
      [1, 2.235, 1.435],
      [1, 2.695, 2.405],
      [1, 0.665, 1.435],
      [1, 1.31, 2.228],
    ]);
  });

  it("il formato Finestra Italia non conta come infisso una posizione Persiana nella stessa fattura", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "finestra-italia-mista", kind: "invoice", text: `
      Finestra 1 anta - Sistema PV6K (L=665;A=1.435;)
      Persiana finestra 1 anta (L=660;A=1.365;)
      Totale fornitura e posa in opera
    ` }]);
    expect(result.evidence?.rows).toHaveLength(1);
    expect(result.evidence?.rows[0]).toMatchObject({ widthM: 0.665, heightM: 1.435 });
  });

  it("DoP tabellare associa gli Uw solo a una firma fattura univoca", () => {
    const dopText = `
      DICHIARAZIONE di PRESTAZIONE
      Scopo utilizzo: serramento in pvc per uso esterno.
      Produttore e fabbricante: Finestra Esempio s.r.l. - FIRMA
      Normativa armonizzata: EN 14351-1:2016
      9. prestazione dichiarata:
      POS. CODICE 9.1 9.2 9.3 9.4 9.5 9.6 9.7 9.8 a 9.9
      1 6K_F2_006 8A - C5/B5 - - - 1,28W/m2K - 4
      2 6K_P2_010 8A - C5/B5 - - - 1,22W/m2K - 4
      Legenda: 9.1 Tenuta all'acqua, 9.7 Trasmittanza termica, 9.9 Permeabilità all'aria
    `;
    const classification = classifyAprInfissiTechnicalDocument({ storageKind: "additional", text: dopText });
    expect(classification).toMatchObject({ verifiedKind: "third_party_certificate", certificateScope: "installed_windows" });
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-codognato", kind: "invoice", text: `
        Finestra 2 ante (L=2.235;A=1.435;)
        Portafinestra 2 ante (L=2.695;A=2.405;)
      ` },
      { sourceId: "dop-tabellare-codognato", kind: classification.verifiedKind, certificateScope: classification.certificateScope, text: dopText },
    ]);
    expect(result).toMatchObject({ status: "ready", blockers: [], audit: { selectedSourceId: "dop-tabellare-codognato", selectedParser: "numbered-dop-thermal-column" } });
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 2.235, heightM: 1.435, thermalTransmittanceWm2K: 1.28 }),
      expect.objectContaining({ quantity: 1, widthM: 2.695, heightM: 2.405, thermalTransmittanceWm2K: 1.22 }),
    ]);
  });

  it("DoP tabellare con cardinalita non coincidente resta fail-closed", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-due-infissi", kind: "invoice", text: `
        Finestra 2 ante (L=1200;A=1400;)
        Portafinestra 2 ante (L=1000;A=2200;)
      ` },
      { sourceId: "dop-tre-posizioni", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
        DICHIARAZIONE di PRESTAZIONE
        9. prestazione dichiarata:
        POS. CODICE 9.1 9.2 9.3 9.4 9.5 9.6 9.7 9.8 a 9.9
        1 F_A 8A - C5/B5 - - - 1,28W/m2K - 4
        2 F_B 8A - C5/B5 - - - 1,22W/m2K - 4
        3 F_C 8A - C5/B5 - - - 1,20W/m2K - 4
        Legenda: 9.1 Tenuta all'acqua, 9.7 Trasmittanza termica, 9.9 Permeabilità all'aria
      ` },
    ]);
    expect(result).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_numbered_dop_thermal_column_invoice_binding_unresolved"] });
  });

  it("etichette abbreviate complete estratte", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "etichette-uw", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
EN 14351-1:2016
posizione: 01 numero: 1/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
\fEN 14351-1:2016
posizione: 01 numero: 2/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
    ` }]);
    expect(result).toMatchObject({ status: "ready", blockers: [], audit: { selectedParser: "abbreviated-thermal-product-label" } });
    expect(result.evidence?.rows).toHaveLength(1);
    expect(result.evidence?.rows.every((item) => item.thermalTransmittanceWm2K === 1.2)).toBe(true);
  });

  it("etichette abbreviate discordanti nella stessa posizione restano fail-closed", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "etichette-conflict", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
EN 14351-1:2016
posizione: 01 numero: 1/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
\fEN 14351-1:2016
posizione: 01 numero: 2/2
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,3 W/m²K
    ` }]);
    expect(result).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_abbreviated_thermal_label_position_conflict"] });
  });

  it("etichette abbreviate con pagina mancante restano fail-closed", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "etichette-incomplete", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
EN 14351-1:2016
posizione: 01 numero: 1/3
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
\fEN 14351-1:2016
posizione: 01 numero: 3/3
Portafinestra 2 ante L: 1485 mm H: 2434 mm
Trasm. termica: 1,2 W/m²K
    ` }]);
    expect(result).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_abbreviated_thermal_label_page_sequence_incomplete"] });
  });

  it("il prefisso 'N°<n>' cattura anche quantita' maggiori di 1 per riga, non solo il default", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-multi", kind: "invoice", text: `
      Fornitura e posa serramenti in PVC.
      N°3 1200 mm x 1500 mm finestra 2 ante
      Trasmittanza termica Uw = 1,1 W/m2K
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 3, widthM: 1.2, heightM: 1.5, thermalTransmittanceWm2K: 1.1 }),
    ]);
  });

  it("continua a non trattare le misure dei cassonetti come infissi quando l'intestazione e' solo 'Cassonetti' senza prefisso 'Misure'", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-cassonetti-nudi", kind: "invoice", text: `
      Fornitura e posa serramenti in PVC.
      N°2 1200 mm x 1500 mm finestra 2 ante
      Cassonetti:
      N°1 1200 mm x 320 mm
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 2, widthM: 1.2, heightM: 1.5 }),
    ]);
  });

  it("legge schede larghezza/altezza con Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "calcolo", kind: "third_party_certificate", text: `
      Larghezza L 760 mm
      Altezza H= 980mm
      Calcolo trasmittanza termica
      Uw = formula
      Uw = 1,27 W/m2K
      Larghezza L 870 mm
      Altezza H= 1305mm
      Calcolo trasmittanza termica
      Uw = formula
      Uw = 1,24 W/m2K
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toHaveLength(2);
    expect(result.evidence?.rows[0]).toMatchObject({ widthM: 0.76, heightM: 0.98, thermalTransmittanceWm2K: 1.27 });
  });

  it("legge tutte le posizioni di una dichiarazione produttore con quantita, L/H e Uw coerenti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "internorm", kind: "invoice", text: `
      DICHIARAZIONE DEL PRODUTTORE
      Le caratteristiche dei nuovi serramenti di cui alla conferma 6653221 sono riportate di seguito.
      Pos. Quantitá Descrizione Valore Uw (calcolato)
      100 1,00 Pezzi SALOTTO SX:
      0.77 W/(m²K)
      Largh. 1.177 Alt. 1.497
      Finestre Internorm in PVC
      Largh.: 1177, Alt.: 1497,
      Uw (calcolato su fin.descritta, EN ISO 10077): 0.77 W/m²K
      110 2,00 Pezzi CAMERA:
      0.79 W/(m²K)
      Largh. 803 Alt. 2.333
      Finestre Internorm in PVC
      Largh.: 803, Alt.: 2333,
      Uw (calcolato su fin.descritta, EN ISO 10077): 0.79 W/m²K
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("producer-position-table");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.177, heightM: 1.497, thermalTransmittanceWm2K: 0.77 }),
      expect.objectContaining({ quantity: 2, widthM: 0.803, heightM: 2.333, thermalTransmittanceWm2K: 0.79 }),
    ]);
  });

  it("resta fail-closed se una posizione produttore ha misure discordanti o Uw mancante", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "internorm-ambiguo", kind: "invoice", text: `
      DICHIARAZIONE DEL PRODUTTORE
      Le caratteristiche dei nuovi serramenti sono riportate di seguito.
      Pos. Quantità Descrizione Valore Uw (calcolato)
      100 1,00 Pezzi SALOTTO:
      Largh. 1.177 Alt. 1.497
      Largh.: 1180, Alt.: 1497,
      Uw (calcolato su fin.descritta, EN ISO 10077): 0.77 W/m²K
      110 1,00 Pezzi CAMERA:
      Largh.: 803, Alt.: 2333,
    ` }]);

    expect(result).toMatchObject({ status: "operator_required", evidence: null });
  });

  it("legge una dichiarazione energetica con una sola tipologia completa e Uw esplicito", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dichiarazione-singola", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
Dichiarazione di conformità energetica
Rif. tipologia: 15040/2026 01 Modello: HOME-B2AS, Portafinestra 2 ante con soglia ribassata, dimensioni: 1090 x 2075, pezzi: 1;
D I C H I A R A
che i serramenti sono conformi alla UNI EN ISO 10077-1:2018.
La trasmittanza termica complessiva dei serramenti è stata determinata mediante metodologia di calcolo e corrisponde a 1,29 W/m²K.
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("single-product-energy-declaration");
    expect(result.evidence?.rows).toEqual([expect.objectContaining({ quantity: 1, widthM: 1.09, heightM: 2.075, thermalTransmittanceWm2K: 1.29 })]);
  });

  it("mantiene fail-closed dichiarazioni energetiche con più tipologie o Uw discordanti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dichiarazione-ambigua", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
Dichiarazione di conformità energetica
Rif. tipologia: 1 Modello: A, Finestra, dimensioni: 900 x 1200, pezzi: 1;
Rif. tipologia: 2 Modello: B, Portafinestra, dimensioni: 1000 x 2100, pezzi: 1;
La trasmittanza termica complessiva dei serramenti corrisponde a 1,20 W/m²K.
La trasmittanza termica complessiva dei serramenti corrisponde a 1,30 W/m²K.
    ` }]);

    expect(result).toMatchObject({ status: "operator_required", evidence: null });
  });

  it("legge tutte le posizioni finestra di una DoP formale con Uw tra parentesi ed esclude gli accessori 0 x 0", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-formale", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
Dichiarazione di prestazione (DoP) N° 74618-26
Pos. 1 Q.tà 1 Finestra ad 1 anta da 720 x 670 mm.
Trasmittanza termica (Uw) 1.2 UNI EN ISO 10077-1
Pos. 2 Q.tà 2 Finestra 2 ante da 1080 x 1435 mm.
Trasmittanza termica (Uw) 1.3 UNI EN ISO 10077-1
Pos. 3 Q.tà 6 Coprifilo piatto da 0 x 0 mm.
` }]);
    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("formal-dop-position-block");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 0.72, heightM: 0.67, thermalTransmittanceWm2K: 1.2 }),
      expect.objectContaining({ quantity: 2, widthM: 1.08, heightM: 1.435, thermalTransmittanceWm2K: 1.3 }),
    ]);
  });

  it("mantiene fail-closed l'intera DoP posizionale se una finestra non ha un Uw univoco", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-formale-incompleta", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
Dichiarazione di prestazione (DoP) N° 74618-26
Pos. 1 Q.tà 1 Finestra ad 1 anta da 720 x 670 mm.
Trasmittanza termica (Uw) 1.2 UNI EN ISO 10077-1
Pos. 2 Q.tà 1 Finestra 2 ante da 1080 x 1435 mm.
` }]);
    expect(result).toMatchObject({ status: "operator_required", evidence: null });
  });

  it("accetta la DoP Sellati: nomi e riferimenti d'ordine coincidono, e le misure inline in fattura confermano il certificato", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-sellati", kind: "invoice", practiceCustomerName: "Claudia Sellati", text: `
Cliente Sellati Claudia
Da Ordine numero 18174 del 30/01/2026
Infissi SERIE SMART WOOD. Dimensioni L x H:
720 x 670 mm finestra 1 anta Pezzi 1
1080 x 1435 mm finestra 2 ante Pezzi 1
` },
      { sourceId: "dop-sellati", kind: "third_party_certificate", certificateScope: "installed_windows", practiceCustomerName: "Claudia Sellati", text: `
Dichiarazione di prestazione (DoP) N° 74618-26
Rif. Sellati Claudia
Pos. 1 Q.tà 1 Finestra ad 1 anta da 720 x 670 mm.
Trasmittanza termica (Uw) 1.2 UNI EN ISO 10077-1
Pos. 2 Q.tà 1 Finestra 2 ante da 1080 x 1435 mm.
Trasmittanza termica (Uw) 1.3 UNI EN ISO 10077-1
` },
    ], { requirePracticeBinding: true });
    expect(result).toMatchObject({ status: "ready", blockers: [], audit: { selectedSourceId: "dop-sellati", selectedSourceBinding: {
      status: "verified", productSignatureMatched: true, matchedInvoiceSourceIds: ["fattura-sellati"],
    } } });
  });

  it("regola generale di Giuliano (Cappello): un certificato del produttore senza alcun nome cliente/rivenditore ne' numero d'ordine e' comunque accettato — quel tipo di documento non li riporta mai, non e' un'anomalia", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-anonima", kind: "invoice", practiceCustomerName: "Cliente Esempio", text: "Fattura per fornitura infissi, conferma d'ordine interna del produttore" },
      { sourceId: "certificato-anonimo", kind: "third_party_certificate", practiceCustomerName: "Cliente Esempio", text: "Dichiarazione del produttore: conferma 6653221 di un'azienda terza. SERRAMENTO Larghezza L 1200 mm Altezza H = 1400 mm Uw = 1,2 W/m" },
    ], { requirePracticeBinding: true });
    expect(result).toMatchObject({ status: "ready", blockers: [], evidence: { kind: "technical_document", sourceIds: ["certificato-anonimo"] } });
  });

  it("rifiuta fail-closed Gemma soltanto per un vero conflitto di misura dichiarata in fattura (non per l'assenza del nome cliente/rivenditore nel certificato, che e' normale)", () => {
    const sources = [
      { sourceId: "fattura-gemma", kind: "invoice", practiceCustomerName: "Gemma Minore", text: `
Cliente Gemma Minore
Saldo Preventivo 25/2026
Infissi. Dimensioni L x H: 1200 x 2100 mm Portoncino a due ante Pezzi 1
` },
      { sourceId: "tecnico-cisam", kind: "third_party_certificate", certificateScope: "installed_windows", practiceCustomerName: "Gemma Minore", text: `
Dichiarazione di conformità energetica
Rif. tipologia: 15040/2026 01 Modello: HOME-B2AS, Portafinestra 2 ante con soglia ribassata, dimensioni: 1090 x 2075, pezzi: 1;
Fornitura n°15040/2026 del cliente CISAM INFISSI S.R.L.
La trasmittanza termica complessiva dei serramenti corrisponde a 1,29 W/m²K.
` },
      { sourceId: "tecnico-cisam-copia", kind: "third_party_certificate", certificateScope: "installed_windows", practiceCustomerName: "Gemma Minore", text: `
Dichiarazione di conformità energetica
Rif. tipologia: 15040/2026 01 Modello: HOME-B2AS, Portafinestra 2 ante con soglia ribassata, dimensioni: 1090 x 2075, pezzi: 1;
Fornitura n°15040/2026 del cliente CISAM INFISSI S.R.L.
La trasmittanza termica complessiva dei serramenti corrisponde a 1,29 W/m²K.
` },
    ] as const;
    const result = extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true });
    expect(result).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_technical_document_practice_binding_unverified"], audit: { selectedSourceBinding: {
      status: "unverified", productSignatureMatched: false,
    } } });
    expect(extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true, confirmedPracticeBinding: { sourceId: "tecnico-cisam", evidenceId: "operator-binding-proof-1" } })).toMatchObject({ status: "ready", blockers: [] });
    expect(extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true, confirmedPracticeBinding: { sourceId: "altra-fonte", evidenceId: "operator-binding-proof-wrong" } })).toMatchObject({ status: "operator_required", evidence: null, blockers: ["infissi_technical_document_practice_binding_unverified"] });
  });

  it("regola generale di Giuliano (Flavia): un certificato con numero d'ordine diverso da quello fatturato non e' piu' un conflitto quando la fattura non dichiara essa stessa una misura diversa", () => {
    const sources = [
      { sourceId: "fattura-flavia", kind: "invoice", practiceCustomerName: "Flavia Cipriani", text: `
Cliente Flavia Cipriani
Fattura 326/FE - Saldo COMM. 1394/2026
Saldo fornitura infissi SERIE ECOMET
` },
      { sourceId: "tecnico-flavia", kind: "third_party_certificate", certificateScope: "installed_windows", practiceCustomerName: "Flavia Cipriani", text: `
Dichiarazione di conformità energetica
Fornitura n° 1613/2026 del cliente Flavia Cipriani
Rif. tipologia: 1613/2026 01 Modello: ECOMET, Finestra 2 ante, dimensioni: 1060 x 1480, pezzi: 1;
La trasmittanza termica complessiva dei serramenti corrisponde a 1,25 W/m²K.
` },
    ] as const;
    const result = extractAprInfissiAutomaticTechnicalEvidence(sources, { requirePracticeBinding: true });
    expect(result).toMatchObject({ status: "ready", blockers: [], evidence: { kind: "technical_document", sourceIds: ["tecnico-flavia"] } });
  });

  it("regola generale: due fatture della stessa pratica con numeri d'ordine diversi (Infissi e Persiane fatturati separatamente) non sono un conflitto", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-infissi-bianchi", kind: "invoice", practiceCustomerName: "Marco Bianchi", text: `
Cliente Marco Bianchi
Fattura saldo Infissi - Ordine cliente n. 38684
Finestra 1 anta (L=1200;A=1400;)
` },
      { sourceId: "fattura-persiane-bianchi", kind: "invoice", practiceCustomerName: "Marco Bianchi", text: `
Cliente Marco Bianchi
Fattura saldo Persiane - Ordine cliente n. 38685
Persiana in alluminio (L=1200;A=1400;)
` },
    ], { requirePracticeBinding: true });
    expect(result).toMatchObject({ status: "ready", blockers: [], audit: { selectedSourceId: "fattura-infissi-bianchi", selectedSourceBinding: { status: "not_applicable" } } });
  });

  it("legge le pagine di prestazione con dimensioni OCR e Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop", kind: "third_party_certificate", text: `
      WEB/26/0680166 - 001
      Quantità: 1
      643 x 1210
      Trasmittanza termica Uw [W/m2K] 0.88
      WEB/26/0680166 - 003
      Quantità: 1
      890 x 2100
      Trasmittanza termica Uw [W/m2K] 0.91
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toHaveLength(2);
  });

  it("non dichiara READY se il documento contiene piu pagine prodotto delle misure OCR estratte", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-incompleto", kind: "third_party_certificate", text: `
      WEB/26/0213119 - 001
      Quantità: 1
      APR_VISUAL_OCR: 785 x 1970
      Trasmittanza termica Uw [W/m2K] 1.3
      WEB/26/0213119 - 002
      Quantità: 1
      Trasmittanza termica Uw [W/m2K] 1.3
    ` }]);

    expect(result).toMatchObject({
      status: "operator_required",
      blockers: ["infissi_performance_page_cardinality_mismatch"],
      evidence: null,
    });
  });

  it("ricostruisce una riga per ciascuna pagina tecnica usando le misure esterne del diagramma", () => {
    const technicalPage = (id: string, width: number, innerWidth: number, height: number, innerHeight: number, thermalLabel = "Uw") => `
WEB/26/0211424 - ${id}
Quantità: 1
Trasmittanza termica ${thermalLabel} [W/m2K] 1.3
APR_VISUAL_OCR:
WEB/26/0211424 - ${id}
343 x 1324
APR_DIAGRAM_OCR:
WEB/26/0211424 - ${id}
Sistemi: Green Evolution 76
${width}
35
${innerWidth}
35
343 x 1324
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
${innerHeight}
${height}
WEB/26/0211424 - ${id}
APR_DIAGRAM_ROTATED_COUNTERCLOCKWISE_OCR:
${height}
${innerHeight}
WEB/26/0211424 - ${id}`;
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-sette-pagine", kind: "third_party_certificate", text: [
      technicalPage("001", 1140, 1070, 2470, 2415, "Ud"),
      technicalPage("002", 1135, 1065, 1605, 1535),
      technicalPage("003", 1135, 1065, 2470, 2415, "Ud"),
      technicalPage("004", 1135, 1065, 1610, 1540),
      technicalPage("005", 830, 760, 1603, 1533),
      technicalPage("006", 1140, 1070, 2468, 2413, "Ud"),
      technicalPage("007", 1130, 1060, 2460, 2405, "Ud"),
    ].join("\f") }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("performance-diagram-page");
    expect(result.evidence?.rows).toHaveLength(7);
    expect(result.evidence?.rows.map((item) => [item.widthM, item.heightM, item.thermalTransmittanceWm2K])).toEqual([
      [1.14, 2.47, 1.3],
      [1.135, 1.605, 1.3],
      [1.135, 2.47, 1.3],
      [1.135, 1.61, 1.3],
      [0.83, 1.603, 1.3],
      [1.14, 2.468, 1.3],
      [1.13, 2.46, 1.3],
    ]);
  });

  it("riconosce anche gli identificativi prestazione ZM oltre a WEB", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-zm", kind: "third_party_certificate", text: `
ZM/25/0275492 - 001
Quantità: 1
Trasmittanza termica Ud [W/m2K] 1.3
APR_DIAGRAM_OCR:
1785
1715
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1934
ZM/25/0275492 - 001` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([expect.objectContaining({ widthM: 1.785, heightM: 1.934, thermalTransmittanceWm2K: 1.3 })]);
  });

  it("legge anche un infisso largo e basso dalla fascia OCR delle quote verticali", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-orizzontale", kind: "third_party_certificate", text: `
WEB/26/0444923 - 009
Quantità: 1
Trasmittanza termica Uw [W/m2K] 0.98
APR_DIAGRAM_OCR:
WEB/26/0444923 - 009
Sistemi: Salamander bluEvolution 82
1760
1880
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1880
1760
APR_VERTICAL_DIMENSION_CLOCKWISE_OCR:
600
APR_VERTICAL_DIMENSION_COUNTERCLOCKWISE_OCR:
720
600
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.88, heightM: 0.72, thermalTransmittanceWm2K: 0.98 }),
    ]);
  });

  it("preserva la pagina fisica usando la misura L x H documentata quando manca la quota verticale isolata", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "dop-quota-verticale-ocr-mancante", kind: "third_party_certificate", text: `
WEB/26/0680166 - 001
Quantità: 1
Trasmittanza termica Uw [W/m2K] 0.88
APR_DIAGRAM_OCR:
WEB/26/0680166 - 001
1715
1595
584 x 1204
APR_DIAGRAM_ROTATED_CLOCKWISE_OCR:
1715
1595
584 x 1204
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("performance-diagram-page");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.715, heightM: 1.204, thermalTransmittanceWm2K: 0.88 }),
    ]);
  });

  it("legge la tabella Qt/LXH/Uw", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "tabella", kind: "third_party_certificate", text: `
      Serramenti - Riferimento Descrizione Qt LXH Uw
      PORTAFINESTRA
      1
      1845 X 2310
      1,13
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows[0]).toMatchObject({ quantity: 1, widthM: 1.845, heightM: 2.31, thermalTransmittanceWm2K: 1.13 });
  });

  it("conta solo i serramenti fisici e non cassonetti, pannelli o riempimenti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "preventivo-produzione", kind: "third_party_certificate", text: `
Porta 001 Quantità: 1 1060
1060
1020
2605
Dimensione di riempimento nr[1]: 344x2413
Coefficiente termico Uw = 1,3 W/m²·K
Vista interna
Finestra 002 Quantità: 1 Sistema: Cassonetto Salamander
Dimensioni interno cassonetto: L x H: 1386 x 336
Finestra 003 Quantità: 1 Sistema: Glass / Panel
596x1507
Finestra 004 Quantità: 1 Sistema: Salamander GreenEvo 76
1565
720
1750
Dimensione di riempimento nr[1]: 596x1507
Coefficiente termico Peso Uw = 1,3 W/m²·K
Vista interna
    ` }]);

    expect(result.status).toBe("ready");
    expect(result.audit.selectedParser).toBe("product-assembly-page");
    expect(result.evidence?.rows).toEqual([
      expect.objectContaining({ quantity: 1, widthM: 1.06, heightM: 2.605, thermalTransmittanceWm2K: 1.3 }),
      expect.objectContaining({ quantity: 1, widthM: 1.565, heightM: 1.75, thermalTransmittanceWm2K: 1.3 }),
    ]);
  });

  it("si ferma su due fonti di pari cardinalita ma misure discordanti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "a", kind: "third_party_certificate", text: "Finestra dimensioni: 1000 x 1200, Pezzi: 1, Trasmittanza termica 1,2" },
      { sourceId: "b", kind: "third_party_certificate", text: "Finestra dimensioni: 1100 x 1200, Pezzi: 1, Trasmittanza termica 1,2" },
    ]);
    expect(result).toMatchObject({ status: "operator_required", blockers: ["infissi_automatic_source_conflict"], evidence: null });
  });

  it("non usa un certificato degli infissi rimossi come tabella dei nuovi prodotti", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura", kind: "invoice", text: "Finestra dimensioni: 1845 x 2310, Pezzi: 1, Trasmittanza termica 1,13" },
      { sourceId: "certificato-rimossi", kind: "third_party_certificate", certificateScope: "removed_windows", text: "Infissi dismessi: 1000 x 1000, Uw=6,0" },
    ]);
    expect(result).toMatchObject({ status: "ready", evidence: { sourceIds: ["fattura"] } });
    expect(result.audit.excludedSources).toContainEqual(expect.objectContaining({ sourceId: "certificato-rimossi", reason: "removed_window_certificate_not_installed_product_source" }));
  });

  it("regressione Capatti: somma i pezzi espliciti N. q davanti a L/H invece di contare le righe", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([{ sourceId: "fattura-capatti", kind: "invoice", text: `
      Fornitura e posa di serramenti.
      N. 01 L 1400 X 2300 H
      N. 01 L 1180 X 1410 H
      N. 02 L 620 X 2300 H
      N. 02 L 1180 X 1260 H
      N. 01 L 680 X 1420 H
    ` }]);
    expect(result.status).toBe("ready");
    expect(result.evidence?.rows.map((item) => item.quantity)).toEqual([1, 1, 2, 2, 1]);
    expect(result.evidence?.rows.reduce((sum, item) => sum + item.quantity, 0)).toBe(7);
    expect(result.audit.appliedRuleIds).toContain(USER_AUTHORIZED_RULE_IDS.infissiExplicitLineQuantityCardinality);
  });

  it("regressione Capatti end-to-end: la firma unica di fattura con sette pezzi prevale sulle misure diverse del certificato", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura-capatti", kind: "invoice", text: `
        Fornitura e posa di serramenti.
        N. 01 L 1400 X 2300 H
        N. 01 L 1180 X 1410 H
        N. 02 L 620 X 2300 H
        N. 02 L 1180 X 1260 H
        N. 01 L 680 X 1420 H
      ` },
      { sourceId: "certificato-capatti", kind: "third_party_certificate", certificateScope: "installed_windows", text: `
        Finestra dimensioni: 1410 x 2310, Pezzi: 1, Trasmittanza termica 1,20 W/m2K
        Finestra dimensioni: 1190 x 1420, Pezzi: 1, Trasmittanza termica 1,21 W/m2K
        Finestra dimensioni: 630 x 2310, Pezzi: 1, Trasmittanza termica 1,22 W/m2K
        Finestra dimensioni: 640 x 2320, Pezzi: 1, Trasmittanza termica 1,23 W/m2K
        Finestra dimensioni: 1190 x 1270, Pezzi: 1, Trasmittanza termica 1,24 W/m2K
        Finestra dimensioni: 1200 x 1280, Pezzi: 1, Trasmittanza termica 1,25 W/m2K
        Finestra dimensioni: 690 x 1430, Pezzi: 1, Trasmittanza termica 1,26 W/m2K
      ` },
    ], { requirePracticeBinding: true });

    expect(result).toMatchObject({
      status: "ready",
      evidence: { kind: "invoice", sourceIds: ["fattura-capatti"] },
      blockers: [],
      audit: { selectedSourceId: "fattura-capatti", invoiceDimensionAuthorityApplied: true },
    });
    expect(result.evidence?.rows.reduce((sum, item) => sum + item.quantity, 0)).toBe(7);
  });

  it("resta fail-closed se fattura e certificato discordano sulla cardinalita fisica", () => {
    const result = extractAprInfissiAutomaticTechnicalEvidence([
      { sourceId: "fattura", kind: "invoice", text: "Finestra dimensioni: 1000 x 1200, Pezzi: 1" },
      { sourceId: "certificato", kind: "third_party_certificate", certificateScope: "installed_windows", text: "Finestra dimensioni: 1000 x 1200, Pezzi: 2, Trasmittanza termica 1,2 W/m2K" },
    ], { requirePracticeBinding: true });

    expect(result).toMatchObject({
      status: "operator_required",
      evidence: null,
      blockers: ["infissi_automatic_source_conflict"],
      audit: { invoiceDimensionAuthorityApplied: false },
    });
  });
});
