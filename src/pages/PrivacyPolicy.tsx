import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy | Pratica Rapida"
        description="Informativa sul trattamento dei dati personali di Pratica Rapida S.r.l.s. ai sensi del GDPR (Reg. UE 2016/679)."
        canonical="/privacy-policy"
        noindex={false}
      />
      <Navbar />
      <div className="min-h-screen bg-white text-gray-800">
        <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Torna alla Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">Privacy Policy</h1>
          <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: marzo 2026</p>

          <div className="space-y-8 text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Titolare del trattamento</h2>
              <p>Il titolare del trattamento dei dati personali è <strong>Pratica Rapida S.r.l.s.</strong>, con sede legale in Lissone (MB), P.IVA 03937130791. Per qualsiasi comunicazione relativa alla privacy scrivere a: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Dati raccolti e finalità</h2>
              <p className="mb-3">Raccogliamo i dati personali strettamente necessari a erogare il servizio di gestione pratiche ENEA e Conto Termico:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li><strong>Dati dell'installatore/rivenditore:</strong> nome, cognome, ragione sociale, P.IVA, email, numero di telefono. Finalità: creazione account, comunicazioni operative, fatturazione.</li>
                <li><strong>Dati del cliente finale:</strong> nome, cognome, codice fiscale, indirizzo dell'immobile, dati catastali. Finalità: compilazione e trasmissione della pratica all'ente competente (ENEA o Gestore Servizi Energetici).</li>
                <li><strong>Dati di navigazione:</strong> indirizzo IP, tipo di browser, pagine visitate. Finalità: sicurezza della piattaforma e analisi aggregate anonime.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Base giuridica del trattamento</h2>
              <p>Il trattamento è basato su: (a) esecuzione del contratto di servizio (art. 6 par. 1 lett. b GDPR); (b) adempimento di obblighi legali (art. 6 par. 1 lett. c GDPR); (c) legittimo interesse del titolare per la sicurezza e il miglioramento del servizio (art. 6 par. 1 lett. f GDPR).</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Conservazione dei dati</h2>
              <p>I dati vengono conservati per il tempo strettamente necessario agli scopi per cui sono stati raccolti, e comunque non oltre 10 anni dalla chiusura del rapporto contrattuale, salvo obblighi di legge che impongano periodi più lunghi (es. normativa fiscale e civilistica vigente).</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Condivisione con terzi</h2>
              <p className="mb-3">I dati personali non vengono venduti né ceduti a terzi per finalità commerciali. Possono essere comunicati a:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Enti istituzionali (ENEA, GSE) per la trasmissione delle pratiche;</li>
                <li>Fornitori tecnici (hosting, email transazionale) che agiscono come responsabili del trattamento ai sensi dell'art. 28 GDPR;</li>
                <li>Autorità competenti qualora richiesto dalla legge.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Diritti dell'interessato</h2>
              <p className="mb-3">Ai sensi degli artt. 15–22 del GDPR (Reg. UE 2016/679), hai il diritto di:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Accedere ai tuoi dati personali;</li>
                <li>Ottenerne la rettifica o la cancellazione ("diritto all'oblio");</li>
                <li>Limitare o opporti al trattamento;</li>
                <li>Ricevere i dati in formato portabile;</li>
                <li>Revocare il consenso in qualsiasi momento;</li>
                <li>Proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">www.garanteprivacy.it</a>).</li>
              </ul>
              <p className="mt-3">Per esercitare questi diritti scrivi a <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookie</h2>
              <p>Per informazioni dettagliate sull'uso dei cookie consulta la nostra <Link to="/cookie-policy" className="text-[#00843D] underline">Cookie Policy</Link>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Modifiche alla presente informativa</h2>
              <p>Ci riserviamo di aggiornare questa informativa in qualsiasi momento. La versione aggiornata sarà sempre disponibile su questa pagina con la data di ultima revisione indicata in cima.</p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
