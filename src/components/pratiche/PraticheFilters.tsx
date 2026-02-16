import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-9 justify-start text-left font-normal", !filterDateFrom && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Da"}
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
            variant="outline"
            size="sm"
            className={cn("h-9 justify-start text-left font-normal", !filterDateTo && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "A"}
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

      {/* Client filter */}
      <Select value={filterCliente || "all"} onValueChange={(v) => onClienteChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="Tutti i clienti" />
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

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9" onClick={onReset}>
          <X className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}
