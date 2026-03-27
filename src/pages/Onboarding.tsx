import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronRight, ChevronLeft, Building2, User, MapPin, Heart } from "lucide-react";

// -----------------------------------------------
// Schemas per step
// -----------------------------------------------
const step1Schema = z.object({
  nome: z.string().min(2, "Inserisci il tuo nome"),
  cognome: z.string().min(2, "Inserisci il tuo cognome"),
  telefono: z.string().min(8, "Numero non valido"),
  preferred_contact: z.enum(["email", "whatsapp"]),
});

const step2Schema = z.object({
  company_name: z.string().min(2, "Inserisci la ragione sociale"),
  piva: z.string().min(11, "P.IVA non valida").max(11, "P.IVA non valida"),
  address: z.string().min(3, "Inserisci l'indirizzo"),
  city: z.string().min(2, "Inserisci la città"),
});

const step3Schema = z.object({
  referral_source: z.string().min(1, "Seleziona un'opzione"),
  notes: z.string().optional(),
});

const step4Schema = z.object({
  privacy: z.boolean().refine((v) => v === true, "Devi accettare la privacy policy"),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;
type Step4 = z.infer<typeof step4Schema>;

const STEPS = [
  { label: "Benvenuto",     icon: User },
  { label: "La tua Azienda", icon: Building2 },
  { label: "Come ci hai trovato", icon: MapPin },
  { label: "Conferma",      icon: Heart },
];

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir < 0 ? 80 : -80, opacity: 0 }),
};

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Step1 & Step2 & Step3 & Step4>>({});

  // Forms per step
  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema), defaultValues: { preferred_contact: "email" } });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema) });
  const form4 = useForm<Step4>({ resolver: zodResolver(step4Schema) });

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const saveStep = async (data: Partial<Step1 & Step2 & Step3 & Step4>) => {
    if (!user) return;
    const merged = { ...formData, ...data };
    setFormData(merged);
    await supabase.from("profiles").update({ onboarding_step: step + 1 }).eq("id", user.id);
  };

  const handleStep1 = async (data: Step1) => {
    setSaving(true);
    await supabase.from("profiles").update({ nome: data.nome, cognome: data.cognome, telefono: data.telefono, preferred_contact: data.preferred_contact, onboarding_step: 1 }).eq("id", user!.id);
    await saveStep(data);
    setSaving(false);
    goTo(1);
  };

  const handleStep2 = async (data: Step2) => {
    setSaving(true);
    await supabase.from("profiles").update({ company_name: data.company_name, piva: data.piva, address: data.address, city: data.city, onboarding_step: 2 }).eq("id", user!.id);
    await saveStep(data);
    setSaving(false);
    goTo(2);
  };

  const handleStep3 = async (data: Step3) => {
    setSaving(true);
    await supabase.from("profiles").update({ referral_source: data.referral_source, notes: data.notes ?? null, onboarding_step: 3 }).eq("id", user!.id);
    await saveStep(data);
    setSaving(false);
    goTo(3);
  };

  const handleStep4 = async () => {
    setSaving(true);
    try {
      const merged = { ...formData };

      await supabase.from("profiles").update({ onboarding_completed: true, onboarding_step: 4 }).eq("id", user!.id);

      // Email benvenuto
      await supabase.functions.invoke("send-email", {
        body: { to: user!.email, template: "onboarding_welcome", data: { nome: merged.nome ?? "", cognome: merged.cognome ?? "" } },
      }).catch(() => null);

      toast({ title: "Benvenuto in Pratica Rapida! 🎉", description: "Il tuo account è pronto." });
      navigate("/");
    } catch {
      toast({ title: "Errore", description: "Riprova tra poco.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const progress = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Pratica Rapida</h1>
          <p className="text-slate-400 text-sm">Configuriamo il tuo account in pochi minuti</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? "bg-green-500 text-white" :
                i === step ? "bg-primary text-white ring-4 ring-primary/30" :
                "bg-slate-700 text-slate-400"
              }`}>
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 transition-all ${i < step ? "bg-green-500" : "bg-slate-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="mb-6 h-1.5" />

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-8 pt-8 pb-2 border-b bg-slate-50">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">Step {step + 1} di {STEPS.length}</p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">{STEPS[step].label}</h2>
          </div>

          <div className="p-8 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: "easeInOut" }}
              >

                {/* STEP 1 */}
                {step === 0 && (
                  <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nome *</Label>
                        <Input {...form1.register("nome")} placeholder="Mario" className="mt-1" />
                        {form1.formState.errors.nome && <p className="text-red-500 text-xs mt-1">{form1.formState.errors.nome.message}</p>}
                      </div>
                      <div>
                        <Label>Cognome *</Label>
                        <Input {...form1.register("cognome")} placeholder="Rossi" className="mt-1" />
                        {form1.formState.errors.cognome && <p className="text-red-500 text-xs mt-1">{form1.formState.errors.cognome.message}</p>}
                      </div>
                    </div>
                    <div>
                      <Label>Telefono *</Label>
                      <Input {...form1.register("telefono")} placeholder="+39 333 1234567" className="mt-1" />
                      {form1.formState.errors.telefono && <p className="text-red-500 text-xs mt-1">{form1.formState.errors.telefono.message}</p>}
                    </div>
                    <div>
                      <Label>Canale preferito per le notifiche</Label>
                      <Select onValueChange={(v) => form1.setValue("preferred_contact", v as "email" | "whatsapp")} defaultValue="email">
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">📧 Email</SelectItem>
                          <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full mt-2" disabled={saving}>
                      {saving ? "Salvataggio..." : <span className="flex items-center gap-2">Avanti <ChevronRight className="h-4 w-4" /></span>}
                    </Button>
                  </form>
                )}

                {/* STEP 2 */}
                {step === 1 && (
                  <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-4">
                    <div>
                      <Label>Ragione Sociale *</Label>
                      <Input {...form2.register("company_name")} placeholder="Mario Rossi Srl" className="mt-1" />
                      {form2.formState.errors.company_name && <p className="text-red-500 text-xs mt-1">{form2.formState.errors.company_name.message}</p>}
                    </div>
                    <div>
                      <Label>Partita IVA *</Label>
                      <Input {...form2.register("piva")} placeholder="01234567890" maxLength={11} className="mt-1" />
                      {form2.formState.errors.piva && <p className="text-red-500 text-xs mt-1">{form2.formState.errors.piva.message}</p>}
                    </div>
                    <div>
                      <Label>Indirizzo *</Label>
                      <Input {...form2.register("address")} placeholder="Via Roma 1" className="mt-1" />
                      {form2.formState.errors.address && <p className="text-red-500 text-xs mt-1">{form2.formState.errors.address.message}</p>}
                    </div>
                    <div>
                      <Label>Città *</Label>
                      <Input {...form2.register("city")} placeholder="Milano" className="mt-1" />
                      {form2.formState.errors.city && <p className="text-red-500 text-xs mt-1">{form2.formState.errors.city.message}</p>}
                    </div>
                    <div className="flex gap-3 mt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => goTo(0)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
                      </Button>
                      <Button type="submit" className="flex-1" disabled={saving}>
                        {saving ? "Salvataggio..." : <span className="flex items-center gap-2">Avanti <ChevronRight className="h-4 w-4" /></span>}
                      </Button>
                    </div>
                  </form>
                )}

                {/* STEP 3 */}
                {step === 2 && (
                  <form onSubmit={form3.handleSubmit(handleStep3)} className="space-y-4">
                    <div>
                      <Label>Come ci hai trovato? *</Label>
                      <Select onValueChange={(v) => form3.setValue("referral_source", v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">🔍 Google</SelectItem>
                          <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                          <SelectItem value="passaparola">🗣️ Passaparola</SelectItem>
                          <SelectItem value="social">📸 Social Media</SelectItem>
                          <SelectItem value="agente">🤝 Agente</SelectItem>
                          <SelectItem value="altro">💬 Altro</SelectItem>
                        </SelectContent>
                      </Select>
                      {form3.formState.errors.referral_source && <p className="text-red-500 text-xs mt-1">{form3.formState.errors.referral_source.message}</p>}
                    </div>
                    <div>
                      <Label>Note aggiuntive <span className="text-slate-400">(opzionale)</span></Label>
                      <Input {...form3.register("notes")} placeholder="Qualcosa che vuoi dirci..." className="mt-1" />
                    </div>
                    <div className="flex gap-3 mt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => goTo(1)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
                      </Button>
                      <Button type="submit" className="flex-1" disabled={saving}>
                        {saving ? "Salvataggio..." : <span className="flex items-center gap-2">Avanti <ChevronRight className="h-4 w-4" /></span>}
                      </Button>
                    </div>
                  </form>
                )}

                {/* STEP 4 */}
                {step === 3 && (
                  <form onSubmit={form4.handleSubmit(handleStep4)} className="space-y-5">
                    {/* Riepilogo */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                      <p className="font-semibold text-slate-700 mb-3">Riepilogo dati</p>
                      <div className="grid grid-cols-2 gap-y-1 text-slate-600">
                        <span className="text-slate-400">Nome</span>
                        <span>{formData.nome} {formData.cognome}</span>
                        <span className="text-slate-400">Telefono</span>
                        <span>{formData.telefono}</span>
                        <span className="text-slate-400">Azienda</span>
                        <span>{formData.company_name}</span>
                        <span className="text-slate-400">P.IVA</span>
                        <span>{formData.piva}</span>
                        <span className="text-slate-400">Città</span>
                        <span>{formData.city}</span>
                        <span className="text-slate-400">Canale</span>
                        <span className="capitalize">{formData.preferred_contact}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="privacy"
                        onCheckedChange={(v) => form4.setValue("privacy", !!v)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="privacy" className="text-sm text-slate-600 leading-relaxed cursor-pointer">
                        Accetto la{" "}
                        <a href="/privacy-policy" target="_blank" className="text-primary underline">Privacy Policy</a>
                        {" "}e il trattamento dei dati per l'erogazione del servizio.
                      </Label>
                    </div>
                    {form4.formState.errors.privacy && <p className="text-red-500 text-xs">{form4.formState.errors.privacy.message}</p>}

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => goTo(2)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
                      </Button>
                      <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700" disabled={saving}>
                        {saving ? "Completamento..." : "🚀 Inizia Ora!"}
                      </Button>
                    </div>
                  </form>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          © {new Date().getFullYear()} Pratica Rapida — AEDIX
        </p>
      </div>
    </div>
  );
}
