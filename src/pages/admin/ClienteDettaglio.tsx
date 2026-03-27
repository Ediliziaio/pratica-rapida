import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Mail, Phone, Building2, MapPin, Calendar, Clock, FileText, Gift, MessageCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { PAGAMENTO_BADGE } from "@/lib/pratiche-config";

const STATO_BADGE: Record<string, string> = {
  bozza: "bg-gray-100 text-gray-600",
  inviata: "bg-blue-100 text-blue-700",
  in_lavorazione: "bg-amber-100 text-amber-700",
  in_attesa_documenti: "bg-orange-100 text-orange-700",
  completata: "bg-green-100 text-green-700",
  annullata: "bg-red-100 text-red-700",
};

const EMAIL_STATUS: Record<string, string> = {
  sent:    "bg-green-100 text-green-700",
  failed:  "bg-red-100 text-red-700",
  bounced: "bg-amber-100 text-amber-700",
  opened:  "bg-blue-100 text-blue-700",
};

const WA_STATUS: Record<string, string> = {
  sent:      "bg-gray-100 text-gray-600",
  delivered: "bg-blue-100 text-blue-700",
  read:      "bg-green-100 text-green-700",
  failed:    "bg-red-100 text-red-700",
};

export default function ClienteDettaglio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-client", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Pratiche
  const { data: pratiche = [] } = useQuery({
    queryKey: ["admin-client-pratiche", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pratiche")
        .select("id, titolo, stato, created_at, prezzo, pagamento_stato, categoria")
        .eq("creato_da", id!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Promo attiva
  const { data: promo } = useQuery({
    queryKey: ["admin-client-promo", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_promos")
        .select("*, promo_types(name)")
        .eq("client_id", id!)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Email logs
  const { data: emailLogs = [] } = useQuery({
    queryKey: ["admin-client-emails", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("email_logs")
        .select("*")
        .eq("client_id", id!)
        .order("sent_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // WA logs
  const { data: waLogs = [] } = useQuery({
    queryKey: ["admin-client-wa", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_logs")
        .select("*")
        .eq("client_id", id!)
        .order("sent_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Save notes
  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("profiles").update({ notes }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-client", id] });
      toast({ title: "Note salvate" });
    },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
    </div>
  );

  if (!profile) return <div className="p-6 text-muted-foreground">Cliente non trovato</div>;

  const totPratiche = pratiche.length;
  const completate = pratiche.filter((p: any) => p.stato === "completata").length;
  const ltv = pratiche.filter((p: any) => p.stato === "completata").reduce((s: number, p: any) => s + (p.prezzo ?? 0), 0);
  const initials = `${profile.nome?.[0] ?? ""}${profile.cognome?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Torna ai clienti
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-6 flex items-start gap-6">
          <Avatar className="h-16 w-16 text-lg">
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.nome} {profile.cognome}</h1>
              {profile.last_login_at && (
                new Date(profile.last_login_at) < new Date(Date.now() - 30 * 86400000)
                  ? <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">INATTIVO</Badge>
                  : <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Attivo</Badge>
              )}
              {promo && <Badge className="bg-amber-100 text-amber-700 border-amber-200">PROMO ATTIVA</Badge>}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {profile.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{profile.email}</span>}
              {profile.telefono && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{profile.telefono}</span>}
              {profile.company_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{profile.company_name}</span>}
              {profile.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{profile.city}</span>}
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Registrato {format(new Date(profile.created_at), "dd MMM yyyy", { locale: it })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pratiche totali", value: totPratiche, icon: FileText, color: "text-blue-600" },
          { label: "Completate", value: completate, icon: FileText, color: "text-green-600" },
          { label: "LTV €", value: `€ ${ltv.toFixed(2)}`, icon: FileText, color: "text-purple-600" },
          { label: "Ultimo accesso", value: profile.last_login_at ? formatDistanceToNow(new Date(profile.last_login_at), { locale: it, addSuffix: true }) : "Mai", icon: Clock, color: "text-orange-600" },
        ].map(k => (
          <Card key={k.label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">{k.label}</CardTitle></CardHeader>
            <CardContent><p className={`text-2xl font-bold ${k.color}`}>{k.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Pratiche recenti */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Pratiche recenti</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pratiche.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Nessuna pratica</p> : pratiche.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.titolo}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}</p>
                </div>
                <Badge variant="outline" className={`ml-2 shrink-0 text-xs ${STATO_BADGE[p.stato] ?? ""}`}>{p.stato}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Promo */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Gift className="h-4 w-4" />Promo attiva</CardTitle></CardHeader>
          <CardContent>
            {!promo ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessuna promo attiva</p>
            ) : (
              <div className="space-y-3">
                <p className="font-semibold">{(promo as any).promo_types?.name}</p>
                {promo.pratiche_free_remaining != null && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Pratiche gratuite rimaste</span>
                      <span className="font-bold text-green-600">{promo.pratiche_free_remaining}</span>
                    </div>
                  </div>
                )}
                {promo.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    Scade il {format(new Date(promo.expires_at), "dd MMM yyyy", { locale: it })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Log */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" />Email inviate</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {emailLogs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Nessuna email</p> : emailLogs.map((e: any) => (
              <div key={e.id} className="flex items-start justify-between text-sm py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.subject}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(e.sent_at), "dd MMM HH:mm", { locale: it })}</p>
                </div>
                <Badge variant="outline" className={`ml-2 shrink-0 text-xs ${EMAIL_STATUS[e.status] ?? ""}`}>{e.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* WA Log */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MessageCircle className="h-4 w-4" />WhatsApp</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {waLogs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Nessun messaggio</p> : waLogs.map((w: any) => (
              <div key={w.id} className="flex items-start justify-between text-sm py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{w.template_name ?? w.body ?? "Messaggio"}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(w.sent_at), "dd MMM HH:mm", { locale: it })} · {w.phone}</p>
                </div>
                <Badge variant="outline" className={`ml-2 shrink-0 text-xs ${WA_STATUS[w.status] ?? ""}`}>{w.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Note admin */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Note interne admin</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            defaultValue={profile.notes ?? ""}
            placeholder="Note interne sul cliente (non visibili al cliente)..."
            className="h-28 resize-none"
            onBlur={(e) => {
              if (e.target.value !== (profile.notes ?? "")) saveNotes.mutate(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">Le note vengono salvate automaticamente quando esci dal campo</p>
        </CardContent>
      </Card>
    </div>
  );
}
