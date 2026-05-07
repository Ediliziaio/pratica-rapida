import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pool of suggestions from existing articles. */
  suggestions?: string[];
  placeholder?: string;
}

/**
 * Visual tag editor: chips display + autocomplete suggestion pool from
 * existing articles. Adds a tag on Enter / comma / blur, removes via × icon
 * or Backspace on empty input.
 */
export default function TagInput({
  value, onChange, suggestions = [], placeholder = "ecobonus, conto-termico…",
}: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value);
    return suggestions
      .filter((s) => !taken.has(s) && s.toLowerCase().includes(q))
      .slice(0, 6);
  }, [input, suggestions, value]);

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
    setInput("");
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 p-1.5 rounded-md border border-input bg-background min-h-[40px] focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="hover:text-destructive transition-colors"
              aria-label={`Rimuovi tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { setFocused(false); if (input.trim()) addTag(input); }}
          onFocus={() => setFocused(true)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="border-0 shadow-none focus-visible:ring-0 h-6 flex-1 min-w-[120px] p-0 text-sm"
        />
      </div>

      {focused && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-md border bg-popover shadow-md py-1 max-h-48 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
