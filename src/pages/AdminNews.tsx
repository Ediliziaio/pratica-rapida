/**
 * AdminNews — CMS unificato news/blog SEO-oriented per super_admin.
 *
 * Tabella backing: public.news_articles (vedi migration 20260504000003).
 *
 * Funzionalità:
 *  - Lista articoli con filtro status / categoria / search
 *  - Editor sheet con tab Contenuto / SEO / Pubblicazione
 *  - Markdown editor con toolbar di inserimento + preview live
 *  - Cover image drag & drop (storage bucket news-images)
 *  - Slug con check di disponibilità live, auto-generato dal titolo
 *  - Tag chips con autocomplete
 *  - Validation checklist pre-publish
 *  - Banner status, AlertDialog per delete, ⌘+S per salvare
 *  - Salva senza chiudere / Salva e chiudi
 *  - Reading-time auto-calcolato dal body
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Copy, Eye, EyeOff, Pin, Search,
  Newspaper, ExternalLink, ImageIcon, FileText, Settings, Upload,
  Loader2, Calculator, CircleAlert, CircleCheck, CircleDot, Save, Sparkles,
} from "lucide-react";
import {
  type NewsArticle, useAdminNews, NEWS_CATEGORIES, categoryLabel,
  slugify, estimateReadingTime, findSlugCollision,
} from "@/lib/news";
import { parseMarkdown } from "@/lib/markdown";
import MarkdownToolbar from "@/components/admin/news/MarkdownToolbar";
import CoverImageUploader from "@/components/admin/news/CoverImageUploader";
import SlugInput from "@/components/admin/news/SlugInput";
import TagInput from "@/components/admin/news/TagInput";
import CharacterCounter from "@/components/admin/news/CharacterCounter";
import PublishChecklist, { type PublishCheck } from "@/components/admin/news/PublishChecklist";

type EditorState = Partial<NewsArticle> & { id?: string };

const emptyEditor = (): EditorState => ({
  slug: "",
  title: "",
  excerpt: "",
  body_md: "",
  category: "guide",
  tags: [],
  author_name: "Pratica Rapida",
  meta_title: "",
  meta_description: "",
  meta_keywords: [],
  canonical_url: "",
  og_title: "",
  og_description: "",
  og_image_url: "",
  twitter_card: "summary_large_image",
  json_ld_type: "BlogPosting",
  no_index: false,
  no_follow: false,
  status: "draft",
  pinned: false,
  read_time_minutes: 5,
  cover_image_url: "",
});

const STATUS_BADGE: Record<NewsArticle["status"], { label: string; bg: string; color: string; icon: typeof CircleDot }> = {
  draft:     { label: "Bozza",      bg: "hsla(45,100%,55%,0.15)", color: "hsl(45 100% 32%)",  icon: CircleDot   },
  published: { label: "Pubblicato", bg: "hsla(152,80%,40%,0.12)", color: "hsl(152 80% 28%)",  icon: CircleCheck },
  archived:  { label: "Archiviato", bg: "hsla(0,0%,50%,0.12)",    color: "hsl(0 0% 35%)",     icon: CircleAlert },
};

export default function AdminNews() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useAdminNews();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | NewsArticle["status"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("tutti");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [tab, setTab] = useState<"content" | "seo" | "publish">("content");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<NewsArticle | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (categoryFilter !== "tutti" && it.category !== categoryFilter) return false;
      if (q && !`${it.title} ${it.slug} ${it.excerpt ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, statusFilter, categoryFilter]);

  // Pool of all tags used across articles for autocomplete
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => it.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  const openNew = () => {
    setEditor(emptyEditor());
    setSlugManuallyEdited(false);
    setTab("content");
    setEditorOpen(true);
  };

  const openEdit = (it: NewsArticle) => {
    setEditor({ ...it });
    setSlugManuallyEdited(true); // preserve existing slug — SEO matters
    setTab("content");
    setEditorOpen(true);
  };

  // Auto-slug from title until user manually edits the slug
  useEffect(() => {
    if (!slugManuallyEdited && editor.title) {
      const next = slugify(editor.title);
      setEditor((e) => (e.slug === next ? e : { ...e, slug: next }));
    }
  }, [editor.title, slugManuallyEdited]);

  // Pre-publish validation rules
  const checks = useMemo<PublishCheck[]>(() => {
    const titleLen = editor.title?.trim().length ?? 0;
    const bodyLen = (editor.body_md ?? "").trim().length;
    const excerptLen = editor.excerpt?.trim().length ?? 0;
    const metaDescLen = editor.meta_description?.trim().length ?? 0;
    const slugOk = !!editor.slug?.trim() && editor.slug.trim() === slugify(editor.slug);
    const hasCover = !!editor.cover_image_url?.trim();
    const hasMetaDescOrExcerpt = excerptLen >= 50 || metaDescLen >= 50;

    return [
      { id: "title",    severity: "error",   passed: titleLen >= 5,  label: "Titolo ≥ 5 caratteri", hint: "Aggiungi un titolo più descrittivo" },
      { id: "slug",     severity: "error",   passed: slugOk,         label: "Slug valido e normalizzato", hint: "Solo a-z, 0-9, trattini" },
      { id: "body",     severity: "error",   passed: bodyLen >= 200, label: "Contenuto ≥ 200 caratteri", hint: "Articoli troppo brevi danneggiano il SEO" },
      { id: "excerpt",  severity: "warning", passed: hasMetaDescOrExcerpt, label: "Estratto o meta description (≥ 50 caratteri)", hint: "Senza, Google sceglie automaticamente un brano del testo" },
      { id: "cover",    severity: "warning", passed: hasCover,       label: "Cover image impostata", hint: "Le cover migliorano CTR su social/SERP" },
    ];
  }, [editor.title, editor.slug, editor.body_md, editor.excerpt, editor.meta_description, editor.cover_image_url]);

  const blockingErrors = checks.filter((c) => !c.passed && c.severity === "error");
  const canPublish = blockingErrors.length === 0;

  const saveMut = useMutation({
    mutationFn: async (params: { e: EditorState; closeAfter: boolean }) => {
      const e = params.e;
      if (!e.title?.trim()) throw new Error("Il titolo è obbligatorio");
      if (!e.slug?.trim()) throw new Error("Lo slug è obbligatorio");

      // Pre-flight collision check (clearer error than the postgres unique violation)
      const collision = await findSlugCollision(e.slug.trim(), e.id);
      if (collision) throw new Error(`Lo slug "${e.slug}" è già usato da un altro articolo`);

      // Block publish if hard checks fail
      if (e.status === "published" && blockingErrors.length > 0) {
        throw new Error(`Impossibile pubblicare: ${blockingErrors[0].label}`);
      }

      const payload: Partial<NewsArticle> = {
        slug: e.slug.trim(),
        title: e.title.trim(),
        excerpt: e.excerpt?.trim() || null,
        body_md: e.body_md ?? null,
        cover_image_url: e.cover_image_url?.trim() || null,
        category: e.category || "guide",
        tags: e.tags ?? [],
        author_name: e.author_name?.trim() || "Pratica Rapida",
        author_avatar_url: e.author_avatar_url?.trim() || null,
        meta_title: e.meta_title?.trim() || null,
        meta_description: e.meta_description?.trim() || null,
        meta_keywords: e.meta_keywords?.length ? e.meta_keywords : null,
        canonical_url: e.canonical_url?.trim() || null,
        og_title: e.og_title?.trim() || null,
        og_description: e.og_description?.trim() || null,
        og_image_url: e.og_image_url?.trim() || null,
        twitter_card: e.twitter_card || "summary_large_image",
        json_ld_type: e.json_ld_type || "BlogPosting",
        no_index: !!e.no_index,
        no_follow: !!e.no_follow,
        status: (e.status as NewsArticle["status"]) ?? "draft",
        pinned: !!e.pinned,
        read_time_minutes: Number(e.read_time_minutes) || 5,
      };

      // Auto-set published_at on first publish
      if (payload.status === "published" && !e.published_at) {
        payload.published_at = new Date().toISOString();
      } else if (e.published_at) {
        payload.published_at = e.published_at;
      }

      let savedId: string;
      if (e.id) {
        const { error } = await supabase.from("news_articles").update(payload).eq("id", e.id);
        if (error) throw error;
        savedId = e.id;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("news_articles")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("id, created_at, updated_at, view_count")
          .single();
        if (error) throw error;
        savedId = data.id;
        // Promote local state to "edit mode" so subsequent saves update
        setEditor((prev) => ({ ...prev, id: savedId, ...data }));
      }
      return { id: savedId, closeAfter: params.closeAfter };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["news_articles"] });
      toast({ title: result.closeAfter ? "Articolo salvato" : "Bozza salvata" });
      if (result.closeAfter) setEditorOpen(false);
    },
    onError: (err: Error) => toast({ title: "Errore salvataggio", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("news_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news_articles"] });
      toast({ title: "Articolo eliminato" });
      setConfirmDelete(null);
    },
    onError: (err: Error) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const togglePublishMut = useMutation({
    mutationFn: async (it: NewsArticle) => {
      const newStatus: NewsArticle["status"] = it.status === "published" ? "draft" : "published";
      const update: Partial<NewsArticle> = { status: newStatus };
      if (newStatus === "published" && !it.published_at) update.published_at = new Date().toISOString();
      const { error } = await supabase.from("news_articles").update(update).eq("id", it.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["news_articles"] }),
  });

  const togglePinMut = useMutation({
    mutationFn: async (it: NewsArticle) => {
      const { error } = await supabase.from("news_articles").update({ pinned: !it.pinned }).eq("id", it.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["news_articles"] }),
  });

  const duplicateMut = useMutation({
    mutationFn: async (it: NewsArticle) => {
      let candidate = `${it.slug}-copia`;
      let n = 2;
      while (items.some((x) => x.slug === candidate)) {
        candidate = `${it.slug}-copia-${n}`;
        n++;
      }
      const { id, created_at, updated_at, view_count, ...rest } = it;
      void id; void created_at; void updated_at; void view_count;
      const copy = {
        ...rest,
        slug: candidate,
        title: `${it.title} (copia)`,
        status: "draft" as const,
        published_at: null,
        pinned: false,
      };
      const { error } = await supabase.from("news_articles").insert(copy);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news_articles"] });
      toast({ title: "Articolo duplicato in bozza" });
    },
    onError: (err: Error) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  // ⌘+S / Ctrl+S to save without closing
  const saveDraft = useCallback(() => {
    if (!editor.title?.trim()) return;
    saveMut.mutate({ e: editor, closeAfter: false });
  }, [editor, saveMut]);

  useEffect(() => {
    if (!editorOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveDraft();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorOpen, saveDraft]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Notizie & Blog</h1>
          <p className="text-muted-foreground text-sm">CMS articoli con SEO completa — visibili su /blog e in homepage</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />Nuovo articolo
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per titolo, slug, estratto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="published">Pubblicati</SelectItem>
            <SelectItem value="draft">Bozze</SelectItem>
            <SelectItem value="archived">Archiviati</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {NEWS_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Newspaper className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg mb-1">Nessun articolo</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {items.length === 0 ? "Crea il primo articolo per il blog" : "Nessun articolo corrisponde ai filtri"}
            </p>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nuovo articolo</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((it) => {
            const sb = STATUS_BADGE[it.status];
            return (
              <Card key={it.id} className={it.status === "draft" ? "opacity-80" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-muted flex items-center justify-center">
                      {it.cover_image_url ? (
                        <img src={it.cover_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ backgroundColor: sb.bg, color: sb.color }}
                        >
                          {sb.label}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{categoryLabel(it.category)}</Badge>
                        {it.pinned && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            <Pin className="h-3 w-3" />In evidenza
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">/{it.slug}</span>
                        {it.view_count > 0 && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3" />{it.view_count}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm">{it.title}</p>
                      {it.excerpt && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{it.excerpt}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {it.status === "published" && (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Apri sul sito">
                          <Link to={`/blog/${it.slug}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={it.pinned ? "Rimuovi evidenza" : "Metti in evidenza"}
                        onClick={() => togglePinMut.mutate(it)}
                      >
                        <Pin className={`h-4 w-4 ${it.pinned ? "fill-current text-orange-500" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={it.status === "published" ? "Riporta in bozza" : "Pubblica"}
                        onClick={() => togglePublishMut.mutate(it)}
                      >
                        {it.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title="Duplica"
                        onClick={() => duplicateMut.mutate(it)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(it)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(it)}
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

      {/* Editor sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 px-6 pt-6 pb-3 bg-background border-b">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3 flex-wrap">
                {editor.id ? "Modifica articolo" : "Nuovo articolo"}
                <StatusBanner editor={editor} canPublish={canPublish} />
              </SheetTitle>
            </SheetHeader>

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-3">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="content" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />Contenuto
                </TabsTrigger>
                <TabsTrigger value="seo" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />SEO
                </TabsTrigger>
                <TabsTrigger value="publish" className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />Pubblicazione
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="px-6 py-5">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              {/* CONTENT TAB */}
              <TabsContent value="content" className="space-y-4 mt-0">
                <div>
                  <Label>Titolo *</Label>
                  <Input
                    value={editor.title ?? ""}
                    onChange={(e) => setEditor((s) => ({ ...s, title: e.target.value }))}
                    placeholder="Es. Guida pratica ENEA 2026"
                    autoFocus={!editor.id}
                  />
                </div>

                <div>
                  <Label>Slug *</Label>
                  <SlugInput
                    value={editor.slug ?? ""}
                    onChange={(v) => { setSlugManuallyEdited(true); setEditor((s) => ({ ...s, slug: v })); }}
                    excludeId={editor.id}
                    onRegenerate={editor.title ? () => {
                      setSlugManuallyEdited(false);
                      setEditor((s) => ({ ...s, slug: slugify(s.title ?? "") }));
                    } : undefined}
                  />
                </div>

                <div>
                  <Label>Estratto</Label>
                  <Textarea
                    rows={2}
                    value={editor.excerpt ?? ""}
                    onChange={(e) => setEditor((s) => ({ ...s, excerpt: e.target.value }))}
                    placeholder="Riassunto breve (150-200 caratteri) — usato in homepage e meta description di default"
                  />
                  <CharacterCounter value={editor.excerpt ?? ""} min={120} max={200} />
                </div>

                <CoverImageUploader
                  value={editor.cover_image_url ?? ""}
                  onChange={(url) => setEditor((s) => ({ ...s, cover_image_url: url }))}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select
                      value={editor.category ?? "guide"}
                      onValueChange={(v) => setEditor((s) => ({ ...s, category: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NEWS_CATEGORIES.filter((c) => c.id !== "tutti").map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Minuti di lettura</Label>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                        onClick={() => setEditor((s) => ({ ...s, read_time_minutes: estimateReadingTime(s.body_md ?? "") }))}
                      >
                        <Calculator className="h-3 w-3" />Auto-calcola
                      </button>
                    </div>
                    <Input
                      type="number" min={1} max={60}
                      value={editor.read_time_minutes ?? 5}
                      onChange={(e) => setEditor((s) => ({ ...s, read_time_minutes: Number(e.target.value) || 5 }))}
                    />
                  </div>
                </div>

                <div>
                  <Label>Tag</Label>
                  <TagInput
                    value={editor.tags ?? []}
                    onChange={(tags) => setEditor((s) => ({ ...s, tags }))}
                    suggestions={tagSuggestions}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Premi Invio o virgola per aggiungere · Backspace per rimuovere l'ultimo
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Autore</Label>
                    <Input
                      value={editor.author_name ?? "Pratica Rapida"}
                      onChange={(e) => setEditor((s) => ({ ...s, author_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Avatar autore (URL)</Label>
                    <Input
                      value={editor.author_avatar_url ?? ""}
                      onChange={(e) => setEditor((s) => ({ ...s, author_avatar_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <BodyEditor
                  value={editor.body_md ?? ""}
                  onChange={(v) => setEditor((s) => ({ ...s, body_md: v }))}
                />
              </TabsContent>

              {/* SEO TAB */}
              <TabsContent value="seo" className="space-y-4 mt-0">
                <SeoPreviewCard
                  title={editor.meta_title || editor.title || ""}
                  description={editor.meta_description || editor.excerpt || ""}
                  slug={editor.slug ?? ""}
                />

                <div>
                  <Label>Meta title (override del &lt;title&gt;)</Label>
                  <Input
                    value={editor.meta_title ?? ""}
                    onChange={(e) => setEditor((s) => ({ ...s, meta_title: e.target.value }))}
                    placeholder={editor.title || "Lascia vuoto per usare il titolo"}
                  />
                  <CharacterCounter value={editor.meta_title ?? ""} min={50} max={60} />
                </div>

                <div>
                  <Label>Meta description</Label>
                  <Textarea
                    rows={2}
                    value={editor.meta_description ?? ""}
                    onChange={(e) => setEditor((s) => ({ ...s, meta_description: e.target.value }))}
                    placeholder={editor.excerpt || "Descrizione per i motori di ricerca"}
                  />
                  <CharacterCounter value={editor.meta_description ?? ""} min={120} max={160} />
                </div>

                <div>
                  <Label>Meta keywords</Label>
                  <TagInput
                    value={editor.meta_keywords ?? []}
                    onChange={(meta_keywords) => setEditor((s) => ({ ...s, meta_keywords }))}
                    suggestions={tagSuggestions}
                    placeholder="ecobonus 2026, pratica enea…"
                  />
                </div>

                <div>
                  <Label>URL canonico (override)</Label>
                  <Input
                    value={editor.canonical_url ?? ""}
                    onChange={(e) => setEditor((s) => ({ ...s, canonical_url: e.target.value }))}
                    placeholder={`https://www.praticarapida.it/blog/${editor.slug || "..."}`}
                  />
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-semibold text-sm">Open Graph (preview social)</h4>
                  <div>
                    <Label>OG Title</Label>
                    <Input
                      value={editor.og_title ?? ""}
                      onChange={(e) => setEditor((s) => ({ ...s, og_title: e.target.value }))}
                      placeholder={editor.title || "Default: titolo articolo"}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {editor.og_title?.trim() ? `Override: ${editor.og_title}` : `Default: ${editor.title || "(usa il titolo)"}`}
                    </p>
                  </div>
                  <div>
                    <Label>OG Description</Label>
                    <Textarea
                      rows={2}
                      value={editor.og_description ?? ""}
                      onChange={(e) => setEditor((s) => ({ ...s, og_description: e.target.value }))}
                      placeholder={editor.excerpt || "Default: estratto"}
                    />
                  </div>
                  <div>
                    <Label>OG Image (1200×630)</Label>
                    <Input
                      value={editor.og_image_url ?? ""}
                      onChange={(e) => setEditor((s) => ({ ...s, og_image_url: e.target.value }))}
                      placeholder={editor.cover_image_url || "Default: cover image"}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {editor.og_image_url?.trim()
                        ? `Override: ${editor.og_image_url}`
                        : editor.cover_image_url
                          ? "Default: stessa cover image"
                          : "Default: og-image globale del sito"}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-semibold text-sm">Schema.org JSON-LD</h4>
                  <div>
                    <Label>Tipo schema</Label>
                    <Select
                      value={editor.json_ld_type ?? "BlogPosting"}
                      onValueChange={(v) => setEditor((s) => ({ ...s, json_ld_type: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BlogPosting">BlogPosting (articolo blog)</SelectItem>
                        <SelectItem value="NewsArticle">NewsArticle (notizia)</SelectItem>
                        <SelectItem value="Article">Article (generico)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm">Indicizzazione</h4>
                  <ToggleRow
                    checked={!!editor.no_index}
                    onChange={(v) => setEditor((s) => ({ ...s, no_index: v }))}
                    title="No-index"
                    desc="Esclude l'articolo dai motori di ricerca"
                  />
                  <ToggleRow
                    checked={!!editor.no_follow}
                    onChange={(v) => setEditor((s) => ({ ...s, no_follow: v }))}
                    title="No-follow"
                    desc="I link nell'articolo non passeranno PageRank"
                  />
                </div>
              </TabsContent>

              {/* PUBLISH TAB */}
              <TabsContent value="publish" className="space-y-4 mt-0">
                <PublishChecklist checks={checks} />

                <div className="border-t pt-4">
                  <Label>Stato</Label>
                  <Select
                    value={editor.status ?? "draft"}
                    onValueChange={(v) => setEditor((s) => ({ ...s, status: v as NewsArticle["status"] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Bozza (non visibile)</SelectItem>
                      <SelectItem value="published" disabled={!canPublish}>
                        Pubblicato (visibile sul sito){!canPublish && " — checklist incompleta"}
                      </SelectItem>
                      <SelectItem value="archived">Archiviato (nascosto, recuperabile)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Data di pubblicazione</Label>
                  <Input
                    type="datetime-local"
                    value={editor.published_at ? toLocalInput(editor.published_at) : ""}
                    onChange={(e) => setEditor((s) => ({
                      ...s,
                      published_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    }))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Lascia vuoto per usare la data corrente al momento della pubblicazione
                  </p>
                </div>

                <ToggleRow
                  checked={!!editor.pinned}
                  onChange={(v) => setEditor((s) => ({ ...s, pinned: v }))}
                  title="In evidenza"
                  desc="L'articolo apparirà in cima alla lista e nel widget homepage"
                />

                {editor.id && (
                  <div className="border-t pt-4 text-xs text-muted-foreground space-y-1">
                    <p><strong>Visualizzazioni:</strong> {(editor as NewsArticle).view_count ?? 0}</p>
                    {(editor as NewsArticle).created_at && (
                      <p><strong>Creato:</strong> {new Date((editor as NewsArticle).created_at).toLocaleString("it-IT")}</p>
                    )}
                    {(editor as NewsArticle).updated_at && (
                      <p><strong>Ultima modifica:</strong> {new Date((editor as NewsArticle).updated_at).toLocaleString("it-IT")}</p>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 left-0 right-0 px-6 py-3 border-t bg-background flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">⌘ S</kbd> per salvare
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saveMut.isPending}>
                Annulla
              </Button>
              <Button
                variant="outline"
                onClick={saveDraft}
                disabled={saveMut.isPending || !editor.title?.trim()}
                className="gap-1.5"
              >
                {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salva bozza
              </Button>
              <Button
                onClick={() => saveMut.mutate({ e: editor, closeAfter: true })}
                disabled={saveMut.isPending || !editor.title?.trim()}
                className="gap-1.5"
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : editor.status === "published" ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {editor.status === "published" ? "Pubblica" : "Salva e chiudi"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare articolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente <strong>{confirmDelete?.title}</strong>. L'azione non è
              reversibile e l'URL <code>/blog/{confirmDelete?.slug}</code> tornerà a 404.
              {confirmDelete?.status === "published" && (
                <span className="block mt-2 text-amber-700">
                  ⚠️ Questo articolo è attualmente <strong>pubblicato</strong>. Considera di archiviarlo invece di eliminarlo.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBanner({ editor, canPublish }: { editor: EditorState; canPublish: boolean }) {
  const status = (editor.status as NewsArticle["status"]) ?? "draft";
  const sb = STATUS_BADGE[status];
  const Icon = sb.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: sb.bg, color: sb.color }}
    >
      <Icon className="h-3 w-3" />
      {sb.label}
      {status === "published" && !canPublish && (
        <span className="ml-1 text-amber-700 font-normal">· checklist incompleta</span>
      )}
    </span>
  );
}

function ToggleRow({
  checked, onChange, title, desc,
}: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function SeoPreviewCard({ title, description, slug }: { title: string; description: string; slug: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Anteprima Google</p>
      <p className="text-xs text-emerald-700">www.praticarapida.it › blog › {slug || "..."}</p>
      <p className="text-base text-blue-700 font-medium leading-tight line-clamp-2">{title || "Titolo articolo"}</p>
      <p className="text-sm text-muted-foreground line-clamp-2">
        {description || "Descrizione mancante — sarà mostrata nei risultati di ricerca"}
      </p>
    </div>
  );
}

function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readingTime = useMemo(() => estimateReadingTime(value), [value]);
  const wordCount = useMemo(() => {
    const stripped = value.replace(/[#>*_\-|]/g, " ").replace(/\s+/g, " ").trim();
    return stripped ? stripped.split(/\s+/).length : 0;
  }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>Contenuto (Markdown)</Label>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {wordCount} parole · ~{readingTime} min
          </span>
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showPreview ? "← Editor" : "Anteprima →"}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="rounded-md border bg-muted/30 p-4 max-h-[420px] overflow-y-auto prose prose-sm max-w-none">
          <MarkdownPreview md={value} />
        </div>
      ) : (
        <>
          <MarkdownToolbar textareaRef={textareaRef} onChange={onChange} />
          <Textarea
            ref={textareaRef}
            rows={20}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-sm leading-relaxed rounded-t-none"
            placeholder={MARKDOWN_HINT}
          />
        </>
      )}

      <p className="text-[11px] text-muted-foreground mt-1">
        Sintassi: <code>## titolo</code>, <code>**grassetto**</code>, <code>- lista</code>, <code>1. numerata</code>,{" "}
        <code>&gt; ⚠️ **WARNING**</code>, tabelle <code>|colonna|...</code>
      </p>
    </div>
  );
}

function MarkdownPreview({ md }: { md: string }) {
  const blocks = useMemo(() => parseMarkdown(md), [md]);
  if (!md.trim()) return <p className="text-muted-foreground italic">Nessun contenuto</p>;
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h1": return <h1 key={i}>{b.text}</h1>;
          case "h2": return <h2 key={i}>{b.text}</h2>;
          case "h3": return <h3 key={i}>{b.text}</h3>;
          case "p":  return <p key={i}>{b.text}</p>;
          case "ul": return <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
          case "ol": return <ol key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>;
          case "callout": return (
            <blockquote
              key={i}
              className={`border-l-4 ${b.variant === "warning" ? "border-orange-500" : b.variant === "tip" ? "border-emerald-500" : "border-blue-500"}`}
            >
              <strong>{b.variant.toUpperCase()}:</strong> {b.text}
            </blockquote>
          );
          case "table": return (
            <table key={i}>
              <thead><tr>{b.headers.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
            </table>
          );
          case "image": return <img key={i} src={b.src} alt={b.alt} />;
          default: return null;
        }
      })}
    </>
  );
}

const MARKDOWN_HINT = `## Sezione

Paragrafo con **grassetto** e [link](https://example.com).

- Punto elenco uno
- Punto elenco due

1. Numerato uno
2. Numerato due

> ⚠️ **WARNING**
>
> Testo del callout di attenzione.

| Colonna A | Colonna B |
| --- | --- |
| valore 1 | valore 2 |
`;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}
