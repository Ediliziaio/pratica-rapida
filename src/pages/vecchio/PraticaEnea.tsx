/**
 * /area-riservata-vecchia/pratica-enea — form pubblico richiesta ENEA.
 *
 * Riusa ESATTAMENTE il form interno (NuovaPraticaEnea in publicMode):
 * stesso design, stessi campi prodotto-dipendenti (flag documenti,
 * libretto pompe di calore, ecc.), più i 3 campi azienda. L'invio passa
 * dall'edge function richiesta-pubblica (nessun login).
 */
import { Navbar, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import NuovaPraticaEnea from "@/pages/rivenditore/NuovaPraticaEnea";

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
          <NuovaPraticaEnea publicMode />
        </div>
      </main>
      <Footer />
    </>
  );
}
