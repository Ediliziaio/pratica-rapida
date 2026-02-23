import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/home" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Torna alla Home
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: 23 febbraio 2026</p>

        <div className="space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Cosa sono i cookie</h2>
            <p>I cookie sono piccoli file di testo che vengono memorizzati sul dispositivo dell'utente quando visita un sito web. Servono a migliorare l'esperienza di navigazione e a fornire informazioni al proprietario del sito.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Cookie utilizzati</h2>
            <p>Il nostro sito utilizza le seguenti categorie di cookie:</p>
            <div className="mt-4 space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Cookie tecnici (necessari)</h3>
                <p className="text-sm">Essenziali per il funzionamento del sito. Includono cookie di sessione e di autenticazione. Non richiedono il consenso dell'utente.</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Cookie analitici</h3>
                <p className="text-sm">Utilizzati per raccogliere informazioni in forma anonima e aggregata sull'utilizzo del sito, al fine di migliorare il servizio offerto.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Gestione dei cookie</h2>
            <p>L'utente può gestire le preferenze sui cookie direttamente dalle impostazioni del proprio browser. La disabilitazione dei cookie tecnici potrebbe compromettere alcune funzionalità del sito.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Cookie di terze parti</h2>
            <p>Il sito potrebbe utilizzare servizi di terze parti che installano cookie propri (ad es. strumenti di analisi). Per maggiori informazioni, consultare le rispettive informative privacy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Contatti</h2>
            <p>Per qualsiasi domanda relativa alla presente Cookie Policy, contattarci a:</p>
            <p className="mt-2 font-medium">modulistica@praticarapida.it | +39 351 7935227</p>
          </section>
        </div>
      </div>
    </div>
  );
}
