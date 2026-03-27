import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PraticheFiltersProps {
  filterDateFrom: Date | undefined;
  filterDateTo: Date | undefined;
  filterCliente: string;
  onDateFromChange: (d: Date | undefined) => void;
  onDateToChange: (d: Date | undefined) => void;
  onClienteChange: (id: string) => void;
  onReset: () => void;
  clienti: { id: string; nome: string; cognome: string }[];
}

export function PraticheFilters({
  filterDateFrom,
  filterDateTo,
  filterCliente,
  onDateFromChange,
  onDateToChange,
  onClienteChange,
  onReset,
  clienti,
}: PraticheFiltersProps) {
  const hasFilters = filterDateFrom || filterDateTo || filterCliente;
  const activeCount = [filterDateFrom, filterDateTo, filterCliente].filter(Boolean).length;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filterDateFrom ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1.5 text-xs font-normal"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {filterDateFrom ? format(filterDateFrom, "dd/MM/yy") : "Dal"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filterDateFrom}
            onSelect={onDateFromChange}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Date To */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={filterDateTo ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1.5 text-xs font-normal"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {filterDateTo ? format(filterDateTo, "dd/MM/yy") : "Al"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filterDateTo}
            onSelect={onDateToChange}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Client */}
      {clienti.length > 0 && (
        <Select value={filterCliente || "all"} onValueChange={(v) => onClienteChange(v === "all" ? "" : v)}>
          <SelectTrigger className={cn("h-9 w-auto text-xs gap-1", filterCliente ? "bg-secondary" : "")}>
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {clienti.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome} {c.cognome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Reset */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
          onClick={onReset}
        >
          <X className="h-3.5 w-3.5" />
          {activeCount > 1 ? `Reset (${activeCount})` : "Reset"}
        </Button>
      )}
    </div>
  );
}
