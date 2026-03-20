import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "./constants";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-background/80 backdrop-blur-xl ${
        scrolled ? "shadow-lg border-b border-border" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        <Link to="/home" className="flex items-center gap-2">
          <img
            src="/pratica-rapida-logo.png"
            alt="Pratica Rapida"
            className="max-h-10 w-auto object-contain"
          />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/auth"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Accedi
          </Link>
        </div>

        <Link
          to="/auth"
          className="hidden md:inline-flex text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all animate-pulse-glow hover:brightness-110"
          style={{ backgroundColor: "hsl(var(--pr-green))" }}
        >
          Attiva Gratis
        </Link>

        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border px-4 pb-4 animate-fade-in">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={closeMobile}
              className="block py-3 text-sm font-medium text-muted-foreground"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/auth"
            onClick={closeMobile}
            className="block py-3 text-sm font-medium text-muted-foreground"
          >
            Accedi
          </Link>
          <Link
            to="/auth"
            onClick={closeMobile}
            className="block w-full text-center text-white font-semibold px-6 py-2.5 rounded-full mt-2"
            style={{ backgroundColor: "hsl(var(--pr-green))" }}
          >
            Attiva Gratis
          </Link>
        </div>
      )}
    </nav>
  );
}
