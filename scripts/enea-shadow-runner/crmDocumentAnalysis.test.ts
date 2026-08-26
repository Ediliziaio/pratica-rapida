import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentAprCrmDocumentAnalysis, resolveAprPdfOcrExecutable } from "./crmDocumentAnalysis";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("analisi locale persistente dei PDF CRM", () => {
  it("riprende dopo riavvio, usa OCR locale e non ripete documenti analizzati", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-")); directories.push(directory); const sourceDirectory = path.join(directory, "source"); mkdirSync(sourceDirectory);
    const inputs = ["native", "scan", "other"].map((name, index) => { const localPath = path.join(sourceDirectory, `${name}.pdf`); const body = Buffer.from(`%PDF-${name}`); writeFileSync(localPath, body);
      return { documentKey: createHash("sha256").update(name).digest("hex"), customerKey: index < 2 ? "cliente-a" : "cliente-b", kind: index < 2 ? "invoice" as const : "additional" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") }; });
    let calls = 0; const analyzer = async (pdfPath: string) => { calls += 1; const scan = pdfPath.endsWith("scan.pdf"); return { text: scan ? "Fattura n. 2 del 02/02/2026 Totale 200,00" : "Fattura n. 1 del 01/02/2026 Totale 100,00", extractionMode: scan ? "macos_vision_ocr" as const : "native_text" as const, pageCount: 1 }; };
    const first = new PersistentAprCrmDocumentAnalysis(directory, analyzer); first.prepare(inputs, "a".repeat(64)); await first.tick();
    const restarted = new PersistentAprCrmDocumentAnalysis(directory, analyzer); for (let index = 0; index < 5 && restarted.snapshot().status !== "completed"; index += 1) await restarted.tick();
    const snapshot = restarted.snapshot(); expect(snapshot).toMatchObject({ status: "completed", progress: { total: 3, analyzed: 3, blocked: 0, queued: 0 }, externalActionAllowed: false });
    expect(snapshot.items.map((item) => item.attemptCount)).toEqual([1, 1, 1]); expect(snapshot.items.filter((item) => item.extractionMode === "macos_vision_ocr")).toHaveLength(1); expect(calls).toBe(3);
    for (const item of snapshot.items) expect(readFileSync(item.textPath!, "utf8").length).toBeGreaterThan(10);
    await restarted.tick(); expect(calls).toBe(3);
    const reparsed = restarted.applyParserRevision("invoice-parser-v2-vendor-formats");
    expect(reparsed.parserRevisionsApplied).toEqual(["invoice-parser-v2-vendor-formats"]);
    expect(restarted.applyParserRevision("invoice-parser-v2-vendor-formats").revision).toBe(reparsed.revision);
    expect(calls).toBe(3);
  });

  it("riapplica la revisione unita-superficie ai testi persistiti con audit del registro", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-unit-surface-")); directories.push(directory);
    const localPath = path.join(directory, "invoice.pdf"); const body = Buffer.from("%PDF-fixture"); writeFileSync(localPath, body);
    const input = { documentKey: createHash("sha256").update("teotino-fixture").digest("hex"), customerKey: "cliente", kind: "invoice" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    const reader = new PersistentAprCrmDocumentAnalysis(directory, async () => ({
      text: "Fattura n. 7 del 28/05/2026 TENDA DA SOLE L 400 x S 250 Tot mq 10 Gtot valore 0,10 Totale 2.257,00 €",
      extractionMode: "native_text",
      pageCount: 1,
    }));
    reader.prepare([input], "d".repeat(64)); await reader.tick();
    const checkpoint = reader.applyParserRevision("invoice-parser-v36-screening-unit-surface-coherence");
    expect(checkpoint.items[0].screeningItems[0]).toMatchObject({ widthMm: 4000, heightMm: 2500, surfaceM2: 10 });
    expect(checkpoint.parserRevisionsApplied).toContain("invoice-parser-v36-screening-unit-surface-coherence");
    expect(checkpoint.audit.at(-1)).toMatchObject({
      type: "parser_reanalyzed",
      appliedRuleIds: expect.arrayContaining([
        "user-2026-08-26-screening-dimension-unit-surface-coherence-v1",
        "user-2026-08-18-explicit-technical-surface-precision",
      ]),
    });
  });

  it("isola un errore di analisi e completa gli altri PDF", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-")); directories.push(directory); const sourceDirectory = path.join(directory, "source"); mkdirSync(sourceDirectory);
    const inputs = ["bad", "good"].map((name) => { const localPath = path.join(sourceDirectory, `${name}.pdf`); const body = Buffer.from(`%PDF-${name}`); writeFileSync(localPath, body); return { documentKey: createHash("sha256").update(name).digest("hex"), customerKey: name, kind: "invoice" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") }; });
    const reader = new PersistentAprCrmDocumentAnalysis(directory, async (pdfPath) => { if (pdfPath.endsWith("bad.pdf")) throw new Error("ocr_failed"); return { text: "Fattura n. 1 del 01/02/2026 Totale 100,00", extractionMode: "native_text", pageCount: 1 }; });
    reader.prepare(inputs, "b".repeat(64)); for (let index = 0; index < 5 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { analyzed: 1, blocked: 1, queued: 0 } });
  });

  it("risolve l'eseguibile dal root permanente e riarma una sola volta i soli errori di percorso", async () => {
    const applicationRoot = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-root-")); directories.push(applicationRoot);
    const cohortRoot = path.join(applicationRoot, "cohorts", "pilot-2"); mkdirSync(cohortRoot, { recursive: true });
    const executable = path.join(applicationRoot, "apr-pdf-ocr"); writeFileSync(executable, "fixture");
    expect(resolveAprPdfOcrExecutable(cohortRoot)).toBe(executable);
    const liveRuntimeRoot = path.join(cohortRoot, "crm-live-processing", "runtime"); mkdirSync(liveRuntimeRoot, { recursive: true });
    expect(resolveAprPdfOcrExecutable(liveRuntimeRoot)).toBe(executable);

    const sourceDirectory = path.join(cohortRoot, "source"); mkdirSync(sourceDirectory);
    const localPath = path.join(sourceDirectory, "invoice.pdf"); const body = Buffer.from("%PDF-fixture"); writeFileSync(localPath, body);
    const input = { documentKey: createHash("sha256").update("invoice").digest("hex"), customerKey: "cliente", kind: "invoice" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    const failed = new PersistentAprCrmDocumentAnalysis(cohortRoot, async () => { throw new Error("ocr_executable_unavailable"); });
    failed.prepare([input], "c".repeat(64)); await failed.tick();
    expect(failed.snapshot()).toMatchObject({ status: "completed", progress: { analyzed: 0, blocked: 1 } });

    const recovered = new PersistentAprCrmDocumentAnalysis(cohortRoot, async () => ({ text: "Fattura n. 1 del 01/02/2026 Totale 100,00", extractionMode: "native_text", pageCount: 1 }));
    const repaired = recovered.applyAnalyzerRepair("pdf-analyzer-cohort-path-v1");
    expect(repaired).toMatchObject({ status: "queued", analyzerRepairsApplied: ["pdf-analyzer-cohort-path-v1"] });
    await recovered.tick();
    expect(recovered.snapshot()).toMatchObject({ status: "completed", progress: { analyzed: 1, blocked: 0 }, items: [{ attemptCount: 2 }] });
    expect(recovered.applyAnalyzerRepair("pdf-analyzer-cohort-path-v1").revision).toBe(recovered.snapshot().revision);
  });

  it("riclassifica un'immagine breve senza segnali fiscali senza ripetere accessi CRM", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-image-")); directories.push(directory);
    const localPath = path.join(directory, "logo.png"); const body = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("logo")]); writeFileSync(localPath, body);
    const input = { documentKey: createHash("sha256").update("logo").digest("hex"), customerKey: "cliente-logo", kind: "invoice" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    const failed = new PersistentAprCrmDocumentAnalysis(directory, async () => { throw new Error("pdf_text_insufficient"); });
    failed.prepare([input], "f".repeat(64)); await failed.tick();
    expect(failed.snapshot()).toMatchObject({ status: "completed", progress: { analyzed: 0, blocked: 1 } });

    const recovered = new PersistentAprCrmDocumentAnalysis(directory, async () => ({ text: "PraticaRapida", extractionMode: "macos_vision_ocr", pageCount: 1 }));
    const repaired = recovered.applyNonFiscalImageRepair("original-image-non-fiscal-classification-v3");
    expect(repaired).toMatchObject({ status: "queued", analyzerRepairsApplied: ["original-image-non-fiscal-classification-v3"], items: [{ state: "queued", attemptCount: 1 }] });
    await recovered.tick();
    const completed = recovered.snapshot();
    expect(completed).toMatchObject({ status: "completed", progress: { analyzed: 1, blocked: 0 }, items: [{ state: "analyzed", attemptCount: 2, nonFiscalImageExcluded: true, invoiceResult: null }] });
    expect(completed.customerReports[0]).toMatchObject({ nonFiscalImagesExcluded: 1 });
    const revision = completed.revision;
    expect(recovered.applyNonFiscalImageRepair("original-image-non-fiscal-classification-v3").revision).toBe(revision);
  });

  it("riarma una sola volta le dichiarazioni tecniche prive dell'OCR focalizzato sui diagrammi", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-diagram-")); directories.push(directory);
    const localPath = path.join(directory, "prestazioni.pdf"); const body = Buffer.from("%PDF-performance"); writeFileSync(localPath, body);
    const input = { documentKey: createHash("sha256").update("performance").digest("hex"), customerKey: "cliente-infissi", kind: "additional" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    let calls = 0;
    const analyzer = async () => {
      calls += 1;
      return { text: calls === 1
        ? "DICHIARAZIONE DI PRESTAZIONE\nWEB/26/1 - 001\nTrasmittanza termica Uw 1.3"
        : "DICHIARAZIONE DI PRESTAZIONE\nWEB/26/1 - 001\nTrasmittanza termica Uw 1.3\nAPR_DIAGRAM_OCR:\n1000\n950\nAPR_DIAGRAM_ROTATED_CLOCKWISE_OCR:\n1200\n1250\nAPR_VERTICAL_DIMENSION_CLOCKWISE_OCR:\n1200\n1250", extractionMode: "macos_vision_ocr" as const, pageCount: 1 };
    };
    const reader = new PersistentAprCrmDocumentAnalysis(directory, analyzer);
    reader.prepare([input], "1".repeat(64)); await reader.tick();
    const repaired = reader.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v1");
    expect(repaired).toMatchObject({ status: "queued", analyzerRepairsApplied: ["infissi-performance-diagram-ocr-v1"], items: [{ state: "queued", attemptCount: 1 }] });
    await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", items: [{ state: "analyzed", attemptCount: 2 }] });
    const revision = reader.snapshot().revision;
    expect(reader.applyTechnicalPerformanceDiagramOcrRepair("infissi-performance-diagram-ocr-v1").revision).toBe(revision);
    expect(calls).toBe(2);
  });

  it("analizza dopo una correzione identita soltanto i nuovi PDF locali", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-extend-")); directories.push(directory);
    const sourceDirectory = path.join(directory, "source"); mkdirSync(sourceDirectory);
    const input = (name: string) => {
      const localPath = path.join(sourceDirectory, `${name}.pdf`); const body = Buffer.from(`%PDF-${name}`); writeFileSync(localPath, body);
      return { documentKey: createHash("sha256").update(name).digest("hex"), customerKey: name, kind: "invoice" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    };
    let calls = 0;
    const reader = new PersistentAprCrmDocumentAnalysis(directory, async () => { calls += 1; return { text: "Fattura n. 1 del 01/02/2026 Totale 100,00", extractionMode: "native_text", pageCount: 1 }; });
    const first = input("cliente-esistente"); reader.prepare([first], "d".repeat(64)); await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { analyzed: 1 } });
    const added = input("cliente-corretto");
    const extended = reader.extendAfterDocumentCorrection([first, added], "e".repeat(64));
    expect(extended).toMatchObject({ status: "queued", items: [{ state: "analyzed" }, { customerKey: "cliente-corretto", state: "queued" }] });
    await reader.tick();
    expect(reader.snapshot()).toMatchObject({ status: "completed", progress: { total: 2, analyzed: 2, queued: 0 } });
    expect(reader.snapshot().items.map((item) => item.attemptCount)).toEqual([1, 1]);
    expect(calls).toBe(2);
  });

  it("classifica il contenuto additional senza promuovere note interne o falsi positivi lessicali", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-classification-")); directories.push(directory);
    const sourceDirectory = path.join(directory, "source"); mkdirSync(sourceDirectory);
    const texts: Record<string, string> = {
      certificate: `DICHIARAZIONE DELLE PRESTAZIONI TERMICHE DEL SERRAMENTO
Il sottoscritto, rappresentante legale della ditta produttrice, dichiara che la finestra ha Uw = 1,13 W/m2K secondo UNI EN ISO 10077-1:2017. Timbro e firma.`,
      internal: "Documento tecnico interno CRM. Infissi da controllare con il cliente; nessun certificato originario allegato.",
      lexical: "NOTA INTERNA: il cliente riferisce trasmittanza termica Uw = 1,30 W/m2K e dimensioni: 1200 x 1400; valori non verificati e non provenienti dal produttore.",
    };
    const inputs = Object.keys(texts).map((name) => {
      const localPath = path.join(sourceDirectory, `${name}.pdf`); const body = Buffer.from(`%PDF-${name}`); writeFileSync(localPath, body);
      return { documentKey: createHash("sha256").update(name).digest("hex"), customerKey: name, kind: "additional" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    });
    const reader = new PersistentAprCrmDocumentAnalysis(directory, async (pdfPath) => ({ text: texts[path.basename(pdfPath, ".pdf")], extractionMode: "native_text", pageCount: 1 }));
    reader.prepare(inputs, "9".repeat(64));
    for (let index = 0; index < 5 && reader.snapshot().status !== "completed"; index += 1) await reader.tick();
    const items = Object.fromEntries(reader.snapshot().items.map((item) => [item.customerKey, item]));
    expect(items.certificate).toMatchObject({ kind: "additional", semanticKind: "third_party_certificate", documentClassification: { profile: "formal_declaration" } });
    expect(items.internal).toMatchObject({ kind: "additional", semanticKind: "additional", documentClassification: { profile: "none" } });
    expect(items.lexical).toMatchObject({ kind: "additional", semanticKind: "additional", documentClassification: { profile: "none" } });
    expect(items.certificate.documentClassification?.appliedRuleIds).toContain("user-2026-08-26-third-party-technical-certificate-classification-v1");
  });

  it("riclassifica checkpoint analizzati precedenti senza cambiare kind, chiave o fingerprint", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "apr-doc-analysis-reclassify-")); directories.push(directory);
    const localPath = path.join(directory, "certificate.pdf"); const body = Buffer.from("%PDF-certificate"); writeFileSync(localPath, body);
    const input = { documentKey: createHash("sha256").update("certificate").digest("hex"), customerKey: "cliente", kind: "additional" as const, localPath, responseSha256: createHash("sha256").update(body).digest("hex") };
    const reader = new PersistentAprCrmDocumentAnalysis(directory, async () => ({ text: `DICHIARAZIONE DI CONFORMITA ENERGETICA dei serramenti
Il costruttore dichiara Uw = 1,2 W/m2K secondo EN 14351-1:2016. Timbro e firma.`, extractionMode: "native_text", pageCount: 1 }));
    reader.prepare([input], "8".repeat(64)); await reader.tick();
    const checkpoint = JSON.parse(readFileSync(reader.checkpointPath, "utf8"));
    delete checkpoint.items[0].semanticKind; delete checkpoint.items[0].documentClassification; delete checkpoint.classificationRevisionsApplied;
    writeFileSync(reader.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    const before = reader.snapshot();
    expect(before.items[0]).toMatchObject({ kind: "additional", semanticKind: "additional", documentClassification: null });
    const revised = reader.applyTechnicalDocumentClassificationRevision("infissi-third-party-certificate-classifier-v1");
    expect(revised).toMatchObject({ sourceFingerprint: "8".repeat(64), classificationRevisionsApplied: ["infissi-third-party-certificate-classifier-v1"], items: [{ documentKey: input.documentKey, kind: "additional", semanticKind: "third_party_certificate" }] });
    expect(reader.applyTechnicalDocumentClassificationRevision("infissi-third-party-certificate-classifier-v1").revision).toBe(revised.revision);
  });
});
