import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clienteSchema } from "@/lib/validation-schemas";
import type { Tables } from "@/integrations/supabase/types";

const INITIAL_FORM = {
  ragione_sociale: "",
  tipo: "azienda" as "azienda" | "persona",
  codice_destinatario_sdi: "",
  referente: "",
  piva: "",
  codice_fiscale: "",
  paese: "Italia",
  indirizzo: "",
  citta: "",
  cap: "",
  provincia: "",
  note_indirizzo: "",
  codice_cliente_interno: "",
  email: "",
  invio_documento_cortesia: false,
  escludi_documento_cortesia: false,
  escludi_solleciti: false,
  pec: "",
  telefono: "",
  note: "",
  nome: "",
  cognome: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated?: (clientId: string) => void;
  clienteData?: Tables<"clienti_finali"> | null;
}

export default function NuovoClienteDialog({ open, onOpenChange, onClientCreated, clienteData }: Props) {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!clienteData;

  // Pre-fill form when editing, reset on close
  useEffect(() => {
    if (!open) {
      setErrors({});
      if (!clienteData) setForm(INITIAL_FORM);
      return;
    }
    if (clienteData) {
      setForm({
        ragione_sociale: clienteData.ragione_sociale || "",
        tipo: (clienteData.tipo as "azienda" | "persona") || "azienda",
        codice_destinatario_sdi: clienteData.codice_destinatario_sdi || "",
        referente: clienteData.referente || "",
        piva: clienteData.piva || "",
        codice_fiscale: clienteData.codice_fiscale || "",
        paese: clienteData.paese || "Italia",
        indirizzo: clienteData.indirizzo || "",
        citta: clienteData.citta || "",
        cap: clienteData.cap || "",
        provincia: clienteData.provincia || "",
        note_indirizzo: clienteData.note_indirizzo || "",
        codice_cliente_interno: clienteData.codice_cliente_interno || "",
        email: clienteData.email || "",
        invio_documento_cortesia: clienteData.invio_documento_cortesia || false,
        escludi_documento_cortesia: clienteData.escludi_documento_cortesia || false,
        escludi_solleciti: clienteData.escludi_solleciti || false,
        pec: clienteData.pec || "",
        telefono: clienteData.telefono || "",
        note: clienteData.note || "",
        nome: clienteData.nome || "",
        cognome: clienteData.cognome || "",
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [clienteData, open]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");

      // Validate with Zod
      const result = clienteSchema.safeParse(form);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((e) => {
          const field = e.path[0]?.toString() || "form";
          fieldErrors[field] = e.message;
        });
        setErrors(fieldErrors);
        throw new Error("Dati non validi. Controlla i campi evidenziati.");
      }

      const validated = result.data;
      const payload = {
        company_id: companyId,
        ragione_sociale: validated.ragione_sociale || "",
        nome: validated.tipo === "persona" ? (validated.nome || "") : (validated.nome || validated.ragione_sociale || ""),
        cognome: validated.cognome || "",
        tipo: validated.tipo,
        codice_destinatario_sdi: validated.codice_destinatario_sdi || "",
        referente: validated.referente || "",
        piva: validated.piva || "",
        codice_fiscale: validated.codice_fiscale || "",
        paese: validated.paese || "Italia",
        indirizzo: validated.indirizzo || "",
        citta: validated.citta || "",
        cap: validated.cap || "",
        provincia: validated.provincia || "",
        note_indirizzo: validated.note_indirizzo || "",
        codice_cliente_interno: validated.codice_cliente_interno || "",
        email: validated.email || "",
        invio_documento_cortesia: validated.invio_documento_cortesia || false,
        escludi_documento_cortesia: validated.escludi_documento_cortesia || false,
        escludi_solleciti: validated.escludi_solleciti || false,
        pec: validated.pec || "",
        telefono: validated.telefono || "",
        note: validated.note || "",
      };

      if (isEditing && clienteData) {
        const { error } = await supabase
          .from("clienti_finali")
          .update(payload)
          .eq("id", clienteData.id);
        if (error) throw error;
        return { id: clienteData.id };
      } else {
        const { data, error } = await supabase
          .from("clienti_finali")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clienti"] });
      setForm(INITIAL_FORM);
      setErrors({});
      toast({ title: isEditing ? "Cliente aggiornato" : "Cliente creato con successo" });
      onClientCreated?.(data.id);
    },
    onError: (e) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const fieldError = (field: string) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica cliente" : "Crea nuovo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); setErrors({}); mutation.mutate(); }} className="space-y-6">
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Denominazione {form.tipo === "azienda" ? "*" : ""}</Label>
              <Input value={form.ragione_sociale} onChange={set("ragione_sociale")} placeholder="Ragione sociale o nome completo" className={errors.ragione_sociale ? "border-destructive" : ""} />
              {fieldError("ragione_sociale")}
            </div>
            <div className="space-y-2">
              <Label>Paese</Label>
              <Select value={form.paese} onValueChange={(v) => setForm((f) => ({ ...f, paese: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Italia">Italia</SelectItem>
                  <SelectItem value="Germania">Germania</SelectItem>
                  <SelectItem value="Francia">Francia</SelectItem>
                  <SelectItem value="Spagna">Spagna</SelectItem>
                  <SelectItem value="Regno Unito">Regno Unito</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Codice cliente interno</Label>
              <Input value={form.codice_cliente_interno} onChange={set("codice_cliente_interno")} placeholder="Codice interno" className={errors.codice_cliente_interno ? "border-destructive" : ""} />
              {fieldError("codice_cliente_interno")}
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Codice destinatario SDI</Label>
              <Input value={form.codice_destinatario_sdi} onChange={set("codice_destinatario_sdi")} placeholder="0000000" maxLength={7} className={errors.codice_destinatario_sdi ? "border-destructive" : ""} />
              {fieldError("codice_destinatario_sdi")}
            </div>
            <div className="space-y-2">
              <Label>Indirizzo</Label>
              <Input value={form.indirizzo} onChange={set("indirizzo")} placeholder="Via, numero civico" />
            </div>
            <div className="space-y-2">
              <Label>Indirizzo e-mail</Label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="email@esempio.it" className={errors.email ? "border-destructive" : ""} />
              {fieldError("email")}
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipologia</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as "azienda" | "persona" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="azienda">Azienda</SelectItem>
                  <SelectItem value="persona">Persona</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comune</Label>
              <Input value={form.citta} onChange={set("citta")} placeholder="Comune" />
            </div>
            <div className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <Switch checked={form.invio_documento_cortesia} onCheckedChange={(v) => setForm((f) => ({ ...f, invio_documento_cortesia: v }))} />
                <Label className="text-xs">Invia documento di cortesia</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.escludi_documento_cortesia} onCheckedChange={(v) => setForm((f) => ({ ...f, escludi_documento_cortesia: !!v }))} />
                <Label className="text-xs">Escludi da invio documento di cortesia</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.escludi_solleciti} onCheckedChange={(v) => setForm((f) => ({ ...f, escludi_solleciti: !!v }))} />
                <Label className="text-xs">Escludi dai solleciti automatici</Label>
              </div>
            </div>
          </div>

          {/* Row 4 - Nome/Cognome for persona */}
          {form.tipo === "persona" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={set("nome")} placeholder="Nome" className={errors.nome ? "border-destructive" : ""} />
                {fieldError("nome")}
              </div>
              <div className="space-y-2">
                <Label>Cognome</Label>
                <Input value={form.cognome} onChange={set("cognome")} placeholder="Cognome" />
              </div>
            </div>
          )}

          {/* Row 5 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Referente</Label>
              <Input value={form.referente} onChange={set("referente")} placeholder="Nome referente" />
            </div>
            <div className="space-y-2">
              <Label>CAP</Label>
              <Input value={form.cap} onChange={set("cap")} placeholder="CAP" maxLength={5} className={errors.cap ? "border-destructive" : ""} />
              {fieldError("cap")}
            </div>
            <div className="space-y-2">
              <Label>Provincia</Label>
              <Input value={form.provincia} onChange={set("provincia")} placeholder="Sigla (es. MI)" maxLength={2} className={errors.provincia ? "border-destructive" : ""} />
              {fieldError("provincia")}
            </div>
            <div className="space-y-2">
              <Label>Indirizzo PEC</Label>
              <Input type="email" value={form.pec} onChange={set("pec")} placeholder="pec@esempio.it" className={errors.pec ? "border-destructive" : ""} />
              {fieldError("pec")}
            </div>
          </div>

          {/* Row 6 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Partita IVA</Label>
              <Input value={form.piva} onChange={set("piva")} placeholder="IT00000000000" className={errors.piva ? "border-destructive" : ""} />
              {fieldError("piva")}
            </div>
            <div className="space-y-2">
              <Label>Note indirizzo</Label>
              <div className="relative">
                <Input value={form.note_indirizzo} onChange={(e) => { if (e.target.value.length <= 256) set("note_indirizzo")(e); }} placeholder="Note aggiuntive indirizzo" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{form.note_indirizzo.length}/256</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input value={form.telefono} onChange={set("telefono")} placeholder="+39 000 0000000" className={errors.telefono ? "border-destructive" : ""} />
              {fieldError("telefono")}
            </div>
          </div>

          {/* Row 7 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Codice fiscale</Label>
              <Input value={form.codice_fiscale} onChange={set("codice_fiscale")} placeholder="Codice fiscale" className={errors.codice_fiscale ? "border-destructive" : ""} />
              {fieldError("codice_fiscale")}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>Note</Label>
            <div className="relative">
              <Textarea value={form.note} onChange={(e) => { if (e.target.value.length <= 1024) set("note")(e); }} placeholder="Note aggiuntive sul cliente..." rows={3} />
              <span className="absolute right-2 bottom-2 text-xs text-muted-foreground">{form.note.length}/1024</span>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : isEditing ? "Aggiorna Cliente" : "Salva Cliente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
