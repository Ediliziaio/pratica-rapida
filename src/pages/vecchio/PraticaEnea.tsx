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
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import NuovaPraticaEnea from "@/pages/rivenditore/NuovaPraticaEnea";

// Form NATIVO attivo (NuovaPraticaEnea publicMode): sostituisce l'embed esterno
// LeadConnector. Lasciato come flag per eventuale rollback rapido.
const USE_LEADCONNECTOR_FORM = false;
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
          <div className="flex items-center justify-between gap-3 mb-6">
            <Link
              to="/area-riservata-vecchia/servizi"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Torna ai servizi
            </Link>
            {/* Guida al form pubblico (PDF generato da tutorial/sito-web.html).
                Sta qui accanto al modulo perché è qui che serve: chi arriva dal
                sito non ha un account e non vede il menu dell'area riservata. */}
            <a
              href="/guida-pratica-enea-sito.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
            >
              <BookOpen className="w-4 h-4" /> Come si compila
            </a>
          </div>
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
