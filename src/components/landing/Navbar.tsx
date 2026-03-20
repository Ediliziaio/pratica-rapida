import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { PR_GREEN, NAV_LINKS } from "./constants";

interface NavbarProps {
  scrolled: boolean;
}

export function Navbar({ scrolled }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <>
      <nav className={`fixed top-10 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "navbar-scrolled" : "bg-[#0a1628]/90 backdrop-blur-md border-b border-white/5"}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4 transition-all duration-300">
          <Link to="/offerta" className="flex items-center gap-2">
            <img
              src={scrolled ? "/pratica-rapida-logo.png" : "/pratica-rapida-logo-white.png"}
              alt="Pratica Rapida"
              className="max-h-10 w-auto object-contain transition-all duration-300"
            />
          </Link>
          <div className={`hidden md:flex items-center gap-8 text-sm ${scrolled ? "text-gray-600" : "text-white/70"}`}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className={`nav-link transition-colors ${scrolled ? "hover:text-[#00843D]" : "hover:text-white"}`}>{l.label}</a>
            ))}
            <Link to="/auth" className={`nav-link transition-colors ${scrolled ? "hover:text-[#00843D]" : "hover:text-white"}`}>Accedi</Link>
          </div>
          <Link to="/auth" className="hidden md:inline-flex text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all animate-pulse-glow" style={{ backgroundColor: PR_GREEN }}>
            Attiva Gratis
          </Link>
          <button className={`md:hidden flex flex-col gap-1.5 z-[60] ${mobileMenuOpen ? "hamburger-open" : ""}`} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
            <span className={`hamburger-line w-6 h-0.5 rounded-full block transition-colors duration-300 ${scrolled ? "bg-gray-800" : "bg-white"}`} />
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 mobile-menu-overlay flex flex-col items-center justify-center gap-8" onClick={closeMobile}>
          <button className="absolute top-5 right-6 text-white" onClick={closeMobile}><X className="w-7 h-7" /></button>
          {NAV_LINKS.map((l, i) => (
            <a key={l.href} href={l.href} onClick={closeMobile} className="text-2xl font-semibold text-white stagger-child landing-visible" style={{ transitionDelay: `${i * 0.1}s`, opacity: 1, transform: "none" }}>
              {l.label}
            </a>
          ))}
          <Link to="/auth" onClick={closeMobile} className="text-2xl font-semibold text-white">Accedi</Link>
          <Link to="/auth" onClick={closeMobile} className="text-white font-semibold px-8 py-3 rounded-lg text-lg mt-4" style={{ backgroundColor: PR_GREEN }}>
            Attiva Gratis
          </Link>
        </div>
      )}
    </>
  );
}
