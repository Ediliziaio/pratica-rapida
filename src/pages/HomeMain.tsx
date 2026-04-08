import { Navbar, TickerStrip, PartnerSection, ReviewsSection, WhyUsSection, GuaranteeSection, Footer, WhatsAppButton } from "@/components/landing";
import HeroSectionHome from "@/components/landing-home/HeroSectionHome";
import ServicesSectionHome from "@/components/landing-home/ServicesSectionHome";
import HowItWorksSectionHome from "@/components/landing-home/HowItWorksSectionHome";
import StatsSectionHome from "@/components/landing-home/StatsSectionHome";
import FinalCTAHome from "@/components/landing-home/FinalCTAHome";
import NewsSectionHome from "@/components/landing-home/NewsSectionHome";
import NewPortalPopup from "@/components/landing/NewPortalPopup";
import { SEO } from "@/components/SEO";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Pratica Rapida",
    legalName: "Pratica Rapida S.r.l.s.",
    url: "https://www.praticarapida.it",
    logo: "https://www.praticarapida.it/pratica-rapida-logo.png",
    description: "Pratica Rapida è il servizio specializzato nella gestione di pratiche ENEA e Conto Termico GSE per installatori e rivenditori italiani. Oltre 20.000 pratiche gestite, 500+ installatori attivi in tutta Italia.",
    address: { "@type": "PostalAddress", addressLocality: "Lissone", addressRegion: "MB", postalCode: "20851", addressCountry: "IT" },
    contactPoint: { "@type": "ContactPoint", telephone: "+39-039-868-2691", contactType: "customer service", availableLanguage: "Italian" },
    sameAs: ["https://it.trustpilot.com/review/praticarapida.it"],
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Gestione Pratiche ENEA e Conto Termico",
    provider: { "@type": "Organization", name: "Pratica Rapida", url: "https://www.praticarapida.it" },
    description: "Servizio di outsourcing per la gestione di pratiche ENEA (Ecobonus/Bonus Casa) e Conto Termico GSE per installatori italiani.",
    areaServed: "IT",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Servizi Pratica Rapida",
      itemListElement: [
        { "@type": "Offer", name: "Pratica ENEA", price: "65", priceCurrency: "EUR" },
        { "@type": "Offer", name: "Pratica Conto Termico", priceCurrency: "EUR" },
      ],
    },
  },
];

export default function HomeMain() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Pratiche ENEA e Conto Termico per Installatori | Pratica Rapida"
        description="Gestiamo pratiche ENEA e Conto Termico a tuo nome in 48 ore. Raccogliamo i documenti, compiliamo e inviamo. Nessun canone fisso. 500+ installatori attivi in tutta Italia."
        canonical="/"
        keywords="pratica ENEA, conto termico GSE, gestione pratiche installatori, outsourcing pratiche energetiche, ecobonus serramenti, bonus casa infissi"
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
      <NewsSectionHome />
      <ReviewsSection />
      <WhyUsSection />
      <GuaranteeSection />
      <FinalCTAHome />
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
