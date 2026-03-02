import { Link } from "react-router-dom";
import { Phone, FileText, Building2 } from "lucide-react";
import { PR_GREEN } from "./constants";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 py-12 px-6 bg-white pb-32">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8">
          <div className="space-y-3">
            <img src="/pratica-rapida-logo.png" alt="Pratica Rapida" className="h-8 w-auto" />
            <div className="space-y-1.5 text-sm text-gray-500">
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4" style={{ color: PR_GREEN }} />
                +39 351 7935227
              </p>
              <p className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: PR_GREEN }} />
                modulistica@praticarapida.it
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="w-4 h-4" style={{ color: PR_GREEN }} />
                Lissone (MB)
              </p>
              <p className="text-xs text-gray-400">P.IVA 03937130791</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 text-sm text-gray-500">
            <a href="#come-funziona" className="hover:text-gray-800 transition-colors">Come Funziona</a>
            <a href="#confronto" className="hover:text-gray-800 transition-colors">Confronto</a>
            <a href="#prezzi" className="hover:text-gray-800 transition-colors">Prezzi</a>
            <a href="#faq" className="hover:text-gray-800 transition-colors">FAQ</a>
            <Link to="/auth" className="hover:text-gray-800 transition-colors">Accedi</Link>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Pratica Rapida. Tutti i diritti riservati.</p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <Link to="/privacy-policy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
            <Link to="/cookie-policy" className="hover:text-gray-600 transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
