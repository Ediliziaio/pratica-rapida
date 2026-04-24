import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyPromos, getPromoDisplayInfo, computeNextIsFree } from "@/hooks/useCompanyPromo";
import type { CompanyPromo } from "@/hooks/useCompanyPromo";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Plus, Pause, CheckCircle2, RefreshCcw } from "lucide-react";

interface PromoTypeOption {
  id: string;
  name: string;
  description: string | null;
  type: "free_pratiche" | "periodic_free" | "discount_percent" | "discount_fixed";
  value: number | null;
  ciclo_pratiche: number | null;
  free_per_ciclo: number | null;
  validity_days: number | null;
  is_active: boolean;
}

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  free_pratiche:    { label: "Pratiche Gratuite",  className: "bg-green-100 text-green-700 border-green-200" },
  periodic_free:    { label: "Periodica",           className: "bg-blue-100 text-blue-700 border-blue-200" },
  discount_percent: { label: "Sconto %",            className: "bg-amber-100 text-amber-700 border-amber-200" },
  discount_fixed:   { label: "Sconto Fisso €",      className: "bg-purple-100 text-purple-700 border-purple-200" },
};

function PromoCard({
  promo,
  onDeactivate,
  isDeactivating,
}: {
  promo: CompanyPromo;
  onDeactivate: (id: string) => void;
  isDeactivating: boolean;
}) {
  const info = getPromoDisplayInfo(promo);
  const isFreeNext = computeNextIsFree(promo);
  const type = promo.promo_types.type;
  const typeBadge = TYPE_BADGE[type] ?? TYPE_BADGE.free_pratiche;

  return (
    <Card className={isFreeNext ? "border-green-300 bg-green-50/40" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Gift className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold truncate">{promo.promo_types.name}</span>
              <Badge variant="outline" className={`text-xs ${typeBadge.className}`}>
                {typeBadge.label}
              </Badge>
              {isFreeNext && (
                <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                  Prossima gratuita!
                </Badge>
              )}
            </div>
            {promo.promo_types.description && (
              <p className="text-xs text-muted-foreground">{promo.promo_types.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onDeactivate(promo.id)}
            disabled={isDeactivating}
          >
            <Pause className="h-3.5 w-3.5 mr-1" />
            Disattiva
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Pratiche usate</p>
            <p className="font-bold text-lg">{promo.pratiche_usate}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Pratiche gratuite erogate</p>
            <p className="font-bold text-lg text-green-600">{promo.pratiche_gratuite_erogate}</p>
          </div>
        </div>

        {/* Type-specific visualization */}
        {type === "free_pratiche" && promo.pratiche_rimaste != null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Pratiche gratuite rimaste</span>
              <span className="font-semibold text-green-700">{promo.pratiche_rimaste}</span>
            </div>
            <Progress
              value={
                promo.promo_types.value
                  ? (promo.pratiche_rimaste / promo.promo_types.value) * 100
                  : 0
              }
              className="h-2"
            />
          </div>
        )}

        {type === "periodic_free" && (() => {
          const N = promo.promo_types.ciclo_pratiche ?? 1;
          const M = promo.promo_types.free_per_ciclo ?? 1;
          const posInCycle = promo.ciclo_posizione % N;
          return (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Posizione nel ciclo</span>
                <span className="font-semibold">{posInCycle + 1} / {N}</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: N }).map((_, i) => {
                  const isFreeSlot = i >= N - M;
                  const isCurrent = i === posInCycle;
                  return (
                    <div
                      key={i}
                      className={`h-4 flex-1 rounded-sm ${
                        isCurrent
                          ? "ring-2 ring-primary"
                          : ""
                      } ${
                        isFreeSlot
                          ? "bg-green-300"
                          : "bg-muted-foreground/20"
                      }`}
                      title={isFreeSlot ? "Slot gratuito" : "Slot pagato"}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Verde = gratuito (ultimi {M} ogni {N} pratiche)
              </p>
            </div>
          );
        })()}

        {/* Detail text */}
        <p className="text-xs text-muted-foreground italic">{info.detail}</p>

        {/* Activation date */}
        <p className="text-xs text-muted-foreground">
          Attivata il {new Date(promo.activated_at).toLocaleDateString("it-IT")}
          {promo.expires_at && ` · Scade il ${new Date(promo.expires_at).toLocaleDateString("it-IT")}`}
        </p>

        {/* Note */}
        {promo.note && (
          <p className="text-xs text-muted-foreground border-t pt-2">Note: {promo.note}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CompanyPromoManager({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPromoTypeId, setSelectedPromoTypeId] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [note, setNote] = useState("");

  const { data: activePromos = [], isLoading } = useCompanyPromos(companyId);

  const { data: promoTypes = [] } = useQuery({
    queryKey: ["promo-types-all"],
    queryFn: async (): Promise<PromoTypeOption[]> => {
      const { data, error } = await supabase
        .from("promo_types")
        .select("id, name, description, type, value, ciclo_pratiche, free_per_ciclo, validity_days, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as PromoTypeOption[];
    },
  });

  const assignPromo = useMutation({
    mutationFn: async () => {
      const promoType = promoTypes.find((p) => p.id === selectedPromoTypeId);
      if (!promoType) throw new Error("Tipo promo non trovato");

      const expires_at =
        validityDays
          ? new Date(Date.now() + parseInt(validityDays) * 86400000).toISOString()
          : promoType.validity_days
          ? new Date(Date.now() + promoType.validity_days * 86400000).toISOString()
          : null;

      const payload: Record<string, unknown> = {
        company_id: companyId,
        promo_type_id: selectedPromoTypeId,
        status: "active",
        note: note || "",
        expires_at,
        assigned_by: user?.id ?? null,
        ciclo_posizione: 0,
        pratiche_usate: 0,
        pratiche_gratuite_erogate: 0,
      };

      if (promoType.type === "free_pratiche") {
        payload.pratiche_rimaste = promoType.value ?? 0;
      } else {
        payload.pratiche_rimaste = null;
      }

      const { error } = await supabase
        .from("company_promos")
        .upsert(payload, { onConflict: "company_id,promo_type_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-promos", companyId] });
      toast({ title: "Promo assegnata all'azienda" });
      setOpen(false);
      setSelectedPromoTypeId("");
      setValidityDays("");
      setNote("");
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deactivatePromo = useMutation({
    mutationFn: async (promoId: string) => {
      const { error } = await supabase
        .from("company_promos")
        .update({ status: "paused" })
        .eq("id", promoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-promos", companyId] });
      toast({ title: "Promo disattivata" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const selectedPromoType = promoTypes.find((p) => p.id === selectedPromoTypeId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            Premi &amp; Offerte Aziendali
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Le promo aziendali si applicano automaticamente a ogni nuova pratica
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Assegna Promo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assegna Promo Aziendale</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Tipo promo *</Label>
                <Select value={selectedPromoTypeId} onValueChange={setSelectedPromoTypeId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleziona una promo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {promoTypes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.type === "free_pratiche" && p.value && ` (${p.value} gratis)`}
                        {p.type === "periodic_free" && p.ciclo_pratiche && p.free_per_ciclo &&
                          ` (ogni ${p.ciclo_pratiche}, ${p.free_per_ciclo} gratis)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPromoType && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <p className="font-medium">{selectedPromoType.name}</p>
                  {selectedPromoType.description && (
                    <p className="text-muted-foreground">{selectedPromoType.description}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <Badge variant="outline" className={`text-xs ${TYPE_BADGE[selectedPromoType.type]?.className ?? ""}`}>
                      {TYPE_BADGE[selectedPromoType.type]?.label}
                    </Badge>
                    {selectedPromoType.type === "free_pratiche" && selectedPromoType.value != null && (
                      <span className="text-muted-foreground">{selectedPromoType.value} pratiche gratuite</span>
                    )}
                    {selectedPromoType.type === "periodic_free" && (
                      <span className="text-muted-foreground">
                        Ogni {selectedPromoType.ciclo_pratiche}, {selectedPromoType.free_per_ciclo} gratis
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label>Validità (giorni, opzionale)</Label>
                <Input
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  placeholder={selectedPromoType?.validity_days ? String(selectedPromoType.validity_days) : "Illimitata"}
                  min="1"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lascia vuoto per usare la durata del tipo promo (o illimitata)
                </p>
              </div>

              <div>
                <Label>Note interne (opzionale)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Es. accordo commerciale, campagna..."
                  className="mt-1 h-20"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => assignPromo.mutate()}
                disabled={!selectedPromoTypeId || assignPromo.isPending}
              >
                {assignPromo.isPending ? "Salvataggio..." : "Assegna Promo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : activePromos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Gift className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nessuna promo attiva</p>
            <p className="text-xs text-muted-foreground mt-1">
              Assegna una promo aziendale per offrire pratiche gratuite o scontate
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {activePromos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              onDeactivate={(id) => deactivatePromo.mutate(id)}
              isDeactivating={deactivatePromo.isPending}
            />
          ))}
        </div>
      )}

      {/* Summary stats */}
      {activePromos.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-muted-foreground">
                Totale pratiche gratuite erogate:{" "}
                <span className="font-semibold text-foreground">
                  {activePromos.reduce((s, p) => s + p.pratiche_gratuite_erogate, 0)}
                </span>
              </span>
              <span className="text-muted-foreground ml-4">
                <RefreshCcw className="h-3.5 w-3.5 inline mr-1" />
                Prossima pratica gratuita:{" "}
                <span className="font-semibold text-foreground">
                  {activePromos.some(computeNextIsFree) ? "Sì" : "No"}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
