import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Settings, Clock, Building2, Users, FolderOpen, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SLASettings {
  presaInCaricoOre: number;
  completamentoOre: number;
}

export default function ImpostazioniPiattaforma() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: slaRow } = useQuery({
    queryKey: ["platform-settings", "sla_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("id, value")
        .eq("key", "sla_settings")
        .maybeSingle();
      return data;
    },
  });

  const [sla, setSla] = useState<SLASettings>({ presaInCaricoOre: 24, completamentoOre: 120 });
  const [slaErrors, setSlaErrors] = useState<{ presaInCaricoOre?: string; completamentoOre?: string }>({});

  useEffect(() => {
    if (slaRow?.value) {
      const val = slaRow.value as unknown as SLASettings;
      setSla({ presaInCaricoOre: val.presaInCaricoOre ?? 24, completamentoOre: val.completamentoOre ?? 120 });
    }
  }, [slaRow]);

  const { data: stats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [companies, pratiche, profiles] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("pratiche").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        aziende: companies.count || 0,
        pratiche: pratiche.count || 0,
        utenti: profiles.count || 0,
      };
    },
  });

  const [saving, setSaving] = useState(false);

  const saveSLA = async () => {
    // Validate
    const errors: typeof slaErrors = {};
    if (!Number.isInteger(sla.presaInCaricoOre) || sla.presaInCaricoOre < 1) {
      errors.presaInCaricoOre = "Deve essere un intero positivo (≥ 1)";
    }
    if (!Number.isInteger(sla.completamentoOre) || sla.completamentoOre < 1) {
      errors.completamentoOre = "Deve essere un intero positivo (≥ 1)";
    }
    if (sla.completamentoOre <= sla.presaInCaricoOre) {
      errors.completamentoOre = "Deve essere maggiore del tempo di presa in carico";
    }
    setSlaErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (slaRow?.id) {
        await supabase
          .from("platform_settings")
          .update({ value: sla as unknown as Record<string, unknown>, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("id", slaRow.id);
      } else {
        await supabase
          .from("platform_settings")
          .insert({ key: "sla_settings", value: sla as unknown as Record<string, unknown>, updated_by: user?.id });
      }
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast({ title: "Soglie SLA salvate" });
    } catch {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" /> Impostazioni Piattaforma
        </h1>
        <p className="text-muted-foreground">Configurazione globale della piattaforma</p>
      </div>

      <Tabs defaultValue="sla">
        <TabsList>
          <TabsTrigger value="sla"><Clock className="mr-1.5 h-4 w-4" />SLA</TabsTrigger>
          <TabsTrigger value="info"><Building2 className="mr-1.5 h-4 w-4" />Info Piattaforma</TabsTrigger>
        </TabsList>

        <TabsContent value="sla" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Soglie SLA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Definisci i tempi target per il monitoraggio delle performance operative. Questi valori vengono usati nella Dashboard per evidenziare le pratiche fuori SLA.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
                <div className="space-y-2">
                  <Label>Presa in carico (ore)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={sla.presaInCaricoOre}
                    onChange={e => {
                      setSla(s => ({ ...s, presaInCaricoOre: Number(e.target.value) }));
                      setSlaErrors(prev => ({ ...prev, presaInCaricoOre: undefined }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "inviata" a "in_lavorazione"</p>
                  {slaErrors.presaInCaricoOre && <p className="text-xs text-destructive">{slaErrors.presaInCaricoOre}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Completamento (ore)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={sla.completamentoOre}
                    onChange={e => {
                      setSla(s => ({ ...s, completamentoOre: Number(e.target.value) }));
                      setSlaErrors(prev => ({ ...prev, completamentoOre: undefined }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "in_lavorazione" a "completata"</p>
                  {slaErrors.completamentoOre && <p className="text-xs text-destructive">{slaErrors.completamentoOre}</p>}
                </div>
              </div>
              <Button onClick={saveSLA} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Salvataggio..." : "Salva Soglie"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Aziende</CardTitle>
                <Building2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.aziende ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Utenti</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.utenti ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pratiche Totali</CardTitle>
                <FolderOpen className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats?.pratiche ?? "—"}</div></CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
