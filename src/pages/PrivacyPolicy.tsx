import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/home" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Torna alla Home
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: 23 febbraio 2026</p>

        <div className="space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Titolare del trattamento</h2>
            <p>Il titolare del trattamento dei dati è Pratica Rapida, con sede in Lissone (MB), P.IVA 03937130791. Per qualsiasi comunicazione relativa alla privacy è possibile scrivere a: <a href="mailto:modulistica@praticarapida.it" className="text-[#00843D] underline">modulistica@praticarapida.it</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Dati raccolti</h2>
            <p>Raccogliamo i seguenti dati personali forniti volontariamente dall'utente:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Nome, cognome, indirizzo email</li>
              <li>Numero di telefono</li>
              <li>Ragione sociale e P.IVA (per utenti aziendali)</li>
              <li>Dati catastali e documentazione tecnica (per le pratiche ENEA)</li>
            </ul>
            <p className="mt-3">Raccogliamo inoltre dati di navigazione in forma anonima e aggregata tramite strumenti analitici.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Finalità del trattamento</h2>
            <p>I dati vengono trattati per le seguenti finalità:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Erogazione del servizio di gestione pratiche ENEA</li>
              <li>Comunicazioni relative al servizio</li>
              <li>Adempimenti fiscali e contabili</li>
              <li>Miglioramento del servizio e analisi statistiche anonime</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Base giuridica</h2>
            <p>Il trattamento si fonda sull'esecuzione del contratto di servizio, sugli obblighi di legge e, ove applicabile, sul consenso dell'interessato.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Conservazione dei dati</h2>
            <p>I dati personali vengono conservati per il tempo necessario all'erogazione del servizio e comunque non oltre i termini previsti dalla normativa fiscale e civilistica vigente.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Diritti dell'interessato</h2>
            <p>Ai sensi degli artt. 15-22 del GDPR (Regolamento UE 2016/679), l'interessato ha il diritto di:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Accedere ai propri dati personali</li>
              <li>Richiederne la rettifica o la cancellazione</li>
              <li>Limitare o opporsi al trattamento</li>
              <li>Richiedere la portabilità dei dati</li>
              <li>Revocare il consenso in qualsiasi momento</li>
            </ul>
            <p className="mt-3">Per esercitare tali diritti, scrivere a <a href="mailto:modulistica@praticarapida.it" className="text-[#00843D] underline">modulistica@praticarapida.it</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contatti</h2>
            <p>Per qualsiasi domanda relativa alla presente Privacy Policy, contattarci a:</p>
            <p className="mt-2 font-medium">modulistica@praticarapida.it | +39 351 7935227</p>
          </section>
        </div>
      </div>
    </div>
  );
}
