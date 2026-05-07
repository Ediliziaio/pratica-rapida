/**
 * Lightweight markdown parser tailored to the news/blog markdown subset
 * we generate ourselves (h2/h3, paragraphs, ul/ol, tables, blockquote callouts).
 *
 * Returns a flat array of typed blocks that BlogPost.tsx renders with the same
 * styling used previously for the static blog-posts.ts content.
 *
 * Inline formatting supported: **bold**, *italic*, [link](url), `code`.
 */

export type ContentBlock =
  | { type: "p"; text: string }
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; variant: "info" | "warning" | "tip"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; src: string; alt: string };

const CALLOUT_VARIANT_RE = /\*\*(INFO|WARNING|TIP)\*\*/i;

export function parseMarkdown(md: string): ContentBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ContentBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Headings
    if (/^###\s+/.test(trimmed)) {
      blocks.push({ type: "h3", text: trimmed.replace(/^###\s+/, "") });
      i++;
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      blocks.push({ type: "h2", text: trimmed.replace(/^##\s+/, "") });
      i++;
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      blocks.push({ type: "h1", text: trimmed.replace(/^#\s+/, "") });
      i++;
      continue;
    }

    // Image: ![alt](src)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      blocks.push({ type: "image", alt: imgMatch[1], src: imgMatch[2] });
      i++;
      continue;
    }

    // Blockquote callout
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const joined = buf.filter(Boolean).join(" ");
      const m = joined.match(CALLOUT_VARIANT_RE);
      const variant = (m?.[1]?.toLowerCase() as "info" | "warning" | "tip") ?? "info";
      // Strip the variant marker and any leading emoji/icon
      const text = joined
        .replace(/^[^\w]*\*\*(INFO|WARNING|TIP)\*\*[^\w]*/i, "")
        .trim();
      blocks.push({ type: "callout", variant, text });
      continue;
    }

    // Table
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().startsWith("|") && /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())) {
      const headers = parseTableRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph: collect consecutive non-empty plain lines
    const paraBuf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s+|[-*]\s+|\d+\.\s+|>|\|)/.test(lines[i].trim())
    ) {
      paraBuf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraBuf.join(" ").replace(/\s+/g, " ").trim() });
  }

  return blocks;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Inline markdown — bold, italic, links, code — converted to HTML.
 * Order matters: handle links/code/bold before italic so * doesn't grab ** twice.
 */
function inlineToHtml(text: string): string {
  return text
    // escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // images: ![alt](src)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // bold then italic (bold first to avoid ** ambiguity)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

/**
 * Convert the news markdown subset to HTML — used to seed the TipTap editor
 * for legacy articles that only have body_md. Output uses the same callout
 * data attributes the WYSIWYG editor produces, so a round-trip is stable.
 */
export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  const blocks = parseMarkdown(md);
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h1": return `<h1>${inlineToHtml(b.text)}</h1>`;
        case "h2": return `<h2>${inlineToHtml(b.text)}</h2>`;
        case "h3": return `<h3>${inlineToHtml(b.text)}</h3>`;
        case "p":  return `<p>${inlineToHtml(b.text)}</p>`;
        case "ul": return `<ul>${b.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("")}</ul>`;
        case "ol": return `<ol>${b.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("")}</ol>`;
        case "callout":
          return `<blockquote data-callout="${b.variant}"><p>${inlineToHtml(b.text)}</p></blockquote>`;
        case "table": {
          const head = `<thead><tr>${b.headers.map((h) => `<th>${inlineToHtml(h)}</th>`).join("")}</tr></thead>`;
          const body = `<tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inlineToHtml(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody>`;
          return `<table>${head}${body}</table>`;
        }
        case "image": return `<figure><img src="${b.src}" alt="${b.alt}" />${b.alt ? `<figcaption>${b.alt}</figcaption>` : ""}</figure>`;
        default: return "";
      }
    })
    .join("");
}

/**
 * Serialize a ContentBlock array back into the markdown subset we use.
 * Used by the editor when migrating legacy structured content.
 */
export function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p": return b.text;
        case "h1": return `# ${b.text}`;
        case "h2": return `## ${b.text}`;
        case "h3": return `### ${b.text}`;
        case "ul": return b.items.map((i) => `- ${i}`).join("\n");
        case "ol": return b.items.map((i, n) => `${n + 1}. ${i}`).join("\n");
        case "callout": {
          const icon = b.variant === "warning" ? "⚠️" : b.variant === "tip" ? "💡" : "ℹ️";
          return `> ${icon} **${b.variant.toUpperCase()}**\n>\n> ${b.text}`;
        }
        case "table": {
          const head = `| ${b.headers.join(" | ")} |`;
          const sep  = `| ${b.headers.map(() => "---").join(" | ")} |`;
          const rows = b.rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
          return `${head}\n${sep}\n${rows}`;
        }
        case "image": return `![${b.alt}](${b.src})`;
        default: return "";
      }
    })
    .join("\n\n");
}
