import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalRecords?: number;
  className?: string;
}

export function Pagination({ 
  page, 
  totalPages, 
  onPageChange, 
  totalRecords, 
  className 
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn(
      "flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-4 gap-3 bg-card border border-border/60 rounded-2xl shadow-sm mt-6", 
      className
    )}>
      <div className="text-[12px] text-muted-foreground font-medium text-center sm:text-left">
        <span className="hidden sm:inline">Showing page </span>
        <span className="text-foreground">{page}</span>
        <span className="hidden sm:inline"> of </span>
        <span className="sm:hidden mx-1">/</span>
        <span className="text-foreground">{totalPages}</span>
        {totalRecords !== undefined && (
          <span className="hidden md:inline"> · <span className="text-foreground">{totalRecords}</span> records</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 sm:h-8 sm:w-8 rounded-lg border-border/60 hover:bg-primary/5 hover:text-primary transition-all disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages > 5 ? 3 : 5, totalPages) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPages > 3) {
              if (page > 2) {
                pageNum = page - 1 + i;
                if (pageNum > totalPages) pageNum = totalPages - (2 - i);
              }
            }
            if (pageNum <= 0 || pageNum > totalPages) return null;

            return (
              <Button
                key={pageNum}
                variant={page === pageNum ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "h-8 w-8 text-[12px] rounded-lg transition-all",
                  page === pageNum ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                )}
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 sm:h-8 sm:w-8 rounded-lg border-border/60 hover:bg-primary/5 hover:text-primary transition-all disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
