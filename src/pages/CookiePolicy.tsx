import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

/**
 * /cookie-policy — Informativa cookie conforme a:
 *  - GDPR (Reg. UE 2016/679)
 *  - Direttiva ePrivacy (2002/58/CE)
 *  - Linee guida Garante Privacy "Cookie e altri strumenti di tracciamento"
 *    (provvedimento del 10 giugno 2021)
 */

export default function CookiePolicy() {
  return (
    <>
      <SEO
        title="Cookie Policy | Pratica Rapida"
        description="Informativa sull'uso dei cookie sul sito Pratica Rapida. Cookie tecnici, analitici e funzionali: cosa sono e come gestirli."
        canonical="/cookie-policy"
        noindex={false}
      />
      <Navbar />
      <div className="min-h-screen bg-white text-gray-800">
        <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Torna alla Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">Cookie Policy</h1>
          <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: 20 maggio 2026</p>

          <div className="space-y-8 text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Cosa sono i cookie</h2>
              <p>I cookie sono piccoli file di testo che vengono memorizzati sul dispositivo dell'utente quando visita un sito web. Permettono al sito di ricordare le azioni e le preferenze dell'utente per un certo periodo di tempo, migliorando l'esperienza di navigazione.</p>
              <p className="mt-2">La presente informativa è resa ai sensi dell'art. 13 del Regolamento UE 2016/679 (GDPR), della Direttiva ePrivacy (2002/58/CE) e delle Linee guida del Garante Privacy in materia di cookie e altri strumenti di tracciamento (provvedimento del 10 giugno 2021).</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Titolare del trattamento</h2>
              <p><strong>Pratica Rapida S.r.l.s.</strong>, sede legale in Lissone (MB), P.IVA 03937130791. Email: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Categorie di cookie utilizzati</h2>
              <p className="mb-4">Il sito <strong>praticarapida.it</strong> e l'applicazione <strong>app.praticarapida.it</strong> utilizzano le seguenti categorie di cookie:</p>

              <div className="space-y-4">
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Necessari · No consenso</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Cookie tecnici e di sessione</h3>
                  <p className="text-sm mb-3">Essenziali per il corretto funzionamento del portale. Permettono autenticazione, mantenimento della sessione, sicurezza CSRF e memorizzazione delle preferenze base. <strong>Non richiedono il consenso dell'utente</strong> ai sensi dell'art. 122 del Codice Privacy.</p>
                  <div className="text-xs space-y-1 bg-gray-50 rounded p-3 font-mono">
                    <p><strong>sb-access-token</strong> · Supabase · Sessione · Token di autenticazione</p>
                    <p><strong>sb-refresh-token</strong> · Supabase · 30 giorni · Refresh autenticazione</p>
                    <p><strong>__cf_bm</strong> · Cloudflare · 30 minuti · Bot management</p>
                    <p><strong>cf_clearance</strong> · Cloudflare · 30 giorni · Anti-DDoS</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Funzionali · No consenso</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Cookie funzionali</h3>
                  <p className="text-sm mb-3">Memorizzano preferenze dell'utente per offrire un'esperienza personalizzata (es. tema chiaro/scuro, banner già visti, lingua preferita). Trattati come tecnici quando il loro uso è limitato a memorizzare scelte effettuate dall'utente.</p>
                  <div className="text-xs space-y-1 bg-gray-50 rounded p-3 font-mono">
                    <p><strong>theme-preference</strong> · LocalStorage · Persistente · Tema chiaro/scuro</p>
                    <p><strong>notifications-seen</strong> · LocalStorage · Persistente · Banner già letti</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Analitici anonimi · Consenso opzionale</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Cookie analitici</h3>
                  <p className="text-sm">Raccolgono informazioni anonime e aggregate sull'utilizzo del sito (pagine visitate, tempo di permanenza, provenienza del traffico). I dati non sono collegabili a singoli utenti e vengono utilizzati esclusivamente per migliorare il servizio. Sono trattati come cookie tecnici quando configurati con IP anonimizzato e senza incrocio con altri dati.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Cookie di terze parti</h2>
              <p className="mb-3">Il sito utilizza servizi di terze parti che possono installare cookie propri:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left p-3 border-b border-gray-200">Servizio</th>
                      <th className="text-left p-3 border-b border-gray-200">Finalità</th>
                      <th className="text-left p-3 border-b border-gray-200">Informativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-gray-100"><strong>Supabase</strong></td>
                      <td className="p-3 border-b border-gray-100">Autenticazione e gestione sessione</td>
                      <td className="p-3 border-b border-gray-100"><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">supabase.com/privacy</a></td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100"><strong>Cloudflare</strong></td>
                      <td className="p-3 border-b border-gray-100">Sicurezza, anti-DDoS, performance</td>
                      <td className="p-3 border-b border-gray-100"><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">cloudflare.com/privacypolicy</a></td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100"><strong>Meta / WhatsApp</strong></td>
                      <td className="p-3 border-b border-gray-100">Solo lato comunicazioni WhatsApp Business (non cookie web)</td>
                      <td className="p-3"><a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">whatsapp.com/legal</a></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">Pratica Rapida non utilizza pixel Meta/Facebook, Google Analytics, strumenti pubblicitari di profilazione o cookie di marketing.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Gestione del consenso</h2>
              <p>Al primo accesso al sito viene mostrato un banner che consente di accettare, rifiutare o personalizzare le scelte sui cookie non strettamente necessari. La scelta dell'utente viene salvata in un cookie tecnico per evitare di richiederla nuovamente nelle visite successive.</p>
              <p className="mt-2">Puoi modificare in qualsiasi momento le tue preferenze cliccando sul link <strong>"Gestisci cookie"</strong> presente in fondo a ogni pagina, oppure cancellando i cookie dal tuo browser e riaccedendo al sito.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Disattivazione dei cookie dal browser</h2>
              <p className="mb-3">Puoi gestire le preferenze sui cookie direttamente dalle impostazioni del tuo browser:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Chrome:</strong> Impostazioni → Privacy e sicurezza → Cookie e altri dati dei siti</li>
                <li><strong>Firefox:</strong> Impostazioni → Privacy e sicurezza → Cookie e dati dei siti</li>
                <li><strong>Safari:</strong> Preferenze → Privacy → Gestisci dati dei siti</li>
                <li><strong>Edge:</strong> Impostazioni → Cookie e autorizzazioni siti</li>
              </ul>
              <p className="mt-3 text-sm text-gray-500">Nota: la disabilitazione dei cookie tecnici compromette il corretto funzionamento del portale e impedisce l'accesso all'area riservata.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Diritti dell'interessato</h2>
              <p>In quanto interessato, hai tutti i diritti previsti dagli artt. 15-22 del GDPR (accesso, rettifica, cancellazione, limitazione, portabilità, opposizione). Per esercitarli consulta la nostra <Link to="/privacy-policy" className="text-[#00843D] underline">Privacy Policy</Link> o scrivi a <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Modifiche alla presente informativa</h2>
              <p>Ci riserviamo di aggiornare questa Cookie Policy in qualsiasi momento. La versione aggiornata sarà sempre disponibile su questa pagina con la data di ultima revisione indicata in cima.</p>
            </section>

            <section className="border-t border-gray-200 pt-6 mt-10">
              <p className="text-sm text-gray-500">
                <strong>Pratica Rapida S.r.l.s.</strong> · Sede legale: Lissone (MB) · P.IVA 03937130791 · Email: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Consulta anche i nostri <Link to="/termini" className="text-[#00843D] underline">Termini di Servizio</Link> e la <Link to="/privacy-policy" className="text-[#00843D] underline">Privacy Policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
