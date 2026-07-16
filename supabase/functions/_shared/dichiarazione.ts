/**
 * Dichiarazione Requisiti Tecnici — sorgente UNICA del documento.
 *
 * È una dichiarazione sostitutiva di atto di notorietà che il rivenditore
 * firma: deve uscire identica da qualunque strada arrivi, quindi qui stanno
 * sia i dati sia il markup, e non esistono altre copie del testo.
 *
 * Usato da due lati con lo stesso file (niente duplicati che divergono):
 *  - frontend  → alias `@shared/dichiarazione.ts` (anteprima nel dialog +
 *                salvataggio manuale del super_admin)
 *  - edge fn   → `../_shared/dichiarazione.ts` (generazione automatica in
 *                on-stage-changed quando la pratica entra in "recensione")
 *
 * Vincolo: TypeScript puro, zero dipendenze e zero API di Deno o del browser,
 * altrimenti smette di funzionare da uno dei due lati.
 */

export interface DichiarazioneTecnicaData {
  // Dati fornitore (azienda rivenditrice)
  azienda_nome: string;
  azienda_citta: string;
  azienda_provincia: string;
  azienda_via: string;
  azienda_civico: string;
  azienda_piva: string;

  // Dati immobile oggetto dell'intervento
  immobile_citta: string;
  immobile_provincia: string;
  immobile_cap: string;
  immobile_via: string;
  immobile_civico: string;

  // Dati cliente finale (intestatario della detrazione)
  cliente_nome: string;
  cliente_cognome: string;
  cliente_citta: string;
  cliente_via: string;
  cliente_civico: string;
  cliente_cf: string;

  // Caratteristiche intervento — checkbox
  caratteristiche_infissi: {
    rispetta_trasmittanza: boolean;
  };
  caratteristiche_schermature: {
    norma_en: boolean;
    marchiatura_ce: boolean;
    gtot_inferiore: boolean;
    esposizione: boolean;
    superficie_vetrata: boolean;
    solidale_edificio: boolean;
  };

  // Dichiarazioni aggiuntive
  importo_congruo: boolean;
  lavori_ultimati: boolean;

  tipo_intervento: "infissi" | "schermature" | "entrambi";

  data_documento?: string;
}

// ── Classificazione intervento ───────────────────────────────────────────────

/**
 * Match STRETTO su "infissi/serramenti", per decidere se generare il documento
 * in automatico. Serve a non pescare "Pompe di Calore" o "Insufflaggio Tetti",
 * che inferTipoIntervento() classificherebbe come infissi solo perché è il suo
 * default.
 */
export function isInterventoInfissi(prodotto: string | null | undefined): boolean {
  const p = (prodotto ?? "").toLowerCase();
  return p.includes("infiss") || p.includes("serrament");
}

/**
 * Tipo intervento di partenza per il dialog. Attenzione: qui il default è
 * "infissi" anche per prodotti che non c'entrano — va bene perché è solo un
 * valore iniziale che il super_admin può correggere a mano, ma NON usarlo per
 * decidere se generare in automatico (vedi isInterventoInfissi).
 */
export function inferTipoIntervento(
  prodotto: string | null | undefined,
): DichiarazioneTecnicaData["tipo_intervento"] {
  const p = (prodotto ?? "").toLowerCase();
  if (p.includes("scherm") || p.includes("tend") || p.includes("frangisole")) return "schermature";
  return "infissi";
}

// ── Costruzione dati ─────────────────────────────────────────────────────────

// Un civico da solo: "24", "1/C", "4A", "n. 7".
const CIVICO_RE = /^(?:n\.?\s*)?(\d+[\w/-]*)$/i;
// Civico in coda a una via: "Corso Venezia 24", "via Campobello n. 1/C".
const VIA_CON_CIVICO_RE = /^(.*?)[\s,]+(?:n\.?\s*)?(\d+[\w/-]*)$/i;

/**
 * Spezza un indirizzo libero in {via, civico, citta}. Serve perché
 * `companies.indirizzo` è un campo unico scritto a mano, in formati diversi:
 * "Corso Venezia 24", "VIA DEL CASTANO, 28", "Corso del Popolo 221, Mestre",
 * "via Campobello n. 1/C".
 *
 * `via` mantiene il tipo (via/corso/viale): il documento lo stampa così com'è,
 * perché "in via Corso Venezia" sarebbe sbagliato.
 */
export function splitIndirizzo(s: string | null | undefined): { via: string; civico: string; citta: string } {
  if (!s) return { via: "", civico: "", citta: "" };

  let parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return { via: "", civico: "", citta: "" };

  let citta = "";
  let civico = "";

  // L'ultimo pezzo dopo la virgola può essere il civico ("Via Manzoni, 24")
  // oppure il comune ("Corso del Popolo 221, Mestre"): distinguili, altrimenti
  // "24" finisce come città.
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const m = last.match(CIVICO_RE);
    if (m) civico = m[1];
    else citta = last;
    parts = parts.slice(0, -1);
  }

  let via = parts.join(", ").trim();
  if (!civico) {
    const m = via.match(VIA_CON_CIVICO_RE);
    if (m) { via = m[1].trim(); civico = m[2]; }
  }

  return { via: rimuoviCivicoDaVia(via, civico), civico, citta };
}

/**
 * Toglie il civico ripetuto in coda alla via. I campi strutturati del form
 * spesso lo contengono già: indirizzo "Viale Beata Vergine del Carmelo n. 186"
 * + civico "186" stamperebbe "…Carmelo n. 186 numero 186".
 * Rimuove solo se la coda è davvero quel civico, così vie come "Via 2 giugno"
 * restano intatte.
 */
export function rimuoviCivicoDaVia(via: string, civico: string): string {
  const v = (via ?? "").trim();
  const c = (civico ?? "").trim();
  if (!v || !c) return v;
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return v.replace(new RegExp(`[\\s,]*(?:n\\.?\\s*)?${esc}\\s*$`, "i"), "").trim() || v;
}

export interface BuildInput {
  practice: {
    cliente_nome?: string | null;
    cliente_cognome?: string | null;
    cliente_cf?: string | null;
    cliente_indirizzo?: string | null;
    prodotto_installato?: string | null;
  } | null;
  company: {
    ragione_sociale?: string | null;
    piva?: string | null;
    indirizzo?: string | null;
    citta?: string | null;
    provincia?: string | null;
  } | null;
  datiForm: Record<string, unknown> | null;
}

/**
 * Costruisce i dati del documento da pratica + anagrafica azienda + form
 * cliente. Quello che manca resta vuoto: il template stampa dei trattini e il
 * rivenditore completa a penna prima di firmare (oggi la gran parte delle
 * aziende non ha P.IVA e sede legale in anagrafica).
 */
export function buildDichiarazioneData(input: BuildInput): DichiarazioneTecnicaData {
  const { practice, company, datiForm } = input;

  const indirizzoAzienda = splitIndirizzo(company?.indirizzo);

  const df = datiForm ?? {};
  const residenza = (df.residenza ?? {}) as Record<string, string | boolean | undefined>;
  const appartamento = (df.appartamento_lavori ?? {}) as Record<string, string | undefined>;
  const richiedente = (df.richiedente ?? {}) as Record<string, string | undefined>;

  const fallbackAddr = splitIndirizzo(practice?.cliente_indirizzo);

  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  // Immobile dei lavori: nel form il cliente indica un indirizzo separato SOLO
  // se i lavori non sono a casa sua (residenza.stesso_indirizzo_lavori). Negli
  // altri casi l'immobile È la residenza — senza questo ripiego si finiva a
  // indovinare l'indirizzo spezzando il testo libero di cliente_indirizzo.
  const immobileDaResidenza = !appartamento.comune;

  // La via della residenza arriva col civico già dentro in parecchi casi
  // ("Viale ... Carmelo n. 186" + civico "186"): normalizzala una volta sola.
  const civicoResidenza = str(residenza.civico) || fallbackAddr.civico;
  const viaResidenza = rimuoviCivicoDaVia(
    str(residenza.indirizzo) || fallbackAddr.via,
    civicoResidenza,
  );

  const tipo = inferTipoIntervento(practice?.prodotto_installato);
  const infissi = tipo === "infissi" || tipo === "entrambi";
  const schermature = tipo === "schermature" || tipo === "entrambi";

  return {
    azienda_nome: company?.ragione_sociale ?? "",
    azienda_citta: company?.citta || indirizzoAzienda.citta,
    azienda_provincia: company?.provincia ?? "",
    azienda_via: indirizzoAzienda.via,
    azienda_civico: indirizzoAzienda.civico,
    azienda_piva: company?.piva ?? "",

    immobile_citta:     immobileDaResidenza ? (str(residenza.comune)    || fallbackAddr.citta) : (appartamento.comune    ?? ""),
    immobile_provincia: immobileDaResidenza ? str(residenza.provincia)                          : (appartamento.provincia ?? ""),
    immobile_cap:       immobileDaResidenza ? str(residenza.cap)                                : (appartamento.cap       ?? ""),
    immobile_via:       immobileDaResidenza ? viaResidenza                                      : rimuoviCivicoDaVia(appartamento.indirizzo ?? "", appartamento.numero ?? ""),
    immobile_civico:    immobileDaResidenza ? civicoResidenza                                   : (appartamento.numero    ?? ""),

    cliente_nome:    practice?.cliente_nome    || richiedente.nome    || "",
    cliente_cognome: practice?.cliente_cognome || richiedente.cognome || "",
    cliente_citta:   str(residenza.comune) || fallbackAddr.citta,
    cliente_via:     viaResidenza,
    cliente_civico:  civicoResidenza,
    cliente_cf:      practice?.cliente_cf || richiedente.cf || "",

    // Il documento stampa SEMPRE entrambe le sezioni (è un modulo unico per
    // infissi e schermature): a cambiare sono solo le caselle spuntate, quella
    // dell'intervento che è stato fatto davvero.
    caratteristiche_infissi: { rispetta_trasmittanza: infissi },
    caratteristiche_schermature: {
      norma_en: schermature,
      marchiatura_ce: schermature,
      gtot_inferiore: schermature,
      esposizione: schermature,
      superficie_vetrata: schermature,
      solidale_edificio: schermature,
    },
    importo_congruo: true,
    lavori_ultimati: true,
    tipo_intervento: tipo,
  };
}

// ── Render ───────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Valore mancante → filetto da riempire a penna. */
function v(s: string | null | undefined, placeholder = "_______________"): string {
  const t = (s ?? "").trim();
  return t ? escapeHtml(t) : placeholder;
}

function cb(checked: boolean, label: string): string {
  return `<div class="cb"><span class="box">${checked ? "X" : ""}</span><span>${escapeHtml(label)}</span></div>`;
}

/** Trasmittanza massima per zona climatica (D.M. 06/08/2020). */
const TRASMITTANZA: ReadonlyArray<readonly [string, string]> = [
  ["Zona climatica A", "2,60 W/m²K"],
  ["Zona climatica B", "2,60 W/m²K"],
  ["Zona climatica C", "1,75 W/m²K"],
  ["Zona climatica D", "1,67 W/m²K"],
  ["Zona climatica E", "1,30 W/m²K"],
  ["Zona climatica F", "1,00 W/m²K"],
];

function tabellaTrasmittanza(): string {
  const rows = TRASMITTANZA
    .map(([zona, val]) => `<tr><td>${zona}</td><td class="num">${val}</td></tr>`)
    .join("");
  return `<table class="tbl tbl-trasm"><tbody>${rows}</tbody></table>`;
}

/** Massimali di spesa specifica (D.M. 06/08/2020, allegato I). */
function tabellaMassimali(): string {
  return `<table class="tbl tbl-mass">
  <tbody>
    <tr><td class="head" colspan="2">SOSTITUZIONE DI CHIUSURE TRASPARENTI COMPRENSIVE DI INFISSI</td></tr>
    <tr><td class="sub" colspan="2">Zone climatiche A, B e C</td></tr>
    <tr><td>Serramento</td><td class="num">660,00 €/m²</td></tr>
    <tr><td>Serramento + chiusura oscurante (persiana, tapparella, scuro)</td><td class="num">780,00 €/m²</td></tr>
    <tr><td class="sub" colspan="2">Zone climatiche D, E ed F</td></tr>
    <tr><td>Serramento</td><td class="num">780,00 €/m²</td></tr>
    <tr><td>Serramento + chiusura oscurante (persiana, tapparella, scuro)</td><td class="num">900,00 €/m²</td></tr>
    <tr><td class="head" colspan="2">INSTALLAZIONE DI SCHERMATURE SOLARI O SOLE CHIUSURE OSCURANTI</td></tr>
    <tr><td>Qualsiasi elemento e qualsiasi zona climatica</td><td class="num">276,00 €/m²</td></tr>
  </tbody>
</table>`;
}

/**
 * CSS del documento. Ogni selettore è annidato sotto `.dichiarazione-doc`:
 * il body viene iniettato anche dentro l'app React per l'anteprima, e regole
 * globali su `p`/`h1` sfonderebbero il resto della pagina.
 */
const CSS = `
.dichiarazione-doc { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; background: #fff; line-height: 1.5; max-width: 210mm; margin: 0 auto; padding: 20mm; box-sizing: border-box; }
.dichiarazione-doc h1 { font-size: 14pt; text-align: center; font-weight: bold; margin: 0 0 4px; }
.dichiarazione-doc h2 { font-size: 13pt; text-align: center; font-weight: bold; margin: 24px 0; }
.dichiarazione-doc .subtitle { text-align: center; font-style: italic; font-size: 9pt; margin-bottom: 24px; line-height: 1.4; }
.dichiarazione-doc p { margin: 0 0 12px; line-height: 1.5; }
.dichiarazione-doc strong { font-weight: bold; }
.dichiarazione-doc .section-title { font-weight: 600; margin: 12px 0 8px; }
.dichiarazione-doc .cb { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; }
.dichiarazione-doc .cb .box { display: inline-block; width: 14px; height: 14px; border: 1px solid #000; text-align: center; font-size: 10px; line-height: 13px; font-weight: bold; flex-shrink: 0; margin-top: 3px; }
.dichiarazione-doc .tbl { border-collapse: collapse; font-size: 10pt; margin: 16px 0; }
.dichiarazione-doc .tbl td { border: 1px solid #999; padding: 6px 10px; }
.dichiarazione-doc .tbl .num { text-align: right; white-space: nowrap; }
.dichiarazione-doc .tbl-trasm { width: 60%; margin-left: auto; margin-right: auto; }
.dichiarazione-doc .tbl-mass { width: 100%; }
.dichiarazione-doc .tbl-mass .head { background: #ececec; text-align: center; font-variant: small-caps; }
.dichiarazione-doc .tbl-mass .sub { background: #f7f7f7; color: #555; }
.dichiarazione-doc .firma { margin-top: 56px; }
.dichiarazione-doc .firma .riga { border-top: 1px solid #000; width: 60mm; margin-top: 28px; }
`.trim();

/**
 * Corpo del documento (CSS incluso, tutto sotto `.dichiarazione-doc`).
 * Iniettato in pagina per l'anteprima e riusato dal documento standalone, così
 * quello che il super_admin vede è esattamente quello che viene salvato.
 */
export function renderDichiarazioneBody(data: DichiarazioneTecnicaData): string {
  const cliente = `${(data.cliente_nome ?? "").trim()} ${(data.cliente_cognome ?? "").trim()}`.trim();

  return `<style>${CSS}</style>
<div class="dichiarazione-doc">
<h1>DICHIARAZIONE REQUISITI TECNICI</h1>
<p class="subtitle">Dichiarazione sostitutiva di atto di notorietà (articoli 47, 75, 76 del D.P.R. n. 445 del 28 Dicembre 2000) resa in sostituzione del tecnico abilitato (art. 8 comma 1 e all'allegato A, punto 2.1 Decreto requisiti tecnici anno 2020).</p>

<p>La <strong>${v(data.azienda_nome)}</strong> con sede legale a <strong>${v(data.azienda_citta, "______")} (${v(data.azienda_provincia, "__")})</strong> in <strong>${v(data.azienda_via, "______")}</strong> numero <strong>${v(data.azienda_civico, "__")}</strong>, Partita IVA <strong>${v(data.azienda_piva)}</strong>.</p>

<p>Dichiara che ha eseguito un intervento di fornitura e/o installazione di infissi e accessori e/o fornitura e/o installazione di schermature solari e accessori presso l'immobile sito a <strong>${v(data.immobile_citta, "______")} (${v(data.immobile_provincia, "__")})</strong> Cap <strong>${v(data.immobile_cap, "_____")}</strong>, in <strong>${v(data.immobile_via, "______")}</strong> numero <strong>${v(data.immobile_civico, "__")}</strong>, su richiesta del/della Sig./Sig.ra <strong>${cliente ? escapeHtml(cliente) : "_______________"}</strong>, residente a <strong>${v(data.cliente_citta, "______")}</strong> in <strong>${v(data.cliente_via, "______")}</strong> numero <strong>${v(data.cliente_civico, "__")}</strong>, C.F. <strong>${v(data.cliente_cf)}</strong>.</p>

<h2>DICHIARA CHE</h2>

<p>Il beneficiario della detrazione ha dichiarato di possedere tutti i requisiti fiscali e tecnici di legge per accedere alla detrazione fiscale.</p>

<p class="section-title">Il prodotto installato (infissi e accessori) rispetta le seguenti caratteristiche tecniche:</p>
${cb(data.caratteristiche_infissi.rispetta_trasmittanza, `Rispetta i valori di trasmittanza minimi definiti dal D.M. 26/06/2015 ("requisiti minimi") e dal D.M. 06/08/2020 ("requisiti tecnici ecobonus") e dalla norma UNI EN ISO 10077-1.`)}
${tabellaTrasmittanza()}

<p class="section-title">Il prodotto installato (schermature solari) rispetta le seguenti caratteristiche tecniche:</p>
${cb(data.caratteristiche_schermature.norma_en, "È una schermatura solare mobile a norma EN 13561 o EN 13659.")}
${cb(data.caratteristiche_schermature.marchiatura_ce, "È dotata di marchiatura CE.")}
${cb(data.caratteristiche_schermature.gtot_inferiore, "Presenta un valore GTOT inferiore a 0,35.")}
${cb(data.caratteristiche_schermature.esposizione, "È esposta da EST a OVEST passando per il SUD.")}
${cb(data.caratteristiche_schermature.superficie_vetrata, "Protegge una superficie vetrata.")}
${cb(data.caratteristiche_schermature.solidale_edificio, "È applicata in modo solidale all'edificio.")}

<h2>DICHIARA INOLTRE CHE</h2>

${cb(data.importo_congruo, "L'importo riportato in fattura rispetta i massimali indicati in tabella e risulta congruo e detraibile, tenendo conto che la normativa consente di aggiungere all'importo relativo ai massimali detraibili i costi che riguardano le opere relative all'installazione e la manodopera, le prestazioni professionali e la quota IVA.")}
${tabellaMassimali()}
${cb(data.lavori_ultimati, "I lavori sono stati regolarmente eseguiti ed ultimati.")}

<div class="firma">
  <p>Timbro e firma del fornitore</p>
  <div class="riga"></div>
</div>
</div>`;
}

/** Documento standalone salvato in storage e stampabile dal browser. */
export function renderDichiarazioneHtml(data: DichiarazioneTecnicaData): string {
  const cliente = `${(data.cliente_nome ?? "").trim()} ${(data.cliente_cognome ?? "").trim()}`.trim();
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dichiarazione Requisiti Tecnici${cliente ? ` — ${escapeHtml(cliente)}` : ""}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { margin: 0; background: #fff; }
  @media print { .dichiarazione-doc { padding: 0 !important; } }
</style>
</head>
<body>
${renderDichiarazioneBody(data)}
</body>
</html>`;
}
