import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Footer, Navbar } from "@/components/landing";
import { SEO } from "@/components/SEO";
import NuovaPraticaEnea from "@/pages/rivenditore/NuovaPraticaEnea";

export default function VecchioFotovoltaicoOffGrid() {
  return (
    <>
      <SEO
        title="Pratica ENEA fotovoltaico off-grid domestico | Pratica Rapida"
        description="Richiedi la pratica ENEA per un impianto fotovoltaico domestico senza allaccio alla rete o al GSE."
        canonical="/area-riservata-vecchia/fotovoltaico-off-grid"
        noindex={true}
      />
      <Navbar />
      <main className="min-h-screen bg-gray-50 pb-20 pt-24">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <Link
            to="/area-riservata-vecchia/servizi"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Torna ai servizi
          </Link>

          <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-4 text-2xl font-extrabold text-foreground md:text-3xl">
              Pratica ENEA fotovoltaico off-grid domestico
            </h1>
            <p className="mb-5 leading-relaxed text-muted-foreground">
              Per impianti domestici senza allaccio alla rete e senza pratica GSE. Il percorso usa la stessa pipeline ENEA e gli stessi automatismi delle altre pratiche.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "pratica ENEA Bonus Casa predisposta e trasmessa",
                "ricevuta ENEA ufficiale pronta per il commercialista",
                "assistenza sulla documentazione necessaria",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(152,65%,38%)]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <NuovaPraticaEnea publicMode initialProduct="fotovoltaico_off_grid" lockProduct />
        </div>
      </main>
      <Footer />
    </>
  );
}
