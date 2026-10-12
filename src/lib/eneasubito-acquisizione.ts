/**
 * I conti dell'acquisizione di EneaSubito.
 *
 * L'obiettivo dichiarato dal Titolare il 12/10/2026 e' **tre pratiche al
 * giorno**, con un tetto di **20 € di pubblicita' per pratica**. Questo file
 * tiene i due numeri e li confronta con la realta' del mese.
 *
 * La spesa pubblicitaria non si puo' dedurre da nessuna parte: Google e
 * ChatGPT non parlano con il nostro database. La inserisce il Titolare, un
 * numero per gruppo per mese, e sta in `platform_settings`. Dove non c'e', il
 * costo per pratica resta vuoto — non si stima, perche' su quella cifra si
 * decide dove mettere i soldi.
 */
import type { Gruppo, RigaConteggio } from "./eneasubito-provenienza";
import { costoPerPratica } from "./eneasubito-provenienza";

/** Tre pratiche al giorno: l'obiettivo di partenza, deciso dal Titolare. */
export const PRATICHE_AL_GIORNO = 3;

/** Massimo che il Titolare accetta di spendere in pubblicita' per pratica. */
export const TETTO_COSTO_PRATICA = 20;

/** La chiave sotto cui vive la spesa, in platform_settings. */
export const CHIAVE_SPESA = "eneasubito_spesa_pubblicitaria";

/** { "2026-10": { "google_annunci": 450 } } — euro, per mese e per gruppo. */
export type SpesaPubblicitaria = Record<string, Partial<Record<Gruppo, number>>>;

/** Il mese in corso nel fuso italiano, come "2026-10". */
export function meseCorrente(adesso: Date = new Date()): string {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(adesso);
  const anno = parti.find((p) => p.type === "year")?.value;
  const mese = parti.find((p) => p.type === "month")?.value;
  return `${anno}-${mese}`;
}

/** Il mese scritto come lo legge una persona: «ottobre 2026». */
export function meseLeggibile(mese: string): string {
  const [anno, numero] = mese.split("-").map(Number);
  if (!anno || !numero) return mese;
  const nomi = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  return `${nomi[numero - 1] ?? mese} ${anno}`;
}

/**
 * Quanti giorni del mese sono gia' passati, contando oggi.
 *
 * Serve a non spaventarsi: il 3 del mese tre pratiche sono il 100%
 * dell'obiettivo fino a quel momento, non il 3% di quello mensile.
 */
export function giorniTrascorsi(mese: string, adesso: Date = new Date()): number {
  if (mese !== meseCorrente(adesso)) return giorniDelMese(mese);
  const giorno = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", day: "2-digit" }).format(adesso),
  );
  return Math.max(1, giorno);
}

export function giorniDelMese(mese: string): number {
  const [anno, numero] = mese.split("-").map(Number);
  if (!anno || !numero) return 30;
  return new Date(Date.UTC(anno, numero, 0)).getUTCDate();
}

export interface Andamento {
  /** Pratiche entrate finora nel mese. */
  pratiche: number;
  /** Quante dovrebbero essercene a oggi per stare sull'obiettivo. */
  atteseAOggi: number;
  /** Quante ne servono per chiudere il mese in obiettivo. */
  attesePerIlMese: number;
  /** Media al giorno realizzata finora. */
  mediaAlGiorno: number;
  /** In pari o in anticipo rispetto al passo. */
  inPari: boolean;
}

export function andamento(
  pratiche: number,
  mese: string,
  adesso: Date = new Date(),
  obiettivoGiornaliero: number = PRATICHE_AL_GIORNO,
): Andamento {
  const passati = giorniTrascorsi(mese, adesso);
  const totali = giorniDelMese(mese);
  const atteseAOggi = passati * obiettivoGiornaliero;
  return {
    pratiche,
    atteseAOggi,
    attesePerIlMese: totali * obiettivoGiornaliero,
    mediaAlGiorno: passati > 0 ? pratiche / passati : 0,
    inPari: pratiche >= atteseAOggi,
  };
}

export interface RigaCruscotto extends RigaConteggio {
  /** Quanto ha dichiarato di aver speso in questo gruppo, in questo mese. */
  spesa: number | null;
  /** Spesa diviso pratiche. `null` se la spesa non e' stata inserita. */
  costo: number | null;
  /** Vero quando il costo per pratica sfonda il tetto dei 20 €. */
  sopraIlTetto: boolean;
}

/**
 * Unisce i conteggi con la spesa dichiarata.
 *
 * Un gruppo su cui si e' speso ma da cui non e' entrata nessuna pratica resta
 * comunque in elenco, con zero pratiche: sono i soldi buttati, ed e' la riga
 * piu' importante da vedere.
 */
export function cruscotto(
  righe: readonly RigaConteggio[],
  spesaDelMese: Partial<Record<Gruppo, number>> | undefined,
  tetto: number = TETTO_COSTO_PRATICA,
): RigaCruscotto[] {
  const spese = spesaDelMese ?? {};
  const viste = new Set<Gruppo>();

  const conSpesa: RigaCruscotto[] = righe.map((riga) => {
    viste.add(riga.gruppo);
    const spesa = Number.isFinite(spese[riga.gruppo] ?? NaN) ? (spese[riga.gruppo] as number) : null;
    const costo = costoPerPratica(riga.pratiche, spesa);
    return { ...riga, spesa, costo, sopraIlTetto: costo !== null && costo > tetto };
  });

  for (const [gruppo, importo] of Object.entries(spese) as [Gruppo, number][]) {
    if (viste.has(gruppo) || !Number.isFinite(importo) || importo <= 0) continue;
    conSpesa.push({
      gruppo,
      etichetta: gruppo,
      pratiche: 0,
      incassato: 0,
      aPagamento: true,
      clienti: [],
      spesa: importo,
      costo: null,
      sopraIlTetto: true,
    });
  }
  return conSpesa;
}

/** Totale speso nel mese, su tutti i gruppi. */
export function spesaTotale(spesaDelMese: Partial<Record<Gruppo, number>> | undefined): number {
  return Object.values(spesaDelMese ?? {}).reduce<number>(
    (somma, importo) => somma + (Number.isFinite(importo) ? (importo as number) : 0),
    0,
  );
}

/**
 * Costo medio per pratica sul mese intero.
 *
 * `null` se non si e' dichiarata nessuna spesa o non e' entrata nessuna
 * pratica: e' il numero che dice se il tetto dei 20 € regge, e inventarlo
 * sarebbe peggio che non averlo.
 */
export function costoMedio(righe: readonly RigaCruscotto[]): number | null {
  const spesa = righe.reduce((s, r) => s + (r.spesa ?? 0), 0);
  const pratiche = righe.reduce((p, r) => p + r.pratiche, 0);
  return costoPerPratica(pratiche, spesa);
}
