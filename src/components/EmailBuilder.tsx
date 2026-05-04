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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, Save, Monitor, Smartphone, Trash2, GripVertical,
  Plus, X, Type, AlignLeft, AlignCenter, AlignRight, Code,
  Image as ImageIcon, Minus, Space, Square, ChevronDown, ChevronUp,
  Send, Eye, Copy as CopyIcon, Columns, Share2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BlockType =
  | "header" | "title" | "text" | "button"
  | "image" | "divider" | "spacer" | "html"
  | "logo" | "social" | "columns2";

export interface SocialIcon {
  platform: "facebook" | "instagram" | "linkedin" | "twitter";
  url: string;
}

export interface ColumnContent {
  content: string;
  bgColor: string;
}

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
  // image / logo
  imageUrl: string;
  imageAlt: string;
  imageWidth: string;
  // social
  socialIcons: SocialIcon[];
  // columns2
  leftColumn: ColumnContent;
  rightColumn: ColumnContent;
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
  { key: "{{cognome}}", label: "Cognome cliente" },
  { key: "{{cliente_nome}}", label: "Nome cliente finale" },
  { key: "{{cliente_cognome}}", label: "Cognome cliente finale" },
  { key: "{{ragione_sociale}}", label: "Ragione sociale" },
  { key: "{{email}}", label: "Email" },
  { key: "{{password}}", label: "Password" },
  { key: "{{brand}}", label: "Brand pratica" },
  { key: "{{prodotto}}", label: "Prodotto" },
  { key: "{{reseller}}", label: "Rivenditore" },
  { key: "{{oggetto}}", label: "Oggetto ticket" },
  { key: "{{messaggio}}", label: "Messaggio" },
  { key: "{{descrizione}}", label: "Descrizione" },
  { key: "{{priorita}}", label: "Priorità" },
  { key: "{{company}}", label: "Azienda" },
  { key: "{{giorni}}", label: "Giorni" },
  { key: "{{stato}}", label: "Stato pratica" },
  { key: "{{tipo_modulo}}", label: "Tipo modulo" },
  { key: "{{link}}", label: "Link generico" },
  { key: "{{ticket_link}}", label: "Link ticket" },
  { key: "{{login_url}}", label: "Login URL" },
  { key: "{{app_url}}", label: "App URL" },
];

// Preset di colori brand (riusabili nelle proprietà dei blocchi)
export const BRAND_COLORS: { name: string; value: string }[] = [
  { name: "ENEA Blue", value: "#1a1a2e" },
  { name: "Action Red", value: "#e94560" },
  { name: "Verde brand", value: "#16a34a" },
  { name: "Blu link", value: "#3b82f6" },
  { name: "Giallo evidenza", value: "#f59e0b" },
  { name: "Verde success", value: "#10b981" },
  { name: "Grey neutro", value: "#f4f4f4" },
  { name: "Bianco", value: "#ffffff" },
];

const PALETTE_ITEMS: { type: BlockType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: "logo",     label: "Logo",         icon: <ImageIcon className="h-3.5 w-3.5" />,         desc: "Logo brand centrato" },
  { type: "header",   label: "Intestazione", icon: <span className="font-bold text-xs">H1</span>, desc: "Header con sfondo colorato" },
  { type: "title",    label: "Titolo",       icon: <Type className="h-3.5 w-3.5" />,              desc: "Titolo sezione" },
  { type: "text",     label: "Testo",        icon: <AlignLeft className="h-3.5 w-3.5" />,         desc: "Paragrafo di testo" },
  { type: "button",   label: "Bottone",      icon: <Square className="h-3.5 w-3.5" />,            desc: "Call-to-action link" },
  { type: "image",    label: "Immagine",     icon: <ImageIcon className="h-3.5 w-3.5" />,         desc: "Immagine da URL" },
  { type: "columns2", label: "2 Colonne",    icon: <Columns className="h-3.5 w-3.5" />,           desc: "Layout a due colonne" },
  { type: "social",   label: "Social",       icon: <Share2 className="h-3.5 w-3.5" />,            desc: "Icone social media" },
  { type: "divider",  label: "Divisore",     icon: <Minus className="h-3.5 w-3.5" />,             desc: "Linea separatrice" },
  { type: "spacer",   label: "Spazio",       icon: <Space className="h-3.5 w-3.5" />,             desc: "Spazio verticale" },
  { type: "html",     label: "HTML libero",  icon: <Code className="h-3.5 w-3.5" />,              desc: "Codice HTML personalizzato" },
];

const DEFAULT_STYLES: Record<BlockType, Partial<BlockStyles>> = {
  header:  { backgroundColor: "#16a34a", color: "#ffffff", fontSize: 24, textAlign: "center", paddingTop: 24, paddingBottom: 24, fontWeight: "bold" },
  title:   { backgroundColor: "#ffffff", color: "#111827", fontSize: 22, textAlign: "left",   paddingTop: 16, paddingBottom: 8,  fontWeight: "bold" },
  text:    { backgroundColor: "#ffffff", color: "#374151", fontSize: 15, textAlign: "left",   paddingTop: 8,  paddingBottom: 8,  fontWeight: "normal" },
  button:  { backgroundColor: "#ffffff", textAlign: "center", paddingTop: 16, paddingBottom: 16, buttonBg: "#16a34a", buttonTextColor: "#ffffff", buttonRadius: 6, buttonUrl: "{{link}}", buttonPadding: 14 },
  image:   { backgroundColor: "#ffffff", textAlign: "center", paddingTop: 12, paddingBottom: 12, imageUrl: "", imageAlt: "", imageWidth: "100%" },
  logo:    { backgroundColor: "#ffffff", textAlign: "center", paddingTop: 24, paddingBottom: 16, imageUrl: "/pratica-rapida-logo.png", imageAlt: "Pratica Rapida", imageWidth: "180px" },
  divider: { backgroundColor: "#ffffff", paddingTop: 8, paddingBottom: 8, borderColor: "#e5e7eb", borderWidth: 1 },
  spacer:  { backgroundColor: "#ffffff", height: 32 },
  html:    { backgroundColor: "#ffffff", paddingTop: 8, paddingBottom: 8 },
  social:  {
    backgroundColor: "#ffffff", textAlign: "center", paddingTop: 16, paddingBottom: 16,
    socialIcons: [
      { platform: "facebook",  url: "https://facebook.com/" },
      { platform: "instagram", url: "https://instagram.com/" },
      { platform: "linkedin",  url: "https://linkedin.com/" },
    ],
  },
  columns2: {
    backgroundColor: "#ffffff", paddingTop: 16, paddingBottom: 16,
    leftColumn:  { content: "Colonna sinistra. Scrivi qui il contenuto.", bgColor: "#ffffff" },
    rightColumn: { content: "Colonna destra. Scrivi qui il contenuto.",   bgColor: "#ffffff" },
  },
};

const DEFAULT_CONTENT: Record<BlockType, string> = {
  header:   "Pratica Rapida",
  title:    "Ciao {{nome}},",
  text:     "Scrivi qui il testo dell'email. Puoi usare variabili come {{nome}} e {{link}}.",
  button:   "Compila il modulo",
  image:    "",
  logo:     "",
  divider:  "",
  spacer:   "",
  html:     "<p style=\"margin:0;\">HTML personalizzato qui</p>",
  social:   "",
  columns2: "",
};

// SVG icons inline per le icone social (compatibili con HTML email)
const SOCIAL_ICON_SVG: Record<SocialIcon["platform"], string> = {
  facebook:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="#E4405F" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C8.741 0 8.333.014 7.053.072 5.775.131 4.905.333 4.14.63a5.876 5.876 0 0 0-2.126 1.384A5.853 5.853 0 0 0 .63 4.14C.333 4.905.131 5.775.072 7.053.014 8.333 0 8.741 0 12s.014 3.667.072 4.947c.059 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.667 1.337 1.078 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.986 8.741 24 12 24s3.667-.014 4.947-.072c1.277-.059 2.148-.262 2.913-.558a5.892 5.892 0 0 0 2.126-1.384c.667-.667 1.078-1.338 1.384-2.126.296-.766.499-1.636.558-2.913.058-1.28.072-1.688.072-4.947s-.014-3.667-.072-4.947c-.059-1.277-.262-2.149-.558-2.913a5.853 5.853 0 0 0-1.384-2.126A5.876 5.876 0 0 0 19.86.63c-.766-.297-1.636-.499-2.913-.558C15.667.014 15.259 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.054 1.805.249 2.227.415.562.218.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>',
  linkedin:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="#0A66C2" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  twitter:
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
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
    case "image":
    case "logo": {
      const iUrl  = s.imageUrl ?? "";
      const iAlt  = s.imageAlt ?? "";
      const iW    = s.imageWidth ?? (block.type === "logo" ? "180px" : "100%");
      const align = s.textAlign ?? "center";
      if (!iUrl) return `<tr><td style="${cellStyle}"></td></tr>`;
      return `<tr><td style="${cellStyle};text-align:${align};"><img src="${iUrl}" alt="${iAlt}" style="max-width:${iW};height:auto;display:inline-block;" /></td></tr>`;
    }
    case "social": {
      const align = s.textAlign ?? "center";
      const icons = s.socialIcons ?? [];
      const iconsHtml = icons.map(i =>
        `<a href="${i.url}" style="display:inline-block;margin:0 8px;text-decoration:none;">${SOCIAL_ICON_SVG[i.platform] ?? ""}</a>`
      ).join("");
      return `<tr><td style="${cellStyle};text-align:${align};">${iconsHtml}</td></tr>`;
    }
    case "columns2": {
      const left = s.leftColumn ?? { content: "", bgColor: "#ffffff" };
      const right = s.rightColumn ?? { content: "", bgColor: "#ffffff" };
      return `<tr><td style="${cellStyle}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>
    <td valign="top" width="50%" style="background:${left.bgColor};padding:16px;font-size:14px;line-height:1.6;color:#374151;">${left.content}</td>
    <td valign="top" width="50%" style="background:${right.bgColor};padding:16px;font-size:14px;line-height:1.6;color:#374151;">${right.content}</td>
  </tr>
</table>
</td></tr>`;
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
    case "logo":
      return (
        <div style={{ ...wrapStyle, textAlign: s.textAlign ?? "center" }}>
          {s.imageUrl
            ? <img src={s.imageUrl} alt={s.imageAlt ?? ""} style={{ maxWidth: s.imageWidth ?? (block.type === "logo" ? "180px" : "100%"), height: "auto" }} />
            : <div className="flex items-center justify-center h-20 bg-muted/30 rounded text-xs text-muted-foreground">{block.type === "logo" ? "Logo (URL vuoto)" : "Nessuna immagine"}</div>
          }
        </div>
      );

    case "social": {
      const icons = s.socialIcons ?? [];
      return (
        <div style={{ ...wrapStyle, textAlign: s.textAlign ?? "center" }}>
          {icons.length === 0 && (
            <div className="text-xs text-muted-foreground">Nessuna icona — aggiungi nella sidebar</div>
          )}
          <div style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
            {icons.map((i, idx) => (
              <span
                key={idx}
                title={`${i.platform} → ${i.url}`}
                dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_SVG[i.platform] ?? "" }}
              />
            ))}
          </div>
        </div>
      );
    }

    case "columns2": {
      const left = s.leftColumn ?? { content: "", bgColor: "#ffffff" };
      const right = s.rightColumn ?? { content: "", bgColor: "#ffffff" };
      return (
        <div style={wrapStyle}>
          <div style={{ display: "flex", gap: 0 }}>
            <div
              style={{ flex: 1, background: left.bgColor, padding: 16, fontSize: 14, color: "#374151", lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: left.content }}
            />
            <div
              style={{ flex: 1, background: right.bgColor, padding: 16, fontSize: 14, color: "#374151", lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: right.content }}
            />
          </div>
        </div>
      );
    }

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
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true); // 4f — espansa di default

  const copyTag = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tag).then(
      () => toast({ title: "Copiato", description: tag }),
      () => toast({ title: "Errore copia", variant: "destructive" })
    );
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-medium">Variabili dinamiche</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {MERGE_TAGS.map(t => (
            <div
              key={t.key}
              className="flex items-center gap-1 group"
            >
              <button
                onClick={() => onInsert(t.key)}
                title={t.label}
                className="flex-1 text-left text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-1 hover:bg-primary/20 transition-colors truncate"
              >
                {t.key}
              </button>
              <button
                onClick={(e) => copyTag(e, t.key)}
                title="Copia negli appunti"
                className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <CopyIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Preset colori brand — riga di swatches che applica il colore al campo target
function BrandPresets({ onPick, label = "Preset brand" }: { onPick: (color: string) => void; label?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {BRAND_COLORS.map(c => (
          <button
            key={c.value}
            onClick={() => onPick(c.value)}
            title={`${c.name} (${c.value})`}
            className="h-6 w-6 rounded border-2 border-border hover:border-primary transition-colors"
            style={{ background: c.value }}
            aria-label={c.name}
          />
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

      {(block.type === "image" || block.type === "logo") && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">URL immagine</Label>
            <Input value={s.imageUrl ?? ""} onChange={e => patchStyles({ imageUrl: e.target.value })} className="text-xs" placeholder={block.type === "logo" ? "/pratica-rapida-logo.png" : "https://..."} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alt text</Label>
            <Input value={s.imageAlt ?? ""} onChange={e => patchStyles({ imageAlt: e.target.value })} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Larghezza</Label>
            <Input value={s.imageWidth ?? (block.type === "logo" ? "180px" : "100%")} onChange={e => patchStyles({ imageWidth: e.target.value })} className="text-xs" placeholder="100%, 300px..." />
          </div>
          <AlignButtons value={s.textAlign ?? "center"} onChange={v => patchStyles({ textAlign: v })} />
        </>
      )}

      {/* Social icons editor */}
      {block.type === "social" && (
        <>
          <Label className="text-xs">Icone social</Label>
          <div className="space-y-2">
            {(s.socialIcons ?? []).map((icon, idx) => (
              <div key={idx} className="flex items-center gap-1 border rounded p-2 bg-muted/30">
                <select
                  value={icon.platform}
                  onChange={e => {
                    const next = [...(s.socialIcons ?? [])];
                    next[idx] = { ...icon, platform: e.target.value as SocialIcon["platform"] };
                    patchStyles({ socialIcons: next });
                  }}
                  className="h-7 rounded border text-xs px-1 bg-background"
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="twitter">Twitter/X</option>
                </select>
                <Input
                  value={icon.url}
                  onChange={e => {
                    const next = [...(s.socialIcons ?? [])];
                    next[idx] = { ...icon, url: e.target.value };
                    patchStyles({ socialIcons: next });
                  }}
                  className="h-7 text-xs flex-1"
                  placeholder="https://..."
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    const next = (s.socialIcons ?? []).filter((_, i) => i !== idx);
                    patchStyles({ socialIcons: next });
                  }}
                  aria-label="Rimuovi icona"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                const next = [...(s.socialIcons ?? []), { platform: "facebook" as const, url: "https://" }];
                patchStyles({ socialIcons: next });
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Aggiungi icona
            </Button>
          </div>
          <AlignButtons value={s.textAlign ?? "center"} onChange={v => patchStyles({ textAlign: v })} />
        </>
      )}

      {/* Columns2 editor */}
      {block.type === "columns2" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Colonna sinistra (HTML)</Label>
            <Textarea
              value={s.leftColumn?.content ?? ""}
              onChange={e => patchStyles({ leftColumn: { ...(s.leftColumn ?? { bgColor: "#ffffff" }), content: e.target.value } })}
              rows={3}
              className="text-xs font-mono resize-none"
            />
            <ColorInput
              label="Sfondo sinistra"
              value={s.leftColumn?.bgColor ?? "#ffffff"}
              onChange={v => patchStyles({ leftColumn: { ...(s.leftColumn ?? { content: "" }), bgColor: v } })}
            />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Colonna destra (HTML)</Label>
            <Textarea
              value={s.rightColumn?.content ?? ""}
              onChange={e => patchStyles({ rightColumn: { ...(s.rightColumn ?? { bgColor: "#ffffff" }), content: e.target.value } })}
              rows={3}
              className="text-xs font-mono resize-none"
            />
            <ColorInput
              label="Sfondo destra"
              value={s.rightColumn?.bgColor ?? "#ffffff"}
              onChange={v => patchStyles({ rightColumn: { ...(s.rightColumn ?? { content: "" }), bgColor: v } })}
            />
          </div>
        </>
      )}

      {/* Background */}
      <ColorInput
        label="Sfondo blocco"
        value={s.backgroundColor ?? "#ffffff"}
        onChange={v => patchStyles({ backgroundColor: v })}
      />
      <BrandPresets onPick={(c) => patchStyles({ backgroundColor: c })} label="Preset sfondo brand" />

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
          <BrandPresets onPick={(c) => patchStyles({ buttonBg: c })} label="Preset colore bottone" />
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
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
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

  // Sample data per le anteprime / test send — copre tutte le merge tag comuni
  const SAMPLE_DATA: Record<string, string> = {
    nome: "Mario", cognome: "Rossi",
    cliente_nome: "Anna", cliente_cognome: "Bianchi",
    ragione_sociale: "Acme Costruzioni Srl",
    email: "test@example.com", password: "Esempio2026!",
    brand: "ENEA", prodotto: "Schermature solari", reseller: "Bricoman SpA",
    oggetto: "Esempio oggetto ticket", subject: "Risposta al tuo ticket",
    messaggio: "Questo è un messaggio di esempio per la test email.",
    descrizione: "Descrizione di esempio del problema riportato.",
    priorita: "normale", priorita_upper: "NORMALE",
    company: "Cliente Test Srl",
    giorni: "30", stato: "In lavorazione", tentativi: "2",
    note: "Manca la planimetria firmata e la copia documento.",
    tipo_modulo: "Schermature",
    link: "https://app.praticarapida.it/test-link",
    ticket_link: "https://app.praticarapida.it/ticket/test",
    login_url: "https://pannello.praticarapida.it",
    app_url: "https://app.praticarapida.it",
    base_url: "https://app.praticarapida.it",
    token: "TEST-TOKEN-1234",
    message: "Messaggio generico di esempio.",
  };

  // Sostituisci variabili {{...}} per la full-preview locale
  const renderedHtml = html.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE_DATA[k] ?? `{{${k}}}`);

  const sendTest = useMutation({
    mutationFn: async () => {
      // Salva prima così la versione su DB è quella che invieremo (DB-first nell'edge)
      const { error: updErr } = await supabase
        .from("email_templates")
        .update({ subject, html_body: html, design_json: design as unknown as Record<string, unknown> })
        .eq("id", tmpl.id);
      if (updErr) throw updErr;
      const { error } = await supabase.functions.invoke("send-email", {
        body: { to: testEmail, template: tmpl.trigger_event, data: SAMPLE_DATA },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Email di test inviata ✓", description: `Inviata a ${testEmail}` });
      setTestDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Errore invio test", description: e.message, variant: "destructive" }),
  });

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

        {/* Variable chips for subject — solo le top 3 più usate, accesso rapido */}
        <div className="flex gap-1 shrink-0">
          {MERGE_TAGS.slice(0, 3).map(t => (
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

        {/* Anteprima full-screen */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setFullPreviewOpen(true)}
          title="Anteprima full-screen con dati di esempio"
        >
          <Eye className="h-3.5 w-3.5" />
          Anteprima
        </Button>

        {/* Invia test */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setTestDialogOpen(true)}
          title="Invia email di test con dati di esempio"
        >
          <Send className="h-3.5 w-3.5" />
          Invia test
        </Button>

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

      {/* ── Send test dialog ─────────────────────────────────────────────── */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invia email di test</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Verrà salvato il template e inviata un'anteprima reale (con dati di esempio) all'indirizzo indicato.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="builder_test_email">Indirizzo destinatario</Label>
              <Input
                id="builder_test_email"
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="tu@esempio.it"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => {
                if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
                  toast({ title: "Email non valida", variant: "destructive" });
                  return;
                }
                sendTest.mutate();
              }}
              disabled={sendTest.isPending || !testEmail}
            >
              {sendTest.isPending ? "Invio..." : "Invia test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Full-screen preview dialog ────────────────────────────────────── */}
      <Dialog open={fullPreviewOpen} onOpenChange={setFullPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Anteprima — {subject || tmpl.name}</DialogTitle>
          </DialogHeader>
          <div className="border rounded-md overflow-auto max-h-[70vh] bg-white">
            <iframe
              srcDoc={renderedHtml}
              title="Anteprima email"
              className="w-full min-h-[600px] border-0"
              sandbox="allow-same-origin"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullPreviewOpen(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
