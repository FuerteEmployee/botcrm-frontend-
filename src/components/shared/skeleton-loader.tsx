import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonLoaderProps {
  type: "table" | "card" | "stats" | "list";
  count?: number;
  className?: string;
}

export function SkeletonLoader({ type, count = 3, className }: SkeletonLoaderProps) {
  if (type === "table") {
    return (
      <div className={cn("w-full space-y-4", className)}>
        <div className="flex items-center justify-between py-2">
          <Skeleton className="h-9 w-[250px] rounded-xl" />
          <Skeleton className="h-9 w-[120px] rounded-xl" />
        </div>
        <div className="border border-border/40 rounded-xl overflow-hidden bg-white/50">
          <div className="bg-muted/30 p-4 border-b border-border/40 flex gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="p-4 border-b border-border/20 flex gap-4 items-center last:border-0">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[40%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
              <Skeleton className="h-4 w-[15%]" />
              <Skeleton className="h-4 w-[15%]" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-5 border border-border/50 rounded-2xl bg-white space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-[70%]" />
              <Skeleton className="h-4 w-[40%]" />
            </div>
            <div className="pt-4 border-t border-border/40 flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "stats") {
    return (
      <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-4 border border-border/40 rounded-xl bg-white space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border border-border/20 rounded-xl">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-[30%]" />
              <Skeleton className="h-3 w-[50%]" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
