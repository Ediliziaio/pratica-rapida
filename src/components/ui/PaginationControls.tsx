import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/hooks/usePraticheServerQuery";

interface PaginationControlsProps {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

/**
 * Simple prev / next pagination bar.
 * Renders nothing when there's only one page.
 */
export function PaginationControls({
  page,
  pageCount,
  total,
  onPageChange,
  isLoading,
}: PaginationControlsProps) {
  if (pageCount <= 1 && total <= PAGE_SIZE) return null;

  const from = page * PAGE_SIZE + 1;
  const to   = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="flex items-center justify-between gap-4 pt-1 border-t">
      <p className="text-xs text-muted-foreground tabular-nums">
        {from}–{to} di <span className="font-medium">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0 || isLoading}
          aria-label="Pagina precedente"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <span className="text-xs text-muted-foreground tabular-nums px-2">
          {page + 1} / {pageCount || 1}
        </span>

        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= (pageCount || 1) - 1 || isLoading}
          aria-label="Pagina successiva"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
