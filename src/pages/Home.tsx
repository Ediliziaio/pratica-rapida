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
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Quanto costa il servizio?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "65€ a pratica completata, IVA esclusa. Nessun canone mensile, nessun costo di attivazione, nessun vincolo contrattuale. Paghi solo quando la pratica è stata effettivamente completata e consegnata.",
        },
      },
      {
        "@type": "Question",
        name: "Come funziona il contatto con il mio cliente?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Chiamiamo il tuo cliente presentandoci come parte del tuo team / ufficio tecnico. Il cliente non saprà mai che siamo un servizio esterno. Raccogliamo tutti i documenti necessari direttamente da lui.",
        },
      },
      {
        "@type": "Question",
        name: "Quanto tempo ci vuole per completare una pratica?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Entro 24 ore lavorative dalla raccolta completa dei documenti, la pratica ENEA viene compilata, inviata e consegnata a te e al tuo cliente.",
        },
      },
      {
        "@type": "Question",
        name: "Cosa succede se c'è un errore nella pratica?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Ogni pratica è coperta da assicurazione RC professionale. In caso di errore, lo correggiamo immediatamente e gratuitamente. La responsabilità è nostra.",
        },
      },
      {
        "@type": "Question",
        name: "Devo firmare un contratto vincolante?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Puoi attivare e disattivare il servizio quando vuoi. Non c'è nessun minimo di pratiche mensili e nessuna penale di uscita.",
        },
      },
      {
        "@type": "Question",
        name: "Per quali tipi di intervento posso fare la pratica ENEA?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Serramenti, infissi, schermature solari, pergole bioclimatiche, pompe di calore, fotovoltaico, vetrate panoramiche. Tutti gli interventi che prevedono la comunicazione ENEA per detrazioni fiscali.",
        },
      },
      {
        "@type": "Question",
        name: "Come ricevo la pratica completata?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tramite la tua area riservata nel portale Pratica Rapida e via email. Sia tu che il tuo cliente ricevete la pratica in formato digitale.",
        },
      },
      {
        "@type": "Question",
        name: "Posso provare il servizio con una sola pratica?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Assolutamente sì. Non c'è nessun obbligo di volume. Puoi provare con una pratica e decidere se continuare.",
        },
      },
      {
        "@type": "Question",
        name: "Il servizio è disponibile in tutta Italia?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sì, operiamo su tutto il territorio nazionale. Essendo un servizio digitale, non ci sono limitazioni geografiche.",
        },
      },
      {
        "@type": "Question",
        name: "Come posso iniziare?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Registrati gratuitamente, inserisci il numero di telefono del tuo primo cliente e lascia fare a noi. In 2 minuti sei operativo.",
        },
      },
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
