import { useRef } from "react";
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Table, AlertTriangle, Lightbulb, Info, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onChange: (next: string) => void;
}

interface InsertOpts {
  /** Text to wrap selection with on both sides ("**" for bold). */
  wrap?: string;
  /** Snippet to insert when there is no selection. `$1` is replaced with caret position. */
  snippet?: string;
  /** Wraps selection like `[selection](url)` for links. */
  link?: boolean;
  /** Prefix each non-empty line. Used for lists/quotes. */
  linePrefix?: string;
  /** Multi-line block, inserted on its own line. */
  block?: string;
}

/**
 * Toolbar for the markdown body editor. Operates on the host textarea via the
 * provided ref so caret position and selection are preserved correctly.
 *
 * Supports text formatting, lists, headings, link, image upload + insert,
 * tables, and the three callout variants we render specially in BlogPost.
 */
export default function MarkdownToolbar({ textareaRef, onChange }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apply = (opts: InsertOpts) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);

    let inserted: string;
    let caretOffset: number;

    if (opts.wrap) {
      const w = opts.wrap;
      inserted = `${w}${sel || "testo"}${w}`;
      caretOffset = start + w.length + (sel ? sel.length : 4);
    } else if (opts.link) {
      inserted = `[${sel || "testo"}](https://)`;
      caretOffset = start + inserted.length - 1; // caret just before the closing )
    } else if (opts.linePrefix) {
      const lines = (sel || opts.snippet || "voce").split("\n");
      inserted = lines.map((l) => `${opts.linePrefix}${l}`).join("\n");
      caretOffset = start + inserted.length;
    } else if (opts.block) {
      // Ensure block sits on its own paragraph
      const needsLeadingNl = before && !before.endsWith("\n\n");
      const needsTrailingNl = after && !after.startsWith("\n\n");
      inserted = `${needsLeadingNl ? (before.endsWith("\n") ? "\n" : "\n\n") : ""}${opts.block}${needsTrailingNl ? "\n\n" : ""}`;
      caretOffset = start + inserted.length;
    } else if (opts.snippet) {
      inserted = opts.snippet;
      const placeholder = inserted.indexOf("$1");
      if (placeholder >= 0) {
        inserted = inserted.replace("$1", "");
        caretOffset = start + placeholder;
      } else {
        caretOffset = start + inserted.length;
      }
    } else {
      return;
    }

    const next = before + inserted + after;
    onChange(next);
    // restore focus + caret on the next tick
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretOffset, caretOffset);
    });
  };

  const handleImageUpload = async (file: File) => {
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
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("news-images").getPublicUrl(path);
      apply({ block: `![${file.name.replace(/\.[^.]+$/, "")}](${data.publicUrl})` });
      toast({ title: "Immagine inserita" });
    } catch (err) {
      toast({ title: "Errore upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const Btn = ({
    label, icon: Icon, onClick,
  }: { label: string; icon: typeof Bold; onClick: () => void }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 flex-wrap p-1 bg-muted/40 border border-b-0 border-border rounded-t-md">
        <Btn label="Titolo H2" icon={Heading2} onClick={() => apply({ linePrefix: "## " })} />
        <Btn label="Sottotitolo H3" icon={Heading3} onClick={() => apply({ linePrefix: "### " })} />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn label="Grassetto" icon={Bold} onClick={() => apply({ wrap: "**" })} />
        <Btn label="Corsivo" icon={Italic} onClick={() => apply({ wrap: "*" })} />
        <Btn label="Link" icon={LinkIcon} onClick={() => apply({ link: true })} />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn label="Lista puntata" icon={List} onClick={() => apply({ linePrefix: "- " })} />
        <Btn label="Lista numerata" icon={ListOrdered} onClick={() => apply({ linePrefix: "1. " })} />
        <Btn label="Citazione" icon={Quote} onClick={() => apply({ linePrefix: "> " })} />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn
          label="Callout informativo"
          icon={Info}
          onClick={() => apply({ block: "> ℹ️ **INFO**\n>\n> Testo informativo." })}
        />
        <Btn
          label="Callout attenzione"
          icon={AlertTriangle}
          onClick={() => apply({ block: "> ⚠️ **WARNING**\n>\n> Testo di attenzione." })}
        />
        <Btn
          label="Callout consiglio"
          icon={Lightbulb}
          onClick={() => apply({ block: "> 💡 **TIP**\n>\n> Suggerimento pratico." })}
        />
        <span className="w-px h-5 bg-border mx-1" />
        <Btn
          label="Tabella"
          icon={Table}
          onClick={() => apply({ block: "| Colonna A | Colonna B |\n| --- | --- |\n| Valore 1 | Valore 2 |\n| Valore 3 | Valore 4 |" })}
        />
        <Btn label="Carica immagine inline" icon={ImageIcon} onClick={() => fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
        />
      </div>
    </TooltipProvider>
  );
}
