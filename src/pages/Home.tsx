import {
  Navbar,
  HeroSection,
  TickerStrip,
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  ProcessSteps,
  PartnerSection,
  DataWallSection,
  ReviewsSection,
  WhyUsSection,
  PricingSection,
  GuaranteeSection,
  FAQSection,
  FinalCTA,
  Footer,
} from "@/components/landing";
import { SEO } from "@/components/SEO";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Pratiche ENEA per Installatori",
  provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
  description: "Gestione completa delle pratiche ENEA per detrazioni fiscali: compilazione, raccolta documenti dal cliente, invio telematico in 48 ore.",
  areaServed: "IT",
  offers: { "@type": "Offer", price: "65", priceCurrency: "EUR", priceSpecification: { "@type": "UnitPriceSpecification", price: "65", priceCurrency: "EUR", unitText: "pratica" } },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratiche ENEA per Installatori — Completate in 48 ore a Tuo Nome"
        description="Gestiamo le pratiche ENEA dei tuoi clienti: raccogliamo i documenti, compiliamo e trasmettiamo in 48 ore. 65€ a pratica, nessun canone. Assicurazione RC inclusa."
        canonical="/pratica-enea"
        jsonLd={jsonLd}
      />
      <Navbar />
      <HeroSection />
      <TickerStrip />
      <ProblemSection />
      <SolutionSection />
      <BenefitsSection />
      <ProcessSteps />
      <PartnerSection />
      <DataWallSection />
      <ReviewsSection />
      <WhyUsSection />
      <PricingSection />
      <GuaranteeSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
