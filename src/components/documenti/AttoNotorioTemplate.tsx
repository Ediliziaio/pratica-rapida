/**
 * AttoNotorioTemplate — render del documento "Dichiarazione Sostitutiva di
 * Atto Notorio del Beneficiario della Detrazione".
 *
 * NON è auto-compilato: il rivenditore lo scarica e lo fa firmare al cliente
 * (perché in fase di intake non sa ancora chi sarà il beneficiario). Per ogni
 * intervento (serramenti, schermature, pompe di calore, ecc.).
 */

interface Checkbox {
  checked: boolean;
  label: string;
}

function Cb({ label }: Checkbox) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="inline-block w-4 h-4 border border-black flex-shrink-0 mt-0.5" />
      <span className="leading-snug">{label}</span>
    </div>
  );
}

export default function AttoNotorioTemplate() {
  return (
    <div className="atto-notorio bg-white text-black mx-auto" style={{
      maxWidth: "210mm",
      padding: "20mm",
      fontFamily: "'Times New Roman', Times, serif",
      fontSize: "11pt",
      lineHeight: 1.6,
    }}>
      <h1 className="text-center font-bold mb-2" style={{ fontSize: "13pt" }}>
        DICHIARAZIONE SOSTITUTIVA DI ATTO NOTORIO
        <br />
        DEL BENEFICIARIO DELLA DETRAZIONE
      </h1>
      <p className="text-center text-xs italic mb-6">
        Ai sensi degli articoli 46 e 47, D.P.R. 28 Dicembre 2000, n. 445
      </p>

      <p className="mb-4 leading-relaxed">
        Il sottoscritto <span className="inline-block border-b border-black min-w-[200px]">&nbsp;</span>{" "}
        (Nome e cognome) nato a <span className="inline-block border-b border-black min-w-[120px]">&nbsp;</span>{" "}
        (città) provincia di <span className="inline-block border-b border-black min-w-[40px]">&nbsp;</span>{" "}
        (sigla) il <span className="inline-block border-b border-black min-w-[100px]">&nbsp;</span>{" "}
        (data di nascita), codice fiscale{" "}
        <span className="inline-block border-b border-black min-w-[180px]">&nbsp;</span>.
      </p>

      <p className="mb-4 leading-relaxed text-sm italic">
        Consapevole che in caso di dichiarazioni mendaci viola il codice penale e delle leggi in
        materia (art. 76 del D.P.R. 445/2000).
      </p>

      <p className="mb-4 leading-relaxed">
        Riferendosi all'immobile oggetto dell'intervento interessato alla detrazione fiscale
      </p>

      <h2 className="text-center font-bold my-6" style={{ fontSize: "12pt" }}>
        DICHIARA
      </h2>

      <p className="text-sm italic mb-2">(segnare una sola voce delle seguenti)</p>

      <Cb checked={false} label="L'immobile oggetto dell'intervento è l'abitazione principale detenuta in qualità di proprietario o comunque di altro diritto reale di godimento regolarmente registrato, anche in qualità di familiare convivente del possessore o del detentore." />

      <Cb checked={false} label="L'immobile oggetto dell'intervento è una abitazione secondaria detenuta in qualità di proprietario o comunque di altro diritto reale di godimento regolarmente registrato." />

      <p className="mt-6 mb-4 leading-relaxed">
        Ed è in possesso di tutti i requisiti previsti dalla normativa per poter accedere alle
        detrazioni fiscali.
      </p>

      {/* Firma */}
      <div className="mt-16 pt-8">
        <div className="flex justify-between items-end gap-8">
          <div className="flex-1">
            <p className="text-sm border-t border-black pt-1">Luogo e data</p>
          </div>
          <div className="flex-1">
            <p className="text-sm border-t border-black pt-1">Firma</p>
          </div>
        </div>
      </div>
    </div>
  );
}
