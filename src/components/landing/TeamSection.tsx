import React from "react";
import { Users } from "lucide-react";
import { PR_GREEN } from "./constants";
import { Section } from "./Section";
import teamImg from "@/assets/team-illustration.jpg";

interface TeamSectionProps {
  teamSectionRef: React.RefObject<HTMLDivElement>;
}

export function TeamSection({ teamSectionRef }: TeamSectionProps) {
  return (
    <Section light>
      <div ref={teamSectionRef} className="max-w-5xl mx-auto px-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PR_GREEN}15` }}>
            <Users className="w-4 h-4" style={{ color: PR_GREEN }} />
          </div>
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: PR_GREEN }}>Il nostro team</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-bold mb-2 text-gray-900">
          Chi c'è dietro <span style={{ color: PR_GREEN }}>Pratica Rapida</span>?
        </h2>
        <div className="w-16 h-1 rounded-full mb-8" style={{ backgroundColor: PR_GREEN }} />

        <div className="grid grid-cols-3 gap-4 mb-10 bg-green-50 rounded-xl p-6 border border-green-100">
          <div className="text-center">
            <span className="text-3xl font-black" style={{ color: PR_GREEN }}>10+</span>
            <p className="text-xs text-gray-500 mt-1">Anni di esperienza</p>
          </div>
          <div className="text-center border-x border-green-200">
            <span className="text-3xl font-black" style={{ color: PR_GREEN }}>Migliaia</span>
            <p className="text-xs text-gray-500 mt-1">Pratiche gestite</p>
          </div>
          <div className="text-center">
            <span className="text-3xl font-black" style={{ color: PR_GREEN }}>100%</span>
            <p className="text-xs text-gray-500 mt-1">Pratiche assicurate</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="space-y-4 text-gray-500 leading-relaxed">
              <p>Da <strong className="text-gray-800">oltre 10 anni</strong> ci occupiamo di pratiche nel settore degli infissi, delle tende da sole, delle pergole e dei serramenti. Non siamo l'ennesima startup che ha scoperto ieri cosa sia una pratica ENEA.</p>
              <p>Abbiamo supportato <strong className="text-gray-800">centinaia di aziende durante il periodo del bonus dello sconto in fattura</strong>, gestendo volumi enormi di pratiche con precisione e puntualità. Quella esperienza ci ha reso ancora più veloci, affidabili e organizzati.</p>
              <p>Il nostro team è composto da <strong className="text-gray-800">professionisti specializzati</strong>. Ogni pratica è seguita con cura, verificata e assicurata. Ci presentiamo a nome della vostra azienda e trattiamo i vostri clienti come se fossero i nostri.</p>
            </div>
            <div className="mt-8 bg-green-50 border-l-4 rounded-r-lg p-5" style={{ borderColor: PR_GREEN }}>
              <p className="text-gray-700 font-semibold italic text-lg">
                "Permetterti di offrire un servizio completo ai tuoi clienti senza aggiungere un solo minuto di lavoro alla tua giornata."
              </p>
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden shadow-lg border" style={{ borderColor: `${PR_GREEN}30` }}>
            <img src={teamImg} alt="Il team di Pratica Rapida" className="w-full h-auto" loading="lazy" />
            <div className="absolute bottom-4 left-4 px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ backgroundColor: PR_GREEN }}>
              Oltre 10 anni nel settore
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
