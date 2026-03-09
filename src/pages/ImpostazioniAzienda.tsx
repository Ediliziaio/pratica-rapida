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

export default function ImpostazioniAzienda() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

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

  const [form, setForm] = useState({
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
    mutationFn: async () => {
      const { error } = await supabase
        .from("companies")
        .update(form)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label>Ragione Sociale</Label>
              <Input value={form.ragione_sociale} onChange={(e) => setForm((f) => ({ ...f, ragione_sociale: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>P. IVA</Label>
              <Input value={form.piva} onChange={(e) => setForm((f) => ({ ...f, piva: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Codice Fiscale</Label>
              <Input value={form.codice_fiscale} onChange={(e) => setForm((f) => ({ ...f, codice_fiscale: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
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
            </div>
            <div className="space-y-2">
              <Label>Provincia</Label>
              <Input value={form.provincia} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} />
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
