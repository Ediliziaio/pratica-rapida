import { useEffect, useRef, useState } from "react";
import { Navbar, Footer, WhatsAppButton } from "@/components/landing";
import { SEO } from "@/components/SEO";
import { AlertTriangle } from "lucide-react";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Simulatore Conto Termico 3.0",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    description:
      "Simulatore gratuito per stimare l'incentivo del Conto Termico 3.0 (D.M. 7 agosto 2025) per pompe di calore, biomassa, solare termico, scaldacqua, teleriscaldamento e microcogenerazione.",
    provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.praticarapida.it/" },
      { "@type": "ListItem", position: 2, name: "Conto Termico", item: "https://www.praticarapida.it/conto-termico" },
      { "@type": "ListItem", position: 3, name: "Simulatore", item: "https://www.praticarapida.it/conto-termico/simulatore" },
    ],
  },
];

export default function SimulatoreCT() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(2400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // calcolatore.html è servito dallo stesso dominio (public/) → same-origin:
    // misuriamo direttamente lo scrollHeight del documento interno.
    const measure = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const h = doc?.documentElement?.scrollHeight;
        if (h && Math.abs(h - height) > 4) setHeight(h + 24);
      } catch {
        /* cross-origin fallback: lascia l'altezza corrente */
      }
    };

    let observer: ResizeObserver | undefined;
    const onLoad = () => {
      measure();
      try {
        const doc = iframe.contentDocument;
        if (doc && "ResizeObserver" in window) {
          observer = new ResizeObserver(measure);
          observer.observe(doc.documentElement);
        }
      } catch {
        /* ignore */
      }
    };

    // Fallback opzionale via postMessage (se il calcolatore lo emette).
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "ct3-resize" && typeof e.data.height === "number") {
        setHeight(e.data.height + 40);
      }
    };

    iframe.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);
    const interval = window.setInterval(measure, 1000);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
      window.clearInterval(interval);
      observer?.disconnect();
    };
  }, [height]);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Simulatore Conto Termico 3.0 — Calcola l'incentivo GSE | Pratica Rapida"
        description="Calcola gratis l'incentivo del Conto Termico 3.0 per il tuo intervento: pompe di calore, biomassa, solare termico, scaldacqua e altro. Stima basata sul D.M. 7 agosto 2025."
        canonical="/conto-termico/simulatore"
        keywords="simulatore conto termico, calcolo incentivo GSE, conto termico 3.0, calcolatore pompe di calore, incentivo biomassa, stima conto termico"
        jsonLd={jsonLd}
      />
      <Navbar />

      <main className="pt-16">
        <section className="bg-muted/30 py-10 md:py-14">
          <div className="max-w-4xl mx-auto px-4">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Simulatore Conto Termico 3.0
            </h1>
            <p className="mt-3 text-base md:text-lg text-muted-foreground">
              Stima l'incentivo del Conto Termico 3.0 per il tuo intervento. Seleziona la
              tipologia, inserisci i dati dell'impianto e ottieni una stima immediata.
            </p>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
              <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
              <p>
                <strong>Attenzione:</strong> i risultati sono indicativi e calcolati sulla base
                delle formule del D.M. 7 agosto 2025. L'incentivo effettivo è soggetto a verifica
                da parte del GSE. Per una valutazione personalizzata{" "}
                <a href="/conto-termico" className="underline font-medium">
                  contatta il nostro team
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="pb-16">
          <div className="max-w-4xl mx-auto px-4">
            <iframe
              ref={iframeRef}
              src="/calcolatore.html"
              title="Calcolatore Conto Termico 3.0"
              className="w-full rounded-xl border border-border bg-white"
              style={{ height, overflow: "hidden" }}
            />
          </div>
        </section>
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}
