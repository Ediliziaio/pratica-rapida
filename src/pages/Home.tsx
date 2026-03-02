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
  const [showBottomBar, setShowBottomBar] = useState(true);
  const teamSectionRef = useRef<HTMLDivElement>(null);
  const teamReached = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      if (window.scrollY > 200 && !teamReached.current) setShowBottomBar(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const el = teamSectionRef.current;
    if (!el) return () => window.removeEventListener("scroll", onScroll);
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { teamReached.current = true; setShowBottomBar(true); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => { window.removeEventListener("scroll", onScroll); observer.disconnect(); };
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
