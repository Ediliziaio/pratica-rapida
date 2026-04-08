import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "./constants";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl shadow-sm border-b border-border transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/pratica-rapida-logo.png"
            alt="Pratica Rapida"
            className="max-h-10 w-auto object-contain"
          />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right CTA group */}
        <div className="hidden md:flex items-center gap-2">
          {/* Area Rivenditori — primary CTA */}
          <Link
            to="/area-riservata-vecchia"
            className="inline-flex items-center gap-1.5 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ backgroundColor: "#f97316" }}
          >
            Area Rivenditori
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-b border-border px-4 pb-5 pt-1 animate-fade-in">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              onClick={closeMobile}
              className="block py-3 text-sm font-medium text-muted-foreground border-b border-border/50 last:border-0"
            >
              {l.label}
            </Link>
          ))}

          <div className="flex flex-col gap-2 mt-4">
            <Link
              to="/area-riservata-vecchia"
              onClick={closeMobile}
              className="block w-full text-center text-white font-bold px-6 py-3 rounded-full text-sm"
              style={{ backgroundColor: "#f97316" }}
            >
              Area Rivenditori
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
