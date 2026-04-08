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
  WhatsAppButton,
} from "@/components/landing";
import StatsSectionHome from "@/components/landing-home/StatsSectionHome";
import { SEO } from "@/components/SEO";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Pratiche ENEA per Installatori",
    provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
    description: "Gestione completa delle pratiche ENEA Ecobonus e Bonus Casa per installatori: infissi, serramenti, schermature solari, pompe di calore. Raccolta documenti dal cliente finale, compilazione e invio telematico ENEA entro 48 ore lavorative.",
    areaServed: "IT",
    offers: { "@type": "Offer", price: "65", priceCurrency: "EUR", priceSpecification: { "@type": "UnitPriceSpecification", price: "65", priceCurrency: "EUR", unitText: "pratica" } },
    audience: { "@type": "BusinessAudience", audienceType: "Installatori, Serramentisti, Rivenditori" },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.praticarapida.it/" },
      { "@type": "ListItem", position: 2, name: "Pratica ENEA", item: "https://www.praticarapida.it/pratica-enea" },
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratica ENEA Online per Installatori — 48 ore a Tuo Nome | Pratica Rapida"
        description="Gestiamo le pratiche ENEA dei tuoi clienti per infissi, serramenti e schermature. Raccolta documenti, invio ENEA e ricevuta in 48 ore. Nessun canone fisso."
        canonical="/pratica-enea"
        keywords="pratica ENEA, comunicazione ENEA, ENEA online, ecobonus infissi, ecobonus serramenti, bonus casa detrazione 50%, schermature solari ENEA, pratica ENEA installatori"
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
      <StatsSectionHome />
      <DataWallSection />
      <ReviewsSection />
      <WhyUsSection />
      <PricingSection />
      <GuaranteeSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
