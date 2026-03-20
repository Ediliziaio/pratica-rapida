import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useScrollAnimation } from "./hooks";
import { Star } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const testimonials = [
  { text: "Servizio impeccabile! Pratica ENEA completata in meno di 24 ore, senza che il mio cliente debba muovere un dito. Consigliatissimo.", author: "Zanellato Enrico", tag: "Serramenti • Veneto", avatar: "ZE" },
  { text: "Professionalità e rapidità. Ho delegato tutte le pratiche ENEA e non potrei essere più soddisfatto. I miei clienti pensano sia il mio ufficio tecnico.", author: "Marco Barbieri", tag: "Infissi • Lombardia", avatar: "MB" },
  { text: "Da quando uso Pratica Rapida ho chiuso più vendite. Il cliente vuole un servizio completo e ora posso offrirglielo senza sforzo.", author: "Silvana", tag: "Tende da Sole • Emilia-Romagna", avatar: "S" },
  { text: "65€ a pratica è un prezzo imbattibile considerando che prima spendevo ore del mio tempo. Ora mi concentro sulle vendite.", author: "Valentina Quagliarella", tag: "Pergole • Puglia", avatar: "VQ" },
  { text: "L'assicurazione RC inclusa mi dà una tranquillità enorme. Sapere che se c'è un errore loro rispondono è impagabile.", author: "Roberto M.", tag: "Fotovoltaico • Lazio", avatar: "RM" },
];

const featured = {
  text: "In 6 mesi ho aumentato il fatturato del 15% semplicemente perché ora offro un servizio completo. Il cliente non deve più andare dal commercialista per la pratica ENEA. A nome mio, Pratica Rapida gestisce tutto. È stato il miglior investimento della mia attività.",
  author: "Alessandro T., Titolare Serramenti, Torino — in partnership da 2 anni",
};

const swipeVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 200 : -200, opacity: 0 }),
};

export default function ReviewsSection() {
  const { ref, isVisible } = useScrollAnimation();
  const [[active, direction], setActiveState] = useState([0, 0]);

  const paginate = useCallback((newDirection: number) => {
    setActiveState(([prev]) => [(prev + newDirection + testimonials.length) % testimonials.length, newDirection]);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => paginate(1), 5000);
    return () => clearInterval(interval);
  }, [paginate]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50) paginate(1);
    else if (info.offset.x > 50) paginate(-1);
  };

  return (
    <section ref={ref} id="testimonianze" className="py-16 sm:py-20 lg:py-28 bg-card">
      <div className="max-w-5xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="font-bold text-2xl sm:text-3xl lg:text-5xl leading-[1.1] mb-4 text-foreground">
            122+ Aziende Ci Hanno Già
            <br />
            <span style={{ color: "hsl(var(--pr-green))" }}>Scelto su Trustpilot.</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Imprenditori reali, risultati reali.
          </p>
        </motion.div>

        <div className="max-w-2xl mx-auto mb-10 sm:mb-12">
          <div className="relative overflow-hidden rounded-2xl border border-border shadow-lg min-h-[240px] sm:min-h-[220px]">
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={active}
                custom={direction}
                variants={swipeVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.3 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={handleDragEnd}
                className="bg-card p-5 sm:p-8 flex flex-col justify-between min-h-[240px] sm:min-h-[220px] cursor-grab active:cursor-grabbing touch-pan-y"
              >
                <div>
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={16} style={{ fill: "hsl(var(--pr-green))", color: "hsl(var(--pr-green))" }} />
                    ))}
                  </div>
                  <p className="text-foreground leading-relaxed italic text-sm sm:text-base select-none">
                    "{testimonials[active].text}"
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: "hsl(var(--pr-green))" }}
                  >
                    {testimonials[active].avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{testimonials[active].author}</p>
                    <span
                      className="inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "hsla(var(--pr-green), 0.1)", color: "hsl(var(--pr-green))" }}
                    >
                      {testimonials[active].tag}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="flex justify-center gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveState([i, i > active ? 1 : -1])}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    i === active ? "w-6" : "w-2.5 bg-border"
                  }`}
                  style={i === active ? { backgroundColor: "hsl(var(--pr-green))" } : {}}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60 sm:hidden">← Scorri per navigare →</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3 }}
          className="max-w-3xl mx-auto rounded-2xl p-5 sm:p-8 text-white"
          style={{ backgroundColor: "hsl(var(--pr-green))" }}
        >
          <div className="flex gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={16} className="fill-white text-white" />
            ))}
          </div>
          <p className="text-base sm:text-lg leading-relaxed italic mb-4">"{featured.text}"</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">AT</div>
            <p className="font-bold text-sm sm:text-base">{featured.author}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
