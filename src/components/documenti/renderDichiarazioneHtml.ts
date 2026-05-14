/**
 * renderDichiarazioneHtml — produce una stringa HTML standalone, self-contained
 * (CSS inline), pronta da salvare in storage e poi stampabile/scaricabile come
 * PDF dal browser.
 *
 * Usata dal flow "Conferma e salva nella card" del Dichiarazione Tecnica Dialog:
 *  1. utente clicca "Conferma e salva"
 *  2. questa funzione produce HTML
 *  3. il blob HTML viene caricato nel bucket `documenti` di Supabase Storage
 *  4. una riga in tabella `documenti` con tipo='dichiarazione_tecnica' rende
 *     il documento visibile sia al super_admin sia al rivenditore tramite RLS
 *     (visibilita='azienda_interno')
 *
 * Tenuto separato dal React component (DichiarazioneTecnicaTemplate.tsx) per
 * generare una stringa HTML senza dipendere da React/ReactDOM server-side.
 */

import type { DichiarazioneTecnicaData } from "./DichiarazioneTecnicaTemplate";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtEuro(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "_______________";
  return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: "EUR", minimumFractionDigits: 2,
  }).format(n);
}

function cb(checked: boolean, label: string): string {
  return `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;">
    <span style="display:inline-block;width:14px;height:14px;border:1px solid #000;text-align:center;font-size:10px;line-height:13px;font-weight:bold;flex-shrink:0;margin-top:3px;">${checked ? "X" : ""}</span>
    <span style="line-height:1.4;">${escapeHtml(label)}</span>
  </div>`;
}

export function renderDichiarazioneHtml(data: DichiarazioneTecnicaData): string {
  const showInfissi = data.tipo_intervento === "infissi" || data.tipo_intervento === "entrambi";
  const showSchermature = data.tipo_intervento === "schermature" || data.tipo_intervento === "entrambi";
  const dataDocumento = data.data_documento
    ?? new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const clienteCompleto = `${escapeHtml(data.cliente_nome)} ${escapeHtml(data.cliente_cognome)}`.trim() || "_______________";

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dichiarazione Requisiti Tecnici — ${clienteCompleto}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; line-height: 1.5; max-width: 210mm; margin: 0 auto; padding: 20mm; background: #fff; }
  h1 { font-size: 14pt; text-align: center; font-weight: bold; margin: 0 0 4px; }
  h2 { font-size: 13pt; text-align: center; font-weight: bold; margin: 24px 0; }
  .subtitle { text-align: center; font-style: italic; font-size: 9pt; margin-bottom: 24px; }
  p { margin: 0 0 12px; line-height: 1.5; }
  strong { font-weight: bold; }
  .section-title { font-weight: 600; margin: 12px 0 8px; }
  .firma-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 64px; padding-top: 32px; }
  .firma-row .data { font-size: 10pt; }
  .firma-row .timbro { text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 10pt; padding-left: 48px; padding-right: 48px; }
  @media print {
    body { padding: 0; margin: 0; }
  }
</style>
</head>
<body>

<h1>DICHIARAZIONE REQUISITI TECNICI</h1>
<p class="subtitle">
Dichiarazione sostitutiva di atto di notorietà (articoli 47, 75, 76 del D.P.R. n. 445 del 28 Dicembre 2000)
resa in sostituzione del tecnico abilitato (art. 8 comma 1 e all'allegato A, punto 2.1 Decreto requisiti tecnici anno 2020)
</p>

<p>
La <strong>${escapeHtml(data.azienda_nome) || "_______________"}</strong> con sede legale a
<strong>${escapeHtml(data.azienda_citta) || "______"} (${escapeHtml(data.azienda_provincia) || "__"})</strong>
in via <strong>${escapeHtml(data.azienda_via) || "______"}</strong>
numero <strong>${escapeHtml(data.azienda_civico) || "__"}</strong>,
Partita IVA <strong>${escapeHtml(data.azienda_piva) || "_______________"}</strong>
</p>

<p>
Dichiara che ha eseguito un intervento di fornitura e/o installazione di infissi e accessori e/o
fornitura e/o installazione di schermature solari e accessori presso l'immobile sito a
<strong>${escapeHtml(data.immobile_citta) || "______"} (${escapeHtml(data.immobile_provincia) || "__"})</strong>
Cap <strong>${escapeHtml(data.immobile_cap) || "_____"}</strong>
in via <strong>${escapeHtml(data.immobile_via) || "______"}</strong>
numero <strong>${escapeHtml(data.immobile_civico) || "__"}</strong>
su richiesta del/della Sig./Sig.ra <strong>${clienteCompleto}</strong>
residente a <strong>${escapeHtml(data.cliente_citta) || "______"}</strong>
in via <strong>${escapeHtml(data.cliente_via) || "______"}</strong>
numero <strong>${escapeHtml(data.cliente_civico) || "__"}</strong>,
C.F. <strong>${escapeHtml(data.cliente_cf) || "_______________"}</strong>.
</p>

<h2>DICHIARA CHE</h2>

<p>Il beneficiario della detrazione ha dichiarato di possedere tutti i requisiti fiscali e
tecnici di legge per accedere alla detrazione fiscale.</p>

${showInfissi ? `
<p class="section-title">Il prodotto installato (infissi e accessori) rispetta le seguenti caratteristiche tecniche:</p>
${cb(data.caratteristiche_infissi.rispetta_trasmittanza,
  `Rispetta i valori di trasmittanza minimi definiti dal D.M. 26/06/2015 ("requisiti minimi") e dal D.M. 06/08/2020 ("requisiti tecnici ecobonus") e dalla norma UNI EN ISO 10077-1`)}
` : ""}

${showSchermature ? `
<p class="section-title">Il prodotto installato (schermature solari) rispetta le seguenti caratteristiche tecniche:</p>
${cb(data.caratteristiche_schermature.norma_en, "È una schermatura solare mobile a norma EN 13561 o EN 13659")}
${cb(data.caratteristiche_schermature.marchiatura_ce, "È dotata di marchiatura CE")}
${cb(data.caratteristiche_schermature.gtot_inferiore, "Presenta un valore GTOT inferiore a 0,35")}
${cb(data.caratteristiche_schermature.esposizione, "È esposta da EST a OVEST passando per il SUD")}
${cb(data.caratteristiche_schermature.superficie_vetrata, "Protegge una superficie vetrata")}
${cb(data.caratteristiche_schermature.solidale_edificio, "È applicata in modo solidale all'edificio")}
` : ""}

<h2>DICHIARA INOLTRE CHE</h2>

${cb(data.importo_congruo, `L'importo riportato in fattura rispetta i massimali indicati in tabella e risulta congruo e detraibile, tenendo conto che la normativa consente di aggiungere all'importo relativo ai massimali detraibili i costi che riguardano le opere relative all'installazione e la manodopera, le prestazioni professionali e la quota IVA.`)}

<p style="margin-left: 22px; margin-top: 8px;">L'importo totale della fattura è di <strong>${fmtEuro(data.importo_fattura)}</strong>.</p>

${cb(data.lavori_ultimati, "I lavori sono stati regolarmente eseguiti ed ultimati.")}

<div class="firma-row">
  <div class="data">${escapeHtml(dataDocumento)}</div>
  <div class="timbro">Timbro e firma del fornitore</div>
</div>

</body>
</html>`;
}
