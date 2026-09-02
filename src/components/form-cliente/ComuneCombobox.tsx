// ============================================================
// ComuneCombobox
//
// Menù a tendina con ricerca per i comuni italiani (dataset ISTAT
// incluso in src/data/comuni-italiani.json). Alla selezione restituisce
// il comune scelto così che il chiamante possa auto-compilare provincia
// e CAP. Il valore testuale resta comunque libero (l'utente può digitare
// e i campi provincia/CAP restano modificabili a mano).
//
// Per performance con ~7.900 comuni: la lista è renderizzata solo quando
// c'è una ricerca (>= 2 caratteri) e limitata ai primi 50 risultati.
// ============================================================

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import comuniData from "@/data/comuni-italiani.json";

export interface Comune {
  /** nome */
  n: string;
  /** sigla provincia */
  p: string;
  /** CAP rappresentativo */
  c: string;
}

const COMUNI = comuniData as Comune[];

// Normalizza per ricerca accent/case-insensitive.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface ComuneComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Chiamato con il comune completo quando l'utente ne seleziona uno dalla lista. */
  onPick?: (comune: Comune) => void;
  placeholder?: string;
  invalid?: boolean;
}

export function ComuneCombobox({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  invalid,
}: ComuneComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const starts: Comune[] = [];
    const contains: Comune[] = [];
    for (const c of COMUNI) {
      const n = norm(c.n);
      if (n.startsWith(q)) starts.push(c);
      else if (n.includes(q)) contains.push(c);
      if (starts.length >= 50) break;
    }
    return [...starts, ...contains].slice(0, 50);
  }, [query]);

  function select(c: Comune) {
    onChange(c.n);
    onPick?.(c);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            invalid && "border-destructive",
          )}
        >
          <span className="truncate">
            {value || placeholder || "Seleziona il comune…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[16rem]"
        align="start"
      >
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca comune…"
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10 px-2"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {norm(query).length < 2 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Digita almeno 2 lettere per cercare.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Nessun comune trovato.
            </p>
          ) : (
            results.map((c) => (
              <button
                key={`${c.n}-${c.p}-${c.c}`}
                type="button"
                onClick={() => select(c)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    value === c.n ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex-1 truncate">{c.n}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {c.p} · {c.c}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
