import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

/**
 * /privacy-policy — Informativa privacy GDPR completa
 *
 * Struttura conforme a artt. 13-14 GDPR + indicazioni Garante Privacy.
 * Include sezioni richieste per pubblicazione Meta WhatsApp Business API
 * (trasferimenti extra-UE, sub-processor list, WhatsApp data handling).
 *
 * ⚠️ Documento template. Revisione legale consigliata prima del go-live.
 */

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
          <p className="text-gray-400 text-sm mb-10">Ultimo aggiornamento: 20 maggio 2026</p>

          <div className="space-y-8 text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Titolare del trattamento</h2>
              <p>Il titolare del trattamento dei dati personali è <strong>Pratica Rapida S.r.l.s.</strong>, con sede legale in Lissone (MB), P.IVA e Codice Fiscale 03937130791. Per qualsiasi comunicazione relativa alla privacy o per esercitare i diritti previsti dal GDPR scrivere a: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
              <p className="mt-2 text-sm text-gray-500">Non è stato nominato un Responsabile della Protezione dei Dati (DPO) in quanto non ricorrono i presupposti dell'art. 37 GDPR. Resta ferma la facoltà di nomina in futuro.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Categorie di dati trattati e finalità</h2>
              <p className="mb-3">Raccogliamo i dati personali strettamente necessari a erogare il servizio di gestione pratiche ENEA e Conto Termico, suddivisi nelle seguenti categorie:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li><strong>Dati dell'installatore/rivenditore (utente registrato):</strong> nome, cognome, ragione sociale, P.IVA, codice fiscale, indirizzo della sede, email, numero di telefono, eventuali credenziali di autenticazione. <em>Finalità:</em> creazione e gestione dell'account, comunicazioni operative, fatturazione, supporto.</li>
                <li><strong>Dati del cliente finale (interessato indiretto):</strong> nome, cognome, codice fiscale, indirizzo dell'immobile, dati catastali, recapiti (telefono, email), dati relativi all'intervento di efficientamento energetico. <em>Finalità:</em> compilazione e trasmissione della pratica all'ente competente (ENEA o Gestore Servizi Energetici), comunicazione del cliente con il rivenditore.</li>
                <li><strong>Dati di comunicazione (WhatsApp / email):</strong> contenuto dei messaggi scambiati tra rivenditore e cliente finale, numero di telefono, identificativi conversazione, timestamp, stato consegna. <em>Finalità:</em> erogazione del servizio di messaggistica integrata, audit anti-contestazione, supporto.</li>
                <li><strong>Dati di navigazione e log tecnici:</strong> indirizzo IP, tipo di browser, sistema operativo, pagine visitate, timestamp di accesso. <em>Finalità:</em> sicurezza informatica, prevenzione frodi, analisi tecniche aggregate.</li>
                <li><strong>Dati di pagamento (eventuali):</strong> non vengono trattati direttamente; gestiti dal provider di pagamento (PCI DSS compliant) che agisce come titolare autonomo.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Base giuridica del trattamento</h2>
              <p className="mb-2">Il trattamento dei dati è fondato sulle seguenti basi giuridiche:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Esecuzione del contratto</strong> di servizio o di misure precontrattuali (art. 6 par. 1 lett. b GDPR), per la fornitura della piattaforma e l'invio delle pratiche;</li>
                <li><strong>Adempimento di obblighi legali</strong> (art. 6 par. 1 lett. c GDPR), per fatturazione, conservazione documentale e adempimenti fiscali;</li>
                <li><strong>Legittimo interesse del titolare</strong> (art. 6 par. 1 lett. f GDPR), per sicurezza, prevenzione frodi, miglioramento del servizio e audit interno;</li>
                <li><strong>Consenso dell'interessato</strong> (art. 6 par. 1 lett. a GDPR), per finalità di marketing facoltative e per l'invio di comunicazioni promozionali tramite WhatsApp/email, dove richiesto.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. WhatsApp Business — informativa specifica</h2>
              <p className="mb-2">Pratica Rapida utilizza l'integrazione ufficiale <strong>WhatsApp Business Platform</strong> di Meta Platforms Ireland Ltd. per consentire ai rivenditori di comunicare con i propri clienti finali. Quando un cliente riceve o invia messaggi attraverso il nostro numero aziendale WhatsApp:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Il contenuto del messaggio (testo, allegati, metadati di consegna) viene transitato e temporaneamente archiviato sui server Meta secondo la <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">WhatsApp Business Policy</a>;</li>
                <li>Una copia del messaggio viene conservata nei nostri sistemi per finalità di audit, supporto e gestione della pratica;</li>
                <li>Il primo messaggio inviato a un cliente richiede l'utilizzo di un template approvato da Meta; le risposte successive sono possibili entro 24 ore in formato libero;</li>
                <li>Il cliente può richiedere in qualsiasi momento la cessazione delle comunicazioni rispondendo con "STOP" o contattando direttamente il rivenditore.</li>
              </ul>
              <p className="mt-3 text-sm">Per maggiori informazioni sulle modalità di trattamento dei dati da parte di Meta consulta la <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">Privacy Policy di WhatsApp</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Conservazione dei dati</h2>
              <p>I dati personali sono conservati per il tempo strettamente necessario alle finalità per cui sono stati raccolti:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>Account utente</strong>: per tutta la durata del rapporto contrattuale e fino a 24 mesi dalla cessazione;</li>
                <li><strong>Pratiche ENEA/Conto Termico</strong>: 10 anni dalla trasmissione, in conformità ai termini di accertamento fiscale e civilistico;</li>
                <li><strong>Comunicazioni WhatsApp ed email</strong>: 24 mesi dall'ultimo messaggio scambiato;</li>
                <li><strong>Log tecnici e di sicurezza</strong>: 12 mesi dalla data di registrazione;</li>
                <li><strong>Documenti fiscali</strong>: 10 anni come da normativa fiscale italiana.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Destinatari e responsabili del trattamento</h2>
              <p className="mb-3">I dati personali possono essere comunicati ai seguenti destinatari, ciascuno dei quali agisce come responsabile esterno del trattamento ai sensi dell'art. 28 GDPR e ha sottoscritto un accordo di trattamento dati (Data Processing Agreement):</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left p-3 border-b border-gray-200">Fornitore</th>
                      <th className="text-left p-3 border-b border-gray-200">Servizio</th>
                      <th className="text-left p-3 border-b border-gray-200">Sede</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-gray-100">Supabase Inc.</td>
                      <td className="p-3 border-b border-gray-100">Database, autenticazione, storage file</td>
                      <td className="p-3 border-b border-gray-100">USA / UE (Francoforte)</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100">Meta Platforms Ireland Ltd.</td>
                      <td className="p-3 border-b border-gray-100">WhatsApp Business Platform</td>
                      <td className="p-3 border-b border-gray-100">Irlanda / USA</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100">Resend Inc.</td>
                      <td className="p-3 border-b border-gray-100">Email transazionali</td>
                      <td className="p-3 border-b border-gray-100">USA</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100">Cloudflare Inc.</td>
                      <td className="p-3 border-b border-gray-100">CDN, sicurezza, hosting pagine</td>
                      <td className="p-3 border-b border-gray-100">USA</td>
                    </tr>
                    <tr>
                      <td className="p-3">Enti istituzionali (ENEA, GSE, Agenzia delle Entrate)</td>
                      <td className="p-3">Trasmissione pratiche e adempimenti fiscali</td>
                      <td className="p-3">Italia</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">I dati possono inoltre essere comunicati ad autorità competenti qualora richiesto dalla legge o per la difesa di un diritto in sede giudiziaria.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Trasferimenti extra-UE</h2>
              <p>Alcuni fornitori sopra elencati hanno sede o utilizzano infrastrutture al di fuori dello Spazio Economico Europeo (in particolare negli Stati Uniti). I trasferimenti sono protetti mediante:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>Clausole Contrattuali Standard</strong> approvate dalla Commissione Europea (Decisione 2021/914/UE);</li>
                <li>Adesione del fornitore al <strong>EU-US Data Privacy Framework</strong>, dove applicabile;</li>
                <li>Misure tecniche e organizzative supplementari (crittografia in transito e a riposo, controlli di accesso, audit).</li>
              </ul>
              <p className="mt-3">Per ricevere copia delle garanzie applicate al trasferimento contattaci a <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Diritti dell'interessato</h2>
              <p className="mb-3">Ai sensi degli artt. 15-22 del GDPR (Reg. UE 2016/679), hai il diritto di:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Accesso</strong> (art. 15): ottenere conferma del trattamento e copia dei tuoi dati;</li>
                <li><strong>Rettifica</strong> (art. 16): correggere dati inesatti o incompleti;</li>
                <li><strong>Cancellazione</strong> (art. 17): "diritto all'oblio", nei casi previsti;</li>
                <li><strong>Limitazione</strong> (art. 18): limitare il trattamento in casi specifici;</li>
                <li><strong>Portabilità</strong> (art. 20): ricevere i dati in formato strutturato e trasmetterli ad altro titolare;</li>
                <li><strong>Opposizione</strong> (art. 21): opporti al trattamento basato su legittimo interesse o marketing;</li>
                <li><strong>Revoca del consenso</strong> in qualsiasi momento, senza pregiudicare la liceità del trattamento già effettuato;</li>
                <li><strong>Reclamo</strong> al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className="text-[#00843D] underline">www.garanteprivacy.it</a>) o all'autorità di controllo del proprio Stato di residenza.</li>
              </ul>
              <p className="mt-3">Per esercitare questi diritti scrivi a <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>. Risponderemo entro 30 giorni dalla ricezione della richiesta.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Cancellazione dell'account e dei dati</h2>
              <p>Per richiedere la cancellazione completa del tuo account e dei dati personali ad esso associati invia una richiesta scritta a <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a> indicando l'email registrata. Provvederemo entro 30 giorni a:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Disabilitare immediatamente l'accesso all'account;</li>
                <li>Cancellare i dati personali non più necessari, fatti salvi gli obblighi di conservazione previsti dalla legge (es. fatturazione: 10 anni);</li>
                <li>Confermarti l'avvenuta cancellazione via email.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Sicurezza</h2>
              <p>Adottiamo misure tecniche e organizzative adeguate per proteggere i dati da accessi non autorizzati, perdita, alterazione o divulgazione: crittografia TLS in transito, crittografia a riposo dei database, autenticazione a due fattori per gli amministratori, controlli di accesso granulari (Row Level Security), log di audit, backup periodici, monitoraggio degli accessi anomali.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Minori</h2>
              <p>Il servizio non è destinato a persone di età inferiore a 16 anni. Non raccogliamo consapevolmente dati di minori. Se vieni a conoscenza che un minore ci ha fornito dati personali contattaci e provvederemo alla cancellazione.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Cookie</h2>
              <p>Per informazioni dettagliate sull'uso dei cookie consulta la nostra <Link to="/cookie-policy" className="text-[#00843D] underline">Cookie Policy</Link>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Modifiche alla presente informativa</h2>
              <p>Ci riserviamo di aggiornare questa informativa in qualsiasi momento per riflettere modifiche normative o operative. La versione aggiornata sarà sempre disponibile su questa pagina con la data di ultima revisione indicata in cima. In caso di modifiche sostanziali ne daremo avviso agli utenti registrati via email almeno 30 giorni prima dell'entrata in vigore.</p>
            </section>

            <section className="border-t border-gray-200 pt-6 mt-10">
              <p className="text-sm text-gray-500">
                <strong>Pratica Rapida S.r.l.s.</strong> · Sede legale: Lissone (MB) · P.IVA 03937130791 · Email: <a href="mailto:privacy@praticarapida.it" className="text-[#00843D] underline">privacy@praticarapida.it</a>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Consulta anche i nostri <Link to="/termini" className="text-[#00843D] underline">Termini di Servizio</Link> e la <Link to="/cookie-policy" className="text-[#00843D] underline">Cookie Policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
