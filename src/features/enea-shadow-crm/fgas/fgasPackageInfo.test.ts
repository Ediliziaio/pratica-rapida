import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fgasPackageInfo } from "./fgasPackageInfo";

describe("pacchetto ENEA + F-Gas: lettura difensiva di dati_form.fgas per la mail finale", () => {
  it("una pratica ENEA normale non ha pacchetto e non cambia comportamento", () => {
    expect(fgasPackageInfo(null)).toEqual({ requested: false, mode: "none", status: null, completionPaths: [] });
    expect(fgasPackageInfo({ richiedente: { nome: "Mario" } })).toEqual({ requested: false, mode: "none", status: null, completionPaths: [] });
    expect(fgasPackageInfo({ fgas: { requested: false } })).toEqual({ requested: false, mode: "none", status: null, completionPaths: [] });
  });

  it("pacchetto richiesto con ricevuta caricata: la ricevuta va in allegato", () => {
    expect(fgasPackageInfo({ fgas: { requested: true, status: "conclusa", completion_document_urls: ["abc/fgas-conclusa/ricevuta.pdf"] } }))
      .toEqual({ requested: true, mode: "bundle", status: "conclusa", completionPaths: ["abc/fgas-conclusa/ricevuta.pdf"] });
  });

  it("pacchetto richiesto senza ricevuta: requested resta true e i percorsi sono vuoti (la mail non parte)", () => {
    expect(fgasPackageInfo({ fgas: { requested: true, status: "in_lavorazione" } }))
      .toEqual({ requested: true, mode: "bundle", status: "in_lavorazione", completionPaths: [] });
  });

  it("riconosce la pratica Solo F-Gas senza richiedere ENEA", () => {
    expect(fgasPackageInfo({ fgas: { requested: true, package: "fgas_only", status: "ricevuta_da_verificare" } }))
      .toEqual({ requested: true, mode: "standalone", status: "ricevuta_da_verificare", completionPaths: [] });
  });

  it("percorsi malformati o pericolosi vengono ignorati, JSON malformato non lancia", () => {
    expect(fgasPackageInfo({ fgas: { requested: true, completion_document_urls: ["../x.pdf", "/etc/passwd", "", 3, "ok/fgas-conclusa/r.pdf"] } }).completionPaths)
      .toEqual(["ok/fgas-conclusa/r.pdf"]);
    expect(() => fgasPackageInfo({ fgas: "stringa" })).not.toThrow();
    expect(() => fgasPackageInfo([1, 2])).not.toThrow();
  });

  it("la funzione edge usa esattamente questa logica (nessuna deriva fra Node e Deno)", () => {
    const edge = readFileSync(path.resolve(__dirname, "../../../../supabase/functions/on-stage-changed/index.ts"), "utf8");
    const here = readFileSync(path.resolve(__dirname, "fgasPackageInfo.ts"), "utf8");
    const body = (src: string) => src.slice(src.indexOf("function fgasPackageInfo(")).split("\n}\n")[0].replace(/\s+/g, " ");
    expect(body(edge)).toBe(body(here).replace("export function", "function").replace(/\s+/g, " "));
  });

  it("la mail finale rifiuta la consegna quando il pacchetto F-Gas e' richiesto e manca la ricevuta", () => {
    const edge = readFileSync(path.resolve(__dirname, "../../../../supabase/functions/on-stage-changed/index.ts"), "utf8");
    expect(edge).toMatch(/if \(fgas\.requested && fgasCounter === 1\) \{[\s\S]*?return \[\];/);
    expect(edge).toMatch(/ricevuta_fgas_\$\{clienteSlug\}/);
    // il chiamante tratta la lista vuota come missing_attachments (gia' presente)
    expect(edge).toMatch(/attachments\.length === 0[\s\S]*?missing_attachments/);
  });

  it("Solo F-Gas chiude con la ricevuta senza pretendere un allegato ENEA", () => {
    const kanban = readFileSync(path.resolve(__dirname, "../../../pages/KanbanBoard.tsx"), "utf8");
    expect(kanban).toMatch(/fgasServiceMode\(practice\) !== "standalone"[\s\S]*?pratica ENEA conclusa/);
    expect(kanban).toMatch(/fgasStandalone \? "SOLO F-GAS" : "F-GAS"/);
  });

  it("la consegna e la mail del rivenditore nominano correttamente Solo F-Gas", () => {
    const edge = readFileSync(path.resolve(__dirname, "../../../../supabase/functions/on-stage-changed/index.ts"), "utf8");
    const email = readFileSync(path.resolve(__dirname, "../../../../supabase/functions/send-email/index.ts"), "utf8");
    expect(edge).toMatch(/fgasInfo\.mode === "standalone"[\s\S]*?"F-Gas"/);
    expect(email).toContain("Pratica {{servizio}} completata");
  });
});
