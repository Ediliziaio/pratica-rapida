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

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
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
