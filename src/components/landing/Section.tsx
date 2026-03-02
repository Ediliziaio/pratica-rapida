import React from "react";
import { useScrollFadeIn } from "./hooks";

export function Section({ children, className = "", id, light = false }: { children: React.ReactNode; className?: string; id?: string; light?: boolean }) {
  const ref = useScrollFadeIn();
  return (
    <section ref={ref} id={id} className={`landing-fade-in py-20 md:py-28 ${light ? "bg-white" : ""} ${className}`}>
      {children}
    </section>
  );
}
