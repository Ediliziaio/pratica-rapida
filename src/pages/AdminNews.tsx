import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Newspaper } from "lucide-react";
import type { HomepageNews } from "@/components/landing-home/NewsSectionHome";

const KEY = "homepage_news";

async function saveNews(items: HomepageNews[]) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key: KEY, value: items }, { onConflict: "key" });
  if (error) throw error;
}

const BADGE_OPTIONS = [
  { value: "green",  label: "Verde"   },
  { value: "orange", label: "Arancio" },
  { value: "blue",   label: "Blu"     },
  { value: "purple", label: "Viola"   },
  { value: "red",    label: "Rosso"   },
];

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  green:  { bg: "hsla(152,100%,42%,0.12)", text: "hsl(152 100% 32%)" },
  orange: { bg: "hsla(25,95%,53%,0.12)",   text: "hsl(25 95% 45%)"   },
  blue:   { bg: "hsla(214,100%,60%,0.12)", text: "hsl(214 100% 45%)" },
  purple: { bg: "hsla(270,80%,60%,0.12)",  text: "hsl(270 80% 50%)"  },
  red:    { bg: "hsla(0,84%,60%,0.12)",    text: "hsl(0 84% 50%)"    },
};

const emptyForm = (): Omit<HomepageNews, "id"> => ({
  title: "",
  excerpt: "",
  date: new Date().toLocaleDateString("it-IT", { month: "short", year: "numeric" }),
  badge: "Novità",
  badgeColor: "green",
  link: "",
  published: true,
});

export default function AdminNews() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<HomepageNews | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: news = [] } = useQuery<HomepageNews[]>({
    queryKey: [KEY],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", KEY).single();
      return (data?.value as HomepageNews[]) ?? [];
    },
  });

  const mutate = useMutation({
    mutationFn: saveNews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ["homepage_news"] });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (item: HomepageNews) => {
    setEditing(item);
    setForm({ title: item.title, excerpt: item.excerpt, date: item.date, badge: item.badge, badgeColor: item.badgeColor, link: item.link ?? "", published: item.published });
    setShowDialog(true);
  };

  const save = () => {
    if (!form.title.trim()) return;
    let updated: HomepageNews[];
    if (editing) {
      updated = news.map((n) => n.id === editing.id ? { ...editing, ...form } : n);
    } else {
      const newItem: HomepageNews = { id: crypto.randomUUID(), ...form };
      updated = [newItem, ...news];
    }
    mutate.mutate(updated, {
      onSuccess: () => {
        setShowDialog(false);
        toast({ title: editing ? "News aggiornata" : "News aggiunta" });
      },
    });
  };

  const togglePublished = (id: string) => {
    mutate.mutate(news.map((n) => n.id === id ? { ...n, published: !n.published } : n));
  };

  const remove = (id: string) => {
    mutate.mutate(news.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">News Homepage</h1>
          <p className="text-muted-foreground">Gestisci le notizie visibili nella home page del sito</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />Nuova News
        </Button>
      </div>

      {news.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Newspaper className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg mb-1">Nessuna news</h3>
            <p className="text-sm text-muted-foreground mb-4">Aggiungi la prima news per farla apparire in homepage</p>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Aggiungi News</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {news.map((item) => {
            const colors = BADGE_COLORS[item.badgeColor] ?? BADGE_COLORS.green;
            return (
              <Card key={item.id} className={item.published ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <GripVertical className="h-5 w-5 text-muted-foreground/30 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {item.badge}
                        </span>
                        <span className="text-xs text-muted-foreground">{item.date}</span>
                        {!item.published && (
                          <Badge variant="outline" className="text-[10px]">Bozza</Badge>
                        )}
                      </div>
                      <p className="font-semibold text-sm truncate">{item.title}</p>
                      {item.excerpt && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.excerpt}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={item.published ? "Nascondi" : "Pubblica"}
                        onClick={() => togglePublished(item.id)}
                      >
                        {item.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => remove(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica News" : "Nuova News"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Titolo *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Es: Conto Termico 3.0 — portale riaperto"
              />
            </div>
            <div>
              <Label>Testo breve</Label>
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                rows={3}
                placeholder="Breve descrizione visibile nella card..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  placeholder="Apr 2026"
                />
              </div>
              <div>
                <Label>Badge</Label>
                <Input
                  value={form.badge}
                  onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="Normativa"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Colore Badge</Label>
                <Select
                  value={form.badgeColor}
                  onValueChange={(v) => setForm((f) => ({ ...f, badgeColor: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BADGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link (opzionale)</Label>
                <Input
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://... o /blog/slug"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.published}
                onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
              />
              <Label className="cursor-pointer">
                {form.published ? "Pubblicata (visibile in homepage)" : "Bozza (nascosta)"}
              </Label>
            </div>
            <Button
              onClick={save}
              disabled={!form.title.trim() || mutate.isPending}
            >
              {mutate.isPending ? "Salvataggio..." : editing ? "Salva Modifiche" : "Aggiungi News"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
