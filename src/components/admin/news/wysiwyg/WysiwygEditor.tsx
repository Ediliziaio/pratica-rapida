/**
 * WysiwygEditor — TipTap-based rich text editor for news articles.
 *
 * - Output: HTML string suitable for storage in news_articles.body_html and
 *   for direct rendering in BlogPost.tsx (via DOMPurify).
 * - Input: existing HTML when editing, or empty.
 * - Features: paragraph styles, headings H1/H2/H3, bold/italic/underline,
 *   bullet/ordered lists, blockquote, callouts (info/warning/tip), inline
 *   image upload to news-images bucket, links, tables, undo/redo.
 *
 * Pattern: stateful via TipTap useEditor — emit `onChange(html)` on every
 * `update`. Parent stores HTML; we re-sync only when the prop value changes
 * from outside (e.g. switching articles).
 */

import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Trash2, Plus,
  AlignLeft, AlignCenter, AlignRight,
  Undo, Redo, Info, AlertTriangle, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Callout, type CalloutVariant } from "./CalloutExtension";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function WysiwygEditor({ value, onChange, placeholder }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUpdatingFromProp = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Disable starter-kit's blockquote so our custom Callout owns blockquotes
        blockquote: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: placeholder ?? "Inizia a scrivere il tuo articolo…",
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "wysiwyg-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "wysiwyg-content prose prose-sm max-w-none focus:outline-none min-h-[400px] px-4 py-3",
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingFromProp.current) return;
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. switching from "new" to existing article)
  // without breaking caret/selection during normal typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      isUpdatingFromProp.current = true;
      editor.commands.setContent(value || "", { emitUpdate: false });
      requestAnimationFrame(() => { isUpdatingFromProp.current = false; });
    }
  }, [value, editor]);

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (!file.type.startsWith("image/")) {
        toast({ title: "File non valido", description: "Seleziona un'immagine", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File troppo grande", description: "Massimo 5 MB", variant: "destructive" });
        return;
      }
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `inline/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("news-images").upload(path, file, {
          cacheControl: "3600", upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from("news-images").getPublicUrl(path);
        editor.chain().focus().setImage({ src: data.publicUrl, alt: file.name.replace(/\.[^.]+$/, "") }).run();
        toast({ title: "Immagine inserita" });
      } catch (err) {
        toast({ title: "Errore upload", description: (err as Error).message, variant: "destructive" });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [editor, toast],
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del link", previousUrl ?? "https://");
    if (url === null) return; // user cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-lg border border-input bg-background overflow-hidden">
        {/* Toolbar */}
        <div className="sticky top-0 z-[5] flex items-center gap-0.5 flex-wrap p-1.5 bg-muted/40 border-b">
          {/* Undo / Redo */}
          <ToolbarButton
            label="Annulla (⌘+Z)"
            icon={Undo}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          />
          <ToolbarButton
            label="Ripeti (⌘+⇧+Z)"
            icon={Redo}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          />
          <Divider />

          {/* Paragraph style dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
                {editor.isActive("heading", { level: 1 }) ? (<><Heading1 className="h-3.5 w-3.5" />Titolo 1</>)
                  : editor.isActive("heading", { level: 2 }) ? (<><Heading2 className="h-3.5 w-3.5" />Titolo 2</>)
                  : editor.isActive("heading", { level: 3 }) ? (<><Heading3 className="h-3.5 w-3.5" />Titolo 3</>)
                  : (<><Pilcrow className="h-3.5 w-3.5" />Paragrafo</>)
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
                <Pilcrow className="h-3.5 w-3.5 mr-2" />Paragrafo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="h-4 w-4 mr-2" /><span className="text-lg font-bold">Titolo 1</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="h-4 w-4 mr-2" /><span className="text-base font-bold">Titolo 2</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                <Heading3 className="h-4 w-4 mr-2" /><span className="text-sm font-semibold">Titolo 3</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />

          {/* Inline formatting */}
          <ToolbarButton
            label="Grassetto (⌘+B)"
            icon={Bold}
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="Corsivo (⌘+I)"
            icon={Italic}
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="Sottolineato (⌘+U)"
            icon={UnderlineIcon}
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            label="Link"
            icon={LinkIcon}
            active={editor.isActive("link")}
            onClick={setLink}
          />
          <Divider />

          {/* Lists */}
          <ToolbarButton
            label="Lista puntata"
            icon={List}
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Lista numerata"
            icon={ListOrdered}
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <Divider />

          {/* Alignment */}
          <ToolbarButton
            label="Allinea a sinistra"
            icon={AlignLeft}
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          />
          <ToolbarButton
            label="Centra"
            icon={AlignCenter}
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          />
          <ToolbarButton
            label="Allinea a destra"
            icon={AlignRight}
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          />
          <Divider />

          {/* Callouts */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                    <Quote className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Riquadro evidenziato</TooltipContent>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {[
                { variant: "info" as CalloutVariant, label: "Informazione", icon: Info, color: "text-blue-600" },
                { variant: "warning" as CalloutVariant, label: "Attenzione", icon: AlertTriangle, color: "text-orange-600" },
                { variant: "tip" as CalloutVariant, label: "Consiglio", icon: Lightbulb, color: "text-emerald-600" },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <DropdownMenuItem
                    key={opt.variant}
                    onClick={() => editor.chain().focus().setCallout(opt.variant).run()}
                  >
                    <Icon className={`h-3.5 w-3.5 mr-2 ${opt.color}`} />
                    {opt.label}
                  </DropdownMenuItem>
                );
              })}
              {editor.isActive("callout") && (
                <DropdownMenuItem onClick={() => editor.chain().focus().unsetCallout().run()}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Rimuovi riquadro
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Image upload */}
          <ToolbarButton
            label="Inserisci immagine"
            icon={ImageIcon}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])}
          />

          {/* Table dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                    <TableIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Tabella</TooltipContent>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                <Plus className="h-3.5 w-3.5 mr-2" />Inserisci tabella 3×3
              </DropdownMenuItem>
              {editor.isActive("table") && (
                <>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                    Aggiungi riga sotto
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                    Aggiungi colonna a destra
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
                    Elimina riga
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
                    Elimina colonna
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Elimina tabella
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Editor surface */}
        <div className="bg-background">
          <EditorContent editor={editor} />

          {/* Bubble menu — appears on text selection */}
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor, from, to }) =>
              from !== to && !editor.isActive("image") && !editor.isActive("table")
            }
            options={{ placement: "top" }}
          >
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-md border bg-popover shadow-lg">
              <ToolbarButton
                label="B" icon={Bold}
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
                size="sm"
              />
              <ToolbarButton
                label="I" icon={Italic}
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                size="sm"
              />
              <ToolbarButton
                label="U" icon={UnderlineIcon}
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                size="sm"
              />
              <ToolbarButton label="Link" icon={LinkIcon} onClick={setLink} size="sm" active={editor.isActive("link")} />
            </div>
          </BubbleMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-border mx-1" />;
}

interface ToolbarBtnProps {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
}

function ToolbarButton({ label, icon: Icon, onClick, active, disabled, size = "default" }: ToolbarBtnProps) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={`${dim} ${active ? "bg-secondary text-secondary-foreground" : ""}`}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
