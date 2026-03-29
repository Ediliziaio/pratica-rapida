/**
 * EmailBuilder — GHL-style block-based email editor
 * Layout: [Block palette] | [Canvas] | [Properties panel]
 */
import { useState, useCallback, useRef } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Save, Monitor, Smartphone, Trash2, GripVertical,
  Plus, X, Type, AlignLeft, AlignCenter, AlignRight, Code,
  Image as ImageIcon, Minus, Space, Square, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BlockType =
  | "header" | "title" | "text" | "button"
  | "image" | "divider" | "spacer" | "html";

export interface BlockStyles {
  backgroundColor: string;
  color: string;
  fontSize: number;
  textAlign: "left" | "center" | "right";
  paddingTop: number;
  paddingBottom: number;
  fontWeight: "normal" | "bold";
  // button
  buttonBg: string;
  buttonTextColor: string;
  buttonRadius: number;
  buttonUrl: string;
  buttonPadding: number;
  // spacer
  height: number;
  // divider
  borderColor: string;
  borderWidth: number;
  // image
  imageUrl: string;
  imageAlt: string;
  imageWidth: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  styles: Partial<BlockStyles>;
}

export interface EmailDesign {
  blocks: Block[];
  bodyBg: string;
  containerBg: string;
  fontFamily: string;
}

export interface EmailTmplRow {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  design_json: EmailDesign | null;
  is_active: boolean;
  trigger_event: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const MERGE_TAGS = [
  { key: "{{nome}}", label: "Nome cliente" },
  { key: "{{link}}", label: "Link modulo" },
  { key: "{{tipo_modulo}}", label: "Tipo modulo" },
];

const PALETTE_ITEMS: { type: BlockType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: "header",  label: "Intestazione", icon: <span className="font-bold text-xs">H1</span>, desc: "Header con sfondo colorato" },
  { type: "title",   label: "Titolo",       icon: <Type className="h-3.5 w-3.5" />,              desc: "Titolo sezione" },
  { type: "text",    label: "Testo",        icon: <AlignLeft className="h-3.5 w-3.5" />,         desc: "Paragrafo di testo" },
  { type: "button",  label: "Bottone",      icon: <Square className="h-3.5 w-3.5" />,            desc: "Call-to-action link" },
  { type: "image",   label: "Immagine",     icon: <ImageIcon className="h-3.5 w-3.5" />,         desc: "Immagine da URL" },
  { type: "divider", label: "Divisore",     icon: <Minus className="h-3.5 w-3.5" />,             desc: "Linea separatrice" },
  { type: "spacer",  label: "Spazio",       icon: <Space className="h-3.5 w-3.5" />,             desc: "Spazio verticale" },
  { type: "html",    label: "HTML libero",  icon: <Code className="h-3.5 w-3.5" />,              desc: "Codice HTML personalizzato" },
];

const DEFAULT_STYLES: Record<BlockType, Partial<BlockStyles>> = {
  header:  { backgroundColor: "#16a34a", color: "#ffffff", fontSize: 24, textAlign: "center", paddingTop: 24, paddingBottom: 24, fontWeight: "bold" },
  title:   { backgroundColor: "#ffffff", color: "#111827", fontSize: 22, textAlign: "left",   paddingTop: 16, paddingBottom: 8,  fontWeight: "bold" },
  text:    { backgroundColor: "#ffffff", color: "#374151", fontSize: 15, textAlign: "left",   paddingTop: 8,  paddingBottom: 8,  fontWeight: "normal" },
  button:  { backgroundColor: "#ffffff", textAlign: "center", paddingTop: 16, paddingBottom: 16, buttonBg: "#16a34a", buttonTextColor: "#ffffff", buttonRadius: 6, buttonUrl: "{{link}}", buttonPadding: 14 },
  image:   { backgroundColor: "#ffffff", textAlign: "center", paddingTop: 12, paddingBottom: 12, imageUrl: "", imageAlt: "", imageWidth: "100%" },
  divider: { backgroundColor: "#ffffff", paddingTop: 8, paddingBottom: 8, borderColor: "#e5e7eb", borderWidth: 1 },
  spacer:  { backgroundColor: "#ffffff", height: 32 },
  html:    { backgroundColor: "#ffffff", paddingTop: 8, paddingBottom: 8 },
};

const DEFAULT_CONTENT: Record<BlockType, string> = {
  header:  "Pratica Rapida",
  title:   "Ciao {{nome}},",
  text:    "Scrivi qui il testo dell'email. Puoi usare variabili come {{nome}} e {{link}}.",
  button:  "Compila il modulo",
  image:   "",
  divider: "",
  spacer:  "",
  html:    "<p style=\"margin:0;\">HTML personalizzato qui</p>",
};

function newBlock(type: BlockType): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content: DEFAULT_CONTENT[type],
    styles: { ...DEFAULT_STYLES[type] },
  };
}

const DEFAULT_DESIGN: EmailDesign = {
  bodyBg: "#f3f4f6",
  containerBg: "#ffffff",
  fontFamily: "Arial, Helvetica, sans-serif",
  blocks: [
    { ...newBlock("header"), content: "Pratica Rapida" },
    { ...newBlock("title"),  content: "Ciao {{nome}}," },
    { ...newBlock("text"),   content: "Hai ricevuto un nuovo modulo da compilare per la tua pratica <b>{{tipo_modulo}}</b>.<br><br>Clicca il bottone qui sotto per accedere al modulo." },
    { ...newBlock("button"), content: "Compila il modulo ora →" },
    { ...newBlock("divider") },
    { ...newBlock("text"),   content: "Se hai domande, rispondi a questa email o contattaci.<br><br>Grazie,<br>Il team Pratica Rapida" },
    { ...newBlock("spacer") },
  ],
};

// ─── HTML Generation ─────────────────────────────────────────────────────────

function blockToHtml(block: Block): string {
  const s = block.styles;
  const bg = s.backgroundColor ?? "#ffffff";
  const pt = s.paddingTop ?? 8;
  const pb = s.paddingBottom ?? 8;
  const cellStyle = `background:${bg};padding:${pt}px 24px ${pb}px 24px;`;

  switch (block.type) {
    case "header":
    case "title": {
      const fs = s.fontSize ?? (block.type === "header" ? 24 : 22);
      const fw = s.fontWeight ?? "bold";
      const clr = s.color ?? "#111827";
      const align = s.textAlign ?? "left";
      return `<tr><td style="${cellStyle}"><p style="margin:0;font-size:${fs}px;font-weight:${fw};color:${clr};text-align:${align};">${block.content}</p></td></tr>`;
    }
    case "text": {
      const fs = s.fontSize ?? 15;
      const fw = s.fontWeight ?? "normal";
      const clr = s.color ?? "#374151";
      const align = s.textAlign ?? "left";
      return `<tr><td style="${cellStyle}"><p style="margin:0;font-size:${fs}px;font-weight:${fw};color:${clr};text-align:${align};line-height:1.6;">${block.content}</p></td></tr>`;
    }
    case "button": {
      const align = s.textAlign ?? "center";
      const bbg = s.buttonBg ?? "#16a34a";
      const btc = s.buttonTextColor ?? "#ffffff";
      const br  = s.buttonRadius ?? 6;
      const bp  = s.buttonPadding ?? 14;
      const url = s.buttonUrl ?? "{{link}}";
      return `<tr><td style="${cellStyle};text-align:${align};"><a href="${url}" style="display:inline-block;background:${bbg};color:${btc};text-decoration:none;font-size:16px;font-weight:bold;padding:${bp}px ${bp * 2}px;border-radius:${br}px;">${block.content}</a></td></tr>`;
    }
    case "image": {
      const iUrl  = s.imageUrl ?? "";
      const iAlt  = s.imageAlt ?? "";
      const iW    = s.imageWidth ?? "100%";
      const align = s.textAlign ?? "center";
      if (!iUrl) return `<tr><td style="${cellStyle}"></td></tr>`;
      return `<tr><td style="${cellStyle};text-align:${align};"><img src="${iUrl}" alt="${iAlt}" style="max-width:${iW};height:auto;display:inline-block;" /></td></tr>`;
    }
    case "divider": {
      const bc = s.borderColor ?? "#e5e7eb";
      const bw = s.borderWidth ?? 1;
      return `<tr><td style="${cellStyle}"><hr style="border:none;border-top:${bw}px solid ${bc};margin:0;" /></td></tr>`;
    }
    case "spacer": {
      const h = s.height ?? 32;
      return `<tr><td style="background:${bg};height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    }
    case "html": {
      return `<tr><td style="${cellStyle}">${block.content}</td></tr>`;
    }
    default:
      return "";
  }
}

export function designToHtml(design: EmailDesign, subject: string): string {
  const rows = design.blocks.map(blockToHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${design.bodyBg};font-family:${design.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${design.bodyBg};">
<tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:${design.containerBg};border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Block preview (canvas rendering) ────────────────────────────────────────

function BlockPreview({ block }: { block: Block }) {
  const s = block.styles;
  const bg = s.backgroundColor ?? "#ffffff";

  const wrapStyle: React.CSSProperties = {
    backgroundColor: bg,
    paddingTop: s.paddingTop ?? 8,
    paddingBottom: s.paddingBottom ?? 8,
    paddingLeft: 24,
    paddingRight: 24,
  };

  switch (block.type) {
    case "header":
    case "title":
    case "text":
      return (
        <div style={wrapStyle}>
          <p
            style={{
              margin: 0,
              fontSize: s.fontSize ?? 15,
              fontWeight: s.fontWeight ?? "normal",
              color: s.color ?? "#374151",
              textAlign: s.textAlign ?? "left",
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: block.content }}
          />
        </div>
      );

    case "button": {
      const align = s.textAlign ?? "center";
      return (
        <div style={{ ...wrapStyle, textAlign: align }}>
          <span style={{
            display: "inline-block",
            background: s.buttonBg ?? "#16a34a",
            color: s.buttonTextColor ?? "#ffffff",
            fontSize: 16,
            fontWeight: "bold",
            padding: `${s.buttonPadding ?? 14}px ${(s.buttonPadding ?? 14) * 2}px`,
            borderRadius: s.buttonRadius ?? 6,
            cursor: "default",
          }}>
            {block.content}
          </span>
        </div>
      );
    }

    case "image":
      return (
        <div style={{ ...wrapStyle, textAlign: s.textAlign ?? "center" }}>
          {s.imageUrl
            ? <img src={s.imageUrl} alt={s.imageAlt ?? ""} style={{ maxWidth: s.imageWidth ?? "100%", height: "auto" }} />
            : <div className="flex items-center justify-center h-20 bg-muted/30 rounded text-xs text-muted-foreground">Nessuna immagine</div>
          }
        </div>
      );

    case "divider":
      return (
        <div style={wrapStyle}>
          <hr style={{ border: "none", borderTop: `${s.borderWidth ?? 1}px solid ${s.borderColor ?? "#e5e7eb"}`, margin: 0 }} />
        </div>
      );

    case "spacer":
      return <div style={{ background: bg, height: s.height ?? 32 }} />;

    case "html":
      return (
        <div
          style={wrapStyle}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      );

    default:
      return null;
  }
}

// ─── Properties Panel ────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs shrink-0">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-6 w-8 rounded border cursor-pointer p-0.5"
        />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-6 w-24 text-xs font-mono"
          maxLength={9}
        />
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, min = 0, max = 200 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{value}px</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} className="w-full" />
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: "left" | "center" | "right"; onChange: (v: "left" | "center" | "right") => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Allineamento</Label>
      <div className="flex gap-1">
        {([["left", <AlignLeft className="h-3.5 w-3.5" />], ["center", <AlignCenter className="h-3.5 w-3.5" />], ["right", <AlignRight className="h-3.5 w-3.5" />]] as const).map(([v, icon]) => (
          <Button
            key={v}
            variant={value === v ? "default" : "outline"}
            size="icon"
            className="h-7 w-7"
            onClick={() => onChange(v)}
          >
            {icon}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MergeTags({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Variabili</Label>
      <div className="flex flex-wrap gap-1">
        {MERGE_TAGS.map(t => (
          <button
            key={t.key}
            onClick={() => onInsert(t.key)}
            title={t.label}
            className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 hover:bg-primary/20 transition-colors"
          >
            {t.key}
          </button>
        ))}
      </div>
    </div>
  );
}

function PropertiesPanel({
  block,
  onUpdate,
  design,
  onUpdateDesign,
}: {
  block: Block | null;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  design: EmailDesign;
  onUpdateDesign: (patch: Partial<EmailDesign>) => void;
}) {
  const [contentRef, setContentRef] = useState<HTMLTextAreaElement | null>(null);

  const patchStyles = (patch: Partial<BlockStyles>) => {
    if (!block) return;
    onUpdate(block.id, { styles: { ...block.styles, ...patch } });
  };

  const insertTag = (tag: string) => {
    if (!block) return;
    if (contentRef) {
      const s = contentRef.selectionStart;
      const e = contentRef.selectionEnd;
      const newContent = block.content.slice(0, s) + tag + block.content.slice(e);
      onUpdate(block.id, { content: newContent });
      requestAnimationFrame(() => { contentRef.focus(); contentRef.setSelectionRange(s + tag.length, s + tag.length); });
    } else {
      onUpdate(block.id, { content: block.content + tag });
    }
  };

  if (!block) {
    // Global settings
    return (
      <div className="space-y-4 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Impostazioni globali</p>
        <ColorInput label="Sfondo pagina" value={design.bodyBg} onChange={v => onUpdateDesign({ bodyBg: v })} />
        <ColorInput label="Sfondo email" value={design.containerBg} onChange={v => onUpdateDesign({ containerBg: v })} />
        <div className="space-y-1.5">
          <Label className="text-xs">Font</Label>
          <select
            value={design.fontFamily}
            onChange={e => onUpdateDesign({ fontFamily: e.target.value })}
            className="w-full h-8 rounded-md border text-xs px-2 bg-background"
          >
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="'Georgia', serif">Georgia</option>
            <option value="'Verdana', sans-serif">Verdana</option>
            <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
          </select>
        </div>
        <p className="text-[10px] text-muted-foreground mt-4">Clicca un blocco nel canvas per modificarlo.</p>
      </div>
    );
  }

  const s = block.styles;

  return (
    <div className="space-y-4 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {PALETTE_ITEMS.find(p => p.type === block.type)?.label}
        </p>
      </div>

      <Separator />

      {/* Content editing */}
      {["header", "title", "text", "button"].includes(block.type) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Contenuto</Label>
          <Textarea
            ref={el => setContentRef(el)}
            value={block.content}
            onChange={e => onUpdate(block.id, { content: e.target.value })}
            rows={3}
            className="text-xs font-mono resize-none"
          />
          <MergeTags onInsert={insertTag} />
        </div>
      )}

      {block.type === "html" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Codice HTML</Label>
          <Textarea
            ref={el => setContentRef(el)}
            value={block.content}
            onChange={e => onUpdate(block.id, { content: e.target.value })}
            rows={5}
            className="text-xs font-mono resize-none"
          />
          <MergeTags onInsert={insertTag} />
        </div>
      )}

      {block.type === "image" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">URL immagine</Label>
            <Input value={s.imageUrl ?? ""} onChange={e => patchStyles({ imageUrl: e.target.value })} className="text-xs" placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alt text</Label>
            <Input value={s.imageAlt ?? ""} onChange={e => patchStyles({ imageAlt: e.target.value })} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Larghezza</Label>
            <Input value={s.imageWidth ?? "100%"} onChange={e => patchStyles({ imageWidth: e.target.value })} className="text-xs" placeholder="100%, 300px..." />
          </div>
          <AlignButtons value={s.textAlign ?? "center"} onChange={v => patchStyles({ textAlign: v })} />
        </>
      )}

      {/* Background */}
      <ColorInput
        label="Sfondo blocco"
        value={s.backgroundColor ?? "#ffffff"}
        onChange={v => patchStyles({ backgroundColor: v })}
      />

      {/* Text styling */}
      {["header", "title", "text"].includes(block.type) && (
        <>
          <ColorInput label="Colore testo" value={s.color ?? "#374151"} onChange={v => patchStyles({ color: v })} />
          <NumInput label="Dimensione testo" value={s.fontSize ?? 15} onChange={v => patchStyles({ fontSize: v })} min={10} max={48} />
          <div className="space-y-1.5">
            <Label className="text-xs">Stile testo</Label>
            <div className="flex gap-1">
              <Button
                variant={s.fontWeight === "bold" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs font-bold"
                onClick={() => patchStyles({ fontWeight: s.fontWeight === "bold" ? "normal" : "bold" })}
              >
                B
              </Button>
            </div>
          </div>
          <AlignButtons value={s.textAlign ?? "left"} onChange={v => patchStyles({ textAlign: v })} />
        </>
      )}

      {/* Button styling */}
      {block.type === "button" && (
        <>
          <ColorInput label="Colore bottone" value={s.buttonBg ?? "#16a34a"} onChange={v => patchStyles({ buttonBg: v })} />
          <ColorInput label="Colore testo" value={s.buttonTextColor ?? "#ffffff"} onChange={v => patchStyles({ buttonTextColor: v })} />
          <NumInput label="Arrotondamento" value={s.buttonRadius ?? 6} onChange={v => patchStyles({ buttonRadius: v })} min={0} max={40} />
          <NumInput label="Padding" value={s.buttonPadding ?? 14} onChange={v => patchStyles({ buttonPadding: v })} min={4} max={40} />
          <AlignButtons value={s.textAlign ?? "center"} onChange={v => patchStyles({ textAlign: v })} />
          <div className="space-y-1.5">
            <Label className="text-xs">URL link</Label>
            <Input value={s.buttonUrl ?? "{{link}}"} onChange={e => patchStyles({ buttonUrl: e.target.value })} className="text-xs font-mono" />
            <MergeTags onInsert={tag => patchStyles({ buttonUrl: tag })} />
          </div>
        </>
      )}

      {/* Divider styling */}
      {block.type === "divider" && (
        <>
          <ColorInput label="Colore linea" value={s.borderColor ?? "#e5e7eb"} onChange={v => patchStyles({ borderColor: v })} />
          <NumInput label="Spessore" value={s.borderWidth ?? 1} onChange={v => patchStyles({ borderWidth: v })} min={1} max={8} />
        </>
      )}

      {/* Spacer */}
      {block.type === "spacer" && (
        <NumInput label="Altezza spazio" value={s.height ?? 32} onChange={v => patchStyles({ height: v })} min={4} max={120} />
      )}

      {/* Padding */}
      {block.type !== "spacer" && (
        <>
          <Separator />
          <NumInput label="Padding superiore" value={s.paddingTop ?? 8} onChange={v => patchStyles({ paddingTop: v })} min={0} max={80} />
          <NumInput label="Padding inferiore" value={s.paddingBottom ?? 8} onChange={v => patchStyles({ paddingBottom: v })} min={0} max={80} />
        </>
      )}
    </div>
  );
}

// ─── Main EmailBuilder component ─────────────────────────────────────────────

export function EmailBuilder({
  tmpl,
  onClose,
  onSaved,
}: {
  tmpl: EmailTmplRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  // Load design from saved JSON or defaults
  const initialDesign: EmailDesign = tmpl.design_json ?? {
    ...DEFAULT_DESIGN,
    blocks: DEFAULT_DESIGN.blocks.map(b => ({ ...b, id: crypto.randomUUID() })),
  };

  const [design, setDesign] = useState<EmailDesign>(initialDesign);
  const [subject, setSubject] = useState(tmpl.subject);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [showHtml, setShowHtml] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);

  const selectedBlock = design.blocks.find(b => b.id === selectedId) ?? null;

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setDesign(d => ({
      ...d,
      blocks: d.blocks.map(b => b.id === id ? { ...b, ...patch, styles: { ...b.styles, ...(patch.styles ?? {}) } } : b),
    }));
  }, []);

  const updateDesign = useCallback((patch: Partial<EmailDesign>) => {
    setDesign(d => ({ ...d, ...patch }));
  }, []);

  const addBlock = (type: BlockType) => {
    const block = newBlock(type);
    setDesign(d => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
  };

  const deleteBlock = (id: string) => {
    setDesign(d => ({ ...d, blocks: d.blocks.filter(b => b.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateBlock = (id: string) => {
    const block = design.blocks.find(b => b.id === id);
    if (!block) return;
    const copy = { ...block, id: crypto.randomUUID() };
    const idx = design.blocks.findIndex(b => b.id === id);
    setDesign(d => {
      const newBlocks = [...d.blocks];
      newBlocks.splice(idx + 1, 0, copy);
      return { ...d, blocks: newBlocks };
    });
    setSelectedId(copy.id);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    setDesign(d => {
      const blocks = [...d.blocks];
      const [removed] = blocks.splice(result.source.index, 1);
      blocks.splice(result.destination!.index, 0, removed);
      return { ...d, blocks };
    });
  };

  const insertTagInSubject = (tag: string) => {
    const el = subjectRef.current;
    if (el) {
      const s = el.selectionStart ?? subject.length;
      const e = el.selectionEnd ?? subject.length;
      const v = subject.slice(0, s) + tag + subject.slice(e);
      setSubject(v);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
    } else {
      setSubject(v => v + tag);
    }
  };

  const html = designToHtml(design, subject);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_templates")
        .update({ subject, html_body: html, design_json: design as unknown as Record<string, unknown> })
        .eq("id", tmpl.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template salvato ✓" });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="h-14 border-b flex items-center gap-3 px-4 shrink-0 bg-background">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Chiudi editor">
          <X className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{tmpl.name}</p>
        </div>

        {/* Subject */}
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">Oggetto:</Label>
          <Input
            ref={subjectRef}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="h-8 text-xs"
            placeholder="Oggetto email…"
          />
        </div>

        {/* Variable chips for subject */}
        <div className="flex gap-1 shrink-0">
          {MERGE_TAGS.map(t => (
            <button
              key={t.key}
              onClick={() => insertTagInSubject(t.key)}
              title={`Inserisci ${t.label} nell'oggetto`}
              className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 hover:bg-primary/20 transition-colors"
            >
              {t.key}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Desktop/mobile preview */}
        <Tabs value={preview} onValueChange={v => setPreview(v as "desktop" | "mobile")}>
          <TabsList className="h-8">
            <TabsTrigger value="desktop" className="h-6 px-2 gap-1 text-xs"><Monitor className="h-3 w-3" />Desktop</TabsTrigger>
            <TabsTrigger value="mobile"  className="h-6 px-2 gap-1 text-xs"><Smartphone className="h-3 w-3" />Mobile</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setShowHtml(v => !v)}
        >
          <Code className="h-3.5 w-3.5" />
          {showHtml ? "Builder" : "HTML"}
        </Button>

        <Button size="sm" className="h-8 gap-1.5" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salva
        </Button>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      {showHtml ? (
        /* HTML view */
        <div className="flex-1 overflow-hidden p-4 bg-muted/30">
          <textarea
            value={html}
            readOnly
            className="w-full h-full font-mono text-xs border rounded-md p-3 resize-none bg-background focus:outline-none"
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex">
          {/* ── Left: Block palette ─────────────────────────────────── */}
          <div className="w-48 shrink-0 border-r bg-muted/20 overflow-y-auto">
            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Blocchi</p>
              <div className="space-y-1">
                {PALETTE_ITEMS.map(item => (
                  <button
                    key={item.type}
                    onClick={() => addBlock(item.type)}
                    className="w-full flex items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                  >
                    <span className="h-6 w-6 flex items-center justify-center rounded bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary shrink-0">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{item.label}</p>
                    </div>
                    <Plus className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Center: Canvas ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-muted/40 flex justify-center p-6"
            onClick={() => setSelectedId(null)}
          >
            <div
              style={{
                width: preview === "mobile" ? 380 : 600,
                background: design.containerBg,
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
                fontFamily: design.fontFamily,
                transition: "width 200ms ease",
              }}
              onClick={e => e.stopPropagation()}
            >
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="canvas">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {design.blocks.map((block, idx) => (
                        <Draggable key={block.id} draggableId={block.id} index={idx}>
                          {(drag, snapshot) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              onClick={() => setSelectedId(block.id)}
                              className="relative group"
                              style={{
                                ...drag.draggableProps.style,
                                outline: selectedId === block.id ? "2px solid #16a34a" : snapshot.isDragging ? "2px dashed #16a34a" : "none",
                                outlineOffset: -2,
                              }}
                            >
                              {/* Block actions */}
                              <div className={`absolute top-1 right-1 z-10 flex items-center gap-0.5 ${selectedId === block.id || snapshot.isDragging ? "flex" : "hidden group-hover:flex"}`}>
                                {/* Drag handle */}
                                <span
                                  {...drag.dragHandleProps}
                                  className="flex h-6 w-6 items-center justify-center rounded bg-black/50 text-white cursor-grab active:cursor-grabbing"
                                  title="Trascina per riordinare"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </span>
                                {/* Duplicate */}
                                <button
                                  onClick={e => { e.stopPropagation(); duplicateBlock(block.id); }}
                                  className="flex h-6 w-6 items-center justify-center rounded bg-black/50 text-white hover:bg-black/70 transition-colors"
                                  title="Duplica"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={e => { e.stopPropagation(); deleteBlock(block.id); }}
                                  className="flex h-6 w-6 items-center justify-center rounded bg-red-500/80 text-white hover:bg-red-600 transition-colors"
                                  title="Elimina blocco"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>

                              <BlockPreview block={block} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Empty canvas */}
                      {design.blocks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                          <Plus className="h-8 w-8 opacity-30" />
                          <p>Aggiungi un blocco dalla palette</p>
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </div>

          {/* ── Right: Properties panel ─────────────────────────────── */}
          <div className="w-64 shrink-0 border-l bg-background overflow-y-auto">
            <PropertiesPanel
              block={selectedBlock}
              onUpdate={updateBlock}
              design={design}
              onUpdateDesign={updateDesign}
            />
          </div>
        </div>
      )}
    </div>
  );
}
