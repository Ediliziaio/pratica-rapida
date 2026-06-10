/**
 * /area-riservata-vecchia/pratica-enea — form pubblico richiesta ENEA.
 *
 * Riusa ESATTAMENTE il form interno (NuovaPraticaEnea in publicMode):
 * stesso design, stessi campi prodotto-dipendenti (flag documenti,
 * libretto pompe di calore, ecc.), più i 3 campi azienda. L'invio passa
 * dall'edge function richiesta-pubblica (nessun login).
 */
import { useEffect } from "react";
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import NuovaPraticaEnea from "@/pages/rivenditore/NuovaPraticaEnea";

// TEMP: in produzione mostriamo il form esterno LeadConnector al posto
// del form nativo. Impostare a `false` per ripristinare il form originale
// (NuovaPraticaEnea publicMode) tra qualche giorno. Il form nativo viene
// renderizzato nascosto per preservarne lo stato e facilitare il rollback.
const USE_LEADCONNECTOR_FORM = true;
const LEADCONNECTOR_FORM_ID = "QQHfDRgAPOynEERpP5DK";
const LEADCONNECTOR_FORM_URL = `https://api.leadconnectorhq.com/widget/form/${LEADCONNECTOR_FORM_ID}`;
const LEADCONNECTOR_EMBED_SCRIPT = "https://link.msgsndr.com/js/form_embed.js";

function LeadConnectorEmbed() {
  // form_embed.js gestisce l'auto-resize dell'iframe via postMessage.
  useEffect(() => {
    if (document.querySelector(`script[src="${LEADCONNECTOR_EMBED_SCRIPT}"]`)) return;
    const s = document.createElement("script");
    s.src = LEADCONNECTOR_EMBED_SCRIPT;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <iframe
      src={LEADCONNECTOR_FORM_URL}
      id={`inline-${LEADCONNECTOR_FORM_ID}`}
      data-layout='{"id":"INLINE"}'
      data-trigger-type="alwaysShow"
      data-form-id={LEADCONNECTOR_FORM_ID}
      data-layout-iframe-id={`inline-${LEADCONNECTOR_FORM_ID}`}
      data-form-name="Nuova Pratica ENEA"
      title="Nuova Pratica ENEA"
      style={{
        width: "100%",
        minHeight: 720,
        border: "none",
        borderRadius: 12,
        background: "white",
        display: "block",
      }}
    />
  );
}

export default function VecchioPraticaEnea() {
  return (
    <>
      <SEO
        title="Pratiche ENEA Ecobonus e Bonus Casa | Pratica Rapida"
        description="Inserisci una nuova pratica ENEA per schermature, infissi, climatizzatori e altro."
        canonical="/area-riservata-vecchia/pratica-enea"
        noindex={true}
      />
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-2xl mx-auto px-4 lg:px-8">
          <Link
            to="/area-riservata-vecchia/servizi"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Torna ai servizi
          </Link>
          {USE_LEADCONNECTOR_FORM ? (
            <>
              <LeadConnectorEmbed />
              {/* Form nativo nascosto — preservato per ripristino futuro. */}
              <div aria-hidden="true" className="hidden">
                <NuovaPraticaEnea publicMode />
              </div>
            </>
          ) : (
            <NuovaPraticaEnea publicMode />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
