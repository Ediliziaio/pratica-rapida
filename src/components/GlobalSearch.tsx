import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth, isInternal } from "@/hooks/useAuth";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { FolderOpen, Users, Search } from "lucide-react";

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  type: "pratica" | "cliente";
  url: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { companyId } = useCompany();
  const { roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!q || q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const all: SearchResult[] = [];
        const pattern = `%${q}%`;

        // Legacy pratiche (staff + tenant views collegate a /pratiche)
        let praticheQuery = supabase
          .from("pratiche")
          .select("id, titolo, stato, categoria")
          .or(`titolo.ilike.${pattern},descrizione.ilike.${pattern}`)
          .limit(5);
        if (!isInternal(roles) && companyId) {
          praticheQuery = praticheQuery.eq("company_id", companyId);
        }
        const { data: pratiche } = await praticheQuery;
        if (pratiche) {
          pratiche.forEach((p) =>
            all.push({
              id: p.id,
              label: p.titolo,
              sublabel: `${p.categoria} · ${p.stato}`,
              type: "pratica",
              url: `/pratiche/${p.id}`,
            })
          );
        }

        // Nuove pratiche ENEA (view masked — RLS filtra per tenant)
        const { data: eneaPractices } = await supabase
          .from("enea_practices_public")
          .select("id, cliente_nome, cliente_cognome, cliente_email, cliente_cf, brand")
          .or(`cliente_nome.ilike.${pattern},cliente_cognome.ilike.${pattern},cliente_email.ilike.${pattern},cliente_cf.ilike.${pattern}`)
          .limit(5);
        if (eneaPractices) {
          eneaPractices.forEach((p) =>
            all.push({
              id: p.id,
              label: `${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""}`.trim() || "(senza nome)",
              sublabel: `${p.brand === "enea" ? "ENEA" : "Conto Termico"}${p.cliente_email ? " · " + p.cliente_email : ""}`,
              type: "pratica",
              url: `/kanban`,
            })
          );
        }

        if (companyId) {
          const { data: clienti } = await supabase
            .from("clienti_finali")
            .select("id, nome, cognome, email")
            .eq("company_id", companyId)
            .or(`nome.ilike.${pattern},cognome.ilike.${pattern},email.ilike.${pattern}`)
            .limit(5);
          if (clienti) {
            clienti.forEach((c) =>
              all.push({
                id: c.id,
                label: `${c.nome} ${c.cognome}`,
                sublabel: c.email || undefined,
                type: "cliente",
                url: `/clienti`,
              })
            );
          }
        }

        setResults(all);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [companyId, roles]
  );

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const iconMap = {
    pratica: FolderOpen,
    cliente: Users,
  };

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(r.url);
  };

  const pratiche = results.filter((r) => r.type === "pratica");
  const clienti = results.filter((r) => r.type === "cliente");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Cerca...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Cerca pratiche, clienti..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? "Ricerca in corso..." : "Nessun risultato trovato."}
          </CommandEmpty>
          {pratiche.length > 0 && (
            <CommandGroup heading="Pratiche">
              {pratiche.map((r) => {
                const Icon = iconMap[r.type];
                return (
                  <CommandItem key={r.id} onSelect={() => handleSelect(r)}>
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{r.label}</span>
                      {r.sublabel && (
                        <span className="text-xs text-muted-foreground">{r.sublabel}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {clienti.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clienti">
                {clienti.map((r) => {
                  const Icon = iconMap[r.type];
                  return (
                    <CommandItem key={r.id} onSelect={() => handleSelect(r)}>
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{r.label}</span>
                        {r.sublabel && (
                          <span className="text-xs text-muted-foreground">{r.sublabel}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
