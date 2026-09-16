import { describe, expect, it } from "vitest";
import { esportaPratica, type ClientEsportazione } from "./esportaPratica.ts";
import {
  CRM_OMBRA_EXPORT_VERSION,
  base64ToBytes,
  bytesToBase64,
  nomeFileEsportazione,
  percorsiDocumenti,
  rigaPerOmbra,
  sha256Hex,
  verificaEsportazione,
  type EsportazionePratica,
} from "./exportFormat.ts";
import { importaPratica, type ClientImportazione } from "./importaPratica.ts";

const NOW = new Date("2026-09-14T09:00:00.000Z");
const ID = "92f0a811-6199-494e-bc12-dafefe1a37b2";

const PRATICA: Record<string, unknown> = {
  id: ID,
  brand: "enea",
  tipo_servizio: "schermature",
  cliente_nome: "Rossella",
  cliente_cognome: "Munafò",
  reseller_id: "c0ffee00-0000-0000-0000-000000000001",
  current_stage_id: "stage-vero-123",
  operatore_id: "utente-vero-1",
  chiamate_assegnato_a: "utente-vero-2",
  fatture_urls: [`${ID}/fattura/f1.pdf`],
  documenti_aggiuntivi_urls: [],
  dati_form: { documenti: { fattura_url: `${ID}/fattura/f1.pdf`, bonifico_url: `${ID}/bonifico/b1.pdf` }, note: "altro-cliente/x.pdf" },
};
const RIVENDITORE = { id: "c0ffee00-0000-0000-0000-000000000001", ragione_sociale: "Brianza Serramenti" };
const STAGE = { id: "stage-vero-123", stage_type: "pronte_da_fare", name: "Pronte da fare", brand: "enea" };
const FILES: Record<string, Uint8Array> = { [`${ID}/fattura/f1.pdf`]: new TextEncoder().encode("%PDF fattura"), [`${ID}/bonifico/b1.pdf`]: new TextEncoder().encode("%PDF bonifico") };

function clientVero(): ClientEsportazione & { scritture: number } {
  const c = {
    scritture: 0,
    async selectById(table: string, id: string) {
      if (table === "enea_practices" && id === ID) return PRATICA;
      if (table === "companies" && id === RIVENDITORE.id) return RIVENDITORE;
      if (table === "pipeline_stages" && id === STAGE.id) return STAGE;
      return null;
    },
    async download(bucket: "documenti" | "enea-documents", path: string) {
      // i file del cliente stanno in enea-documents: in "documenti" non ci sono
      if (bucket !== "enea-documents") return null;
      const bytes = FILES[path];
      return bytes ? { bytes, contentType: "application/pdf" } : null;
    },
  };
  return c;
}

async function esportazioneDiProva(): Promise<EsportazionePratica> {
  const esito = await esportaPratica(clientVero(), ID, "giuliano", NOW);
  if (esito.ok === false) throw new Error(esito.errore);
  return esito.esportazione;
}

describe("formato di esportazione", () => {
  it("raccoglie i percorsi dalle colonne e da dati_form, una volta sola, solo quelli della pratica", () => {
    expect(percorsiDocumenti(PRATICA)).toEqual([
      { origine: "fatture_urls", path: `${ID}/fattura/f1.pdf` },
      { origine: "dati_form.bonifico_url", path: `${ID}/bonifico/b1.pdf` },
    ]);
  });

  it("base64 e sha256 tornano indietro identici", async () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("nome del file leggibile e ordinabile", () => {
    expect(nomeFileEsportazione(ID, NOW)).toBe(`pratica-ombra-${ID}-20260914-0900.json`);
  });

  it("rimappa lo stage e azzera gli utenti del CRM vero, lasciando tutto il resto com'è", () => {
    const riga = rigaPerOmbra(PRATICA, "stage-ombra-9");
    expect(riga).toMatchObject({ id: ID, current_stage_id: "stage-ombra-9", operatore_id: null, chiamate_assegnato_a: null, reseller_id: RIVENDITORE.id, fatture_urls: [`${ID}/fattura/f1.pdf`] });
  });
});

describe("esportazione dal CRM vero", () => {
  it("è sola lettura, include rivenditore, stage e documenti firmati", async () => {
    const client = clientVero();
    const esito = await esportaPratica(client, ID, "giuliano", NOW);
    expect(esito.ok).toBe(true);
    if (esito.ok === false) return;
    expect(client.scritture).toBe(0);
    expect(esito.avvisi).toEqual([]);
    expect(esito.esportazione).toMatchObject({ version: CRM_OMBRA_EXPORT_VERSION, exportedAt: NOW.toISOString(), exportedBy: "giuliano", practiceId: ID, reseller: RIVENDITORE, stage: { stage_type: "pronte_da_fare", name: "Pronte da fare", brand: "enea" } });
    expect(esito.esportazione.documents.map((d) => [d.origine, d.bucket, d.size])).toEqual([["fatture_urls", "enea-documents", 12], ["dati_form.bonifico_url", "enea-documents", 13]]);
    expect(await verificaEsportazione(esito.esportazione)).toMatchObject({ ok: true });
    // il file passa per JSON e torna: la firma regge
    expect(await verificaEsportazione(JSON.parse(JSON.stringify(esito.esportazione)))).toMatchObject({ ok: true });
  });

  it("un documento mancante diventa un avviso, non un errore", async () => {
    const client = clientVero();
    const download = client.download;
    client.download = async (bucket, path) => (path.endsWith("b1.pdf") ? null : download(bucket, path));
    const esito = await esportaPratica(client, ID, "giuliano", NOW);
    expect(esito).toMatchObject({ ok: true, avvisi: [expect.stringContaining("b1.pdf")] });
    if (esito.ok) expect(esito.esportazione.documents).toHaveLength(1);
  });

  it("pratica inesistente: errore leggibile", async () => {
    expect(await esportaPratica(clientVero(), "non-esiste", "giuliano", NOW)).toEqual({ ok: false, errore: "Pratica non-esiste non trovata in enea_practices." });
  });
});

function clientOmbra(opzioni: { pratichePresenti?: string[]; rivenditoriPresenti?: string[]; stageOmbra?: string | null; fileGiaPresenti?: string[] } = {}) {
  const inseriti: Array<{ table: string; row: Record<string, unknown> }> = [];
  const caricati: Array<{ bucket: string; path: string; size: number; contentType: string | null }> = [];
  const client: ClientImportazione = {
    async exists(table, id) {
      if (table === "enea_practices") return (opzioni.pratichePresenti ?? []).includes(id);
      if (table === "companies") return (opzioni.rivenditoriPresenti ?? []).includes(id);
      return false;
    },
    async insert(table, row) { inseriti.push({ table, row }); },
    async findSystemStage(stageType, brand) { return stageType === "pronte_da_fare" && brand === "enea" ? (opzioni.stageOmbra === undefined ? "stage-ombra-9" : opzioni.stageOmbra) : null; },
    async upload(bucket, path, bytes, contentType) {
      if ((opzioni.fileGiaPresenti ?? []).includes(path)) return "gia_presente";
      caricati.push({ bucket, path, size: bytes.length, contentType });
      return "caricato";
    },
  };
  return { client, inseriti, caricati };
}

describe("importazione nel CRM ombra", () => {
  it("importa con gli stessi id, rimappa lo stage, crea il rivenditore se manca, carica i documenti", async () => {
    const { client, inseriti, caricati } = clientOmbra();
    const esito = await importaPratica(client, await esportazioneDiProva());
    expect(esito).toEqual({ ok: true, rapporto: { practiceId: ID, stageId: "stage-ombra-9", stageType: "pronte_da_fare", rivenditoreCreato: true, documentiCaricati: 2, documentiGiaPresenti: 0 } });
    expect(inseriti.map((i) => i.table)).toEqual(["companies", "enea_practices"]);
    expect(inseriti[0].row).toEqual(RIVENDITORE);
    expect(inseriti[1].row).toMatchObject({ id: ID, current_stage_id: "stage-ombra-9", operatore_id: null, chiamate_assegnato_a: null });
    expect(caricati).toEqual([
      { bucket: "enea-documents", path: `${ID}/fattura/f1.pdf`, size: 12, contentType: "application/pdf" },
      { bucket: "enea-documents", path: `${ID}/bonifico/b1.pdf`, size: 13, contentType: "application/pdf" },
    ]);
  });

  it("non sovrascrive una pratica già presente e non tocca nulla", async () => {
    const { client, inseriti, caricati } = clientOmbra({ pratichePresenti: [ID] });
    const esito = await importaPratica(client, await esportazioneDiProva());
    expect(esito).toMatchObject({ ok: false, errori: [expect.stringContaining("già presente")] });
    expect(inseriti).toEqual([]);
    expect(caricati).toEqual([]);
  });

  it("rifiuta per intero un file alterato, prima di toccare qualsiasi cosa", async () => {
    const { client, inseriti, caricati } = clientOmbra();
    const alterato = JSON.parse(JSON.stringify(await esportazioneDiProva())) as EsportazionePratica;
    alterato.practice.prezzo = 999;
    expect(await importaPratica(client, alterato)).toMatchObject({ ok: false, errori: [expect.stringContaining("contentSha256")] });
    const documentoAlterato = JSON.parse(JSON.stringify(await esportazioneDiProva())) as EsportazionePratica;
    documentoAlterato.documents[0].base64 = bytesToBase64(new TextEncoder().encode("%PDF altro"));
    const esito = await importaPratica(client, documentoAlterato);
    expect(esito.ok).toBe(false);
    if (esito.ok === false) expect(esito.errori.join(" ")).toMatch(/contentSha256|sha256 non corrisponde/);
    expect(await importaPratica(client, { version: "altro" })).toMatchObject({ ok: false });
    expect(inseriti).toEqual([]);
    expect(caricati).toEqual([]);
  });

  it("senza lo stage di sistema nell'ombra si ferma con il messaggio sulle migrazioni", async () => {
    const { client, inseriti } = clientOmbra({ stageOmbra: null });
    expect(await importaPratica(client, await esportazioneDiProva())).toMatchObject({ ok: false, errori: [expect.stringContaining("seed pipeline_stages")] });
    expect(inseriti).toEqual([]);
  });

  it("rivenditore già presente e documento già caricato: non li duplica", async () => {
    const { client, inseriti } = clientOmbra({ rivenditoriPresenti: [RIVENDITORE.id], fileGiaPresenti: [`${ID}/fattura/f1.pdf`] });
    const esito = await importaPratica(client, await esportazioneDiProva());
    expect(esito).toMatchObject({ ok: true, rapporto: { rivenditoreCreato: false, documentiCaricati: 1, documentiGiaPresenti: 1 } });
    expect(inseriti.map((i) => i.table)).toEqual(["enea_practices"]);
  });
});
