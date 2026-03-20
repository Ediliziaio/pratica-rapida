import {
  Navbar,
  HeroSection,
  TickerStrip,
  ProblemSection,
  InactionCostSection,
  SolutionSection,
  ServicesGrid,
  ProcessSteps,
  PartnerSection,
  DataWallSection,
  ReviewsSection,
  PricingSection,
  GuaranteeSection,
  FAQSection,
  FinalCTA,
  Footer,
} from "@/components/landing";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <TickerStrip />
      <ProblemSection />
      <InactionCostSection />
      <SolutionSection />
      <ServicesGrid />
      <ProcessSteps />
      <PartnerSection />
      <DataWallSection />
      <ReviewsSection />
      <PricingSection />
      <GuaranteeSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
