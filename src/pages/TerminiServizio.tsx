import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

/**
 * /termini — Termini e Condizioni di Servizio di Pratica Rapida.
 *
 * Documento contrattuale tra Pratica Rapida S.r.l.s. e gli utenti del
 * servizio (installatori/rivenditori). Strutturato per essere conforme
 * al Codice del Consumo (B2C) e alla normativa italiana sui contratti
 * a distanza (D.Lgs. 70/2003).
 *
 * ⚠️ Template robusto ma richiede revisione legale prima del go-live
 * specie su clausole di responsabilità, recesso e foro competente.
 */

export default function TerminiServizio() {
  return (
    <>
      <SEO
        title="Termini di Servizio | Pratica Rapida"
        description="Termini e condizioni di utilizzo del servizio Pratica Rapida per la gestione di pratiche ENEA e Conto Termico."
        canonical="/termini"
        noindex={false}
      />
      <Navbar />
      <div className="min-h-screen bg-white text-gray-800">
        <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Torna alla Home
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">Termini di Servizio</h1>
          <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: 20 maggio 2026</p>

          <div className="space-y-8 text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Premessa e parti del contratto</h2>
              <p>I presenti Termini e Condizioni (di seguito "Termini") disciplinano l'utilizzo della piattaforma <strong>Pratica Rapida</strong> (di seguito il "Servizio"), erogata da <strong>Pratica Rapida S.r.l.s.</strong> (di seguito "Fornitore"), con sede legale in Lissone (MB), P.IVA e Codice Fiscale 03937130791, email <a href="mailto:info@praticarapida.it" className="text-[#00843D] underline">info@praticarapida.it</a>.</p>
              <p className="mt-2">La registrazione al Servizio e/o il suo utilizzo comporta accettazione integrale dei presenti Termini, della <Link to="/privacy-policy" className="text-[#00843D] underline">Privacy Policy</Link> e della <Link to="/cookie-policy" className="text-[#00843D] underline">Cookie Policy</Link>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Oggetto del Servizio</h2>
              <p>Pratica Rapida è una piattaforma SaaS (Software as a Service) destinata a installatori, rivenditori e aziende del settore edilizio per la gestione, la compilazione e la trasmissione di pratiche ENEA e Conto Termico, nonché per la comunicazione strutturata con i clienti finali tramite email e WhatsApp Business.</p>
              <p className="mt-2">Il Servizio include, a titolo esemplificativo e non esaustivo:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Compilazione assistita delle pratiche fiscali (ENEA, Conto Termico);</li>
                <li>Trasmissione delle pratiche agli enti competenti tramite gli strumenti messi a disposizione dall'utente;</li>
                <li>Gestione del flusso documentale e dei contatti con i clienti finali;</li>
                <li>Invio di comunicazioni email e WhatsApp template approvati;</li>
                <li>Automazioni per solleciti, conferme e follow-up;</li>
                <li>Reportistica e dashboard di monitoraggio.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Registrazione e account</h2>
              <p>L'accesso al Servizio richiede la creazione di un account fornendo dati veritieri, completi e aggiornati. L'utente è responsabile della custodia delle proprie credenziali e di ogni attività svolta tramite il proprio account.</p>
              <p className="mt-2">È vietato:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Creare account utilizzando dati di terzi senza autorizzazione;</li>
                <li>Condividere le credenziali con soggetti non autorizzati;</li>
                <li>Utilizzare l'account per finalità illecite o contrarie alle leggi vigenti;</li>
                <li>Tentare di accedere ad aree riservate o di compromettere la sicurezza del Servizio.</li>
              </ul>
              <p className="mt-2">L'utente si impegna a comunicare tempestivamente al Fornitore qualsiasi sospetto utilizzo non autorizzato del proprio account scrivendo a <a href="mailto:supporto@praticarapida.it" className="text-[#00843D] underline">supporto@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Piani, prezzi e fatturazione</h2>
              <p>Il Servizio è offerto secondo i piani tariffari e le condizioni economiche pubblicate sul sito <a href="https://www.praticarapida.it" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">www.praticarapida.it</a>, eventualmente personalizzabili in fase di adesione.</p>
              <p className="mt-2">I corrispettivi sono espressi in Euro al netto dell'IVA, dovuti in via anticipata secondo la periodicità del piano sottoscritto (mensile/annuale). Il pagamento avviene tramite gli strumenti messi a disposizione (carta di credito, addebito SEPA o bonifico bancario).</p>
              <p className="mt-2">In caso di mancato pagamento alla scadenza il Fornitore si riserva di sospendere l'accesso al Servizio previa comunicazione con preavviso di 7 giorni. Resta fermo l'obbligo di pagamento delle somme dovute.</p>
              <p className="mt-2">La fatturazione elettronica è emessa secondo la normativa vigente entro il giorno 15 del mese successivo al periodo di riferimento e trasmessa al Sistema di Interscambio (SDI).</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Durata, rinnovo e recesso</h2>
              <p>Il contratto ha durata pari al periodo del piano sottoscritto e si rinnova tacitamente per analogo periodo salvo disdetta comunicata con almeno 15 giorni di preavviso rispetto alla scadenza, da inviare a <a href="mailto:supporto@praticarapida.it" className="text-[#00843D] underline">supporto@praticarapida.it</a>.</p>
              <p className="mt-2">L'utente può recedere in qualsiasi momento dall'account; il recesso ha effetto al termine del periodo di fatturazione già pagato, senza diritto a rimborsi parziali salvo diverse pattuizioni.</p>
              <p className="mt-2"><strong>Diritto di recesso (clienti consumatori):</strong> nei casi in cui l'utente sia qualificabile come consumatore ai sensi del Codice del Consumo (D.Lgs. 206/2005), ha diritto di recedere senza penalità entro 14 giorni dalla conclusione del contratto, salvo che il Servizio sia stato già fruito con espresso consenso al venir meno del diritto (art. 59 c. 1 lett. o Codice del Consumo).</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Obblighi dell'utente</h2>
              <p>L'utente si impegna a:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Utilizzare il Servizio in conformità alle leggi vigenti e ai presenti Termini;</li>
                <li>Inserire dati veritieri, completi e aggiornati relativi a sé e ai propri clienti;</li>
                <li>Ottenere il consenso del cliente finale prima di inserirne i dati nel Servizio, ove richiesto dalla normativa privacy;</li>
                <li>Non utilizzare il Servizio per inviare comunicazioni di spam, messaggi non sollecitati o contenuti illeciti;</li>
                <li>Rispettare le politiche di Meta WhatsApp Business (<a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">whatsapp.com/legal/business-policy</a>) nell'utilizzo del canale di messaggistica;</li>
                <li>Non tentare di alterare, decompilare o accedere abusivamente al software del Servizio.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Proprietà intellettuale</h2>
              <p>Il software, il design, i marchi, i loghi e tutti i contenuti del Servizio sono di esclusiva proprietà del Fornitore o concessi in licenza. È vietata la riproduzione, distribuzione, modifica o utilizzo commerciale senza preventiva autorizzazione scritta.</p>
              <p className="mt-2">L'utente conserva la piena proprietà dei dati e contenuti che inserisce nel Servizio. Concede al Fornitore una licenza non esclusiva limitata al trattamento di tali dati per l'erogazione del Servizio, nei limiti della Privacy Policy.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Limitazione di responsabilità</h2>
              <p>Il Fornitore si impegna a garantire un servizio diligente e affidabile ma non può assicurare l'assenza assoluta di interruzioni, errori o malfunzionamenti dovuti a:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Cause di forza maggiore;</li>
                <li>Interventi di manutenzione programmata o straordinaria;</li>
                <li>Disservizi di fornitori terzi (hosting, CDN, gateway pagamento, WhatsApp/Meta);</li>
                <li>Modifiche normative o tecniche degli enti istituzionali (ENEA, GSE, AdE);</li>
                <li>Comportamenti dell'utente o dei suoi clienti finali.</li>
              </ul>
              <p className="mt-2">Il Fornitore non è responsabile per la veridicità, completezza e correttezza dei dati inseriti dall'utente, né per il loro utilizzo da parte degli enti istituzionali destinatari della pratica.</p>
              <p className="mt-2">In ogni caso, la responsabilità del Fornitore nei confronti dell'utente è limitata all'ammontare dei corrispettivi pagati dall'utente nei 12 mesi precedenti l'evento generatore della responsabilità, fatti salvi i limiti inderogabili di legge.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Sospensione e disattivazione</h2>
              <p>Il Fornitore si riserva di sospendere o disattivare l'account in caso di:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Violazione dei presenti Termini, della Privacy Policy o di leggi vigenti;</li>
                <li>Mancato pagamento dei corrispettivi dovuti;</li>
                <li>Utilizzo del Servizio per finalità illecite, fraudolente o lesive di diritti di terzi;</li>
                <li>Comportamenti contrari alle policy di Meta WhatsApp Business che possano comportare blocco o degradazione qualità del numero;</li>
                <li>Inattività prolungata superiore a 24 mesi.</li>
              </ul>
              <p className="mt-2">In caso di disattivazione il Fornitore garantisce all'utente la possibilità di esportare i propri dati entro 30 giorni dalla comunicazione, salvo casi di violazioni gravi.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Comunicazioni WhatsApp e politiche Meta</h2>
              <p>Il Servizio si integra con la piattaforma WhatsApp Business di Meta Platforms Ireland Ltd. L'utente prende atto che:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>I messaggi inviati sono soggetti alle politiche di Meta (Business Policy, Commerce Policy);</li>
                <li>Meta può limitare, sospendere o bloccare il numero WhatsApp Business in caso di violazioni;</li>
                <li>La qualità del numero (quality rating) può variare in base al feedback dei destinatari;</li>
                <li>Il Fornitore non è responsabile di blocchi, limitazioni o decisioni unilaterali di Meta.</li>
              </ul>
              <p className="mt-2">L'utente si impegna a inviare comunicazioni solo a destinatari che hanno effettivamente intrattenuto rapporti con lui, evitando spam o messaggi non sollecitati.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Modifiche ai Termini</h2>
              <p>Il Fornitore si riserva di modificare in qualsiasi momento i presenti Termini per esigenze tecniche, normative o di business. Le modifiche saranno pubblicate su questa pagina con indicazione della data di ultima revisione e comunicate agli utenti registrati via email almeno 15 giorni prima dell'entrata in vigore.</p>
              <p className="mt-2">L'utilizzo del Servizio successivo all'entrata in vigore comporta accettazione delle modifiche. In caso di mancata accettazione, l'utente può recedere dal contratto senza penalità.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Legge applicabile e foro competente</h2>
              <p>Il presente contratto è regolato dalla legge italiana. Per qualsiasi controversia derivante dall'interpretazione o esecuzione dei presenti Termini sarà competente in via esclusiva il Foro di Monza, fatta salva l'applicabilità del foro inderogabile del consumatore (art. 66-bis Codice del Consumo) qualora l'utente sia qualificabile come consumatore.</p>
              <p className="mt-2"><strong>Risoluzione stragiudiziale (ODR):</strong> la Commissione Europea mette a disposizione una piattaforma per la risoluzione delle controversie online disponibile all'indirizzo <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">ec.europa.eu/consumers/odr</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Contatti</h2>
              <p>Per qualsiasi domanda relativa ai presenti Termini di Servizio:</p>
              <ul className="list-none pl-0 mt-2 space-y-1">
                <li>Email generale: <a href="mailto:info@praticarapida.it" className="text-[#00843D] underline">info@praticarapida.it</a></li>
                <li>Supporto: <a href="mailto:supporto@praticarapida.it" className="text-[#00843D] underline">supporto@praticarapida.it</a></li>
                <li>Privacy: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a></li>
              </ul>
            </section>

            <section className="border-t border-gray-200 pt-6 mt-10">
              <p className="text-sm text-gray-500">
                <strong>Pratica Rapida S.r.l.s.</strong> · Sede legale: Lissone (MB) · P.IVA 03937130791
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Consulta anche la <Link to="/privacy-policy" className="text-[#00843D] underline">Privacy Policy</Link> e la <Link to="/cookie-policy" className="text-[#00843D] underline">Cookie Policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
