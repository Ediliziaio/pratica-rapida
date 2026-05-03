import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/390398682691?text=Ciao%2C%20vorrei%20sapere%20come%20funziona%20Pratica%20Rapida";

export default function Footer() {
  return (
    <footer className="py-16 text-white/70" style={{ backgroundColor: "hsl(var(--pr-dark))" }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div>
            <img src="/pratica-rapida-logo-white.png" alt="Pratica Rapida" className="h-8 w-auto mb-3" />
            <p className="text-sm italic mb-4">"Le pratiche dei tuoi clienti? Ci pensiamo noi."</p>
            <p className="text-xs text-white/40">Pratica Rapida S.r.l.s. — P.IVA 03937130791</p>
            <p className="text-xs text-white/40 mt-1">Lissone (MB)</p>
          </div>

          {/* Servizi */}
          <div>
            <h5 className="font-bold text-sm text-white mb-4">Servizi</h5>
            <Link to="/pratica-enea" className="block text-sm mb-2 hover:text-white transition-colors">Pratiche ENEA</Link>
            <Link to="/conto-termico" className="block text-sm mb-2 hover:text-white transition-colors">Conto Termico</Link>
            <Link to="/pratica-enea#come-funziona" className="block text-sm mb-2 hover:text-white transition-colors">Come funziona</Link>
            <Link to="/pratica-enea#prezzi" className="block text-sm mb-2 hover:text-white transition-colors">Prezzi</Link>
          </div>

          {/* Azienda */}
          <div>
            <h5 className="font-bold text-sm text-white mb-4">Azienda</h5>
            <Link to="/" className="block text-sm mb-2 hover:text-white transition-colors">Home</Link>
            <Link to="/faq" className="block text-sm mb-2 hover:text-white transition-colors">FAQ</Link>
            <Link to="/blog" className="block text-sm mb-2 hover:text-white transition-colors">News</Link>
            <Link to="/auth" className="block text-sm mb-2 hover:text-white transition-colors">Accedi al portale</Link>
            <a
              href="https://www.praticarapida.com/area-rivenditori/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm mb-2 hover:text-white transition-colors text-orange-400/80 hover:text-orange-300"
            >
              Portale precedente
            </a>
          </div>

          {/* Contatti */}
          <div>
            <h5 className="font-bold text-sm text-white mb-4">Contatti</h5>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm mb-2 hover:text-white transition-colors text-green-400/90">
              <MessageCircle size={14} className="shrink-0" /> WhatsApp — Scrivici subito
            </a>
            <a href="tel:+390398682691" className="flex items-center gap-2 text-sm mb-2 hover:text-white transition-colors">
              <Phone size={14} className="shrink-0" /> +39 039 868 2691
            </a>
            <a href="mailto:modulistica@praticarapida.it" className="flex items-center gap-2 text-sm mb-2 hover:text-white transition-colors">
              <Mail size={14} className="shrink-0" /> modulistica@praticarapida.it
            </a>
            <p className="flex items-center gap-2 text-sm mb-2">
              <MapPin size={14} className="shrink-0" /> Lissone (MB)
            </p>
            <p className="flex items-center gap-2 text-sm">
              <Clock size={14} className="shrink-0" /> Lun-Ven 9:00-18:00
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
          <p>© {new Date().getFullYear()} Pratica Rapida · Pratica Rapida S.r.l.s. Tutti i diritti riservati.</p>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
