import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";

export default function CookiePolicy() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white text-gray-800">
        <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Torna alla Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">Cookie Policy</h1>
          <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: marzo 2026</p>

          <div className="space-y-8 text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Cosa sono i cookie</h2>
              <p>I cookie sono piccoli file di testo che vengono memorizzati sul dispositivo dell'utente quando visita un sito web. Permettono al sito di ricordare le azioni e le preferenze dell'utente per un certo periodo di tempo, migliorando l'esperienza di navigazione.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Cookie utilizzati da questo sito</h2>
              <p className="mb-4">Il sito <strong>praticarapida.it</strong> utilizza le seguenti categorie di cookie:</p>

              <div className="space-y-4">
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Necessari</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Cookie tecnici e di sessione</h3>
                  <p className="text-sm">Essenziali per il corretto funzionamento del portale. Includono i token di autenticazione, le preferenze di sessione e le impostazioni di sicurezza. Non richiedono il consenso dell'utente e non possono essere disattivati.</p>
                </div>

                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Analitici</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Cookie analitici anonimi</h3>
                  <p className="text-sm">Utilizzati per raccogliere informazioni anonime e aggregate sull'utilizzo del sito (pagine visitate, tempo di permanenza, provenienza del traffico). I dati non sono collegabili a singoli utenti e vengono utilizzati esclusivamente per migliorare il servizio.</p>
                </div>

                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">Funzionali</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Cookie funzionali</h3>
                  <p className="text-sm">Memorizzano le preferenze dell'utente (ad es. notifiche già viste, impostazioni del portale) per offrire un'esperienza personalizzata nelle visite successive.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Cookie di terze parti</h2>
              <p>Il sito può utilizzare servizi di terze parti che installano cookie propri, tra cui:</p>
              <ul className="list-disc pl-6 mt-3 space-y-2">
                <li><strong>Supabase</strong> — autenticazione e gestione sessioni utente;</li>
                <li><strong>Cloudflare</strong> — sicurezza e ottimizzazione delle performance;</li>
                <li>Eventuali strumenti di analisi anonima del traffico.</li>
              </ul>
              <p className="mt-3">Per maggiori informazioni sui cookie di terze parti, consultare le rispettive informative privacy.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Gestione e disattivazione dei cookie</h2>
              <p className="mb-3">Puoi gestire le preferenze sui cookie direttamente dalle impostazioni del tuo browser:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Chrome:</strong> Impostazioni → Privacy e sicurezza → Cookie e altri dati dei siti</li>
                <li><strong>Firefox:</strong> Impostazioni → Privacy e sicurezza → Cookie e dati dei siti</li>
                <li><strong>Safari:</strong> Preferenze → Privacy → Gestisci dati dei siti</li>
                <li><strong>Edge:</strong> Impostazioni → Cookie e autorizzazioni siti</li>
              </ul>
              <p className="mt-3 text-sm text-gray-500">Nota: la disabilitazione dei cookie tecnici potrebbe compromettere il corretto funzionamento del portale e impedire l'accesso all'area riservata.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Contatti</h2>
              <p>Per qualsiasi domanda relativa alla presente Cookie Policy o al trattamento dei dati personali, contattaci a:</p>
              <p className="mt-2 font-medium text-gray-900">
                <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>
              </p>
              <p className="mt-2 text-sm">Consulta anche la nostra <Link to="/privacy-policy" className="text-[#00843D] underline">Privacy Policy</Link> per le informazioni complete sul trattamento dei dati.</p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
