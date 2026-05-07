/**
 * LeadRequestModal — modulo "Richiedi informazioni" per le landing pubbliche.
 *
 * Aperto da CTA tipo "Attiva Gratis" / "Inizia Gratis". Posta direttamente
 * a public.leads (RLS con policy `Public submit lead` accetta INSERT da anon
 * solo con source='public_form').
 *
 * Visibile a tutto il personale Pratica Rapida nella pagina /aziende > Pipeline.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Check, MessageCircle, Phone as PhoneIcon, ShieldCheck, Clock,
} from "lucide-react";

const WHATSAPP_URL = "https://wa.me/390398682691?text=Voglio%20avere%20maggiori%20informazioni%20sui%20vostri%20servizi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-set message shown above the form ("Pronto a iniziare?", "Richiedi una demo", etc.) */
  title?: string;
  description?: string;
}

interface FormState {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  citta: string;
  note: string;
  /** Honeypot field — bots fill it, humans don't. Submission is silently dropped if non-empty. */
  website: string;
  /** Required GDPR consent. */
  privacyAccepted: boolean;
}

const emptyForm: FormState = {
  nome: "", cognome: "", email: "", telefono: "", citta: "", note: "",
  website: "", privacyAccepted: false,
};

/** Minimum time (ms) the form must be visible before a submission is plausibly human. */
const MIN_INTERACTION_MS = 1500;

export default function LeadRequestModal({
  open, onOpenChange, title, description,
}: Props) {
  const { toast } = useToast();
  const location = useLocation();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const openedAt = useRef<number | null>(null);

  // Reset state on open (so reopen is always fresh, no flicker from delayed reset on close)
  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setSubmitted(false);
      setSubmitting(false);
      openedAt.current = Date.now();
    }
  }, [open]);

  const validate = (): string | null => {
    if (!form.nome.trim()) return "Inserisci il tuo nome";
    if (!form.email.trim() && !form.telefono.trim())
      return "Inserisci almeno un contatto (email o telefono)";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "L'indirizzo email non sembra valido";
    if (form.telefono && form.telefono.trim().replace(/\D/g, "").length < 7)
      return "Il numero di telefono sembra troppo corto";
    if (!form.privacyAccepted)
      return "Accetta l'informativa sulla privacy per continuare";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Anti-spam: honeypot field filled → silently fake-success without writing.
    // Bots usually auto-fill every input; humans never see this hidden field.
    if (form.website.trim()) {
      console.warn("[lead-form] honeypot triggered, submission dropped");
      setSubmitted(true);
      return;
    }
    // Anti-spam: ultra-fast submission (< 1.5s after open) is almost certainly a bot.
    if (openedAt.current && Date.now() - openedAt.current < MIN_INTERACTION_MS) {
      console.warn("[lead-form] too-fast submission dropped");
      setSubmitted(true);
      return;
    }

    const err = validate();
    if (err) {
      toast({ title: "Controlla i dati", description: err, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("leads").insert({
        nome: form.nome.trim(),
        cognome: form.cognome.trim() || null,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        citta: form.citta.trim() || null,
        note: form.note.trim() || null,
        source: "public_form",
        page_url: typeof window !== "undefined" ? window.location.origin + location.pathname : null,
        stage_id: "lead",
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Si è verificato un errore",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <SuccessState onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                {title ?? "Richiedi informazioni"}
              </DialogTitle>
              <DialogDescription>
                {description ?? "Lascia i tuoi contatti, ti richiamiamo entro 24 ore lavorative. Nessun impegno."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-3 mt-2">
              {/* Honeypot — hidden from users, filled by bots */}
              <div aria-hidden="true" className="hidden" tabIndex={-1}>
                <Label htmlFor="lead-website">Sito web (lascia vuoto)</Label>
                <Input
                  id="lead-website"
                  type="text"
                  autoComplete="off"
                  tabIndex={-1}
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="lead-nome">Nome *</Label>
                  <Input
                    id="lead-nome"
                    autoFocus
                    autoComplete="given-name"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Mario"
                    required
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label htmlFor="lead-cognome">Cognome</Label>
                  <Input
                    id="lead-cognome"
                    autoComplete="family-name"
                    value={form.cognome}
                    onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
                    placeholder="Rossi"
                    maxLength={100}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="mario.rossi@azienda.it"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="lead-telefono">Telefono</Label>
                  <Input
                    id="lead-telefono"
                    type="tel"
                    autoComplete="tel"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="+39 333 123 4567"
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label htmlFor="lead-citta">Città</Label>
                  <Input
                    id="lead-citta"
                    autoComplete="address-level2"
                    value={form.citta}
                    onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))}
                    placeholder="Milano"
                    maxLength={100}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="lead-note" className="flex items-center gap-2">
                  Messaggio <span className="text-muted-foreground text-[11px] font-normal">(opzionale)</span>
                </Label>
                <Textarea
                  id="lead-note"
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Es. Sono interessato al servizio Conto Termico, gestisco circa 20 cantieri al mese."
                  maxLength={1000}
                />
              </div>

              {/* GDPR consent */}
              <label className="flex items-start gap-2 cursor-pointer p-2 -mx-2 rounded hover:bg-muted/50 transition-colors">
                <Checkbox
                  id="lead-privacy"
                  checked={form.privacyAccepted}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, privacyAccepted: checked === true }))
                  }
                  className="mt-0.5"
                />
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  Acconsento al trattamento dei miei dati personali per essere ricontattato/a
                  da Pratica Rapida ai sensi del{" "}
                  <a
                    href="https://www.praticarapida.it/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    GDPR e dell'informativa privacy
                  </a>.
                </span>
              </label>

              <Button
                type="submit"
                disabled={submitting || !form.privacyAccepted || !form.nome.trim()}
                className="w-full font-bold"
                style={{ background: "hsl(var(--pr-green))" }}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invio in corso…</>
                ) : (
                  "Invia richiesta"
                )}
              </Button>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <Badge icon={Clock} text="Risposta in 24h" />
                <Badge icon={ShieldCheck} text="Nessun impegno" />
                <Badge icon={PhoneIcon} text="Ti chiamiamo noi" />
              </div>

              {/* WhatsApp shortcut for impatient users */}
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Preferisci scriverci?{" "}
                <span className="inline-flex items-center gap-1 font-medium underline" style={{ color: "hsl(152 70% 38%)" }}>
                  <MessageCircle size={11} />Contattaci su WhatsApp
                </span>
              </a>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Badge({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="h-4 w-4" style={{ color: "hsl(152 70% 38%)" }} />
      <span className="text-[10px] font-medium leading-tight">{text}</span>
    </div>
  );
}

function SuccessState({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="text-center py-2"
    >
      <div
        className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ background: "hsla(152,70%,40%,0.12)" }}
      >
        <Check className="h-7 w-7" style={{ color: "hsl(152 70% 38%)" }} strokeWidth={3} />
      </div>
      <h3 className="text-xl font-bold mb-2">Richiesta ricevuta!</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
        Grazie per averci contattato. Ti richiamiamo entro 24 ore lavorative
        per spiegarti come possiamo aiutarti.
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={onClose} className="w-full">Chiudi</Button>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle size={12} />
          Hai fretta? Scrivici su WhatsApp
        </a>
      </div>
    </motion.div>
  );
}
