import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FileSignature } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type PendingSchema = { id: string; proprietario_nome: string | null };
const photovoltaicDb = supabase as unknown as SupabaseClient;

export function UnifilareReadyDialog() {
  const { isInternal, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [practice, setPractice] = useState<PendingSchema | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || isInternal || /\/fotovoltaico\/pratiche\/[^/]+\/schema/.test(location.pathname)) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await photovoltaicDb
        .from("fotovoltaico_practices")
        .select("id, proprietario_nome")
        .eq("unifilare_status", "inviato_da_firmare")
        .is("archived_at", null)
        .order("unifilare_draft_sent_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const pending = data as PendingSchema;
      setPractice(pending);
      setOpen(sessionStorage.getItem(`unifilare-ready-dismissed:${pending.id}`) !== "1");
    };
    void load();
    return () => { cancelled = true; };
  }, [isInternal, location.pathname, user]);

  if (!practice) return null;

  const dismiss = () => {
    sessionStorage.setItem(`unifilare-ready-dismissed:${practice.id}`, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); else setOpen(true); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><FileSignature className="h-6 w-6" /></div>
          <DialogTitle>Lo schema unifilare è pronto</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {practice.proprietario_nome ? <>Pratica di <strong>{practice.proprietario_nome}</strong>. </> : null}
            Scaricalo, fallo firmare e timbrare e ricaricalo qui. Puoi usare un PDF firmato digitalmente, una scansione oppure una foto nitida e completa. Penseremo noi a inserirlo nella pratica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismiss}>Più tardi</Button>
          <Button onClick={() => navigate(`/fotovoltaico/pratiche/${practice.id}/schema`)}>Scarica e ricarica lo schema</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
