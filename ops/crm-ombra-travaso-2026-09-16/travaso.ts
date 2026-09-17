#!/usr/bin/env node
// Travaso CRM vero -> CRM ombra.
//
// Una direzione sola. Il CRM vero viene letto con la sessione APR del
// Portachiavi (PersistentAprCrmAuth: GET su enea_practices_public e sul bucket
// enea-documents, nient'altro). L'ombra viene scritta con la chiave del
// progetto ombra letta da un file locale (mai in chat, mai nel codice).
// La logica di esportazione/importazione e' la stessa del bottone manuale
// (esportaPratica / importaPratica, copiati qui dal CRM): stesso file, stessa
// firma, stessi id, stessa regola "una pratica gia' presente non si tocca".
//
// Uso:
//   travaso.ts --once                 una passata sulle colonne configurate
//   travaso.ts --practice <id>        una sola pratica
//   travaso.ts --loop 600             ogni 600 secondi, finche' non viene fermato
//   --dry-run                         legge e riferisce, non scrive nell'ombra
//   --stages pronte_da_fare,recensione  colonne da travasare (default: pronte_da_fare)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { PersistentAprCrmAuth } from "../../scripts/enea-shadow-runner/crmAuth";
import { esportaPratica, type ClientEsportazione } from "./esportaPratica.ts";
import { importaPratica, type ClientImportazione } from "./importaPratica.ts";
import { percorsiDocumenti, type BucketDocumenti } from "./exportFormat.ts";

const OMBRA_ORIGIN = "https://boxvncaqpszeqpofazzr.supabase.co";
const RUNNER_STATE = path.join(homedir(), "Library/Application Support/PraticaRapida/enea-shadow-runner/state");
const OMBRA_DIR = path.join(homedir(), "Library/Application Support/PraticaRapida/crm-ombra");
const KEY_FILE = path.join(OMBRA_DIR, "service-role.key");
const REGISTRO = path.join(OMBRA_DIR, "travaso", "registro.json");
const LOG = path.join(OMBRA_DIR, "travaso", "travaso.ndjson");
const BATTITO = path.join(OMBRA_DIR, "travaso", "battito.json");
const EMBED = ["companies", "pipeline_stages"] as const;

type Registro = { version: "crm-ombra-travaso-registro-v1"; pratiche: Record<string, VoceRegistro> };
type VoceRegistro = {
  practiceId: string; displayName: string; stageType: string; stato: "travasata" | "gia_presente" | "rifiutata";
  at: string; documenti: number; avvisi: string[]; errori: string[];
};

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(name);
const now = () => new Date();

function leggiChiaveOmbra(): string {
  if (!existsSync(KEY_FILE)) throw new Error(`chiave ombra assente: ${KEY_FILE}`);
  const k = readFileSync(KEY_FILE, "utf8").trim();
  if (!k.startsWith("sb_secret_") || k.length < 30) throw new Error("chiave ombra non valida (atteso sb_secret_...)");
  return k;
}
function leggiRegistro(): Registro {
  if (!existsSync(REGISTRO)) return { version: "crm-ombra-travaso-registro-v1", pratiche: {} };
  return JSON.parse(readFileSync(REGISTRO, "utf8")) as Registro;
}
function scriviRegistro(r: Registro) {
  mkdirSync(path.dirname(REGISTRO), { recursive: true });
  writeFileSync(REGISTRO, JSON.stringify(r, null, 2));
}
function log(evento: Record<string, unknown>) {
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify({ at: now().toISOString(), ...evento }) + "\n");
  const { at: _at, ...rest } = { at: "", ...evento };
  console.log(JSON.stringify(rest));
}

// ---- CRM vero: sola lettura tramite la sessione APR ----------------------
type RigaVista = Record<string, unknown> & { companies?: Record<string, unknown> | null; pipeline_stages?: Record<string, unknown> | null };

function clientEsportazioneApr(auth: PersistentAprCrmAuth) {
  const cache = new Map<string, RigaVista>();
  async function riga(practiceId: string): Promise<RigaVista | null> {
    if (cache.has(practiceId)) return cache.get(practiceId)!;
    const params = new URLSearchParams({ select: "*,companies:reseller_id(*),pipeline_stages(id,stage_type,name,brand)", id: `eq.${practiceId}`, limit: "1" });
    const res = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
    if (!res.ok) throw new Error(`crm vero: HTTP ${res.status} su ${practiceId}`);
    const rows = await res.json() as RigaVista[];
    const r = rows[0] ?? null;
    if (r) cache.set(practiceId, r);
    return r;
  }
  const client: ClientEsportazione = {
    async selectById(table, id) {
      if (table === "enea_practices") {
        const r = await riga(id);
        if (!r) return null;
        const pulita: Record<string, unknown> = { ...r };
        for (const k of EMBED) delete pulita[k];
        return pulita;
      }
      if (table === "companies") {
        for (const r of cache.values()) if (r.companies && r.companies.id === id) return r.companies;
        return null;
      }
      if (table === "pipeline_stages") {
        for (const r of cache.values()) if (r.pipeline_stages && r.pipeline_stages.id === id) return r.pipeline_stages;
        return null;
      }
      throw new Error(`tabella non prevista in lettura: ${table}`);
    },
    async download(bucket, objectPath) {
      if (bucket !== "enea-documents") return null; // l'adattatore APR legge solo questo bucket
      let res: Response;
      try { res = await auth.readOnlyStorageGet("enea-documents", objectPath); } catch { return null; }
      if (!res.ok) return null;
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
    },
  };
  return { client, listaPerColonna: async (stages: string[]) => {
    const params = new URLSearchParams({
      select: "id,cliente_nome,cliente_cognome,updated_at,pipeline_stages!inner(stage_type)",
      "pipeline_stages.stage_type": `in.(${stages.join(",")})`, order: "updated_at.asc", limit: "500",
    });
    const res = await auth.readOnlyGet("/rest/v1/enea_practices_public", params);
    if (!res.ok) throw new Error(`crm vero: HTTP ${res.status} sulla lista`);
    return (await res.json() as Array<{ id: string; cliente_nome: string; cliente_cognome: string; pipeline_stages: { stage_type: string } }>);
  } };
}

// ---- CRM ombra: scrittura con la chiave del progetto ombra ---------------
// Il CRM vero ha colonne aggiunte a mano, fuori dalle migrazioni (es.
// companies.prezzo_cf_imponibile_cents). L'ombra ha solo lo schema delle
// migrazioni: le colonne che non conosce vengono tolte dalla riga e segnalate,
// cosi' la deriva resta visibile invece di far fallire il travaso.
const colonneScartate: Record<string, Set<string>> = {};
async function colonneOmbra(h: Record<string, string>): Promise<Record<string, Set<string>>> {
  const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/`, { headers: { ...h, Accept: "application/openapi+json" } });
  if (!res.ok) throw new Error(`ombra schema: HTTP ${res.status}`);
  const spec = await res.json() as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
  const out: Record<string, Set<string>> = {};
  for (const [table, def] of Object.entries(spec.definitions ?? {})) out[table] = new Set(Object.keys(def.properties ?? {}));
  return out;
}

type ClientOmbra = ClientImportazione & {
  documentiPratica: (id: string) => Promise<Record<string, unknown> | null>;
  aggiornaColonneDocumenti: (id: string, colonne: Record<string, unknown>) => Promise<void>;
};

function clientImportazioneOmbra(key: string, dryRun: boolean, schema: Record<string, Set<string>>): ClientOmbra {
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const filtra = (table: string, row: Record<string, unknown>) => {
    const note = schema[table];
    if (!note) return row;
    const pulita: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (note.has(k)) pulita[k] = v; else (colonneScartate[table] ??= new Set()).add(k);
    }
    return pulita;
  };
  return {
    async exists(table, id) {
      const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`, { headers: h });
      if (!res.ok) throw new Error(`ombra ${table}: HTTP ${res.status}`);
      return (await res.json() as unknown[]).length > 0;
    },
    async insert(table, row) {
      if (dryRun) return;
      const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/${table}`, { method: "POST", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(filtra(table, row)) });
      if (!res.ok) throw new Error(`ombra insert ${table}: HTTP ${res.status} ${await res.text()}`);
    },
    async documentiPratica(id: string) {
      const q = new URLSearchParams({ select: "id,fatture_urls,documenti_aggiuntivi_urls,documenti_enea_urls,pratica_enea_conclusa_urls,dati_form", id: `eq.${id}`, limit: "1" });
      const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/enea_practices?${q}`, { headers: h });
      if (!res.ok) throw new Error(`ombra enea_practices: HTTP ${res.status}`);
      return (await res.json() as Record<string, unknown>[])[0] ?? null;
    },
    async aggiornaColonneDocumenti(id: string, colonne: Record<string, unknown>) {
      if (dryRun) return;
      const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/enea_practices?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(colonne) });
      if (!res.ok) throw new Error(`ombra aggiornamento documenti ${id}: HTTP ${res.status} ${await res.text()}`);
    },
    async findSystemStage(stageType, brand) {
      const q = new URLSearchParams({ select: "id", stage_type: `eq.${stageType}`, reseller_id: "is.null", limit: "1" });
      if (brand) q.set("brand", `eq.${brand}`);
      const res = await fetch(`${OMBRA_ORIGIN}/rest/v1/pipeline_stages?${q}`, { headers: h });
      if (!res.ok) throw new Error(`ombra pipeline_stages: HTTP ${res.status}`);
      return (await res.json() as Array<{ id: string }>)[0]?.id ?? null;
    },
    async upload(bucket: BucketDocumenti, objectPath, bytes, contentType) {
      if (dryRun) return "caricato";
      const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${OMBRA_ORIGIN}/storage/v1/object/${bucket}/${encoded}`, { method: "POST", headers: { ...h, "Content-Type": contentType ?? "application/octet-stream", "x-upsert": "false" }, body: bytes });
      if (res.ok) return "caricato";
      const testo = await res.text();
      if (res.status === 409 || /exists|duplicate/i.test(testo)) return "gia_presente";
      throw new Error(`ombra storage ${bucket}/${objectPath}: HTTP ${res.status} ${testo}`);
    },
  };
}

// ---- una pratica -----------------------------------------------------------
async function travasa(practiceId: string, esp: ReturnType<typeof clientEsportazioneApr>, imp: ClientOmbra, registro: Registro, dryRun: boolean) {
  if (await imp.exists("enea_practices", practiceId)) {
    const voce = registro.pratiche[practiceId];
    if (!voce || voce.stato !== "gia_presente") {
      registro.pratiche[practiceId] = { practiceId, displayName: voce?.displayName ?? "", stageType: voce?.stageType ?? "", stato: "gia_presente", at: now().toISOString(), documenti: voce?.documenti ?? 0, avvisi: [], errori: [] };
      log({ evento: "gia_presente", practiceId });
    }
    await aggiungiDocumentiNuovi(practiceId, esp, imp, registro, dryRun);
    return;
  }
  const esito = await esportaPratica(esp.client, practiceId, "travaso-automatico", now());
  if (!esito.ok) {
    registro.pratiche[practiceId] = { practiceId, displayName: "", stageType: "", stato: "rifiutata", at: now().toISOString(), documenti: 0, avvisi: [], errori: [esito.errore] };
    log({ evento: "rifiutata", practiceId, errore: esito.errore });
    return;
  }
  const e = esito.esportazione;
  const displayName = `${e.practice.cliente_nome ?? ""} ${e.practice.cliente_cognome ?? ""}`.trim();
  const importazione = await importaPratica(imp, e);
  if (!importazione.ok) {
    registro.pratiche[practiceId] = { practiceId, displayName, stageType: e.stage?.stage_type ?? "", stato: "rifiutata", at: now().toISOString(), documenti: e.documents.length, avvisi: esito.avvisi, errori: importazione.errori };
    log({ evento: "rifiutata", practiceId, displayName, errori: importazione.errori });
    return;
  }
  registro.pratiche[practiceId] = { practiceId, displayName, stageType: importazione.rapporto.stageType, stato: "travasata", at: now().toISOString(), documenti: importazione.rapporto.documentiCaricati + importazione.rapporto.documentiGiaPresenti, avvisi: esito.avvisi, errori: [] };
  log({ evento: dryRun ? "travasata (prova)" : "travasata", practiceId, displayName, stage: importazione.rapporto.stageType, documenti: e.documents.length, rivenditoreCreato: importazione.rapporto.rivenditoreCreato, avvisi: esito.avvisi });
}

// Seconda direzione, ristretta: se nel CRM vero compaiono documenti che
// l'ombra non ha (fattura arrivata dopo, allegato aggiunto dall'operatore),
// vengono AGGIUNTI all'ombra. Nulla viene tolto o sostituito; colonna, note e
// risposte dell'ombra non si toccano; il CRM vero non viene mai scritto.
const COLONNE_DOC = ["fatture_urls", "documenti_aggiuntivi_urls", "documenti_enea_urls", "pratica_enea_conclusa_urls"] as const;
async function aggiungiDocumentiNuovi(practiceId: string, esp: ReturnType<typeof clientEsportazioneApr>, imp: ClientOmbra, registro: Registro, dryRun: boolean) {
  const vero = await esp.client.selectById("enea_practices", practiceId);
  const ombra = await imp.documentiPratica(practiceId);
  if (!vero || !ombra) return;
  const nelVero = percorsiDocumenti(vero);
  const nellOmbra = new Set(percorsiDocumenti(ombra).map((d) => d.path));
  const nuovi = nelVero.filter((d) => !nellOmbra.has(d.path));
  if (nuovi.length === 0) return;
  let caricati = 0; const avvisi: string[] = [];
  for (const d of nuovi) {
    const file = await esp.client.download("enea-documents", d.path);
    if (!file) { avvisi.push(`Documento nuovo non scaricabile: ${d.path} (${d.origine})`); continue; }
    await imp.upload("enea-documents", d.path, file.bytes, file.contentType);
    caricati += 1;
  }
  // Le colonne dei percorsi vengono riallineate per aggiunta: unione, mai rimozione.
  const colonne: Record<string, unknown> = {};
  for (const c of COLONNE_DOC) {
    const v = Array.isArray(vero[c]) ? vero[c] as string[] : [];
    const o = Array.isArray(ombra[c]) ? ombra[c] as string[] : [];
    const unione = [...o, ...v.filter((p) => !o.includes(p))];
    if (unione.length !== o.length) colonne[c] = unione;
  }
  // dati_form: i file caricati dal cliente vivono li'; si prende quello del vero solo se l'ombra non ne ha uno.
  if (!ombra.dati_form && vero.dati_form) colonne.dati_form = vero.dati_form;
  if (Object.keys(colonne).length) await imp.aggiornaColonneDocumenti(practiceId, colonne);
  const voce = registro.pratiche[practiceId];
  if (voce) { voce.documenti += caricati; voce.avvisi = [...voce.avvisi, ...avvisi]; voce.at = now().toISOString(); }
  log({ evento: dryRun ? "documenti_aggiunti (prova)" : "documenti_aggiunti", practiceId, displayName: voce?.displayName ?? "", nuovi: nuovi.map((d) => d.path), caricati, avvisi });
}

async function passata(stages: string[], dryRun: boolean, soloPratica?: string) {
  const auth = new PersistentAprCrmAuth(RUNNER_STATE);
  const esp = clientEsportazioneApr(auth);
  const key = leggiChiaveOmbra();
  const imp: ClientOmbra = clientImportazioneOmbra(key, dryRun, await colonneOmbra({ apikey: key, Authorization: `Bearer ${key}` }));
  const registro = leggiRegistro();
  const ids = soloPratica ? [soloPratica] : (await esp.listaPerColonna(stages)).map((r) => r.id);
  log({ evento: "passata", stages, candidate: ids.length, dryRun });
  let travasate = 0, presenti = 0, rifiutate = 0;
  for (const id of ids) {
    try {
      const prima = registro.pratiche[id]?.stato;
      await travasa(id, esp, imp, registro, dryRun);
      const dopo = registro.pratiche[id]?.stato;
      if (dopo === "travasata" && prima !== "travasata") travasate += 1; else if (dopo === "gia_presente") presenti += 1; else if (dopo === "rifiutata") rifiutate += 1;
    } catch (error) {
      rifiutate += 1;
      registro.pratiche[id] = { practiceId: id, displayName: registro.pratiche[id]?.displayName ?? "", stageType: "", stato: "rifiutata", at: now().toISOString(), documenti: 0, avvisi: [], errori: [String((error as Error).message ?? error)] };
      log({ evento: "errore", practiceId: id, errore: String((error as Error).message ?? error) });
    }
    if (!dryRun) scriviRegistro(registro);
  }
  const scartate = Object.fromEntries(Object.entries(colonneScartate).map(([t, c]) => [t, [...c].sort()]));
  log({ evento: "fine_passata", travasate, presenti, rifiutate, colonneNonPresentiNellOmbra: scartate });
  // Ultimo battito: chi controlla (cronoprogramma, sentinella) legge questo file.
  writeFileSync(BATTITO, JSON.stringify({ at: now().toISOString(), pid: process.pid, stages, travasate, presenti, rifiutate, dryRun }, null, 2));
}

async function main() {
  const stages = (arg("--stages") ?? "pronte_da_fare").split(",").map((s) => s.trim()).filter(Boolean);
  const dryRun = flag("--dry-run");
  const pratica = arg("--practice");
  const loop = arg("--loop");
  if (loop) {
    const secondi = Math.max(60, Number(loop) || 600);
    for (;;) {
      try { await passata(stages, dryRun); } catch (error) { log({ evento: "errore_passata", errore: String((error as Error).message ?? error) }); }
      await new Promise((r) => setTimeout(r, secondi * 1000));
    }
  }
  await passata(stages, dryRun, pratica);
}

main().catch((error) => { console.error(error); process.exit(1); });
