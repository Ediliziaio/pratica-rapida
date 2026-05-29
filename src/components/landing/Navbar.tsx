import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import { NAV_LINKS, type NavLink } from "./constants";

function DesktopDropdown({ link }: { link: NavLink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {link.label}
        <ChevronDown
          size={15}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full pt-2 z-50">
          <div className="min-w-[200px] rounded-lg border border-border bg-white shadow-lg py-2 animate-fade-in">
            {link.children!.map((c) => (
              <Link
                key={c.href}
                to={c.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState<string | null>(null);
  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setMobileSubOpen(null);
  }, []);

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
          {NAV_LINKS.map((l) =>
            l.children ? (
              <DesktopDropdown key={l.href} link={l} />
            ) : (
              <Link
                key={l.href}
                to={l.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            )
          )}
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
          {NAV_LINKS.map((l) =>
            l.children ? (
              <div key={l.href} className="border-b border-border/50">
                <button
                  type="button"
                  onClick={() =>
                    setMobileSubOpen((cur) => (cur === l.href ? null : l.href))
                  }
                  className="flex w-full items-center justify-between py-3 text-sm font-medium text-muted-foreground"
                  aria-expanded={mobileSubOpen === l.href}
                >
                  {l.label}
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                      mobileSubOpen === l.href ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {mobileSubOpen === l.href && (
                  <div className="pb-2">
                    {l.children.map((c) => (
                      <Link
                        key={c.href}
                        to={c.href}
                        onClick={closeMobile}
                        className="block py-2.5 pl-4 text-sm font-medium text-muted-foreground"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={l.href}
                to={l.href}
                onClick={closeMobile}
                className="block py-3 text-sm font-medium text-muted-foreground border-b border-border/50 last:border-0"
              >
                {l.label}
              </Link>
            )
          )}

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
