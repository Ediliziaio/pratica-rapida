import { Navbar, TickerStrip, PartnerSection, ReviewsSection, WhyUsSection, GuaranteeSection, FinalCTA, Footer, WhatsAppButton } from "@/components/landing";
import { SEO } from "@/components/SEO";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Pratiche Conto Termico GSE per Installatori",
    provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
    description: "Gestione completa delle pratiche Conto Termico GSE per pompe di calore, solare termico e schermature solari. Raccolta documenti dal cliente, invio GSE e monitoraggio inclusi.",
    areaServed: "IT",
    audience: { "@type": "BusinessAudience", audienceType: "Installatori, Termoidraulici, Rivenditori" },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.praticarapida.it/" },
      { "@type": "ListItem", position: 2, name: "Conto Termico", item: "https://www.praticarapida.it/conto-termico" },
    ],
  },
];
import HeroSectionCT from "@/components/landing-ct/HeroSectionCT";
import TickerStripCT from "@/components/landing-ct/TickerStripCT";
import ProblemSectionCT from "@/components/landing-ct/ProblemSectionCT";
import SolutionSectionCT from "@/components/landing-ct/SolutionSectionCT";
import BenefitsSectionCT from "@/components/landing-ct/BenefitsSectionCT";
import DataWallSectionCT from "@/components/landing-ct/DataWallSectionCT";
import FAQSectionCT from "@/components/landing-ct/FAQSectionCT";

export default function HomeCT() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratica Conto Termico GSE per Installatori — A Tuo Nome | Pratica Rapida"
        description="Gestiamo le pratiche Conto Termico GSE per pompe di calore, solare termico e schermature. Raccolta documenti, invio GSE e monitoraggio inclusi. Nessun canone fisso."
        canonical="/conto-termico"
        keywords="conto termico GSE, pratica conto termico, pompe di calore incentivi, solare termico detrazione, pratiche GSE installatori, conto termico 3.0"
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
      <GuaranteeSection />
      <FAQSectionCT />
      <FinalCTA />
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
