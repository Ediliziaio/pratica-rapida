import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="py-16 text-white/70" style={{ backgroundColor: "hsl(var(--pr-dark))" }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <img src="/pratica-rapida-logo-white.png" alt="Pratica Rapida" className="h-8 w-auto mb-3" />
            <p className="text-sm italic mb-4">"Le pratiche ENEA dei tuoi clienti? Ci pensiamo noi."</p>
          </div>

          <div>
            <h5 className="font-bold text-sm text-white mb-4">Servizi</h5>
            {[
              "Compilazione ENEA",
              "Invio Telematico",
              "Raccolta Documenti",
              "Contatto Cliente",
              "Assicurazione RC",
            ].map((s) => (
              <a key={s} href="#servizi" className="block text-sm mb-2 hover:text-white transition-colors">{s}</a>
            ))}
          </div>

          <div>
            <h5 className="font-bold text-sm text-white mb-4">Azienda</h5>
            <a href="#come-funziona" className="block text-sm mb-2 hover:text-white transition-colors">Come Funziona</a>
            <a href="#prezzi" className="block text-sm mb-2 hover:text-white transition-colors">Prezzi</a>
            <a href="#testimonianze" className="block text-sm mb-2 hover:text-white transition-colors">Recensioni</a>
            <a href="#faq" className="block text-sm mb-2 hover:text-white transition-colors">FAQ</a>
            <Link to="/auth" className="block text-sm mb-2 hover:text-white transition-colors">Accedi</Link>
          </div>

          <div>
            <h5 className="font-bold text-sm text-white mb-4">Contatti</h5>
            <p className="text-sm mb-2">📞 +39 039 868 2691</p>
            <p className="text-sm mb-2">📧 modulistica@praticarapida.it</p>
            <p className="text-sm mb-2">📍 Lissone (MB)</p>
            <p className="text-sm mb-2">🕐 Lun-Ven 9:00-18:00</p>
            <p className="text-xs text-white/40 mt-3">P.IVA 03937130791</p>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
          <p>© {new Date().getFullYear()} Pratica Rapida. Tutti i diritti riservati.</p>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
