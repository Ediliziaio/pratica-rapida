import { useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Navbar, Footer } from "@/components/landing";

interface Props {
  title: string;
  description: string;
  bulletIntro: string;
  bullets: string[];
  iframeSrc: string;
  iframeId: string;
  iframeHeight: number;
  formName: string;
}

export default function OldPortalFormPage({
  title,
  description,
  bulletIntro,
  bullets,
  iframeSrc,
  iframeId,
  iframeHeight,
  formName,
}: Props) {
  useEffect(() => {
    if (document.querySelector('script[src="https://link.msgsndr.com/js/form_embed.js"]')) return;
    const s = document.createElement("script");
    s.src = "https://link.msgsndr.com/js/form_embed.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 lg:px-8">

          {/* Back */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <Link
              to="/area-riservata-vecchia"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Torna all'area riservata
            </Link>
          </motion.div>

          {/* Info card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-8"
          >
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mb-5">{title}</h1>
            <p className="text-muted-foreground leading-relaxed mb-6">{description}</p>

            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <p className="text-sm font-bold text-foreground mb-3">Cosa Ricevi:</p>
              <ul className="space-y-2">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[hsl(152,65%,38%)]" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Form section */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8"
          >
            <p className="text-sm font-semibold text-muted-foreground mb-6">{bulletIntro}</p>

            <iframe
              src={iframeSrc}
              style={{ width: "100%", height: iframeHeight, border: "none", borderRadius: 3 }}
              id={iframeId}
              data-layout="{'id':'INLINE'}"
              data-trigger-type="alwaysShow"
              data-trigger-value=""
              data-activation-type="alwaysActivated"
              data-activation-value=""
              data-deactivation-type="neverDeactivate"
              data-deactivation-value=""
              data-form-name={formName}
              data-height={iframeHeight}
              data-layout-iframe-id={iframeId}
              data-form-id={iframeId.replace("inline-", "")}
              title={formName}
            />
          </motion.div>

        </div>
      </main>
      <Footer />
    </>
  );
}
