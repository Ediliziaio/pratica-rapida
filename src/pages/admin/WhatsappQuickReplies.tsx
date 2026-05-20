/**
 * /admin/whatsapp-quick-replies — Gestione canned responses chat WhatsApp.
 *
 * CRUD super_admin only:
 *  - Lista con drag-free ordering (sort_order numerico, +/-100)
 *  - Crea/modifica/elimina
 *  - Toggle is_active
 *  - Usage count visibile (read-only, incrementato dal picker chat)
 *  - Raggruppamento per categoria
 *
 * Gli operatori non super_admin le vedono e usano dal composer chat
 * (vedi QuickReplyPicker in WhatsappChat.tsx).
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Zap, Plus, Pencil, Trash2, Loader2, MessageCircle, TrendingUp,
} from "lucide-react";

interface QuickReply {
  id: string;
  label: string;
  body: string;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export default function WhatsappQuickReplies() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);

  const { data: replies, isLoading } = useQuery({
    queryKey: ["whatsapp-quick-replies-all"],
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("whatsapp_quick_replies")
        .select("*")
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data as QuickReply[]) ?? [];
    },
  });

  const grouped = useMemo(() => {
    if (!replies) return new Map<string, QuickReply[]>();
    const map = new Map<string, QuickReply[]>();
    for (const r of replies) {
      const cat = r.category ?? "Senza categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return map;
  }, [replies]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_quick_replies")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] });
      toast({ title: "Risposta rapida eliminata" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            Risposte rapide
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Canned responses che lo staff può inserire nel composer della chat WhatsApp con un click.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuova risposta
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Caricamento…
          </CardContent>
        </Card>
      )}

      {!isLoading && (!replies || replies.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto opacity-30 mb-3" />
            <p className="text-sm font-medium">Nessuna risposta rapida</p>
            <p className="text-xs mt-1">Crea la prima per iniziare a usarle in chat.</p>
          </CardContent>
        </Card>
      )}

      {grouped.size > 0 && Array.from(grouped.entries()).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {cat}
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((r) => (
              <div
                key={r.id}
                className={`border rounded-lg p-3 transition-colors ${
                  r.is_active ? "hover:bg-slate-50" : "bg-slate-50/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{r.label}</p>
                      {r.usage_count > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <TrendingUp className="h-2.5 w-2.5" />
                          {r.usage_count} usi
                        </Badge>
                      )}
                      {!r.is_active && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">disattivata</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">{r.body}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, active: v })}
                        disabled={toggleMutation.isPending}
                      />
                      <span className="text-xs text-muted-foreground">Attiva</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Modifica
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Eliminare la risposta "${r.label}"?`)) {
                          deleteMutation.mutate(r.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="gap-1.5 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {editing && (
        <EditQuickReplyDialog
          quickReply={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditQuickReplyDialog({
  quickReply, onClose,
}: {
  quickReply: QuickReply | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = !quickReply;
  const [label, setLabel] = useState(quickReply?.label ?? "");
  const [body, setBody] = useState(quickReply?.body ?? "");
  const [category, setCategory] = useState(quickReply?.category ?? "");
  const [sortOrder, setSortOrder] = useState(quickReply?.sort_order ?? 100);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!label.trim() || !body.trim()) throw new Error("Label e body obbligatori");
      const row = {
        label: label.trim(),
        body: body.trim(),
        category: category.trim() || null,
        sort_order: sortOrder,
      };
      if (isNew) {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("whatsapp_quick_replies")
          .insert({ ...row, created_by: userData.user?.id ?? null });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("whatsapp_quick_replies")
          .update(row)
          .eq("id", quickReply!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies-all"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] });
      toast({ title: isNew ? "Risposta rapida creata" : "Risposta rapida aggiornata" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore salvataggio", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuova risposta rapida" : "Modifica risposta"}</DialogTitle>
          <DialogDescription>
            Il body viene inserito nel composer della chat quando lo staff la sceglie. Niente placeholder dinamici qui — per quello usa i template Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="qr_label">Etichetta breve *</Label>
            <Input
              id="qr_label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Es. Saluti iniziali"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground mt-1">Mostrata nel popover. Max 80 caratteri.</p>
          </div>

          <div>
            <Label htmlFor="qr_body">Testo della risposta *</Label>
            <Textarea
              id="qr_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Buongiorno! Come posso aiutarla?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qr_cat">Categoria</Label>
              <Input
                id="qr_cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Es. Saluti, FAQ, Conferme"
                maxLength={40}
                list="qr-categories"
              />
              <datalist id="qr-categories">
                <option value="Saluti" />
                <option value="FAQ" />
                <option value="Conferme" />
                <option value="Info pratica" />
                <option value="Documenti" />
              </datalist>
            </div>
            <div>
              <Label htmlFor="qr_order">Ordine</Label>
              <Input
                id="qr_order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 100)}
              />
              <p className="text-xs text-muted-foreground mt-1">Più basso = prima in lista.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !label.trim() || !body.trim()}
            className="gap-2"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Crea" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
