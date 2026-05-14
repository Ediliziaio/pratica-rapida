/**
 * DichiarazioneTecnicaTemplate — render del documento "Dichiarazione Requisiti
 * Tecnici" precompilato con i dati del fornitore (azienda rivenditrice) e del
 * cliente finale (intestatario detrazione).
 *
 * Stile: stampabile A4, font serif, layout official document.
 * Usato sia per:
 *  - anteprima nel admin (PracticeDetailSheet → Documenti precompilati)
 *  - generazione PDF via window.print() con @media print rules
 */

export interface DichiarazioneTecnicaData {
  // Dati fornitore (azienda rivenditrice)
  azienda_nome: string;
  azienda_citta: string;
  azienda_provincia: string;
  azienda_via: string;
  azienda_civico: string;
  azienda_piva: string;

  // Dati immobile/cliente
  immobile_citta: string;
  immobile_provincia: string;
  immobile_cap: string;
  immobile_via: string;
  immobile_civico: string;

  // Dati cliente finale
  cliente_nome: string;
  cliente_cognome: string;
  cliente_citta: string;
  cliente_via: string;
  cliente_civico: string;
  cliente_cf: string;

  // Caratteristiche intervento — checkbox configurabili dal superadmin
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

  // Importo fattura inserito a mano dal superadmin prima della conferma
  importo_fattura?: number | null;

  // Tipo intervento
  tipo_intervento: "infissi" | "schermature" | "entrambi";

  // Generata il
  data_documento?: string;
}

/** Format Euro per il documento. */
export function formatEuro(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "_______________";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

interface Props {
  data: DichiarazioneTecnicaData;
}

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="inline-block w-4 h-4 border border-black flex-shrink-0 mt-0.5 text-center text-xs font-bold leading-[14px]">
        {checked ? "X" : ""}
      </span>
      <span className="leading-snug">{label}</span>
    </div>
  );
}

export default function DichiarazioneTecnicaTemplate({ data }: Props) {
  const showInfissi = data.tipo_intervento === "infissi" || data.tipo_intervento === "entrambi";
  const showSchermature = data.tipo_intervento === "schermature" || data.tipo_intervento === "entrambi";

  return (
    <div className="dichiarazione-tecnica bg-white text-black mx-auto" style={{
      maxWidth: "210mm",
      padding: "20mm",
      fontFamily: "'Times New Roman', Times, serif",
      fontSize: "11pt",
      lineHeight: 1.5,
    }}>
      {/* Titolo */}
      <h1 className="text-center font-bold mb-1" style={{ fontSize: "14pt" }}>
        DICHIARAZIONE REQUISITI TECNICI
      </h1>
      <p className="text-center text-xs italic mb-5">
        Dichiarazione sostitutiva di atto di notorietà (articoli 47, 75, 76 del D.P.R. n. 445 del 28 Dicembre 2000)
        resa in sostituzione del tecnico abilitato (art. 8 comma 1 e all'allegato A, punto 2.1 Decreto requisiti tecnici anno 2020)
      </p>

      {/* Intro */}
      <p className="mb-3 leading-relaxed">
        La <strong>{data.azienda_nome || "_______________"}</strong> con sede legale a{" "}
        <strong>{data.azienda_citta || "______"} ({data.azienda_provincia || "__"})</strong> in via{" "}
        <strong>{data.azienda_via || "______"}</strong> numero <strong>{data.azienda_civico || "__"}</strong>,
        Partita IVA <strong>{data.azienda_piva || "_______________"}</strong>
      </p>

      <p className="mb-3 leading-relaxed">
        Dichiara che ha eseguito un intervento di fornitura e/o installazione di infissi e accessori e/o
        fornitura e/o installazione di schermature solari e accessori presso l'immobile sito a{" "}
        <strong>{data.immobile_citta || "______"} ({data.immobile_provincia || "__"})</strong>{" "}
        Cap <strong>{data.immobile_cap || "_____"}</strong> in via <strong>{data.immobile_via || "______"}</strong>{" "}
        numero <strong>{data.immobile_civico || "__"}</strong> su richiesta del/della Sig./Sig.ra{" "}
        <strong>{(data.cliente_nome + " " + data.cliente_cognome).trim() || "_______________"}</strong>{" "}
        residente a <strong>{data.cliente_citta || "______"}</strong> in via{" "}
        <strong>{data.cliente_via || "______"}</strong> numero <strong>{data.cliente_civico || "__"}</strong>,
        C.F. <strong>{data.cliente_cf || "_______________"}</strong>.
      </p>

      <h2 className="text-center font-bold my-5" style={{ fontSize: "13pt" }}>
        DICHIARA CHE
      </h2>

      <p className="mb-3">
        Il beneficiario della detrazione ha dichiarato di possedere tutti i requisiti fiscali e
        tecnici di legge per accedere alla detrazione fiscale.
      </p>

      {showInfissi && (
        <>
          <p className="mb-2 font-semibold">
            Il prodotto installato (infissi e accessori) rispetta le seguenti caratteristiche tecniche:
          </p>
          <Checkbox
            checked={data.caratteristiche_infissi.rispetta_trasmittanza}
            label={`Rispetta i valori di trasmittanza minimi definiti dal D.M. 26/06/2015 ("requisiti minimi") e dal D.M. 06/08/2020 ("requisiti tecnici ecobonus") e dalla norma UNI EN ISO 10077-1`}
          />
        </>
      )}

      {showSchermature && (
        <div className="mt-4">
          <p className="mb-2 font-semibold">
            Il prodotto installato (schermature solari) rispetta le seguenti caratteristiche tecniche:
          </p>
          <Checkbox checked={data.caratteristiche_schermature.norma_en} label="È una schermatura solare mobile a norma EN 13561 o EN 13659" />
          <Checkbox checked={data.caratteristiche_schermature.marchiatura_ce} label="È dotata di marchiatura CE" />
          <Checkbox checked={data.caratteristiche_schermature.gtot_inferiore} label="Presenta un valore GTOT inferiore a 0,35" />
          <Checkbox checked={data.caratteristiche_schermature.esposizione} label="È esposta da EST a OVEST passando per il SUD" />
          <Checkbox checked={data.caratteristiche_schermature.superficie_vetrata} label="Protegge una superficie vetrata" />
          <Checkbox checked={data.caratteristiche_schermature.solidale_edificio} label="È applicata in modo solidale all'edificio" />
        </div>
      )}

      <h2 className="text-center font-bold my-5" style={{ fontSize: "13pt" }}>
        DICHIARA INOLTRE CHE
      </h2>

      <Checkbox
        checked={data.importo_congruo}
        label="L'importo riportato in fattura rispetta i massimali indicati in tabella e risulta congruo e detraibile, tenendo conto che la normativa consente di aggiungere all'importo relativo ai massimali detraibili i costi che riguardano le opere relative all'installazione e la manodopera, le prestazioni professionali e la quota IVA."
      />

      {/* Importo fattura — inserito a mano dal superadmin prima della conferma */}
      <p className="my-3 pl-6">
        L'importo totale della fattura è di <strong>{formatEuro(data.importo_fattura)}</strong>.
      </p>

      <Checkbox checked={data.lavori_ultimati} label="I lavori sono stati regolarmente eseguiti ed ultimati." />

      {/* Firma */}
      <div className="mt-12 pt-8">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-sm">{data.data_documento ?? new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="text-center">
            <p className="border-t border-black pt-1 px-12 text-sm">Timbro e firma del fornitore</p>
          </div>
        </div>
      </div>
    </div>
  );
}
