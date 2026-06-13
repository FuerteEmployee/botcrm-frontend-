import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableHead, TableHeader, TableRow, TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";

interface DataTableProps {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
  emptyMessage?: ReactNode;
  isEmpty?: boolean;
  footer?: ReactNode;
  maxHeight?: string | number;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalRecords?: number;
  };
}

export function DataTable({ headers, children, className, emptyMessage, isEmpty, footer, pagination, maxHeight }: DataTableProps) {
  return (
    <Card className={cn("border border-border/60 bg-card overflow-hidden rounded-2xl shadow-sm", className)}>
      <div
        className="overflow-auto scrollbar-thin"
        style={{ maxHeight: maxHeight }}
      >
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-card">
            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/60">
              {headers.map((header, i) => (
                <TableHead
                  key={i}
                  className={cn(
                    "text-[12px] font-semibold text-muted-foreground py-3.5 px-4",
                    i === 0 && "pl-6",
                    i === headers.length - 1 && "text-right pr-6"
                  )}
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {children}
            {isEmpty && (
              <TableRow>
                <TableCell colSpan={headers.length} className="h-32 text-center text-muted-foreground text-[13px]">
                  {emptyMessage || "No data available."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>


      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={pagination.onPageChange}
          totalRecords={pagination.totalRecords}
          className="border-none shadow-none bg-muted/5 mt-0 rounded-none border-t"
        />
      )}
      {footer}
    </Card>
  );
}

export function DataTableRow({ children, className, ...props }: React.ComponentProps<typeof TableRow>) {
  return (
    <TableRow className={cn("border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors", className)} {...props}>
      {children}
    </TableRow>
  );
}

export function DataTableCell({ children, className, isFirst, isLast, ...props }: React.ComponentProps<typeof TableCell> & { isFirst?: boolean; isLast?: boolean }) {
  return (
    <TableCell className={cn("py-4 px-4", isFirst && "pl-6", isLast && "pr-6", className)} {...props}>
      {children}
    </TableCell>
  );
}
