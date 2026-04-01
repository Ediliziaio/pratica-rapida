import { Navbar, TickerStrip, PartnerSection, ReviewsSection, WhyUsSection, GuaranteeSection, Footer } from "@/components/landing";
import HeroSectionHome from "@/components/landing-home/HeroSectionHome";
import ServicesSectionHome from "@/components/landing-home/ServicesSectionHome";
import HowItWorksSectionHome from "@/components/landing-home/HowItWorksSectionHome";
import StatsSectionHome from "@/components/landing-home/StatsSectionHome";
import FinalCTAHome from "@/components/landing-home/FinalCTAHome";
import NewPortalPopup from "@/components/landing/NewPortalPopup";
import { SEO } from "@/components/SEO";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Pratica Rapida",
  url: "https://www.praticarapida.it",
  logo: "https://www.praticarapida.it/pratica-rapida-logo.png",
  description: "Gestione pratiche ENEA e Conto Termico per installatori italiani. Completiamo le pratiche dei tuoi clienti a tuo nome in 48–72 ore.",
  address: { "@type": "PostalAddress", addressLocality: "Lissone", addressRegion: "MB", addressCountry: "IT" },
  contactPoint: { "@type": "ContactPoint", telephone: "+39-039-868-2691", contactType: "customer service", availableLanguage: "Italian" },
  sameAs: ["https://it.trustpilot.com/review/praticarapida.it"],
};

export default function HomeMain() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratica Rapida — Gestione Pratiche ENEA e Conto Termico per Installatori"
        description="Gestiamo le pratiche ENEA e Conto Termico dei tuoi clienti a tuo nome in 48–72 ore. Nessun canone fisso, assicurazione RC inclusa. 350+ installatori attivi in tutta Italia."
        canonical="/"
        jsonLd={jsonLd}
      />
      <NewPortalPopup />
      <Navbar />
      <HeroSectionHome />
      <TickerStrip />
      <ServicesSectionHome />
      <PartnerSection />
      <HowItWorksSectionHome />
      <StatsSectionHome />
      <ReviewsSection />
      <WhyUsSection />
      <GuaranteeSection />
      <FinalCTAHome />
      <Footer />
    </div>
  );
}
