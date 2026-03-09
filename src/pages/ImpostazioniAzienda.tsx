import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";
import { z } from "zod";

const companySettingsSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Ragione sociale obbligatoria").max(255),
  piva: z.string().trim().refine(v => v === "" || /^(IT)?\d{11}$/.test(v.replace(/\s/g, "")), { message: "P.IVA non valida (11 cifre)" }).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(16).optional().or(z.literal("")),
  email: z.string().trim().refine(v => v === "" || z.string().email().safeParse(v).success, { message: "Email non valida" }).optional().or(z.literal("")),
  telefono: z.string().trim().refine(v => v === "" || /^[\d\s\+\-().]{6,20}$/.test(v), { message: "Telefono non valido" }).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(255).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().refine(v => v === "" || /^\d{5}$/.test(v), { message: "CAP non valido (5 cifre)" }).optional().or(z.literal("")),
  provincia: z.string().trim().toUpperCase().refine(v => v === "" || /^[A-Z]{2}$/.test(v), { message: "Provincia non valida (2 lettere)" }).optional().or(z.literal("")),
});

type CompanySettingsForm = z.infer<typeof companySettingsSchema>;

export default function ImpostazioniAzienda() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Partial<Record<keyof CompanySettingsForm, string>>>({});

  const { data: company, isLoading } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const [form, setForm] = useState<CompanySettingsForm>({
    ragione_sociale: "",
    piva: "",
    codice_fiscale: "",
    email: "",
    telefono: "",
    indirizzo: "",
    citta: "",
    cap: "",
    provincia: "",
  });

  useEffect(() => {
    if (company) {
      setForm({
        ragione_sociale: company.ragione_sociale || "",
        piva: company.piva || "",
        codice_fiscale: company.codice_fiscale || "",
        email: company.email || "",
        telefono: company.telefono || "",
        indirizzo: company.indirizzo || "",
        citta: company.citta || "",
        cap: company.cap || "",
        provincia: company.provincia || "",
      });
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (validated: CompanySettingsForm) => {
      const { error } = await supabase
        .from("companies")
        .update(validated)
        .eq("id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
      toast({ title: "Impostazioni salvate", description: "I dati aziendali sono stati aggiornati." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare le impostazioni.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = companySettingsSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach(err => {
        const field = err.path[0] as keyof CompanySettingsForm;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    updateMutation.mutate(result.data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const fieldError = (field: keyof CompanySettingsForm) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Impostazioni Azienda</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dati Aziendali</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2 sm:col-span-2">
              <Label>Ragione Sociale *</Label>
              <Input value={form.ragione_sociale} onChange={(e) => setForm((f) => ({ ...f, ragione_sociale: e.target.value }))} />
              {fieldError("ragione_sociale")}
            </div>
            <div className="space-y-2">
              <Label>P. IVA</Label>
              <Input value={form.piva} onChange={(e) => setForm((f) => ({ ...f, piva: e.target.value }))} />
              {fieldError("piva")}
            </div>
            <div className="space-y-2">
              <Label>Codice Fiscale</Label>
              <Input value={form.codice_fiscale} onChange={(e) => setForm((f) => ({ ...f, codice_fiscale: e.target.value }))} />
              {fieldError("codice_fiscale")}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              {fieldError("email")}
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
              {fieldError("telefono")}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Indirizzo</Label>
              <Input value={form.indirizzo} onChange={(e) => setForm((f) => ({ ...f, indirizzo: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Città</Label>
              <Input value={form.citta} onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>CAP</Label>
              <Input value={form.cap} onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))} />
              {fieldError("cap")}
            </div>
            <div className="space-y-2">
              <Label>Provincia</Label>
              <Input value={form.provincia} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} maxLength={2} />
              {fieldError("provincia")}
            </div>
            <div className="sm:col-span-2 flex justify-end pt-4">
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? "Salvataggio..." : "Salva Impostazioni"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
