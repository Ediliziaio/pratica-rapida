import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Clock, Building2, Users, FolderOpen, Save } from "lucide-react";

const SLA_KEY = "pratica_rapida_sla_settings";

interface SLASettings {
  presaInCaricoOre: number;
  completamentoOre: number;
}

function loadSLA(): SLASettings {
  try {
    const stored = localStorage.getItem(SLA_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { presaInCaricoOre: 24, completamentoOre: 120 };
}

export default function ImpostazioniPiattaforma() {
  const { toast } = useToast();
  const [sla, setSla] = useState<SLASettings>(loadSLA);

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

  const saveSLA = () => {
    localStorage.setItem(SLA_KEY, JSON.stringify(sla));
    toast({ title: "Soglie SLA salvate" });
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
                    value={sla.presaInCaricoOre}
                    onChange={e => setSla(s => ({ ...s, presaInCaricoOre: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "inviata" a "in_lavorazione"</p>
                </div>
                <div className="space-y-2">
                  <Label>Completamento (ore)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={sla.completamentoOre}
                    onChange={e => setSla(s => ({ ...s, completamentoOre: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">Tempo max da "in_lavorazione" a "completata"</p>
                </div>
              </div>
              <Button onClick={saveSLA} className="gap-2">
                <Save className="h-4 w-4" /> Salva Soglie
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
