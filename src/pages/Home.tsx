import { useEffect, useRef, useState } from "react";
import {
  TopBanner,
  Navbar,
  FloatingIcons,
  HeroSection,
  SocialProofBar,
  ProblemSection,
  TrapsSection,
  HowItWorksSection,
  ComparisonSection,
  PricingSection,
  GuaranteesSection,
  TeamSection,
  ReviewsSection,
  FAQSection,
  CTASection,
  Footer,
  StickyBottomBar,
} from "@/components/landing";

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(false);
  const teamSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setShowBottomBar(window.scrollY > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white font-sans relative overflow-x-hidden pt-24 pb-28">
      <FloatingIcons />
      <TopBanner />
      <Navbar scrolled={scrolled} />
      <HeroSection />
      <SocialProofBar />
      <ProblemSection />
      <TrapsSection />
      <HowItWorksSection />
      <ComparisonSection />
      <PricingSection />
      <GuaranteesSection />
      <TeamSection teamSectionRef={teamSectionRef} />
      <ReviewsSection />
      <FAQSection />
      <CTASection />
      <Footer />
      <StickyBottomBar showBottomBar={showBottomBar} />
    </div>
  );
}
