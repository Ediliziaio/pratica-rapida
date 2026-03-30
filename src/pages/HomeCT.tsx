import { Navbar, TickerStrip, PartnerSection, ReviewsSection, WhyUsSection, GuaranteeSection, FinalCTA, Footer } from "@/components/landing";
import { SEO } from "@/components/SEO";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Pratiche Conto Termico GSE per Installatori",
  provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
  description: "Gestione completa delle pratiche Conto Termico GSE per caldaie a condensazione, pompe di calore e solare termico. Invio in 72 ore, zero pratiche respinte.",
  areaServed: "IT",
  offers: { "@type": "Offer", price: "250", priceCurrency: "EUR", priceSpecification: { "@type": "UnitPriceSpecification", price: "250", priceCurrency: "EUR", unitText: "pratica" } },
};
import HeroSectionCT from "@/components/landing-ct/HeroSectionCT";
import TickerStripCT from "@/components/landing-ct/TickerStripCT";
import ProblemSectionCT from "@/components/landing-ct/ProblemSectionCT";
import SolutionSectionCT from "@/components/landing-ct/SolutionSectionCT";
import BenefitsSectionCT from "@/components/landing-ct/BenefitsSectionCT";
import DataWallSectionCT from "@/components/landing-ct/DataWallSectionCT";
import PricingSectionCT from "@/components/landing-ct/PricingSectionCT";
import FAQSectionCT from "@/components/landing-ct/FAQSectionCT";

export default function HomeCT() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratiche Conto Termico GSE — Gestite a Tuo Nome in 72 ore"
        description="Gestiamo le pratiche Conto Termico GSE per i tuoi clienti: caldaie a condensazione, pompe di calore, solare termico. 250€ a pratica, zero pratiche respinte."
        canonical="/conto-termico"
        jsonLd={jsonLd}
      />
      <Navbar />
      <HeroSectionCT />
      <TickerStripCT />
      <ProblemSectionCT />
      <SolutionSectionCT />
      <BenefitsSectionCT />
      <DataWallSectionCT />
      <ReviewsSection />
      <WhyUsSection />
      <PricingSectionCT />
      <GuaranteeSection />
      <FAQSectionCT />
      <FinalCTA />
      <Footer />
    </div>
  );
}
